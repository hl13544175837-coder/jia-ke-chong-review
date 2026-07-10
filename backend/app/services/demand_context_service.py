"""Demand-scoped access and legacy resolution helpers.

RecruitmentDemand owns recruitment workflow facts. Job remains a reusable
template and must never grant implicit access to every linked demand.
"""

from dataclasses import dataclass

from sqlalchemy import select

from .. import db
from ..models import RecruitmentDemand, User


# ``open_only`` 用于写入上下文：暂停需求可查看，但不可新增流程、
# 简历、AI 预筛或面试任务。
OPEN_DEMAND_STATUSES = {"pending", "active"}


@dataclass
class DemandContextError(Exception):
    message: str
    status_code: int
    code: str
    fields: dict | None = None

    def as_payload(self):
        payload = {"error": self.message, "code": self.code}
        if self.fields:
            payload["fields"] = self.fields
        return payload


def visible_demand_query(user_id, role, org_id):
    query = RecruitmentDemand.query.filter(RecruitmentDemand.org_id == org_id)
    if role == "recruiter":
        return query.filter(RecruitmentDemand.owner_hr_id == user_id)
    if role in {"manager", "admin"}:
        return query
    return query.filter(RecruitmentDemand.id < 0)


def can_read_demand(user_id, role, org_id, demand):
    if demand is None or demand.org_id != org_id:
        return False
    return (
        visible_demand_query(user_id, role, org_id)
        .filter(RecruitmentDemand.id == demand.id)
        .first()
        is not None
    )


def can_manage_demand(user_id, role, org_id, demand):
    return can_read_demand(user_id, role, org_id, demand)


def get_demand(demand_id, org_id, *, lock=False):
    statement = select(RecruitmentDemand).where(
        RecruitmentDemand.id == demand_id,
        RecruitmentDemand.org_id == org_id,
    )
    if lock:
        statement = statement.with_for_update()
    return db.session.execute(statement).scalar_one_or_none()


def validate_recruiter_owner(owner_hr_id, org_id):
    try:
        owner_id = int(owner_hr_id)
    except (TypeError, ValueError):
        return None
    return User.query.filter_by(
        id=owner_id,
        org_id=org_id,
        role="recruiter",
        is_active=True,
    ).first()


def resolve_demand_context(
    *,
    org_id,
    demand_id=None,
    job_id=None,
    open_only=False,
    lock=False,
):
    """Resolve a demand without guessing when a Job has sibling demands.

    New callers pass demand_id. Legacy job-only callers remain compatible only
    when the Job maps to exactly one eligible demand.
    """

    if demand_id is not None:
        demand = get_demand(demand_id, org_id, lock=lock)
        if demand is None:
            raise DemandContextError("需求不存在", 404, "demand_not_found")
        if job_id is not None:
            try:
                requested_job_id = int(job_id)
            except (TypeError, ValueError):
                requested_job_id = None
            if requested_job_id != demand.job_id:
                raise DemandContextError(
                    "demand_id 与 job_id 不一致",
                    409,
                    "demand_job_mismatch",
                )
        if open_only and demand.status not in OPEN_DEMAND_STATUSES:
            raise DemandContextError("需求当前不可推进", 409, "demand_not_open")
        return demand

    if job_id is None:
        raise DemandContextError("demand_id required", 400, "demand_id_required")

    try:
        normalized_job_id = int(job_id)
    except (TypeError, ValueError):
        raise DemandContextError("job_id 无效", 400, "invalid_job_id") from None

    statement = select(RecruitmentDemand).where(
        RecruitmentDemand.org_id == org_id,
        RecruitmentDemand.job_id == normalized_job_id,
    )
    if open_only:
        statement = statement.where(
            RecruitmentDemand.status.in_(OPEN_DEMAND_STATUSES)
        )
    statement = statement.order_by(RecruitmentDemand.id.asc()).limit(2)
    if lock:
        statement = statement.with_for_update()
    candidates = list(db.session.execute(statement).scalars())

    if not candidates:
        raise DemandContextError(
            "该岗位没有可用招聘需求，请先创建需求",
            404,
            "demand_not_found",
        )
    if len(candidates) > 1:
        raise DemandContextError(
            "该职位模板关联多个招聘需求，请明确选择需求",
            409,
            "demand_id_required",
        )
    return candidates[0]
