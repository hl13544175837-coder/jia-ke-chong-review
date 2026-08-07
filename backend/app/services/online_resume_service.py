"""Recruiter-owned online resume imports and library operations."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from flask import current_app

from .. import db
from ..models import Event, OnlineResume, RecruitmentDemand, User
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
)
from ..time_utils import utc_now


@dataclass
class OnlineResumeValidationError(Exception):
    message: str


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
        """Create or update by (org, owner, platform, external_record_id)."""

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
                demand = self._resolve_manageable_demand(
                    org_id=org_id,
                    owner_hr_id=owner_hr_id,
                    role=role,
                    demand_id=item["demand_id"],
                )
                row, status = self._upsert_item(
                    org_id=org_id,
                    owner_hr_id=owner_hr_id,
                    role=role,
                    demand=demand,
                    item=item,
                )
                db.session.commit()
                result[status] += 1
                result["results"].append(
                    {
                        "external_record_id": row.external_record_id,
                        "id": row.id,
                        "status": status,
                    }
                )
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
        if role == "recruiter":
            query = query.filter(OnlineResume.owner_hr_id == actor_id)
        elif role not in {"manager", "admin"}:
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
        if role == "recruiter" and resume.owner_hr_id != actor_id:
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
        resume.resume_json = resume_json
        resume.is_manually_edited = True
        resume.updated_at = utc_now()
        db.session.commit()
        return resume

    def delete(self, resume: OnlineResume) -> None:
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
            ).all()
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
            )
            for resume in resumes
        ]

    def _serialize(
        self,
        resume: OnlineResume,
        *,
        demand: RecruitmentDemand | None,
        owner: User | None,
    ) -> dict:
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
        return {
            "id": resume.id,
            "org_id": resume.org_id,
            "owner_hr_id": resume.owner_hr_id,
            "owner_name": owner.name if owner is not None else "",
            "demand": demand_summary,
            "boss_account": resume.boss_account,
            "source_platform": resume.source_platform,
            "external_record_id": resume.external_record_id,
            "display_name": resume.display_name,
            "resume_json": resume.resume_json,
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
            "chat_json": chat,
            "latest_chat": chat[-1] if chat else None,
            "source_url": resume.source_url,
            "created_at": resume.created_at.isoformat() if resume.created_at else None,
            "updated_at": resume.updated_at.isoformat() if resume.updated_at else None,
        }

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
        demand_id: int,
    ) -> RecruitmentDemand:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
            open_only=True,
        )
        if not can_manage_demand(owner_hr_id, role, org_id, demand):
            raise OnlineResumeValidationError("无权导入到该招聘需求")
        return demand

    def _validate_import_item(self, item: dict) -> dict:
        if not isinstance(item, dict):
            raise OnlineResumeValidationError("每份在线简历必须是对象")
        try:
            demand_id = int(item.get("demand_id"))
        except (TypeError, ValueError):
            raise OnlineResumeValidationError("招聘需求编号无效") from None
        if demand_id <= 0:
            raise OnlineResumeValidationError("招聘需求编号无效")

        resume_json = item.get("resume_json")
        if not isinstance(resume_json, dict):
            raise OnlineResumeValidationError("结构化简历必须是对象")
        self._validate_serialized_size(
            resume_json,
            max_bytes=self.MAX_RESUME_JSON_BYTES,
            error_message="结构化简历内容不能超过 1MB",
        )
        chat_json = item.get("chat_json")
        if not isinstance(chat_json, list):
            raise OnlineResumeValidationError("完整聊天记录必须是列表")
        chat_json = self._normalize_chat_messages(chat_json)

        source_url = item.get("source_url")
        if source_url is not None and not isinstance(source_url, str):
            raise OnlineResumeValidationError("来源链接格式无效")
        normalized_source_url = source_url.strip() if isinstance(source_url, str) else None
        if normalized_source_url:
            if len(normalized_source_url) > self.MAX_SOURCE_URL_LENGTH:
                raise OnlineResumeValidationError(
                    "来源链接长度不能超过 2000 个字符"
                )
            if not normalized_source_url.lower().startswith(("http://", "https://")):
                raise OnlineResumeValidationError(
                    "来源链接必须以 http:// 或 https:// 开头"
                )
        return {
            "demand_id": demand_id,
            "external_record_id": self._required_text(
                item.get("external_record_id"),
                field_name="外部记录编号",
                max_length=200,
            ),
            "boss_account": self._required_text(
                item.get("boss_account"),
                field_name="BOSS 账号",
                max_length=160,
            ),
            "source_platform": self._required_text(
                item.get("source_platform") or "BOSS直聘",
                field_name="来源平台",
                max_length=60,
            ),
            "display_name": self._required_text(
                item.get("display_name") or "未命名候选人",
                field_name="候选人名称",
                max_length=100,
            ),
            "resume_json": resume_json,
            "chat_json": chat_json,
            "source_url": normalized_source_url or None,
        }

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
