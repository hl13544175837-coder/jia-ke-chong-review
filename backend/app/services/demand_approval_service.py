"""Transactional approval state changes for business-created demands."""

from dataclasses import dataclass

from sqlalchemy import select

from .. import db
from ..models import Event, Notification, RecruitmentDemand, User
from ..time_utils import utc_now
from .demand_service import DemandValidationError, apply_editable_fields


APPROVER_ROLES = {"recruiter", "manager", "admin"}
RESUBMIT_PROTECTED_FIELDS = {
    "approval_status",
    "closed_at",
    "closed_by",
    "close_reason",
    "created_by",
    "downgrade_reason",
    "job_id",
    "owner_hr_id",
    "priority",
    "reviewed_at",
    "reviewed_by",
    "review_reason",
    "status",
    "submitted_at",
}


@dataclass
class DemandApprovalError(Exception):
    message: str
    status_code: int
    code: str
    fields: dict | None = None

    def as_payload(self):
        payload = {"error": self.message, "code": self.code}
        if self.fields:
            payload["fields"] = self.fields
        return payload


def _locked_demand(demand_id, org_id):
    demand = db.session.execute(
        select(RecruitmentDemand)
        .where(
            RecruitmentDemand.id == demand_id,
            RecruitmentDemand.org_id == org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if demand is None:
        raise DemandApprovalError(
            "需求不存在", 404, "demand_not_found"
        )
    return demand


def _actor(actor_id, org_id):
    actor = User.query.filter_by(
        id=actor_id,
        org_id=org_id,
        is_active=True,
    ).first()
    if actor is None:
        raise DemandApprovalError("Forbidden", 403, "forbidden")
    return actor


def _require_approver(demand, actor):
    if actor.role not in APPROVER_ROLES:
        raise DemandApprovalError("Forbidden", 403, "forbidden")
    if actor.role == "recruiter" and demand.owner_hr_id != actor.id:
        raise DemandApprovalError("Forbidden", 403, "forbidden")


def _require_pending(demand):
    if demand.approval_status != "pending":
        raise DemandApprovalError(
            "当前需求不在待审批状态",
            409,
            "demand_approval_state_conflict",
        )


def _record_event(action, *, demand, actor, payload=None):
    db.session.add(
        Event(
            org_id=demand.org_id,
            actor_id=actor.id,
            actor_role=actor.role,
            action=action,
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload=payload or {},
        )
    )


def approve_demand(demand_id, actor_id, org_id):
    try:
        demand = _locked_demand(demand_id, org_id)
        actor = _actor(actor_id, org_id)
        _require_approver(demand, actor)
        _require_pending(demand)

        reviewed_at = utc_now()
        demand.approval_status = "approved"
        demand.status = "active"
        demand.reviewed_by = actor.id
        demand.reviewed_at = reviewed_at
        demand.review_reason = ""
        _record_event(
            "demand.approved",
            demand=demand,
            actor=actor,
            payload={"job_id": demand.job_id, "approval_status": "approved"},
        )
        # 需求审核通过后,提醒需求负责人可以让 AI 助手去市场找人。
        owner_id = demand.owner_hr_id
        if owner_id and owner_id != actor.id:
            job_title = demand.job_title_snapshot or (
                demand.job.title if demand.job else ""
            )
            db.session.add(
                Notification(
                    org_id=org_id,
                    user_id=owner_id,
                    demand_id=demand.id,
                    type="demand_approved_ai_recruit",
                    title="需求已通过，可以让 AI 帮忙找人",
                    body=(
                        f"{job_title or '该岗位'}已审核通过。可在招聘需求列表点「AI 找人」，"
                        "让 AI 助手去 58/BOSS/猎聘 帮你找候选人。"
                    ),
                    link=f"/jobs?demand={demand.id}",
                )
            )
        db.session.commit()
        return demand
    except Exception:
        db.session.rollback()
        raise


def _validated_rejection_reason(reason):
    normalized = str(reason or "").strip()
    if not normalized:
        raise DemandApprovalError(
            "请填写驳回原因",
            400,
            "validation_error",
            {"reason": "驳回原因必填"},
        )
    if len(normalized) > 1000:
        raise DemandApprovalError(
            "请检查驳回原因",
            400,
            "validation_error",
            {"reason": "驳回原因不能超过 1000 个字符"},
        )
    return normalized


def reject_demand(demand_id, actor_id, org_id, reason):
    try:
        normalized_reason = _validated_rejection_reason(reason)
        demand = _locked_demand(demand_id, org_id)
        actor = _actor(actor_id, org_id)
        _require_approver(demand, actor)
        _require_pending(demand)

        demand.approval_status = "rejected"
        demand.status = "pending"
        demand.reviewed_by = actor.id
        demand.reviewed_at = utc_now()
        demand.review_reason = normalized_reason
        _record_event(
            "demand.rejected",
            demand=demand,
            actor=actor,
            payload={
                "job_id": demand.job_id,
                "approval_status": "rejected",
                "reason": normalized_reason,
            },
        )
        db.session.commit()
        return demand
    except Exception:
        db.session.rollback()
        raise


def resubmit_demand(demand_id, actor_id, org_id, changes):
    try:
        if not isinstance(changes, dict):
            raise DemandValidationError({"body": "请提交有效的需求信息"})

        demand = _locked_demand(demand_id, org_id)
        actor = _actor(actor_id, org_id)
        if actor.role != "interviewer" or demand.created_by != actor.id:
            raise DemandApprovalError("Forbidden", 403, "forbidden")
        if demand.approval_status != "rejected":
            raise DemandApprovalError(
                "只有已驳回的需求可以重新提交",
                409,
                "demand_approval_state_conflict",
            )

        protected = sorted(RESUBMIT_PROTECTED_FIELDS.intersection(changes))
        if protected:
            raise DemandValidationError(
                {field: "该字段不能在重新提交时修改" for field in protected},
                "请使用可编辑的需求字段",
            )

        fields = apply_editable_fields(demand, changes, org_id=org_id)
        if fields:
            raise DemandValidationError(fields)

        demand.approval_status = "pending"
        demand.status = "pending"
        demand.submitted_at = utc_now()
        demand.reviewed_by = None
        demand.reviewed_at = None
        demand.review_reason = ""
        _record_event(
            "demand.resubmitted",
            demand=demand,
            actor=actor,
            payload={
                "job_id": demand.job_id,
                "approval_status": "pending",
                "changed_fields": sorted(changes),
            },
        )
        db.session.commit()
        return demand
    except Exception:
        db.session.rollback()
        raise
