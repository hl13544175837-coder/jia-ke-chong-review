"""Read model and state transitions for the recruiter interview workbench."""

from datetime import timedelta

from sqlalchemy import and_, func
from sqlalchemy.orm import aliased

from .. import db
from ..middleware.events import record_event
from ..models import (
    BusinessReviewTask,
    Candidate,
    CandidateDemandFlow,
    CandidateDisposition,
    Event,
    InterviewAssignment,
    InterviewFeedback,
    InterviewRescheduleRequest,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now
from .interview_workflow_service import (
    InterviewAssignmentWorkflowError,
    active_assignment_filter,
    assignment_is_cancelled,
    ensure_interview_has_started,
    ensure_interview_time_is_future,
    feedback_satisfaction,
    interview_times_overlap,
    normalize_assignment_datetime,
    normalize_assignment_status,
)
from .pipeline_service import normalize_pipeline_stage


INTERVIEW_PIPELINE_STAGES = {
    "interview",
    "interview_first",
    "interview_second",
    "interview_final",
}
REMINDER_COOLDOWN = timedelta(minutes=15)


def feedback_result(feedback):
    if feedback is None:
        return None
    satisfaction = feedback_satisfaction(feedback)
    if satisfaction == "satisfied":
        return "passed"
    if satisfaction == "unsatisfied":
        return "not_passed"
    if satisfaction == "pending":
        return "pending"
    if feedback.passed is True:
        return "passed"
    if feedback.passed is False:
        return "not_passed"
    return "pending"


def interview_management_rows(*, user_id, role, org_id):
    """Return all visible interview-stage candidates in a bounded query."""

    latest_stage_ids = (
        db.session.query(
            PipelineStage.org_id.label("org_id"),
            PipelineStage.candidate_id.label("candidate_id"),
            PipelineStage.demand_id.label("demand_id"),
            func.max(PipelineStage.id).label("stage_id"),
        )
        .filter(
            PipelineStage.org_id == org_id,
            PipelineStage.demand_id.isnot(None),
        )
        .group_by(
            PipelineStage.org_id,
            PipelineStage.candidate_id,
            PipelineStage.demand_id,
        )
        .subquery()
    )
    latest_business_review_status = (
        db.session.query(BusinessReviewTask.status)
        .filter(
            BusinessReviewTask.org_id == CandidateDemandFlow.org_id,
            BusinessReviewTask.candidate_id == CandidateDemandFlow.candidate_id,
            BusinessReviewTask.demand_id == CandidateDemandFlow.demand_id,
        )
        .order_by(BusinessReviewTask.id.desc())
        .limit(1)
        .correlate(CandidateDemandFlow)
        .scalar_subquery()
    )
    latest_disposition_ids = (
        db.session.query(
            CandidateDisposition.org_id.label("org_id"),
            CandidateDisposition.candidate_id.label("candidate_id"),
            CandidateDisposition.demand_id.label("demand_id"),
            func.max(CandidateDisposition.id).label("disposition_id"),
        )
        .filter(
            CandidateDisposition.org_id == org_id,
            CandidateDisposition.demand_id.isnot(None),
        )
        .group_by(
            CandidateDisposition.org_id,
            CandidateDisposition.candidate_id,
            CandidateDisposition.demand_id,
        )
        .subquery()
    )
    interviewer = aliased(User)
    query = (
        db.session.query(
            Candidate,
            RecruitmentDemand,
            Job,
            PipelineStage,
            InterviewAssignment,
            interviewer,
            InterviewFeedback,
            CandidateDisposition,
        )
        .select_from(CandidateDemandFlow)
        .join(
            Candidate,
            and_(
                Candidate.id == CandidateDemandFlow.candidate_id,
                Candidate.org_id == CandidateDemandFlow.org_id,
            ),
        )
        .join(
            RecruitmentDemand,
            and_(
                RecruitmentDemand.id == CandidateDemandFlow.demand_id,
                RecruitmentDemand.org_id == CandidateDemandFlow.org_id,
            ),
        )
        .join(
            Job,
            and_(
                Job.id == RecruitmentDemand.job_id,
                Job.org_id == RecruitmentDemand.org_id,
            ),
        )
        .join(
            latest_stage_ids,
            and_(
                latest_stage_ids.c.org_id == CandidateDemandFlow.org_id,
                latest_stage_ids.c.candidate_id == CandidateDemandFlow.candidate_id,
                latest_stage_ids.c.demand_id == CandidateDemandFlow.demand_id,
            ),
        )
        .join(PipelineStage, PipelineStage.id == latest_stage_ids.c.stage_id)
        .outerjoin(
            InterviewAssignment,
            and_(
                InterviewAssignment.org_id == CandidateDemandFlow.org_id,
                InterviewAssignment.candidate_id == CandidateDemandFlow.candidate_id,
                InterviewAssignment.demand_id == CandidateDemandFlow.demand_id,
                InterviewAssignment.is_primary.is_(True),
                active_assignment_filter(),
            ),
        )
        .outerjoin(
            interviewer,
            and_(
                interviewer.id == InterviewAssignment.interviewer_id,
                interviewer.org_id == InterviewAssignment.org_id,
            ),
        )
        .outerjoin(
            InterviewFeedback,
            and_(
                InterviewFeedback.org_id == CandidateDemandFlow.org_id,
                InterviewFeedback.assignment_id == InterviewAssignment.id,
            ),
        )
        .outerjoin(
            latest_disposition_ids,
            and_(
                latest_disposition_ids.c.org_id == CandidateDemandFlow.org_id,
                latest_disposition_ids.c.candidate_id == CandidateDemandFlow.candidate_id,
                latest_disposition_ids.c.demand_id == CandidateDemandFlow.demand_id,
            ),
        )
        .outerjoin(
            CandidateDisposition,
            CandidateDisposition.id == latest_disposition_ids.c.disposition_id,
        )
        .filter(
            CandidateDemandFlow.org_id == org_id,
            Candidate.org_id == org_id,
            Candidate.deleted_at.is_(None),
            RecruitmentDemand.org_id == org_id,
            db.or_(
                CandidateDemandFlow.status == "active",
                InterviewAssignment.id.isnot(None),
            ),
            db.or_(
                PipelineStage.stage.in_(INTERVIEW_PIPELINE_STAGES),
                InterviewAssignment.id.isnot(None),
                latest_business_review_status == "approved",
            ),
        )
    )
    if role == "recruiter":
        query = query.filter(RecruitmentDemand.owner_hr_id == user_id)
    elif role not in {"manager", "admin"}:
        return []

    records = query.order_by(
        RecruitmentDemand.id.desc(),
        Candidate.id.desc(),
        InterviewAssignment.round_sequence.asc(),
        InterviewAssignment.id.asc(),
    ).all()
    rows_by_candidate_demand = {}
    for candidate, demand, job, stage, assignment, assigned_user, feedback, disposition in records:
        rows_by_candidate_demand[(candidate.id, demand.id)] = {
                "candidate_id": candidate.id,
                "name_masked": candidate.name_masked,
                "demand_id": demand.id,
                "job_id": job.id,
                "job_title": demand.job_title_snapshot or job.title,
                "job_city": demand.city or job.city or "",
                "job_department": demand.department or job.department or "",
                "pipeline_stage": normalize_pipeline_stage(stage.stage),
                "round": assignment.round if assignment else None,
                "round_sequence": assignment.round_sequence if assignment else None,
                "assignment_id": assignment.id if assignment else None,
                "is_primary": bool(assignment.is_primary) if assignment else None,
                "interviewer_id": assignment.interviewer_id if assignment else None,
                "interviewer_name": assigned_user.name if assigned_user else None,
                "scheduled_at": (
                    assignment.scheduled_at.isoformat()
                    if assignment and assignment.scheduled_at
                    else None
                ),
                "location": (assignment.location or "") if assignment else "",
                "note": (assignment.note or "") if assignment else "",
                "assignment_status": (
                    normalize_assignment_status(assignment.status)
                    if assignment
                    else "unassigned"
                ),
                "feedback_id": feedback.id if feedback else None,
                "feedback_submitted": feedback is not None,
                "feedback_score": feedback.score if feedback else None,
                "feedback_passed": feedback.passed if feedback else None,
                "feedback_result": feedback_result(feedback),
                "disposition_reason": disposition.reason if disposition else "",
                "enter_talent_pool": (
                    bool(disposition.enter_talent_pool) if disposition else None
                ),
            }
    rows = list(rows_by_candidate_demand.values())
    if rows:
        from .interview_reschedule_service import (
            open_requests_for_rows,
            serialize_reschedule_request,
        )

        pair_set = {(row["candidate_id"], row["demand_id"]) for row in rows}
        open_requests = open_requests_for_rows(
            org_id=org_id,
            candidate_demand_pairs=pair_set,
        )
        for row in rows:
            open_request = open_requests.get((row["candidate_id"], row["demand_id"]))
            if open_request is not None:
                row["reschedule_request"] = serialize_reschedule_request(open_request)
    return rows


def update_interview_assignment(
    *,
    assignment,
    interviewer_id,
    scheduled_at,
    location,
    note,
):
    if normalize_assignment_status(assignment.status) != "scheduled":
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试已进行、已有反馈或已取消，不能再调整排期",
            code="assignment_not_reschedulable",
        )
    if InterviewFeedback.query.filter_by(
        org_id=assignment.org_id, assignment_id=assignment.id
    ).first() is not None:
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试任务已有反馈，不能再调整排期",
            code="assignment_not_reschedulable",
        )

    normalized_scheduled_at = ensure_interview_time_is_future(scheduled_at)
    if normalized_scheduled_at is not None:
        possible_conflicts = (
            InterviewAssignment.query.filter_by(
                org_id=assignment.org_id,
                interviewer_id=interviewer_id,
            )
            .filter(
                InterviewAssignment.id != assignment.id,
                active_assignment_filter(),
            )
            .all()
        )
        for other in possible_conflicts:
            if interview_times_overlap(other.scheduled_at, normalized_scheduled_at):
                db.session.rollback()
                raise InterviewAssignmentWorkflowError(
                    "面试官该时间已有面试安排，请改期或更换面试官",
                    code="interviewer_schedule_conflict",
                    details={"conflict_assignment_id": other.id},
                )

    normalized_location = str(location or "")[:240]
    normalized_note = str(note or "")
    old_interviewer_id = assignment.interviewer_id
    changed = any(
        (
            interviewer_id != assignment.interviewer_id,
            normalized_scheduled_at
            != normalize_assignment_datetime(assignment.scheduled_at),
            normalized_location != (assignment.location or ""),
            normalized_note != (assignment.note or ""),
        )
    )
    if not changed:
        db.session.rollback()
        return assignment, True

    assignment.interviewer_id = interviewer_id
    assignment.scheduled_at = normalized_scheduled_at
    assignment.location = normalized_location
    assignment.note = normalized_note
    notified_user_ids = {old_interviewer_id, interviewer_id}
    for notified_user_id in notified_user_ids:
        db.session.add(
            Notification(
                org_id=assignment.org_id,
                user_id=notified_user_id,
                demand_id=assignment.demand_id,
                type="interview_assignment_updated",
                title="面试安排已调整",
                body=(
                    f"第 {assignment.round_sequence} 轮面试的时间、地点或面试官已更新。"
                ),
                link=(
                    f"/interviewer/interviews?demand={assignment.demand_id}"
                    f"&candidate={assignment.candidate_id}"
                    f"&assignment={assignment.id}"
                ),
            )
        )
    record_event(
        "interview.assignment_updated",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "job_id": assignment.job_id,
            "round": assignment.round,
            "round_sequence": assignment.round_sequence,
            "interviewer_id": interviewer_id,
            "scheduled_at": (
                normalized_scheduled_at.isoformat()
                if normalized_scheduled_at is not None
                else None
            ),
        },
        commit=False,
    )
    db.session.commit()
    return assignment, False


def mark_interview_conducted(*, assignment):
    status = normalize_assignment_status(assignment.status)
    if status == "awaiting_feedback":
        db.session.rollback()
        return assignment, True
    if status != "scheduled" or assignment_is_cancelled(status):
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "该面试任务当前不能确认已进行",
            code="assignment_not_conductable",
        )
    ensure_interview_has_started(assignment)
    if InterviewFeedback.query.filter_by(
        org_id=assignment.org_id, assignment_id=assignment.id
    ).first() is not None:
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试任务已有反馈",
            code="feedback_already_submitted",
        )

    assignment.status = "awaiting_feedback"
    db.session.add(
        Notification(
            org_id=assignment.org_id,
            user_id=assignment.interviewer_id,
            demand_id=assignment.demand_id,
            type="interview_feedback_requested",
            title="面试已确认完成，请提交反馈",
            body=f"第 {assignment.round_sequence} 轮面试已由招聘团队确认进行。",
            link=(
                f"/interviewer/interviews?demand={assignment.demand_id}"
                f"&candidate={assignment.candidate_id}"
                f"&assignment={assignment.id}"
            ),
        )
    )
    record_event(
        "interview.assignment_conducted",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "job_id": assignment.job_id,
            "round": assignment.round,
            "round_sequence": assignment.round_sequence,
            "interviewer_id": assignment.interviewer_id,
        },
        commit=False,
    )
    db.session.commit()
    return assignment, False


def remind_interview_feedback(*, assignment):
    if normalize_assignment_status(assignment.status) != "awaiting_feedback":
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "只有已进行且待反馈的面试才能催反馈",
            code="assignment_not_awaiting_feedback",
        )
    if InterviewFeedback.query.filter_by(
        org_id=assignment.org_id, assignment_id=assignment.id
    ).first() is not None:
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试反馈已提交，无需再催",
            code="feedback_already_submitted",
        )

    recent_events = (
        Event.query.filter(
            Event.org_id == assignment.org_id,
            Event.demand_id == assignment.demand_id,
            Event.action == "interview.feedback_reminded",
            Event.entity_id == assignment.candidate_id,
            Event.ts >= utc_now() - REMINDER_COOLDOWN,
        )
        .order_by(Event.id.desc())
        .limit(20)
        .all()
    )
    if any(
        isinstance(item.payload, dict)
        and item.payload.get("assignment_id") == assignment.id
        for item in recent_events
    ):
        db.session.rollback()
        return assignment, True

    db.session.add(
        Notification(
            org_id=assignment.org_id,
            user_id=assignment.interviewer_id,
            demand_id=assignment.demand_id,
            type="interview_feedback_reminder",
            title="请尽快补充面试反馈",
            body=f"第 {assignment.round_sequence} 轮面试仍在等待反馈。",
            link=(
                f"/interviewer/interviews?demand={assignment.demand_id}"
                f"&candidate={assignment.candidate_id}"
                f"&assignment={assignment.id}"
            ),
        )
    )
    record_event(
        "interview.feedback_reminded",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "job_id": assignment.job_id,
            "round": assignment.round,
            "round_sequence": assignment.round_sequence,
            "interviewer_id": assignment.interviewer_id,
        },
        commit=False,
    )
    db.session.commit()
    return assignment, False
