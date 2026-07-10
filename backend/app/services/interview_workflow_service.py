"""Demand-scoped interview context and round-task rules."""

from dataclasses import dataclass

from .. import db
from ..models import (
    Candidate,
    CandidateDemandFlow,
    InterviewAssignment,
    Job,
    RecruitmentDemand,
)
from .demand_context_service import (
    DemandContextError,
    OPEN_DEMAND_STATUSES,
    can_manage_demand,
    can_read_demand,
    resolve_demand_context,
)


@dataclass
class InterviewContext:
    candidate: Candidate
    job: Job
    demand: RecruitmentDemand | None

    @property
    def demand_id(self):
        return self.demand.id if self.demand else None


def resolve_interview_context(
    *,
    org_id,
    candidate_id,
    demand_id=None,
    job_id=None,
    open_only=False,
    require_current=False,
):
    candidate = db.session.get(Candidate, candidate_id)
    if (
        candidate is None
        or candidate.org_id != org_id
        or candidate.deleted_at is not None
    ):
        raise DemandContextError("候选人不存在", 404, "candidate_not_found")

    demand = None
    if demand_id is not None:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
            job_id=job_id,
            open_only=open_only,
        )
        job = demand.job
    elif job_id is not None:
        demands = RecruitmentDemand.query.filter_by(
            org_id=org_id,
            job_id=job_id,
        )
        if open_only:
            demands = demands.filter(
                RecruitmentDemand.status.in_(OPEN_DEMAND_STATUSES)
            )
        rows = demands.order_by(RecruitmentDemand.id.asc()).limit(2).all()
        if len(rows) > 1:
            raise DemandContextError(
                "该职位模板关联多个招聘需求，请明确选择需求",
                409,
                "demand_id_required",
            )
        demand = rows[0] if rows else None
        job = db.session.get(Job, job_id)
    else:
        raise DemandContextError("demand_id required", 400, "demand_id_required")

    if job is None or job.org_id != org_id:
        raise DemandContextError("职位模板不存在", 404, "job_not_found")
    if demand is not None and require_current:
        flow = CandidateDemandFlow.query.filter_by(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            status="active",
        ).first()
        if candidate.current_demand_id != demand.id or flow is None:
            raise DemandContextError(
                "候选人当前不在该招聘需求流程中",
                409,
                "candidate_not_in_demand",
            )
    return InterviewContext(candidate=candidate, job=job, demand=demand)


def can_manage_interview_context(user_id, role, org_id, context):
    if context.demand is not None:
        return can_manage_demand(user_id, role, org_id, context.demand)
    if role in {"manager", "admin"}:
        return True
    return role == "recruiter" and context.candidate.owner_hr_id in {user_id, None}


def can_read_interview_context(user_id, role, org_id, context, round_name=None):
    if role in {"manager", "admin"}:
        return True
    if role == "recruiter":
        if context.demand is not None:
            return can_read_demand(user_id, role, org_id, context.demand)
        return context.candidate.owner_hr_id in {user_id, None}
    if role != "interviewer":
        return False
    query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        candidate_id=context.candidate.id,
        interviewer_id=user_id,
    )
    if context.demand is not None:
        query = query.filter_by(demand_id=context.demand.id)
    else:
        query = query.filter_by(job_id=context.job.id)
    if round_name:
        query = query.filter_by(round=round_name)
    return query.first() is not None


def active_primary_assignment(*, org_id, demand_id, candidate_id, round_sequence):
    return (
        InterviewAssignment.query.filter_by(
            org_id=org_id,
            demand_id=demand_id,
            candidate_id=candidate_id,
            round_sequence=round_sequence,
            is_primary=True,
        )
        .filter(~InterviewAssignment.status.in_(["cancelled", "canceled"]))
        .first()
    )


def feedback_assignment(
    *,
    org_id,
    interviewer_id,
    assignment_id=None,
    candidate_id=None,
    demand_id=None,
    job_id=None,
    round_name=None,
):
    if assignment_id:
        assignment = db.session.get(InterviewAssignment, assignment_id)
        if assignment is None or assignment.org_id != org_id:
            return None
        if assignment.interviewer_id != interviewer_id:
            return None
        if candidate_id and assignment.candidate_id != candidate_id:
            return None
        if demand_id and assignment.demand_id != demand_id:
            return None
        if job_id and assignment.job_id != job_id:
            return None
        if round_name and assignment.round != round_name:
            return None
        return assignment

    query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        interviewer_id=interviewer_id,
        candidate_id=candidate_id,
        round=round_name,
    )
    if demand_id is not None:
        query = query.filter_by(demand_id=demand_id)
    elif job_id is not None:
        query = query.filter_by(job_id=job_id)
    return query.order_by(InterviewAssignment.id.desc()).first()
