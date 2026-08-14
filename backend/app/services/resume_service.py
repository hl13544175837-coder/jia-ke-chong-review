import json
import logging
import os
import socket
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from flask import current_app
from runtime_paths import DEFAULT_UPLOAD_FOLDER, resolve_stored_upload_path

# 指向 base_agent，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from resume_parser import ResumeParser
from .. import db
from ..models import Candidate, CandidateTag, User
from .public_errors import stored_resume_parse_error
from .resume_quality import check_extracted_quality


logger = logging.getLogger(__name__)


def resume_parse_node_id() -> str:
    return (os.environ.get("HOSTNAME") or socket.gethostname() or "local")[:120]


def resume_parse_queue_marker() -> str:
    return f"queued:{resume_parse_node_id()}"


class ResumeBatchService:
    def __init__(self, parser=None):
        self._parser = parser

    @property
    def parser(self):
        if self._parser is None:
            self._parser = ResumeParser()
        return self._parser

    def _owner_org_id(self, owner_hr_id: int) -> int:
        user = db.session.get(User, owner_hr_id) if owner_hr_id else None
        return (user.org_id if user else None) or 1

    def parse_and_save(
        self,
        file_path: str,
        owner_hr_id: int,
        upload_batch_id: int = None,
        raw_file_name: str | None = None,
        raw_file_data: bytes | None = None,
    ) -> Candidate:
        """解析单份简历，存入数据库，返回 Candidate 对象"""
        result = self.parser.parse_resume(file_path)

        candidate = Candidate(
            org_id=self._owner_org_id(owner_hr_id),
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            raw_file_path=file_path,
            raw_file_name=raw_file_name or Path(file_path).name,
            raw_file_data=raw_file_data,
            resume_json={},
            parse_status="ok",
        )
        db.session.add(candidate)
        db.session.flush()  # 获取 candidate.id
        self._apply_parse_result(candidate, result)
        db.session.commit()
        return candidate

    def create_from_structured_resume(
        self,
        *,
        file_path: str,
        owner_hr_id: int,
        parse_result: dict,
        upload_batch_id: int,
        org_id: int,
        resume_sha256: str,
        raw_file_name: str,
        raw_file_data: bytes,
        commit: bool = True,
    ) -> Candidate:
        """直接使用 Agent 提供的结构化简历建档，不调用模型。"""
        normalized = self.normalize_structured_resume(parse_result)
        candidate = Candidate(
            org_id=org_id,
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            resume_json={},
            raw_file_path=file_path,
            raw_file_name=raw_file_name,
            raw_file_data=raw_file_data,
            resume_sha256=resume_sha256,
            parse_status="ok",
        )
        db.session.add(candidate)
        db.session.flush()
        self._apply_parse_result(candidate, normalized)
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        return candidate

    def normalize_structured_resume(self, parse_result: dict) -> dict:
        """限制 Agent 结构化数据大小，并清理会进入主档的基础字段。"""
        if not isinstance(parse_result, dict):
            raise ValueError("结构化简历必须是对象")
        encoded = json.dumps(parse_result, ensure_ascii=False).encode("utf-8")
        if len(encoded) > 1024 * 1024:
            raise ValueError("结构化简历内容超过1MB")

        normalized = dict(parse_result)
        normalized["extracted_info"] = self._sanitize_profile(
            parse_result.get("extracted_info") or {}
        )
        normalized["skills"] = self._sanitize_structured_skills(
            parse_result.get("skills") or []
        )
        return normalized

    def _sanitize_structured_skills(self, skills: list) -> list:
        """Normalize skill values while preserving the Agent's valid JSON shape."""
        if not isinstance(skills, list):
            return []
        cleaned = []
        seen = set()
        for raw in skills[:50]:
            if not isinstance(raw, dict):
                continue
            uses_tag = "skill_name" not in raw and "tag" in raw
            name = str(raw.get("skill_name") or raw.get("tag") or "").strip()[:100]
            if not name or name in seen:
                continue
            try:
                score = int(raw.get("score", 3))
            except (TypeError, ValueError):
                score = 3
            item = {
                "tag" if uses_tag else "skill_name": name,
                "score": min(5, max(1, score)),
            }
            if "category" in raw:
                item["category"] = str(raw.get("category") or "").strip()[:40]
            cleaned.append(item)
            seen.add(name)
        return cleaned

    def create_pending_candidate(
        self,
        file_path: str,
        owner_hr_id: int,
        display_name: str,
        upload_batch_id: int = None,
        org_id: int | None = None,
        resume_sha256: str | None = None,
        raw_file_name: str | None = None,
        raw_file_data: bytes | None = None,
    ) -> Candidate:
        """先安全落库，模型解析交给后台任务，避免上传请求被网关截断。"""
        candidate = Candidate(
            org_id=org_id or self._owner_org_id(owner_hr_id),
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked=display_name[:100],
            resume_json={},
            raw_file_path=file_path,
            raw_file_name=raw_file_name or Path(file_path).name,
            raw_file_data=raw_file_data,
            resume_sha256=resume_sha256,
            parse_status="pending",
            parse_error=resume_parse_queue_marker(),
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    def queue_candidate(self, candidate: Candidate) -> Candidate:
        candidate.parse_status = "pending"
        candidate.parse_error = resume_parse_queue_marker()
        db.session.commit()
        return candidate

    def create_failed_candidate(
        self,
        file_path: str,
        owner_hr_id: int,
        display_name: str,
        error: Exception,
        upload_batch_id: int = None,
        raw_file_name: str | None = None,
        raw_file_data: bytes | None = None,
    ) -> Candidate:
        candidate = Candidate(
            org_id=self._owner_org_id(owner_hr_id),
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked=display_name[:100],
            resume_json={},
            raw_file_path=file_path,
            raw_file_name=raw_file_name or Path(file_path).name,
            raw_file_data=raw_file_data,
            parse_status="failed",
            parse_error=stored_resume_parse_error(error),
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    def reparse_candidate(self, candidate: Candidate) -> Candidate:
        if not candidate.raw_file_path and not candidate.raw_file_data:
            raise ValueError("这条候选人没有可重试的原始文件")

        candidate_id = candidate.id
        try:
            candidate.parse_status = "processing"
            candidate.parse_error = None
            db.session.flush()

            with self._candidate_source_path(candidate) as source_path:
                result = self.parser.parse_resume(str(source_path))
            self._apply_parse_result(candidate, result)
            db.session.commit()
            return candidate
        except Exception as exc:
            logger.exception("候选人 %s 重新解析失败", candidate_id)
            db.session.rollback()
            failed_candidate = db.session.get(Candidate, candidate_id)
            if failed_candidate:
                failed_candidate.parse_status = "failed"
                failed_candidate.parse_error = stored_resume_parse_error(exc)
                db.session.commit()
            raise

    def parse_file(self, file_path: str) -> dict:
        """解析一份新文件，但不立即改候选人数据。

        替换简历时先用这个结果做重复身份检查，只有确认可写入后
        才覆盖旧档案，避免一半成功一半失败。
        """
        return self.parser.parse_resume(file_path)

    def replace_candidate_resume(
        self,
        candidate: Candidate,
        *,
        file_path: str,
        content_sha256: str,
        parse_result: dict,
        raw_file_name: str | None = None,
        raw_file_data: bytes | None = None,
    ) -> Candidate:
        """用新原件和新解析结果覆盖简历档案，保留候选人 ID 和业务历史。"""
        candidate.raw_file_path = file_path
        candidate.raw_file_name = raw_file_name or Path(file_path).name
        candidate.raw_file_data = raw_file_data
        candidate.resume_sha256 = content_sha256
        self._apply_parse_result(candidate, parse_result)
        db.session.commit()
        return candidate

    def mark_replacement_parse_failed(
        self,
        candidate: Candidate,
        *,
        file_path: str,
        content_sha256: str,
        display_name: str,
        error: Exception,
        raw_file_name: str | None = None,
        raw_file_data: bytes | None = None,
    ) -> Candidate:
        """新原件解析失败时，保留新原件供人工确认，不留用旧结构化内容。"""
        candidate.raw_file_path = file_path
        candidate.raw_file_name = raw_file_name or Path(file_path).name
        candidate.raw_file_data = raw_file_data
        candidate.resume_sha256 = content_sha256
        candidate.name_masked = display_name[:100]
        candidate.email_masked = ""
        candidate.phone_masked = ""
        candidate.resume_json = {}
        candidate.parse_status = "failed"
        candidate.parse_error = stored_resume_parse_error(error)
        self._replace_candidate_tags(candidate, [])
        db.session.commit()
        return candidate

    @contextmanager
    def _candidate_source_path(self, candidate: Candidate):
        upload_root = current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER
        try:
            source_path = resolve_stored_upload_path(candidate.raw_file_path, upload_root)
        except (TypeError, RuntimeError, ValueError):
            source_path = None

        if source_path is not None and source_path.is_file():
            yield source_path
            return

        file_data = bytes(candidate.raw_file_data or b"")
        if not file_data:
            raise ValueError("这条候选人没有可重试的原始文件")

        suffix = Path(candidate.raw_file_name or candidate.raw_file_path or "").suffix
        temporary = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        temporary_path = Path(temporary.name)
        try:
            with temporary:
                temporary.write(file_data)
            yield temporary_path
        finally:
            temporary_path.unlink(missing_ok=True)

    def _apply_parse_result(self, candidate: Candidate, result: dict) -> None:
        info = result.get("extracted_info", {}) if isinstance(result, dict) else {}
        skills = result.get("skills", []) if isinstance(result, dict) else []
        has_profile_content = isinstance(info, dict) and any(
            value is not None
            and value != ""
            and (not isinstance(value, (list, dict)) or bool(value))
            for value in info.values()
        )
        has_skill_content = isinstance(skills, list) and any(
            isinstance(item, dict)
            and str(item.get("skill_name") or item.get("tag") or "").strip()
            for item in skills
        )
        if not has_profile_content and not has_skill_content:
            candidate.resume_json = {}
            candidate.parse_status = "failed"
            candidate.parse_error = "简历解析结果为空，请重试或人工补录"
            return
        # 质量校验: 抽取字段疑似异常时标记失败,不写入 ok 状态(防止脏数据进简历库)
        issues = check_extracted_quality(info)
        if issues:
            candidate.resume_json = {}
            candidate.parse_status = "failed"
            candidate.parse_error = (
                "简历解析结果字段疑似异常（"
                + "、".join(issues)
                + "），请重试或人工补录"
            )
            return
        candidate.name_masked = info.get("name", "")[:100] if info.get("name") else ""
        candidate.email_masked = info.get("email", "")[:100] if info.get("email") else ""
        candidate.phone_masked = info.get("phone", "")[:30] if info.get("phone") else ""
        candidate.resume_json = result
        candidate.parse_status = "ok"
        candidate.parse_error = None

        self._replace_candidate_tags(candidate, result.get("skills", []) if isinstance(result, dict) else [])

    def update_candidate_profile(self, candidate: Candidate, profile: dict, skills=None) -> Candidate:
        """保存 HR 手动修正后的候选人档案，并同步候选人主信息与技能标签。"""
        resume = candidate.resume_json if isinstance(candidate.resume_json, dict) else {}
        next_resume = dict(resume)
        existing_info = next_resume.get("extracted_info")
        if not isinstance(existing_info, dict):
            existing_info = {}

        next_info = dict(existing_info)
        next_info.update(self._sanitize_profile(profile))
        next_resume["extracted_info"] = next_info

        if skills is not None:
            next_resume["skills"] = self._sanitize_skills(skills)

        candidate.resume_json = next_resume
        candidate.name_masked = str(next_info.get("name") or "")[:100]
        candidate.email_masked = str(next_info.get("email") or "")[:100]
        candidate.phone_masked = str(next_info.get("phone") or "")[:30]
        candidate.parse_status = "ok"
        candidate.parse_error = None

        if skills is not None:
            self._replace_candidate_tags(candidate, next_resume.get("skills", []))

        db.session.commit()
        return candidate

    def _sanitize_profile(self, profile: dict) -> dict:
        if not isinstance(profile, dict):
            return {}

        scalar_fields = {
            "name": 100,
            "email": 100,
            "phone": 30,
            "summary": 2000,
            "intent_city": 80,
            "target_position": 120,
            "work_years": 40,
            "additional_info": 4000,
        }
        list_fields = {
            "education",
            "experience",
            "projects",
            "certifications",
            "languages",
        }

        cleaned = {}
        for field, limit in scalar_fields.items():
            if field in profile:
                cleaned[field] = str(profile.get(field) or "").strip()[:limit]
        for field in list_fields:
            if field in profile:
                cleaned[field] = self._sanitize_item_list(profile.get(field))
        return cleaned

    def _sanitize_item_list(self, value) -> list:
        if not isinstance(value, list):
            return []
        items = []
        for raw in value[:20]:
            if isinstance(raw, dict):
                item = {}
                for key, val in raw.items():
                    clean_key = str(key or "").strip()[:40]
                    clean_val = str(val or "").strip()[:2000]
                    if clean_key and clean_val:
                        item[clean_key] = clean_val
                if item:
                    items.append(item)
            else:
                text = str(raw or "").strip()[:2000]
                if text:
                    items.append(text)
        return items

    def _sanitize_skills(self, skills: list) -> list:
        if not isinstance(skills, list):
            return []
        cleaned = []
        seen = set()
        for raw in skills[:50]:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("skill_name") or raw.get("tag") or "").strip()[:100]
            if not name or name in seen:
                continue
            try:
                score = int(raw.get("score", 3))
            except (TypeError, ValueError):
                score = 3
            score = min(5, max(1, score))
            cleaned.append({
                "skill_name": name,
                "score": score,
                "category": str(raw.get("category") or "人工修正")[:40],
            })
            seen.add(name)
        return cleaned

    def _replace_candidate_tags(self, candidate: Candidate, skills: list) -> None:
        CandidateTag.query.filter_by(candidate_id=candidate.id).delete()
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            tag_name = str(skill.get("skill_name") or skill.get("tag") or "").strip()
            if not tag_name:
                continue
            tag = CandidateTag(
                org_id=candidate.org_id or 1,
                candidate_id=candidate.id,
                tag=tag_name[:100],
                score=self._coerce_score(skill.get("score", 3)),
            )
            db.session.add(tag)

    def _coerce_score(self, value) -> int:
        try:
            score = int(value)
        except (TypeError, ValueError):
            score = 3
        return min(5, max(1, score))
