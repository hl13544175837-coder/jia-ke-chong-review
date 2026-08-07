#!/usr/bin/env python
# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import io
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Mapping
from urllib.parse import urlsplit, urlunsplit

import requests
from PIL import Image, UnidentifiedImageError

from llm_client import resolve_secret_value

IMAGE_RESUME_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "webp", "gif"})
IMAGE_RESUME_MAX_FILE_SIZE = 10 * 1024 * 1024
MODEL_IMAGE_PAYLOAD_MAX_SIZE = 7 * 1024 * 1024
MODEL_IMAGE_MAX_PIXELS = 16_000_000
SOURCE_IMAGE_MAX_PIXELS = 64_000_000
MIN_IMAGE_EDGE = 11
MAX_IMAGE_ASPECT_RATIO = 200
DOCUMENT_VISION_MAX_PARALLEL_REQUESTS = 3

_SUPPORTED_PIL_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "GIF"})
_MIME_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
_PROFILE_SCALAR_LIMITS = {
    "name": 100,
    "email": 100,
    "phone": 30,
    "summary": 2000,
    "intent_city": 80,
    "target_position": 120,
    "additional_info": 4000,
}
_PROFILE_LIST_FIELDS = {
    "education",
    "experience",
    "projects",
    "certifications",
    "languages",
}


@dataclass(frozen=True)
class ImageResumeParseResult:
    extracted_info: dict
    skills: list[dict]


@dataclass(frozen=True)
class DashScopeVisionConfig:
    endpoint: str
    api_key: str
    model: str
    timeout_seconds: int

    @classmethod
    def from_environment(cls) -> "DashScopeVisionConfig":
        api_key = resolve_secret_value(os.getenv("DASHSCOPE_API_KEY", "").strip()).strip()
        if not api_key:
            raise RuntimeError("图片简历识别未配置：请设置 DASHSCOPE_API_KEY")

        raw_base_url = os.getenv("DASHSCOPE_BASE_URL", "").strip()
        if not raw_base_url:
            raise RuntimeError(
                "图片简历识别未配置：请设置包含业务空间 ID 的 DASHSCOPE_BASE_URL"
            )

        model = os.getenv("DASHSCOPE_VISION_MODEL", "qwen3.7-plus").strip()
        if not model:
            raise RuntimeError("图片简历识别未配置：DASHSCOPE_VISION_MODEL 不能为空")

        raw_timeout = os.getenv("DASHSCOPE_VISION_TIMEOUT_S", "120").strip()
        try:
            timeout_seconds = int(raw_timeout)
        except ValueError as error:
            raise RuntimeError(
                "图片简历识别配置错误：DASHSCOPE_VISION_TIMEOUT_S 必须是整数"
            ) from error
        if timeout_seconds < 10 or timeout_seconds > 300:
            raise RuntimeError(
                "图片简历识别配置错误：DASHSCOPE_VISION_TIMEOUT_S 必须在 10 到 300 秒之间"
            )

        return cls(
            endpoint=_normalize_chat_completions_url(raw_base_url),
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_seconds,
        )


class ImageResumeVisionParser:
    def __init__(
        self,
        config: DashScopeVisionConfig | None = None,
        http_client: requests.Session | None = None,
    ) -> None:
        self.config = config
        self.http_client = http_client

    def parse(self, file_path: str) -> ImageResumeParseResult:
        """解析单张图片简历。

        部分视觉模型对“数组型 JSON schema”prompt 会输出超长内容并撞上输出
        token 上限，导致 JSON 截断/非法。首次失败时自动降级为平铺字段
        prompt 重试一次，避免整份简历直接失败。
        """
        config = self.config or DashScopeVisionConfig.from_environment()
        image_data_uri = _prepare_image_data_uri(Path(file_path))
        payload = self._completion_json(
            config,
            [image_data_uri],
            _resume_extraction_prompt(),
            fallback_text=_resume_fallback_prompt(),
        )
        return _normalize_resume_payload(payload)

    def parse_document(self, data_uris: list[str]) -> ImageResumeParseResult:
        """解析多页文档（PDF/DOCX 已转图片），并行识别各页后合并结构。"""
        config = self.config or DashScopeVisionConfig.from_environment()
        if not data_uris:
            return ImageResumeParseResult(extracted_info={}, skills=[])

        def parse_page(page_num: int, uri: str) -> Mapping[str, object]:
            page_prompt = _resume_document_page_prompt(page_num, len(data_uris))
            return self._completion_json(
                config,
                [uri],
                page_prompt,
                fallback_text=_resume_fallback_prompt(),
            )

        page_payloads: list[Mapping[str, object] | None] = [None] * len(data_uris)
        worker_count = min(DOCUMENT_VISION_MAX_PARALLEL_REQUESTS, len(data_uris))
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = {
                executor.submit(parse_page, page_num, uri): page_num - 1
                for page_num, uri in enumerate(data_uris, 1)
            }
            for future in as_completed(futures):
                page_payloads[futures[future]] = future.result()

        all_results: list[dict] = []
        for payload in page_payloads:
            if payload is None:
                continue
            # 兼容两种返回：顶层 extracted_info 或平铺字段
            info = payload.get("extracted_info") if isinstance(payload.get("extracted_info"), dict) else payload
            if isinstance(info, dict) and _has_any_value(info):
                all_results.append(info)

        merged = _merge_page_results(all_results) if all_results else {}
        return ImageResumeParseResult(extracted_info=merged, skills=[])

    def _completion_json(
        self,
        config: DashScopeVisionConfig,
        data_uris: list[str],
        user_text: str,
        *,
        fallback_text: str | None = None,
    ) -> Mapping[str, object]:
        """发起视觉识别并解析 JSON；首次 JSON 非法时降级重试一次。"""
        response = self._post_completion(config, data_uris, user_text)
        try:
            return _parse_json_object(_extract_message_content(response))
        except RuntimeError as first_error:
            if not fallback_text:
                raise
            response = self._post_completion(config, data_uris, fallback_text)
            return _parse_json_object(_extract_message_content(response))

    def _post_completion(
        self,
        config: DashScopeVisionConfig,
        data_uris: list[str],
        user_text: str,
    ) -> Mapping[str, object]:
        content_parts: list[dict] = []
        for uri in data_uris:
            content_parts.append({"type": "image_url", "image_url": {"url": uri}})
        content_parts.append({"type": "text", "text": user_text})
        request_body = {
            "model": config.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是一名严谨的简历结构化解析助手。只提取图片中明确可见的信息，"
                        "不得猜测、补全或虚构；模糊信息留空。只返回合法 JSON。"
                        "严格只输出用户给定结构中的字段，不要新增、改名或扩展任何字段，"
                        "不要输出 OCR 原文、解释或额外内容。"
                    ),
                },
                {
                    "role": "user",
                    "content": content_parts,
                },
            ],
            "response_format": {"type": "json_object"},
            "enable_thinking": False,
            "stream": False,
            # 显式限制输出上限：防止模型超长输出被截断成非法 JSON。
            # 实测部分模型在 schema prompt 下会超长输出，撞到默认上限后
            # JSON 未闭合导致解析失败；上限过大又会让“失控输出”白白消耗
            # token，故取折中值，失败路径由 _completion_json 降级重试兜底。
            "max_tokens": 4096,
        }
        post = self.http_client.post if self.http_client is not None else requests.post
        try:
            response = post(
                config.endpoint,
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
                timeout=config.timeout_seconds,
            )
        except requests.Timeout as error:
            raise RuntimeError(
                f"图片简历识别超时（超过 {config.timeout_seconds} 秒），请稍后重新解析"
            ) from error
        except requests.RequestException as error:
            raise RuntimeError("图片简历识别服务暂时无法连接，请稍后重新解析") from error

        if not response.ok:
            error_code = _safe_provider_error_code(response)
            code_hint = f"，错误码 {error_code}" if error_code else ""
            raise RuntimeError(
                f"图片简历识别服务返回异常（HTTP {response.status_code}{code_hint}），"
                "请检查百炼配置后重新解析"
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise RuntimeError("图片简历识别服务返回了无法解析的响应") from error
        if not isinstance(payload, Mapping):
            raise RuntimeError("图片简历识别服务返回格式不正确")
        return payload


def inspect_image_file(file_path: Path) -> tuple[str, int, int]:
    try:
        with Image.open(file_path) as image:
            return _inspect_opened_image(image)
    except UnidentifiedImageError as error:
        raise ValueError("图片内容无法识别或文件已损坏") from error
    except OSError as error:
        raise ValueError("图片文件已损坏，无法读取") from error


def inspect_image_stream(stream: BinaryIO) -> tuple[str, int, int]:
    current_position = stream.tell()
    try:
        stream.seek(0)
        with Image.open(stream) as image:
            return _inspect_opened_image(image)
    except UnidentifiedImageError as error:
        raise ValueError("图片内容无法识别或文件已损坏") from error
    except OSError as error:
        raise ValueError("图片文件已损坏，无法读取") from error
    finally:
        stream.seek(current_position)


def _inspect_opened_image(image: Image.Image) -> tuple[str, int, int]:
    image_format = (image.format or "").upper()
    width, height = image.size
    _validate_image_metadata(image_format, width, height)
    image.verify()
    return image_format, width, height


def _prepare_image_data_uri(file_path: Path) -> str:
    if not file_path.is_file():
        raise ValueError("图片简历原文件不存在")

    file_size = file_path.stat().st_size
    if file_size <= 0:
        raise ValueError("图片简历文件为空")
    if file_size > IMAGE_RESUME_MAX_FILE_SIZE:
        raise ValueError("图片简历不能超过 10 MB")

    image_format, width, height = inspect_image_file(file_path)
    original_bytes = file_path.read_bytes()
    requires_conversion = (
        image_format == "GIF"
        or len(original_bytes) > MODEL_IMAGE_PAYLOAD_MAX_SIZE
        or width * height > MODEL_IMAGE_MAX_PIXELS
    )

    if requires_conversion:
        payload, mime_type = _convert_image_for_model(file_path)
    else:
        payload = original_bytes
        mime_type = _MIME_TYPES[image_format]

    encoded = base64.b64encode(payload)
    if len(encoded) > 10 * 1024 * 1024:
        raise ValueError("图片编码后超过视觉模型 10 MB 上限，请压缩后重新上传")
    return f"data:{mime_type};base64,{encoded.decode('ascii')}"


def _convert_image_for_model(file_path: Path) -> tuple[bytes, str]:
    try:
        with Image.open(file_path) as source:
            source.seek(0)
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("图片内容无法识别或文件已损坏") from error

    if image.width * image.height > MODEL_IMAGE_MAX_PIXELS:
        scale = math.sqrt(MODEL_IMAGE_MAX_PIXELS / (image.width * image.height))
        target_size = (
            max(MIN_IMAGE_EDGE, int(image.width * scale)),
            max(MIN_IMAGE_EDGE, int(image.height * scale)),
        )
        image = image.resize(target_size, Image.Resampling.LANCZOS)

    background = Image.new("RGB", image.size, "white")
    background.paste(image, mask=image.getchannel("A"))

    quality = 92
    while quality >= 70:
        buffer = io.BytesIO()
        background.save(buffer, format="JPEG", quality=quality, optimize=True)
        payload = buffer.getvalue()
        if len(payload) <= MODEL_IMAGE_PAYLOAD_MAX_SIZE:
            return payload, "image/jpeg"
        quality -= 7

    raise ValueError("图片压缩后仍超过视觉模型上限，请降低分辨率后重新上传")


def _validate_image_metadata(image_format: str, width: int, height: int) -> None:
    if image_format not in _SUPPORTED_PIL_FORMATS:
        raise ValueError("不支持该图片格式，请上传 JPG、PNG、WebP 或 GIF")
    if width < MIN_IMAGE_EDGE or height < MIN_IMAGE_EDGE:
        raise ValueError("图片宽高均需大于 10 像素")
    if max(width, height) / min(width, height) > MAX_IMAGE_ASPECT_RATIO:
        raise ValueError("图片长宽比不能超过 200:1")
    if width * height > SOURCE_IMAGE_MAX_PIXELS:
        raise ValueError("图片分辨率过高，请压缩到 6400 万像素以内")


def _normalize_chat_completions_url(raw_base_url: str) -> str:
    normalized_hint = raw_base_url.casefold()
    if (
        "{" in raw_base_url
        or "}" in raw_base_url
        or "your-workspace-id" in normalized_hint
        or "你的业务空间" in raw_base_url
    ):
        raise RuntimeError(
            "图片简历识别配置错误：DASHSCOPE_BASE_URL 中仍包含未替换的业务空间占位符"
        )

    parsed = urlsplit(raw_base_url)
    if parsed.scheme != "https":
        raise RuntimeError("图片简历识别配置错误：DASHSCOPE_BASE_URL 必须使用 HTTPS")
    if not parsed.hostname:
        raise RuntimeError("图片简历识别配置错误：DASHSCOPE_BASE_URL 缺少主机名")
    if parsed.username or parsed.password:
        raise RuntimeError("图片简历识别配置错误：DASHSCOPE_BASE_URL 不允许包含账号密码")
    if parsed.query or parsed.fragment:
        raise RuntimeError(
            "图片简历识别配置错误：DASHSCOPE_BASE_URL 不允许包含查询参数或片段"
        )

    path = parsed.path.rstrip("/")
    if not path.endswith("/chat/completions"):
        path = f"{path}/chat/completions"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _extract_message_content(payload: Mapping[str, object]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("图片简历识别响应中没有候选结果")
    first_choice = choices[0]
    if not isinstance(first_choice, Mapping):
        raise RuntimeError("图片简历识别响应格式不正确")
    message = first_choice.get("message")
    if not isinstance(message, Mapping):
        raise RuntimeError("图片简历识别响应中没有消息内容")
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        text_parts = [
            str(item.get("text")).strip()
            for item in content
            if isinstance(item, Mapping)
            and item.get("type") in {"text", "output_text"}
            and item.get("text")
        ]
        if text_parts:
            return "\n".join(text_parts)
    raise RuntimeError("图片简历识别响应中没有可用内容")


def _parse_json_object(content: str) -> Mapping[str, object]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```JSON").removeprefix("```")
        cleaned = cleaned.removesuffix("```").strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        if start < 0:
            raise RuntimeError("图片简历识别结果不是有效 JSON")
        try:
            payload, _ = json.JSONDecoder().raw_decode(cleaned[start:])
        except json.JSONDecodeError:
            repaired = _repair_truncated_json(cleaned[start:])
            if repaired is None:
                raise RuntimeError("图片简历识别结果不是有效 JSON")
            try:
                payload = json.loads(repaired)
            except json.JSONDecodeError as error:
                raise RuntimeError("图片简历识别结果不是有效 JSON") from error
    if not isinstance(payload, Mapping):
        raise RuntimeError("图片简历识别结果必须是 JSON 对象")
    return payload


def _repair_truncated_json(content: str) -> str | None:
    """尝试修复因输出截断而未闭合的 JSON：去掉末尾不完整的字符串，
    补全缺失的 } 和 ]。

    只会在内容结尾补闭合符，不会改动已有内容，因此是安全的兜底。
    若连“完整键值对”都不存在，返回 None 表示无法修复。
    """
    stack: list[str] = []
    in_string = False
    escaped = False
    last_value_end = -1  # 最后一个完整值结束的位置（不含）
    i = 0
    length = len(content)
    while i < length:
        ch = content[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
                last_value_end = i + 1
            i += 1
            continue
        if ch == '"':
            in_string = True
            last_value_end = -1
        elif ch in "{[":
            stack.append(ch)
            last_value_end = -1
        elif ch in "}]":
            if stack:
                stack.pop()
            last_value_end = i + 1
        elif ch in "0123456789tfn-":
            # 简单数字/true/false/null 结尾判定交给后续关闭符逻辑
            last_value_end = i + 1
        elif ch == ":" or ch == ",":
            last_value_end = -1
        i += 1

    if in_string:
        # 结尾是未闭合的字符串：截掉不完整的字符串内容
        content = content[:last_value_end] if last_value_end >= 0 else content
        while content and content[-1] not in '"}]':
            content = content[:-1]
        if not content:
            return None
    if not stack or last_value_end < 0:
        return None
    tail = []
    for opener in reversed(stack):
        tail.append("}" if opener == "{" else "]")
    return content.rstrip() + "".join(tail)


def _normalize_resume_payload(payload: Mapping[str, object]) -> ImageResumeParseResult:
    raw_info = payload.get("extracted_info")
    if not isinstance(raw_info, Mapping):
        raw_info = payload

    extracted_info: dict[str, object] = {}
    for field, limit in _PROFILE_SCALAR_LIMITS.items():
        extracted_info[field] = _clean_text(raw_info.get(field), limit)
    for field in _PROFILE_LIST_FIELDS:
        extracted_info[field] = _clean_item_list(raw_info.get(field))

    skills = _clean_skills(payload.get("skills"))
    has_profile_content = any(
        bool(value)
        for value in extracted_info.values()
        if isinstance(value, (str, list))
    )
    if not has_profile_content and not skills:
        raise ValueError("图片中未识别到可用的简历信息，请确认图片清晰且内容完整")
    return ImageResumeParseResult(extracted_info=extracted_info, skills=skills)


def _clean_text(value: object, limit: int) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    return str(value).strip()[:limit]


def _clean_item_list(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, str]] = []
    for raw_item in value[:20]:
        if not isinstance(raw_item, Mapping):
            continue
        item: dict[str, str] = {}
        for raw_key, raw_value in raw_item.items():
            key = _clean_text(raw_key, 40)
            text = _clean_text(raw_value, 2000)
            if key and text:
                item[key] = text
        if item:
            cleaned.append(item)
    return cleaned


def _clean_skills(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict] = []
    seen: set[str] = set()
    for index, raw_skill in enumerate(value[:50]):
        if isinstance(raw_skill, str):
            name = raw_skill.strip()[:100]
            raw_score: object = 3
            category = "专业技能"
        elif isinstance(raw_skill, Mapping):
            name = _clean_text(
                raw_skill.get("skill_name") or raw_skill.get("name") or raw_skill.get("tag"),
                100,
            )
            raw_score = raw_skill.get("score", 3)
            category = _clean_text(raw_skill.get("category"), 40) or "专业技能"
        else:
            continue
        if not name or name.casefold() in seen:
            continue
        try:
            score = int(raw_score)
        except (TypeError, ValueError):
            score = 3
        cleaned.append(
            {
                "id": f"skill_{index}",
                "resume_id": "temp",
                "skill_name": name,
                "score": min(5, max(1, score)),
                "category": category,
            }
        )
        seen.add(name.casefold())
    return cleaned


def _safe_provider_error_code(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return ""
    if not isinstance(payload, Mapping):
        return ""
    error = payload.get("error")
    if not isinstance(error, Mapping):
        return ""
    code = error.get("code")
    return str(code).strip()[:80] if code else ""


def _resume_extraction_prompt() -> str:
    return (
        "请识别这份图片简历并输出以下 JSON 结构："
        '{"extracted_info":{"name":"","email":"","phone":"","summary":"",'
        '"intent_city":"","target_position":"","education":[{"school":"","degree":"","major":"","year":""}],'
        '"experience":[{"company":"","position":"","duration":"","description":""}],'
        '"projects":[{"name":"","role":"","duration":"","description":""}],'
        '"certifications":[{"name":"","issuer":"","date":""}],'
        '"languages":[{"language":"","level":""}],"additional_info":""},'
        '"skills":[{"skill_name":"","score":3,"category":"专业技能"}]}。'
        "技能只填写简历中有明确证据的内容，score 使用 1 到 5；"
        "没有的信息使用空字符串或空数组。不要输出 OCR 原文、Markdown 或解释。"
    )


def _resume_fallback_prompt() -> str:
    """降级 prompt：不包含数组型 schema，规避部分视觉模型对复杂 schema
    的超长输出/截断问题；字段与主提取结构兼容（education_level 等多余
    字段会被 _normalize_resume_payload 忽略）。"""
    return (
        "识别图片简历中的基本信息，用简体中文输出 JSON，只包含这些字段"
        "（图片中缺失的留空，不要编造，不要输出其他任何字段）："
        '{"name":"","email":"","phone":"","summary":"","intent_city":"",'
        '"target_position":"","education_level":"","years_of_experience":"",'
        '"salary_expectation":""}'
    )


def _resume_document_page_prompt(page_num: int, total_pages: int) -> str:
    return (
        f"这是多页文档简历的第 {page_num}/{total_pages} 页。"
        "请提取本页中可见的简历信息，输出 JSON："
        '{"name":"","email":"","phone":"","summary":"","target_position":"",'
        '"education":[{"school":"","degree":"","major":"","year":""}],'
        '"experience":[{"company":"","position":"","duration":"","description":""}],'
        '"projects":[{"name":"","role":"","duration":"","description":""}],'
        '"certifications":[{"name":"","issuer":"","date":""}],'
        '"language":[{"language":"","level":""}],"additional_info":""}'
        "。没有的信息留空字符串或空数组，不输出解释。"
    )


def _has_any_value(info: dict) -> bool:
    for key, val in info.items():
        if isinstance(val, str) and val.strip():
            return True
        if isinstance(val, list) and len(val) > 0:
            return True
    return False


def _merge_page_results(pages: list[dict]) -> dict:
    merged: dict = {
        "name": "", "email": "", "phone": "", "summary": "",
        "intent_city": "", "target_position": "", "additional_info": "",
        "education": [],
        "experience": [],
        "projects": [],
        "certifications": [],
        "languages": [],
    }
    for page in pages:
        for key in ("name", "email", "phone", "summary", "intent_city", "target_position"):
            if not merged.get(key) and isinstance(page.get(key), str) and page[key].strip():
                merged[key] = page[key]
        if not merged.get("additional_info") or isinstance(page.get("additional_info"), str):
            add = page.get("additional_info", "")
            if add and isinstance(add, str):
                merged["additional_info"] = (merged.get("additional_info", "") or "") + ("\n" + add if merged.get("additional_info") else add)
        for list_key in ("education", "experience", "projects", "certifications"):
            items = page.get(list_key)
            if isinstance(items, list):
                merged[list_key].extend(items)
        langs = page.get("languages") or page.get("language")
        if isinstance(langs, list):
            merged["languages"].extend(langs)
    return merged
