"""Recruiter-owned online resume imports and library operations."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlsplit

from flask import current_app
from sqlalchemy.orm import selectinload

from .. import db
from ..models import Event, OnlineResume, RecruitmentDemand, User
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
)
from ..time_utils import utc_now
from .account_display_service import account_display_name
from .resume_quality import check_extracted_quality


@dataclass
class OnlineResumeValidationError(Exception):
    message: str


def _normalize_source_url(value: str | None, *, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise OnlineResumeValidationError("来源链接格式无效")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise OnlineResumeValidationError(
            f"来源链接长度不能超过 {max_length} 个字符"
        )
    if not normalized.lower().startswith(("http://", "https://")):
        raise OnlineResumeValidationError(
            "来源链接必须以 http:// 或 https:// 开头"
        )
    if "\\" in normalized or any(ord(char) < 32 or ord(char) == 127 for char in normalized):
        raise OnlineResumeValidationError("来源链接格式无效")
    try:
        parsed = urlsplit(normalized)
        _ = parsed.port
    except ValueError as exc:
        raise OnlineResumeValidationError("来源链接格式无效") from exc
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or any(char.isspace() for char in normalized)
    ):
        raise OnlineResumeValidationError("来源链接格式无效")
    return normalized


def _safe_serialized_source_url(value: str | None, *, max_length: int) -> str | None:
    """Hide unsafe legacy URLs without mutating historical database rows."""
    try:
        return _normalize_source_url(value, max_length=max_length)
    except OnlineResumeValidationError:
        return None


def _validate_extracted_quality(info: dict) -> None:
    """校验抽取字段质量，异常时抛错（导入与编辑共用，防止脏数据入库）。"""
    issues = check_extracted_quality(info)
    if not issues:
        return
    field_label = {
        "target_position": "目标岗位",
        "salary_expectation": "期望薪资",
        "location": "所在地",
        "structure": "结构化内容",
    }
    label = field_label.get(issues[0], "字段")
    raw_value = ""
    if isinstance(info, dict):
        raw_value = info.get(
            "target_position"
            if issues[0] == "target_position"
            else "salary_expectation"
            if issues[0] == "salary_expectation"
            else "location"
        )
    display = str(raw_value)[:40] if raw_value else ""
    raise OnlineResumeValidationError(
        f"在线简历的{label}疑似异常或格式错误（{display}），"
        "请修正后再保存"
    )


class OnlineResumeService:
    MAX_BATCH = 100
    MAX_RESUME_JSON_BYTES = 1024 * 1024
    MAX_CHAT_JSON_BYTES = 4 * 1024 * 1024
    MAX_CHAT_MESSAGES = 10000
    MAX_CHAT_SENDER_LENGTH = 40
    MAX_CHAT_TEXT_LENGTH = 20000
    MAX_CHAT_SENT_AT_LENGTH = 80
    MAX_SOURCE_URL_LENGTH = 2000

    def import_batch(
        self,
        *,
        org_id: int,
        owner_hr_id: int,
        role: str,
        items: list[dict],
    ) -> dict:
        """Create or update by (org, owner, platform, external_record_id).

        支持轻量导入：外部 Agent 提供 name、明确的 demand_id 和基本信息
        （phone/position/resume_text 等）；external_record_id / resume_json 可省略，
        系统自动补全。需求缺失、不可用或无权管理时逐条拒绝，绝不猜测归属。
        """

        if not isinstance(items, list):
            raise OnlineResumeValidationError("请提供在线简历列表")
        if not items:
            raise OnlineResumeValidationError("请至少提供一份在线简历")
        if len(items) > self.MAX_BATCH:
            raise OnlineResumeValidationError(
                f"单次最多导入 {self.MAX_BATCH} 份在线简历"
            )

        result = {
            "created": 0,
            "updated": 0,
            "skipped_deleted": 0,
            "failed": 0,
            "warnings": 0,
            "results": [],
        }
        for raw_item in items:
            external_record_id = self._result_external_id(raw_item)
            try:
                item = self._validate_import_item(raw_item)
                if self._has_deleted_import_receipt(
                    org_id=org_id,
                    owner_hr_id=owner_hr_id,
                    source_platform=item["source_platform"],
                    external_record_id=item["external_record_id"],
                ):
                    result["skipped_deleted"] += 1
                    result["results"].append(
                        {
                            "external_record_id": item["external_record_id"],
                            "status": "skipped_deleted",
                        }
                    )
                    continue
                demand, demand_warning = self._resolve_manageable_demand(
                    org_id=org_id,
                    owner_hr_id=owner_hr_id,
                    role=role,
                    demand_id=item["demand_id"],
                )
                if demand is None:
                    result["failed"] += 1
                    result["results"].append(
                        {
                            "external_record_id": item["external_record_id"],
                            "status": "error",
                            "error": demand_warning or "没有可导入的招聘需求",
                        }
                    )
                    continue
                row, status = self._upsert_item(
                    org_id=org_id,
                    owner_hr_id=owner_hr_id,
                    role=role,
                    demand=demand,
                    item=item,
                )
                db.session.commit()
                result[status] += 1
                entry = {
                    "external_record_id": row.external_record_id,
                    "id": row.id,
                    "status": status,
                }
                warnings = [w for w in (demand_warning, item.get("_warning")) if w]
                if warnings:
                    result["warnings"] += 1
                    entry["warnings"] = warnings
                result["results"].append(entry)
            except OnlineResumeValidationError as exc:
                db.session.rollback()
                result["failed"] += 1
                result["results"].append(
                    {
                        "external_record_id": external_record_id,
                        "status": "error",
                        "error": exc.message,
                    }
                )
            except DemandContextError as exc:
                db.session.rollback()
                result["failed"] += 1
                result["results"].append(
                    {
                        "external_record_id": external_record_id,
                        "status": "error",
                        "error": exc.message,
                    }
                )
            except Exception:
                db.session.rollback()
                current_app.logger.exception("在线简历单项导入发生未处理异常")
                result["failed"] += 1
                result["results"].append(
                    {
                        "external_record_id": external_record_id,
                        "status": "error",
                        "error": "导入失败，请稍后重试",
                    }
                )
        return result

    def list_for_actor(
        self,
        *,
        org_id: int,
        actor_id: int,
        role: str,
        page: int,
        per_page: int,
        demand_id: int | None = None,
        gender: str | None = None,
        age_from: int | None = None,
        age_to: int | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        source_platform: str | None = None,
        education_level: str | None = None,
        location: str | None = None,
        keyword: str | None = None,
        owner_hr_id: int | None = None,
    ) -> dict:
        query = OnlineResume.query.filter(OnlineResume.org_id == org_id)
        if role not in {"recruiter", "manager", "admin"}:
            query = query.filter(OnlineResume.id < 0)
        if owner_hr_id is not None and role in {"recruiter", "manager", "admin"}:
            query = query.filter(OnlineResume.owner_hr_id == owner_hr_id)
        if demand_id is not None:
            query = query.filter(OnlineResume.demand_id == demand_id)
        if source_platform:
            query = query.filter(OnlineResume.source_platform == source_platform)
        if created_from:
            query = query.filter(OnlineResume.created_at >= created_from)
        if created_to:
            query = query.filter(OnlineResume.created_at <= created_to)

        ordered_query = query.order_by(
            OnlineResume.updated_at.desc(),
            OnlineResume.id.desc(),
        )
        needs_json_filter = any(
            (
                gender,
                age_from is not None,
                age_to is not None,
                education_level,
                location,
                keyword and keyword.strip(),
            )
        )
        if not needs_json_filter:
            total = ordered_query.count()
            pages = max(1, -(-total // per_page))
            page = min(page, pages)
            page_items = ordered_query.offset((page - 1) * per_page).limit(per_page).all()
            return {
                "items": self._serialize_page(page_items),
                "total": total,
                "page": page,
                "per_page": per_page,
                "pages": pages,
            }

        # JSON 字段（年龄/性别/学历/城市）在 Python 层过滤，保持兼容 MySQL/SQLite。
        all_items = ordered_query.all()

        keyword_lower = keyword.strip().lower() if keyword else ""
        filtered = []
        for item in all_items:
            info = self._extracted_info(item)
            age = self._parse_age(info.get("age"))
            item_gender = (info.get("gender") or "").strip().lower()
            if gender:
                wanted = gender.strip().lower()
                if wanted in {"男", "male", "m"}:
                    if not (item_gender in {"男", "male", "m"} or item_gender == "男性"):
                        continue
                elif wanted in {"女", "female", "f"}:
                    if not (item_gender in {"女", "female", "f"} or item_gender == "女性"):
                        continue
            if age_from is not None and (age is None or age < age_from):
                continue
            if age_to is not None and (age is None or age > age_to):
                continue
            if education_level:
                if (info.get("education_level") or "") != education_level:
                    continue
            if location:
                if (info.get("location") or "") != location:
                    continue
            if keyword_lower:
                haystack = " ".join([
                    item.display_name or "",
                    info.get("name") or "",
                    info.get("target_position") or "",
                    info.get("summary") or "",
                ]).lower()
                raw = item.resume_json.get("raw_text") if isinstance(item.resume_json, dict) else None
                if isinstance(raw, str):
                    haystack += " " + raw.lower()
                if keyword_lower not in haystack:
                    continue
            filtered.append(item)

        total = len(filtered)
        pages = max(1, -(-total // per_page))
        page = min(page, pages)
        start = (page - 1) * per_page
        page_items = filtered[start:start + per_page]
        return {
            "items": self._serialize_page(page_items),
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": pages,
        }

    @staticmethod
    def owner_options(*, org_id: int) -> list[dict]:
        owner_ids = [
            owner_id
            for (owner_id,) in db.session.query(OnlineResume.owner_hr_id)
            .filter(OnlineResume.org_id == org_id)
            .distinct()
            .all()
        ]
        if not owner_ids:
            return []
        owners = User.query.filter(
            User.org_id == org_id,
            User.id.in_(owner_ids),
        ).order_by(User.id.asc()).all()
        return [
            {
                "id": owner.id,
                "name": account_display_name(owner),
                "email": owner.email,
            }
            for owner in owners
        ]

    @staticmethod
    def demand_options(*, org_id: int) -> list[dict]:
        """Return only demands that are actually represented in this org's library."""
        demand_ids = [
            demand_id
            for (demand_id,) in db.session.query(OnlineResume.demand_id)
            .filter(OnlineResume.org_id == org_id)
            .distinct()
            .all()
        ]
        if not demand_ids:
            return []
        demands = RecruitmentDemand.query.filter(
            RecruitmentDemand.org_id == org_id,
            RecruitmentDemand.id.in_(demand_ids),
        ).options(selectinload(RecruitmentDemand.job)).order_by(
            RecruitmentDemand.id.asc()
        ).all()
        return [
            {
                "id": demand.id,
                "request_no": demand.request_no,
                "title": demand.job_title_snapshot or demand.job.title,
            }
            for demand in demands
            if demand.job is not None and demand.job.org_id == org_id
        ]

    @staticmethod
    def _extracted_info(resume: OnlineResume) -> dict:
        payload = resume.resume_json if isinstance(resume.resume_json, dict) else {}
        info = payload.get("extracted_info")
        return info if isinstance(info, dict) else {}

    @staticmethod
    def _parse_age(value) -> int | None:
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            match = re.search(r"(\d+)", value)
            if match:
                return int(match.group(1))
        return None

    def get_for_actor(
        self,
        resume_id: int,
        *,
        org_id: int,
        actor_id: int,
        role: str,
    ) -> OnlineResume | None:
        resume = db.session.get(OnlineResume, resume_id)
        if resume is None or resume.org_id != org_id:
            return None
        if role not in {"recruiter", "manager", "admin"}:
            return None
        return resume

    def update_profile(
        self,
        resume: OnlineResume,
        *,
        display_name: str,
        resume_json: dict,
    ) -> OnlineResume:
        resume.display_name = self._required_text(
            display_name,
            field_name="候选人名称",
            max_length=100,
        )
        if not isinstance(resume_json, dict):
            raise OnlineResumeValidationError("结构化简历必须是对象")
        self._validate_serialized_size(
            resume_json,
            max_bytes=self.MAX_RESUME_JSON_BYTES,
            error_message="结构化简历内容不能超过 1MB",
        )
        extracted_info = resume_json.get("extracted_info")
        info = extracted_info if isinstance(extracted_info, dict) else resume_json
        _validate_extracted_quality(info)
        resume.resume_json = resume_json
        resume.is_manually_edited = True
        resume.updated_at = utc_now()
        db.session.commit()
        return resume

    def delete(
        self,
        resume: OnlineResume,
        *,
        actor_id: int,
        actor_role: str,
    ) -> None:
        linked_demand = db.session.get(RecruitmentDemand, resume.demand_id)
        audit_demand_id = (
            resume.demand_id
            if linked_demand is not None and linked_demand.org_id == resume.org_id
            else None
        )
        payload = {
            "owner_hr_id": resume.owner_hr_id,
            "source_platform": resume.source_platform,
            "external_record_id": resume.external_record_id,
        }
        if audit_demand_id is None and resume.demand_id is not None:
            payload["legacy_demand_id"] = resume.demand_id
        db.session.add(
            Event(
                org_id=resume.org_id,
                actor_id=actor_id,
                actor_role=actor_role,
                action="online_resume.deleted",
                entity_id=resume.id,
                entity_type="online_resume",
                demand_id=audit_demand_id,
                payload=payload,
                result="success",
                source="ui",
                severity="warning",
            )
        )
        db.session.delete(resume)
        db.session.commit()

    def serialize(self, resume: OnlineResume) -> dict:
        demand = db.session.get(RecruitmentDemand, resume.demand_id)
        owner = db.session.get(User, resume.owner_hr_id)
        return self._serialize(resume, demand=demand, owner=owner)

    def _serialize_page(self, resumes: list[OnlineResume]) -> list[dict]:
        if not resumes:
            return []
        demand_ids = {resume.demand_id for resume in resumes}
        owner_ids = {resume.owner_hr_id for resume in resumes}
        demands = {
            demand.id: demand
            for demand in RecruitmentDemand.query.filter(
                RecruitmentDemand.id.in_(demand_ids)
            ).options(selectinload(RecruitmentDemand.job)).all()
        }
        owners = {
            owner.id: owner
            for owner in User.query.filter(User.id.in_(owner_ids)).all()
        }
        return [
            self._serialize(
                resume,
                demand=demands.get(resume.demand_id),
                owner=owners.get(resume.owner_hr_id),
                include_full=False,
            )
            for resume in resumes
        ]

    def _serialize(
        self,
        resume: OnlineResume,
        *,
        demand: RecruitmentDemand | None,
        owner: User | None,
        include_full: bool = True,
    ) -> dict:
        if demand is not None:
            demand_job = demand.job
            if (
                demand.org_id != resume.org_id
                or demand_job is None
                or demand_job.org_id != resume.org_id
            ):
                demand = None
        if owner is not None and owner.org_id != resume.org_id:
            owner = None
        demand_summary = None
        if demand is not None:
            title = demand.job_title_snapshot or (demand.job.title if demand.job else "")
            demand_summary = {
                "id": demand.id,
                "request_no": demand.request_no,
                "title": title,
            }
        chat = resume.chat_json if isinstance(resume.chat_json, list) else []
        info = self._extracted_info(resume)
        payload = {
            "id": resume.id,
            "org_id": resume.org_id,
            "owner_hr_id": resume.owner_hr_id,
            "owner_name": account_display_name(owner),
            "demand": demand_summary,
            "boss_account": resume.boss_account,
            "source_platform": resume.source_platform,
            "external_record_id": resume.external_record_id,
            "display_name": resume.display_name,
            "extracted": {
                "age": info.get("age") or "",
                "gender": info.get("gender") or "",
                "education_level": info.get("education_level") or "",
                "years_of_experience": info.get("years_of_experience") or "",
                "salary_expectation": info.get("salary_expectation") or "",
                "location": info.get("location") or "",
                "target_position": info.get("target_position") or "",
                "availability": info.get("availability") or "",
                "summary": info.get("summary") or "",
            },
            "latest_chat": chat[-1] if chat else None,
            "source_url": _safe_serialized_source_url(
                resume.source_url,
                max_length=self.MAX_SOURCE_URL_LENGTH,
            ),
            "created_at": resume.created_at.isoformat() if resume.created_at else None,
            "updated_at": resume.updated_at.isoformat() if resume.updated_at else None,
        }
        # 列表接口不携带完整 resume_json 与聊天记录，避免 BOSS 长聊天把
        # 单页响应撑到上百 KB；详情接口（serialize）才返回全量。
        if include_full:
            payload["resume_json"] = resume.resume_json
            payload["chat_json"] = chat
        return payload

    def _upsert_item(
        self,
        *,
        org_id: int,
        owner_hr_id: int,
        role: str,
        demand: RecruitmentDemand,
        item: dict,
    ) -> tuple[OnlineResume, str]:
        resume = OnlineResume.query.filter_by(
            org_id=org_id,
            owner_hr_id=owner_hr_id,
            source_platform=item["source_platform"],
            external_record_id=item["external_record_id"],
        ).first()
        if resume is not None:
            if resume.boss_account != item["boss_account"]:
                raise OnlineResumeValidationError("已导入在线简历不能更换 BOSS 账号")
            if resume.demand_id != demand.id:
                raise OnlineResumeValidationError("已导入在线简历不能更换招聘需求")
            if not resume.is_manually_edited:
                resume.display_name = item["display_name"]
                resume.resume_json = item["resume_json"]
            resume.chat_json = self._merge_chat_histories(
                resume.chat_json,
                item["chat_json"],
            )
            resume.source_url = item["source_url"]
            resume.updated_at = utc_now()
            return resume, "updated"

        resume = OnlineResume(
            org_id=org_id,
            owner_hr_id=owner_hr_id,
            demand_id=demand.id,
            boss_account=item["boss_account"],
            source_platform=item["source_platform"],
            external_record_id=item["external_record_id"],
            display_name=item["display_name"],
            resume_json=item["resume_json"],
            chat_json=item["chat_json"],
            source_url=item["source_url"],
        )
        db.session.add(resume)
        db.session.flush()
        db.session.add(
            Event(
                org_id=org_id,
                actor_id=owner_hr_id,
                actor_role=role,
                action="online_resume.imported",
                entity_id=resume.id,
                entity_type="online_resume",
                demand_id=demand.id,
                payload={
                    "source_platform": item["source_platform"],
                    "external_record_id": item["external_record_id"],
                },
                result="success",
                source="agent",
            )
        )
        return resume, "created"

    def _resolve_manageable_demand(
        self,
        *,
        org_id: int,
        owner_hr_id: int,
        role: str,
        demand_id: int | None,
    ) -> tuple[RecruitmentDemand | None, str | None]:
        """严格解析需求，避免简历被静默归入不相关的招聘需求。"""
        if demand_id is not None and demand_id > 0:
            try:
                demand = resolve_demand_context(
                    org_id=org_id,
                    demand_id=demand_id,
                    open_only=True,
                )
            except DemandContextError:
                demand = None
            if demand is not None and can_manage_demand(
                owner_hr_id, role, org_id, demand
            ):
                return demand, None
            return None, (
                f"需求({demand_id})不可用或无权导入，请选择当前账号可管理的招聘需求"
            )
        return None, "在线简历导入必须指定明确的招聘需求"

    def _validate_import_item(self, item: dict) -> dict:
        if not isinstance(item, dict):
            raise OnlineResumeValidationError("每份在线简历必须是对象")

        # 极简模式：仅姓名必填；其余字段均可由系统补全。
        display_name = self._optional_text(
            item.get("display_name") or item.get("name"),
            max_length=100,
        )
        if not display_name:
            raise OnlineResumeValidationError("候选人姓名不能为空")

        # demand_id 必须明确传入；禁止静默猜测需求，以免候选人进入错误流程。
        demand_id: int | None = None
        raw_demand_id = item.get("demand_id")
        if raw_demand_id not in (None, "", 0):
            try:
                parsed = int(raw_demand_id)
                demand_id = parsed if parsed > 0 else None
            except (TypeError, ValueError):
                demand_id = None

        # resume_json 可选：缺失时从 resume_text / 顶层字段自动构造
        resume_text = item.get("resume_text") or item.get("raw_text")
        if isinstance(resume_text, str):
            resume_text = resume_text.strip()
        resume_json = item.get("resume_json")
        if not isinstance(resume_json, dict):
            resume_json = {}
        else:
            # 先校验外部显式传入的结构化简历：超限必须拒绝，不能静默丢弃后重建
            self._validate_serialized_size(
                resume_json,
                max_bytes=self.MAX_RESUME_JSON_BYTES,
                error_message="结构化简历内容不能超过 1MB",
            )
        extracted_info = resume_json.get("extracted_info")
        info = extracted_info if isinstance(extracted_info, dict) else {}
        if not info:
            info = self._build_minimal_info(item, resume_text)
            resume_json = {
                "extracted_info": info,
                "raw_text": resume_text or "",
            }
        else:
            # 外部显式提供完整结构化数据时保留严格质量校验（防脏数据）；
            # 极简自动构造的字段走宽松路径，允许人工后续补全。
            _validate_extracted_quality(info)
        self._validate_serialized_size(
            resume_json,
            max_bytes=self.MAX_RESUME_JSON_BYTES,
            error_message="结构化简历内容不能超过 1MB",
        )

        chat_json = item.get("chat_json")
        if not isinstance(chat_json, list):
            chat_json = []
        chat_json = self._normalize_chat_messages(chat_json)

        normalized_source_url = _normalize_source_url(
            item.get("source_url"),
            max_length=self.MAX_SOURCE_URL_LENGTH,
        )

        # external_record_id 可选：缺省自动生成，保证幂等去重
        external_record_id = self._optional_text(
            item.get("external_record_id"),
            max_length=200,
        )
        if not external_record_id:
            external_record_id = self._auto_external_id(item, info)
        source_platform = self._optional_text(
            item.get("source_platform") or "BOSS直聘",
            max_length=60,
        ) or "BOSS直聘"
        boss_account = self._optional_text(
            item.get("boss_account"),
            max_length=160,
        )
        if not boss_account:
            boss_account = "unknown"

        return {
            "demand_id": demand_id,
            "external_record_id": external_record_id,
            "boss_account": boss_account,
            "source_platform": source_platform,
            "display_name": display_name,
            "resume_json": resume_json,
            "chat_json": chat_json,
            "source_url": normalized_source_url or None,
            "_warning": None,
        }

    @staticmethod
    def _build_minimal_info(item: dict, resume_text: str | None) -> dict:
        """从极简字段 + 简历原文构造 extracted_info（只放行可靠字段）。"""
        def text_value(*keys):
            for key in keys:
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return None

        info: dict[str, str] = {}
        name = text_value("name", "display_name")
        if name:
            info["name"] = name

        target_position = text_value("target_position", "position")
        if target_position:
            info["target_position"] = target_position
        else:
            info["target_position"] = name or ""

        for key, label in (
            ("age", "age"), ("gender", "gender"),
            ("education_level", "education_level"),
            ("years_of_experience", "years_of_experience"),
            ("salary_expectation", "salary_expectation"),
            ("location", "location"),
            ("availability", "availability"),
            ("summary", "summary"),
        ):
            value = text_value(key)
            if value:
                info[label] = value

        if isinstance(resume_text, str) and resume_text:
            info.setdefault("age", OnlineResumeService._extract_age(resume_text))
            info.setdefault(
                "years_of_experience",
                OnlineResumeService._extract_experience(resume_text),
            )
            education = OnlineResumeService._extract_education(resume_text)
            if education:
                info.setdefault("education_level", education)
            city = OnlineResumeService._extract_city(resume_text)
            if city:
                info.setdefault("location", city)
            salary = OnlineResumeService._extract_salary(resume_text)
            if salary:
                info.setdefault("salary_expectation", salary)
        if not info.get("summary"):
            info["summary"] = name or ""
        return info

    @staticmethod
    def _auto_external_id(item: dict, info: dict) -> str:
        platform = str(
            item.get("source_platform") or "BOSS直聘"
        ).strip()[:20] or "BOSS直聘"
        phone = str(info.get("phone") or item.get("phone") or "").strip()
        name = str(info.get("name") or item.get("name") or "").strip()
        base = phone or name or "candidate"
        digest = json.dumps(
            [base, str(item.get("source_url") or "")],
            ensure_ascii=False,
        ).encode("utf-8")
        import hashlib

        suffix = hashlib.sha1(digest).hexdigest()[:10]
        return f"{platform}:auto:{base[:40]}:{suffix}"

    @staticmethod
    def _extract_age(text: str) -> str:
        match = re.search(r"(\d{1,2})\s*岁", text)
        return f"{match.group(1)}岁" if match else ""

    @staticmethod
    def _extract_experience(text: str) -> str:
        match = re.search(r"(\d+)\s*年(?:以上)?(?:工作)?经验", text)
        return f"{match.group(1)}年" if match else ""

    @staticmethod
    def _extract_education(text: str) -> str:
        for level in ("博士", "硕士", "本科", "大专", "中专", "高中"):
            if level in text:
                return level
        return ""

    _CITIES = (
        "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京",
        "苏州", "西安", "重庆", "天津", "长沙", "郑州", "青岛", "大连",
        "厦门", "福州", "济南", "合肥", "宁波", "无锡", "佛山", "东莞",
        "珠海", "昆明", "南昌", "贵阳", "南宁", "海口", "兰州", "太原",
    )

    @classmethod
    def _extract_city(cls, text: str) -> str:
        for city in cls._CITIES:
            if city in text:
                return city
        return ""

    @staticmethod
    def _extract_salary(text: str) -> str:
        pattern = re.compile(
            r"\d+(?:\.\d+)?\s*[kKwW万]?\s*[-~至]\s*\d+(?:\.\d+)?\s*[kKwW万]"
            r"|\d+(?:\.\d+)?\s*[kKwW万]\s*[×x*]\s*\d+\s*薪"
        )
        match = pattern.search(text)
        return match.group(0) if match else ""

    @staticmethod
    def _optional_text(value, *, max_length: int) -> str:
        if not isinstance(value, str) or not value.strip():
            return ""
        normalized = value.strip()
        if len(normalized) > max_length:
            return normalized[:max_length]
        return normalized

    def _normalize_chat_messages(self, chat_json: list) -> list[dict]:
        if len(chat_json) > self.MAX_CHAT_MESSAGES:
            raise OnlineResumeValidationError("完整聊天记录最多 10000 条")
        self._validate_serialized_size(
            chat_json,
            max_bytes=self.MAX_CHAT_JSON_BYTES,
            error_message="完整聊天记录不能超过 4MB",
        )
        normalized_by_key = {}
        for message in chat_json:
            if not isinstance(message, dict):
                raise OnlineResumeValidationError("每条聊天记录必须是对象")
            if any(
                not isinstance(message.get(field), str) or not message[field].strip()
                for field in ("sender", "text", "sent_at")
            ):
                raise OnlineResumeValidationError(
                    "聊天记录缺少 sender、text 或 sent_at"
                )
            if len(message["sender"]) > self.MAX_CHAT_SENDER_LENGTH:
                raise OnlineResumeValidationError(
                    "聊天发送方长度不能超过 40 个字符"
                )
            if len(message["text"]) > self.MAX_CHAT_TEXT_LENGTH:
                raise OnlineResumeValidationError(
                    "单条聊天内容长度不能超过 20000 个字符"
                )
            if len(message["sent_at"]) > self.MAX_CHAT_SENT_AT_LENGTH:
                raise OnlineResumeValidationError(
                    "聊天时间长度不能超过 80 个字符"
                )
            sent_at = self._normalize_chat_time(message["sent_at"])
            normalized = {
                "sender": message["sender"],
                "text": message["text"],
                "sent_at": sent_at,
            }
            key = (normalized["sender"], normalized["text"], sent_at)
            normalized_by_key[key] = normalized
        normalized_chat = sorted(
            normalized_by_key.values(),
            key=lambda message: self._parse_chat_time(message["sent_at"]),
        )
        self._validate_serialized_size(
            normalized_chat,
            max_bytes=self.MAX_CHAT_JSON_BYTES,
            error_message="完整聊天记录不能超过 4MB",
        )
        return normalized_chat

    def _merge_chat_histories(self, existing, incoming: list) -> list[dict]:
        current = self._normalize_chat_messages(
            existing if isinstance(existing, list) else []
        )
        merged_by_key = {
            (message["sender"], message["text"], message["sent_at"]): message
            for message in [*current, *incoming]
        }
        if len(merged_by_key) > self.MAX_CHAT_MESSAGES:
            raise OnlineResumeValidationError("完整聊天记录最多 10000 条")
        merged = sorted(
            merged_by_key.values(),
            key=lambda message: self._parse_chat_time(message["sent_at"]),
        )
        self._validate_serialized_size(
            merged,
            max_bytes=self.MAX_CHAT_JSON_BYTES,
            error_message="完整聊天记录不能超过 4MB",
        )
        return merged

    @classmethod
    def _normalize_chat_time(cls, value: str) -> str:
        parsed = cls._parse_chat_time(value)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _parse_chat_time(value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise OnlineResumeValidationError(
                "聊天时间必须是带时区的 ISO 时间"
            ) from exc
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise OnlineResumeValidationError("聊天时间必须是带时区的 ISO 时间")
        return parsed

    @staticmethod
    def _has_deleted_import_receipt(
        *,
        org_id: int,
        owner_hr_id: int,
        source_platform: str,
        external_record_id: str,
    ) -> bool:
        active = OnlineResume.query.filter_by(
            org_id=org_id,
            owner_hr_id=owner_hr_id,
            source_platform=source_platform,
            external_record_id=external_record_id,
        ).first()
        if active is not None:
            return False
        receipts = Event.query.filter_by(
            org_id=org_id,
            actor_id=owner_hr_id,
            action="online_resume.imported",
            entity_type="online_resume",
            source="agent",
            result="success",
        ).all()
        return any(
            isinstance(event.payload, dict)
            and event.payload.get("source_platform") == source_platform
            and event.payload.get("external_record_id") == external_record_id
            for event in receipts
        )

    @staticmethod
    def _validate_serialized_size(value, *, max_bytes: int, error_message: str) -> None:
        try:
            encoded = json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise OnlineResumeValidationError("内容包含无法保存的数据") from exc
        if len(encoded) > max_bytes:
            raise OnlineResumeValidationError(error_message)

    @staticmethod
    def _required_text(value, *, field_name: str, max_length: int) -> str:
        if not isinstance(value, str) or not value.strip():
            raise OnlineResumeValidationError(f"{field_name}不能为空")
        normalized = value.strip()
        if len(normalized) > max_length:
            raise OnlineResumeValidationError(
                f"{field_name}长度不能超过 {max_length} 个字符"
            )
        return normalized

    @staticmethod
    def _result_external_id(item) -> str | None:
        if not isinstance(item, dict):
            return None
        value = item.get("external_record_id")
        return value if isinstance(value, str) else None
