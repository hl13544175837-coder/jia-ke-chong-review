"""Business screening task workflow and scoped payloads."""

from datetime import datetime, timezone

from flask import current_app
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from runtime_paths import (
    DEFAULT_UPLOAD_FOLDER,
    RuntimePathError,
    resolve_stored_upload_path,
)

from .. import db
from .. import models as models_module
from ..middleware.events import record_event
from ..models import (
    Candidate,
    CandidateDemandFlow,
    Notification,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now


BUSINESS_REVIEW_STATUSES = {"pending", "approved", "rejected", "needs_info"}
BUSINESS_REVIEW_DECISIONS = {"approved", "rejected", "needs_info"}
REASON_REQUIRED_DECISIONS = {"rejected", "needs_info"}
BUSINESS_REVIEWER_ROLES = {"interviewer", "manager"}
BUSINESS_REVIEW_MANAGER_ROLES = {"manager", "admin"}

ORIGINAL_RESUME_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class BusinessReviewError(Exception):
    def __init__(self, message, *, code, status_code=409, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def as_payload(self):
        return {"error": self.message, "code": self.code, **self.details}


def _business_review_model():
    task_model = getattr(models_module, "BusinessReviewTask", None)
    if task_model is None or not hasattr(RecruitmentDemand, "approval_status"):
        raise BusinessReviewError(
            "业务筛选表结构尚未就绪，请先合入并执行 Task 1 数据库变更",
            code="business_review_schema_unavailable",
            status_code=503,
        )
    return task_model


def _normalize_due_at(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        except (TypeError, ValueError):
            raise BusinessReviewError(
                "due_at 必须是有效的 ISO 日期时间",
                code="invalid_business_review_due_at",
                status_code=400,
            ) from None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _clean_note(value, *, limit=4000):
    return str(value or "").strip()[:limit]


def _task_for_update(task_model, *, org_id, task_id):
    return db.session.execute(
        select(task_model)
        .where(task_model.id == task_id, task_model.org_id == org_id)
        .with_for_update()
    ).scalar_one_or_none()


def _pending_task(task_model, *, org_id, demand_id, candidate_id, lock=False):
    statement = select(task_model).where(
        task_model.org_id == org_id,
        task_model.demand_id == demand_id,
        task_model.candidate_id == candidate_id,
        task_model.status == "pending",
        task_model.pending_slot == 1,
    )
    if lock:
        statement = statement.with_for_update()
    return db.session.execute(statement).scalar_one_or_none()


def _validate_creation_scope(*, org_id, demand_id, candidate_id, reviewer_id, actor_id):
    actor = db.session.get(User, actor_id)
    if actor is None or actor.org_id != org_id or not actor.is_active:
        raise BusinessReviewError(
            "Forbidden", code="forbidden", status_code=403
        )
    if actor.role not in {"recruiter", "manager", "admin"}:
        raise BusinessReviewError(
            "Forbidden", code="forbidden", status_code=403
        )

    demand = db.session.execute(
        select(RecruitmentDemand)
        .where(
            RecruitmentDemand.id == demand_id,
            RecruitmentDemand.org_id == org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if demand is None:
        raise BusinessReviewError(
            "招聘需求不存在", code="demand_not_found", status_code=404
        )
    if actor.role == "recruiter" and demand.owner_hr_id != actor_id:
        raise BusinessReviewError(
            "Forbidden", code="forbidden", status_code=403
        )
    if demand.status != "active":
        raise BusinessReviewError(
            "只有招聘中的需求可以发起业务筛选",
            code="demand_not_active",
        )
    if demand.approval_status != "approved":
        raise BusinessReviewError(
            "招聘需求尚未审批通过",
            code="demand_not_approved",
        )

    candidate = db.session.execute(
        select(Candidate)
        .where(Candidate.id == candidate_id, Candidate.org_id == org_id)
        .with_for_update()
    ).scalar_one_or_none()
    if candidate is None or candidate.deleted_at is not None:
        raise BusinessReviewError(
            "候选人不存在", code="candidate_not_found", status_code=404
        )
    flow = db.session.execute(
        select(CandidateDemandFlow)
        .where(
            CandidateDemandFlow.org_id == org_id,
            CandidateDemandFlow.demand_id == demand_id,
            CandidateDemandFlow.candidate_id == candidate_id,
            CandidateDemandFlow.status == "active",
        )
        .with_for_update()
    ).scalar_one_or_none()
    if flow is None:
        raise BusinessReviewError(
            "候选人当前不在该招聘需求流程中",
            code="candidate_not_in_demand",
        )

    reviewer = db.session.execute(
        select(User)
        .where(User.id == reviewer_id, User.org_id == org_id)
        .with_for_update()
    ).scalar_one_or_none()
    if (
        reviewer is None
        or not reviewer.is_active
        or reviewer.role not in BUSINESS_REVIEWER_ROLES
    ):
        raise BusinessReviewError(
            "业务审核人不存在、未启用或角色不正确",
            code="invalid_business_reviewer",
            status_code=400,
        )
    return demand, candidate, reviewer


def create_business_review(
    org_id,
    demand_id,
    candidate_id,
    reviewer_id,
    actor_id,
    hr_note,
    due_at,
):
    """Create or reuse the one pending screening task for a candidate flow."""

    task_model = _business_review_model()
    due_at = _normalize_due_at(due_at)
    hr_note = _clean_note(hr_note)
    demand, candidate, reviewer = _validate_creation_scope(
        org_id=org_id,
        demand_id=demand_id,
        candidate_id=candidate_id,
        reviewer_id=reviewer_id,
        actor_id=actor_id,
    )
    existing = _pending_task(
        task_model,
        org_id=org_id,
        demand_id=demand_id,
        candidate_id=candidate_id,
        lock=True,
    )
    if existing is not None:
        return existing, True

    task = task_model(
        org_id=org_id,
        demand_id=demand_id,
        candidate_id=candidate_id,
        reviewer_id=reviewer.id,
        status="pending",
        pending_slot=1,
        hr_note=hr_note,
        due_at=due_at,
        created_by=actor_id,
    )
    try:
        db.session.add(task)
        db.session.flush()

        latest_stage = (
            PipelineStage.query.filter_by(
                org_id=org_id,
                demand_id=demand_id,
                candidate_id=candidate_id,
            )
            .order_by(PipelineStage.id.desc())
            .first()
        )
        if latest_stage is None or latest_stage.stage != "business_review":
            db.session.add(
                PipelineStage(
                    org_id=org_id,
                    candidate_id=candidate_id,
                    job_id=demand.job_id,
                    demand_id=demand_id,
                    stage="business_review",
                    updated_by=actor_id,
                    note=hr_note,
                )
            )

        db.session.add(
            Notification(
                org_id=org_id,
                user_id=reviewer.id,
                demand_id=demand_id,
                type="business_review_assigned",
                title="新的业务筛选任务",
                body=(
                    f"{candidate.name_masked or '候选人'} · "
                    f"{demand.job_title_snapshot or demand.job.title}"
                ),
                link=f"/interviewer/screening?task={task.id}",
            )
        )
        record_event(
            "business_review.created",
            entity_id=task.id,
            entity_type="business_review_task",
            demand_id=demand_id,
            payload={
                "task_id": task.id,
                "candidate_id": candidate_id,
                "reviewer_id": reviewer.id,
            },
            commit=False,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = _pending_task(
            task_model,
            org_id=org_id,
            demand_id=demand_id,
            candidate_id=candidate_id,
        )
        if existing is not None:
            return existing, True
        raise BusinessReviewError(
            "业务筛选任务写入冲突，请刷新后重试",
            code="business_review_conflict",
        ) from None
    except Exception:
        db.session.rollback()
        raise
    return task, False


def list_business_reviews(org_id, user_id, role, status=None):
    task_model = _business_review_model()
    if status and status not in BUSINESS_REVIEW_STATUSES:
        raise BusinessReviewError(
            "无效的业务筛选状态",
            code="invalid_business_review_status",
            status_code=400,
        )
    query = task_model.query.filter(task_model.org_id == org_id)
    if role == "interviewer":
        query = query.filter(task_model.reviewer_id == user_id)
    elif role == "recruiter":
        query = query.join(
            RecruitmentDemand,
            task_model.demand_id == RecruitmentDemand.id,
        ).filter(
            RecruitmentDemand.org_id == org_id,
            RecruitmentDemand.owner_hr_id == user_id,
        )
    elif role not in BUSINESS_REVIEW_MANAGER_ROLES:
        query = query.filter(task_model.id < 0)
    if status:
        query = query.filter(task_model.status == status)
    return query.order_by(task_model.created_at.desc(), task_model.id.desc()).all()


def _can_read_task(*, task, demand, user_id, role):
    if role in BUSINESS_REVIEW_MANAGER_ROLES:
        return True
    if role == "interviewer":
        return task.reviewer_id == user_id
    if role == "recruiter":
        return demand is not None and demand.owner_hr_id == user_id
    return False


def get_business_review(org_id, task_id, user_id, role):
    task_model = _business_review_model()
    task = task_model.query.filter_by(id=task_id, org_id=org_id).first()
    if task is None:
        raise BusinessReviewError(
            "业务筛选任务不存在",
            code="business_review_not_found",
            status_code=404,
        )
    demand = db.session.get(RecruitmentDemand, task.demand_id)
    if not _can_read_task(
        task=task, demand=demand, user_id=user_id, role=role
    ):
        raise BusinessReviewError(
            "Forbidden", code="forbidden", status_code=403
        )
    return task


def decide_business_review(org_id, task_id, actor_id, decision, note):
    task_model = _business_review_model()
    decision = str(decision or "").strip().lower()
    note = _clean_note(note)
    if decision not in BUSINESS_REVIEW_DECISIONS:
        raise BusinessReviewError(
            "decision 必须是 approved、rejected 或 needs_info",
            code="invalid_business_review_decision",
            status_code=400,
        )
    if decision in REASON_REQUIRED_DECISIONS and not note:
        raise BusinessReviewError(
            "拒绝或需要补充信息时必须填写原因",
            code="business_review_note_required",
            status_code=400,
        )

    task = _task_for_update(task_model, org_id=org_id, task_id=task_id)
    if task is None:
        raise BusinessReviewError(
            "业务筛选任务不存在",
            code="business_review_not_found",
            status_code=404,
        )
    if task.reviewer_id != actor_id:
        raise BusinessReviewError(
            "Forbidden", code="forbidden", status_code=403
        )
    if task.status != "pending" or task.pending_slot != 1:
        raise BusinessReviewError(
            "业务筛选任务已经处理",
            code="business_review_already_decided",
        )

    demand = db.session.get(RecruitmentDemand, task.demand_id)
    task.status = decision
    task.pending_slot = None
    task.business_note = note
    task.decided_by = actor_id
    task.decided_at = utc_now()
    if demand is not None and demand.owner_hr_id is not None:
        candidate = db.session.get(Candidate, task.candidate_id)
        decision_label = {
            "approved": "已通过，待安排面试",
            "rejected": "不合适，待 HR 确认",
            "needs_info": "需要 HR 补充信息",
        }[decision]
        candidate_name = candidate.name_masked if candidate else "候选人"
        job_title = demand.job_title_snapshot or (
            demand.job.title if demand.job else "招聘需求"
        )
        db.session.add(
            Notification(
                org_id=org_id,
                user_id=demand.owner_hr_id,
                demand_id=task.demand_id,
                type="business_review_decided",
                title="业务筛选已有结论",
                body=f"{candidate_name} · {job_title} · {decision_label}",
                link=f"/candidates?demand={task.demand_id}&candidate={task.candidate_id}",
            )
        )
    try:
        record_event(
            "business_review.decided",
            entity_id=task.id,
            entity_type="business_review_task",
            demand_id=task.demand_id,
            payload={
                "task_id": task.id,
                "candidate_id": task.candidate_id,
                "decision": decision,
            },
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return task


def _isoformat(value):
    return value.isoformat() if value else None


def _original_resume_payload(candidate):
    base = f"/api/resume/{candidate.id}/original"
    payload = {
        "available": False,
        "filename": None,
        "mime_type": None,
        "preview_url": f"{base}/preview",
        "download_url": f"{base}/download",
    }
    if not candidate.raw_file_path:
        return payload
    try:
        resolved = resolve_stored_upload_path(
            candidate.raw_file_path,
            current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER,
        )
    except RuntimePathError:
        return payload
    mime_type = ORIGINAL_RESUME_MIME_TYPES.get(resolved.suffix.lower())
    if not resolved.is_file() or mime_type is None:
        return payload
    payload.update(
        {
            "available": True,
            "filename": f"candidate-{candidate.id}-resume{resolved.suffix.lower()}",
            "mime_type": mime_type,
        }
    )
    return payload


def _demand_focus_points(demand):
    if demand is None or demand.job is None:
        return []
    structured = demand.job.jd_structured or {}
    if not isinstance(structured, dict):
        return []
    points = []
    for field in ("must_have_skills", "responsibilities"):
        values = structured.get(field) or []
        if not isinstance(values, list):
            continue
        for value in values:
            text = str(value or "").strip()
            if text and text not in points:
                points.append(text)
    return points[:12]


def business_review_payload(task):
    demand = db.session.get(RecruitmentDemand, task.demand_id)
    candidate = db.session.get(Candidate, task.candidate_id)
    reviewer = db.session.get(User, task.reviewer_id)
    creator = db.session.get(User, task.created_by)
    decider = db.session.get(User, task.decided_by) if task.decided_by else None
    return {
        "id": task.id,
        "org_id": task.org_id,
        "demand_id": task.demand_id,
        "candidate_id": task.candidate_id,
        "reviewer_id": task.reviewer_id,
        "reviewer_name": reviewer.name if reviewer else None,
        "created_by": task.created_by,
        "creator_name": creator.name if creator else None,
        "created_by_name": creator.name if creator else None,
        "decided_by": task.decided_by,
        "decided_by_name": decider.name if decider else None,
        "status": task.status,
        "hr_note": task.hr_note or "",
        "business_note": task.business_note or "",
        "due_at": _isoformat(task.due_at),
        "decided_at": _isoformat(task.decided_at),
        "created_at": _isoformat(task.created_at),
        "updated_at": _isoformat(task.updated_at),
        "demand": {
            "id": task.demand_id,
            "request_no": demand.request_no if demand else "",
            "job_id": demand.job_id if demand else None,
            "job_title": demand.job_title_snapshot if demand else None,
            "department": (
                demand.department or demand.requester_department or ""
                if demand
                else ""
            ),
            "city": demand.city or "" if demand else "",
            "jd_text": demand.jd_text_snapshot if demand else None,
            "focus_points": _demand_focus_points(demand),
            "owner_hr_id": demand.owner_hr_id if demand else None,
        },
        "candidate": {
            "id": task.candidate_id,
            "name_masked": candidate.name_masked if candidate else None,
            "resume_json": candidate.resume_json if candidate else {},
            "parse_status": candidate.parse_status if candidate else "failed",
            "original_resume": (
                _original_resume_payload(candidate) if candidate else None
            ),
        },
    }
