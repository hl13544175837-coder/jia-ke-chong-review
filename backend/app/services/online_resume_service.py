"""Recruiter-owned online resume imports and library operations."""

from dataclasses import dataclass

from .. import db
from ..models import Event, OnlineResume, RecruitmentDemand
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
            "failed": 0,
            "results": [],
        }
        for raw_item in items:
            external_record_id = self._result_external_id(raw_item)
            try:
                item = self._validate_import_item(raw_item)
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
    ) -> dict:
        query = OnlineResume.query.filter(OnlineResume.org_id == org_id)
        if role == "recruiter":
            query = query.filter(OnlineResume.owner_hr_id == actor_id)
        elif role not in {"manager", "admin"}:
            query = query.filter(OnlineResume.id < 0)
        if demand_id is not None:
            query = query.filter(OnlineResume.demand_id == demand_id)

        pagination = query.order_by(
            OnlineResume.updated_at.desc(),
            OnlineResume.id.desc(),
        ).paginate(page=page, per_page=per_page, error_out=False)
        return {
            "items": [self.serialize(item) for item in pagination.items],
            "total": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "pages": pagination.pages,
        }

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
        resume.resume_json = resume_json
        resume.updated_at = utc_now()
        db.session.commit()
        return resume

    def delete(self, resume: OnlineResume) -> None:
        db.session.delete(resume)
        db.session.commit()

    def serialize(self, resume: OnlineResume) -> dict:
        demand = db.session.get(RecruitmentDemand, resume.demand_id)
        demand_summary = None
        if demand is not None:
            title = demand.job_title_snapshot or (demand.job.title if demand.job else "")
            demand_summary = {
                "id": demand.id,
                "request_no": demand.request_no,
                "title": title,
            }
        chat = resume.chat_json if isinstance(resume.chat_json, list) else []
        return {
            "id": resume.id,
            "org_id": resume.org_id,
            "owner_hr_id": resume.owner_hr_id,
            "demand": demand_summary,
            "boss_account": resume.boss_account,
            "source_platform": resume.source_platform,
            "external_record_id": resume.external_record_id,
            "display_name": resume.display_name,
            "resume_json": resume.resume_json,
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
            resume.display_name = item["display_name"]
            resume.resume_json = item["resume_json"]
            resume.chat_json = item["chat_json"]
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
                payload={"source_platform": item["source_platform"]},
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
        chat_json = item.get("chat_json")
        if not isinstance(chat_json, list):
            raise OnlineResumeValidationError("完整聊天记录必须是列表")
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

        source_url = item.get("source_url")
        if source_url is not None and not isinstance(source_url, str):
            raise OnlineResumeValidationError("来源链接格式无效")
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
            "source_url": source_url.strip() if isinstance(source_url, str) else None,
        }

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
