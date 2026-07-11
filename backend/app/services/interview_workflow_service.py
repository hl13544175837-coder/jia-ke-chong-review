"""Demand-scoped interview context and round-task rules."""

from dataclasses import dataclass
from datetime import timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import db
from ..middleware.events import record_event
from ..models import (
    Candidate,
    CandidateDemandFlow,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Notification,
    RecruitmentDemand,
)
from .demand_context_service import (
    DemandContextError,
    can_manage_demand,
    can_read_demand,
    resolve_demand_context,
)


CANCELLED_ASSIGNMENT_STATUSES = {"cancelled", "canceled"}


class InterviewAssignmentWorkflowError(Exception):
    def __init__(self, message, *, code, status_code=409, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def normalize_assignment_status(status):
    return str(status or "scheduled").strip().lower()


def assignment_is_cancelled(status):
    return normalize_assignment_status(status) in CANCELLED_ASSIGNMENT_STATUSES


def active_assignment_filter():
    normalized = func.lower(
        func.trim(func.coalesce(InterviewAssignment.status, "scheduled"))
    )
    return ~normalized.in_(tuple(CANCELLED_ASSIGNMENT_STATUSES))


def normalize_assignment_datetime(value):
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


@dataclass
class InterviewContext:
    candidate: Candidate
    job: Job
    demand: RecruitmentDemand

    @property
    def demand_id(self):
        return self.demand.id


def resolve_interview_context(
    *,
    org_id,
    candidate_id,
    demand_id=None,
    job_id=None,
    open_only=False,
    require_current=False,
    lock=False,
):
    if demand_id is not None:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
            job_id=job_id,
            open_only=open_only,
            lock=lock,
        )
        job = demand.job
    elif job_id is not None:
        demand = resolve_demand_context(
            org_id=org_id,
            job_id=job_id,
            open_only=open_only,
            lock=lock,
        )
        job = demand.job
    else:
        raise DemandContextError("demand_id required", 400, "demand_id_required")

    if job is None or job.org_id != org_id:
        raise DemandContextError("职位模板不存在", 404, "job_not_found")

    candidate_statement = select(Candidate).where(Candidate.id == candidate_id)
    if lock:
        candidate_statement = candidate_statement.with_for_update()
    candidate = db.session.execute(candidate_statement).scalar_one_or_none()
    if (
        candidate is None
        or candidate.org_id != org_id
        or candidate.deleted_at is not None
    ):
        raise DemandContextError("候选人不存在", 404, "candidate_not_found")
    if require_current:
        flow_statement = select(CandidateDemandFlow).where(
            CandidateDemandFlow.org_id == org_id,
            CandidateDemandFlow.candidate_id == candidate.id,
            CandidateDemandFlow.demand_id == demand.id,
            CandidateDemandFlow.status == "active",
        )
        if lock:
            flow_statement = flow_statement.with_for_update()
        flow = db.session.execute(flow_statement).scalar_one_or_none()
        if candidate.current_demand_id != demand.id or flow is None:
            raise DemandContextError(
                "候选人当前不在该招聘需求流程中",
                409,
                "candidate_not_in_demand",
            )
    return InterviewContext(candidate=candidate, job=job, demand=demand)


def can_manage_interview_context(user_id, role, org_id, context):
    return can_manage_demand(user_id, role, org_id, context.demand)


def can_read_interview_context(user_id, role, org_id, context, round_name=None):
    if role in {"manager", "admin"}:
        return True
    if role == "recruiter":
        return can_read_demand(user_id, role, org_id, context.demand)
    if role != "interviewer":
        return False
    query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        candidate_id=context.candidate.id,
        interviewer_id=user_id,
    ).filter(active_assignment_filter())
    query = query.filter_by(demand_id=context.demand.id)
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
        .filter(active_assignment_filter())
        .first()
    )


def load_assignment_for_update(*, org_id, assignment_id):
    return db.session.execute(
        select(InterviewAssignment)
        .where(
            InterviewAssignment.id == assignment_id,
            InterviewAssignment.org_id == org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()


def create_interview_assignment(
    *,
    context,
    interviewer_id,
    round_name,
    round_sequence,
    is_primary,
    scheduled_at,
    location,
    note,
    created_by,
):
    """Create or deduplicate an active assignment in one service transaction."""

    primary_slot = round_sequence if is_primary else None
    if primary_slot is not None:
        existing_primary = active_primary_assignment(
            org_id=context.demand.org_id,
            demand_id=context.demand_id,
            candidate_id=context.candidate.id,
            round_sequence=round_sequence,
        )
        if existing_primary and existing_primary.interviewer_id != interviewer_id:
            raise InterviewAssignmentWorkflowError(
                "该轮次已有主面试官，如需更换请先取消原任务",
                code="primary_interviewer_exists",
                details={"assignment_id": existing_primary.id},
            )

    existing = (
        InterviewAssignment.query.filter_by(
            org_id=context.demand.org_id,
            candidate_id=context.candidate.id,
            demand_id=context.demand_id,
            job_id=context.job.id,
            round=round_name,
            round_sequence=round_sequence,
            interviewer_id=interviewer_id,
        )
        .filter(active_assignment_filter())
        .all()
    )
    normalized_scheduled_at = normalize_assignment_datetime(scheduled_at)
    for item in existing:
        if normalize_assignment_datetime(item.scheduled_at) == normalized_scheduled_at:
            return item, True

    if normalized_scheduled_at is not None:
        interviewer_assignments = (
            InterviewAssignment.query.filter_by(
                org_id=context.demand.org_id,
                interviewer_id=interviewer_id,
            )
            .filter(active_assignment_filter())
            .all()
        )
        for item in interviewer_assignments:
            if normalize_assignment_datetime(item.scheduled_at) == normalized_scheduled_at:
                raise InterviewAssignmentWorkflowError(
                    "面试官该时间已有面试安排，请改期或更换面试官",
                    code="interviewer_schedule_conflict",
                    details={"conflict_assignment_id": item.id},
                )

    assignment = InterviewAssignment(
        org_id=context.demand.org_id,
        candidate_id=context.candidate.id,
        job_id=context.job.id,
        demand_id=context.demand_id,
        round=round_name,
        round_sequence=round_sequence,
        is_primary=is_primary,
        primary_slot=primary_slot,
        interviewer_id=interviewer_id,
        scheduled_at=scheduled_at,
        location=location[:240],
        note=note,
        status="scheduled",
        created_by=created_by,
    )
    db.session.add(assignment)
    db.session.add(Notification(
        org_id=context.demand.org_id,
        user_id=interviewer_id,
        demand_id=context.demand_id,
        type="interview_assignment",
        title="新的面试任务待反馈",
        body=(
            f"{context.candidate.name_masked or '候选人'} · "
            f"第 {round_sequence} 轮"
            f"{' · 主面试官' if is_primary else ' · 辅助面试官'}"
        ),
        link=(
            f"/interviews?demand={context.demand_id}"
            f"&candidate={context.candidate.id}"
        ),
    ))
    try:
        db.session.flush()
        record_event(
            "interview.assigned",
            entity_id=assignment.candidate_id,
            entity_type="candidate",
            demand_id=context.demand_id,
            payload={
                "assignment_id": assignment.id,
                "job_id": assignment.job_id,
                "demand_id": context.demand_id,
                "round": assignment.round,
                "round_sequence": round_sequence,
                "is_primary": is_primary,
                "interviewer_id": interviewer_id,
            },
            commit=False,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if primary_slot is not None:
            existing_primary = active_primary_assignment(
                org_id=context.demand.org_id,
                demand_id=context.demand_id,
                candidate_id=context.candidate.id,
                round_sequence=round_sequence,
            )
            if existing_primary is not None:
                raise InterviewAssignmentWorkflowError(
                    "该轮次已有主面试官，如需更换请先取消原任务",
                    code="primary_interviewer_exists",
                    details={"assignment_id": existing_primary.id},
                )
        raise InterviewAssignmentWorkflowError(
            "面试任务写入冲突，请刷新后重试",
            code="interview_assignment_conflict",
        )
    except Exception:
        db.session.rollback()
        raise
    return assignment, False


def cancel_interview_assignment(*, assignment, reason):
    """Cancel an unfinished assignment and atomically release its slot."""

    if assignment_is_cancelled(assignment.status):
        needs_repair = assignment.status != "cancelled" or assignment.primary_slot is not None
        if needs_repair:
            assignment.status = "cancelled"
            assignment.primary_slot = None
            record_event(
                "interview.assignment_cancelled",
                entity_id=assignment.candidate_id,
                entity_type="candidate",
                demand_id=assignment.demand_id,
                payload={
                    "assignment_id": assignment.id,
                    "job_id": assignment.job_id,
                    "round": assignment.round,
                    "reason": reason,
                    "repaired_legacy_state": True,
                },
                commit=False,
            )
            db.session.commit()
        else:
            db.session.rollback()
        return assignment, True

    has_feedback = InterviewFeedback.query.filter_by(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
    ).first() is not None
    if has_feedback or normalize_assignment_status(assignment.status) in {
        "completed",
        "feedback_submitted",
    }:
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试任务已有反馈，不能取消",
            code="assignment_already_completed",
        )

    assignment.status = "cancelled"
    assignment.primary_slot = None
    db.session.add(Notification(
        org_id=assignment.org_id,
        user_id=assignment.interviewer_id,
        demand_id=assignment.demand_id,
        type="interview_assignment_cancelled",
        title="面试任务已取消",
        body=reason[:500],
        link=(
            f"/interviews?demand={assignment.demand_id}"
            f"&candidate={assignment.candidate_id}"
        ),
    ))
    record_event(
        "interview.assignment_cancelled",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "job_id": assignment.job_id,
            "round": assignment.round,
            "reason": reason,
        },
        commit=False,
    )
    db.session.commit()
    return assignment, False


def feedback_assignment(
    *,
    org_id,
    interviewer_id,
    assignment_id=None,
    candidate_id=None,
    demand_id=None,
    job_id=None,
    round_name=None,
    lock=False,
):
    if assignment_id:
        statement = select(InterviewAssignment).where(
            InterviewAssignment.id == assignment_id
        )
        if lock:
            statement = statement.with_for_update()
        assignment = db.session.execute(statement).scalar_one_or_none()
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
        if assignment_is_cancelled(assignment.status):
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
    if lock:
        query = query.with_for_update()
    return (
        query.filter(active_assignment_filter())
        .order_by(InterviewAssignment.id.desc())
        .first()
    )
