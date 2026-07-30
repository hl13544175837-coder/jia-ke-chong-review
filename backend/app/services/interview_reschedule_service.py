"""Interview reschedule requests, durable schedule history, and replacement links."""

from sqlalchemy import or_, select

from .. import db
from ..middleware.events import record_event
from ..models import (
    InterviewAssignment,
    InterviewFeedback,
    InterviewRescheduleRequest,
    Notification,
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now
from .interview_management_service import update_interview_assignment
from .interview_workflow_service import (
    InterviewAssignmentWorkflowError,
    cancel_interview_assignment,
    create_interview_assignment,
    ensure_interview_time_is_future,
    normalize_assignment_datetime,
    normalize_assignment_status,
)


OPEN_RESCHEDULE_STATUSES = {"pending", "waiting_reassignment"}


class InterviewRescheduleError(Exception):
    def __init__(self, message, *, code, status_code=409, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def as_payload(self):
        return {"error": self.message, "code": self.code, **self.details}


def _iso(value):
    return value.isoformat() if value is not None else None


def _user_name(user_id):
    user = db.session.get(User, user_id) if user_id else None
    return user.name if user else None


def serialize_reschedule_request(item):
    proposed = item.proposed_times if isinstance(item.proposed_times, list) else []
    return {
        "id": item.id,
        "org_id": item.org_id,
        "assignment_id": item.assignment_id,
        "replacement_assignment_id": item.replacement_assignment_id,
        "candidate_id": item.candidate_id,
        "job_id": item.job_id,
        "demand_id": item.demand_id,
        "round": item.round,
        "round_sequence": item.round_sequence,
        "source": item.source,
        "status": item.status,
        "requested_by": item.requested_by,
        "requester_name": _user_name(item.requested_by),
        "requested_at": _iso(item.requested_at),
        "reason": item.reason or "",
        "proposed_times": proposed,
        "original_interviewer_id": item.original_interviewer_id,
        "original_interviewer_name": _user_name(item.original_interviewer_id),
        "original_scheduled_at": _iso(item.original_scheduled_at),
        "original_location": item.original_location or "",
        "final_interviewer_id": item.final_interviewer_id,
        "final_interviewer_name": _user_name(item.final_interviewer_id),
        "final_scheduled_at": _iso(item.final_scheduled_at),
        "final_location": item.final_location or "",
        "processed_by": item.processed_by,
        "processor_name": _user_name(item.processed_by),
        "processed_at": _iso(item.processed_at),
        "processor_note": item.processor_note or "",
    }


def history_for_assignment(assignment):
    return (
        InterviewRescheduleRequest.query.filter(
            InterviewRescheduleRequest.org_id == assignment.org_id,
            InterviewRescheduleRequest.candidate_id == assignment.candidate_id,
            InterviewRescheduleRequest.demand_id == assignment.demand_id,
            or_(
                InterviewRescheduleRequest.assignment_id == assignment.id,
                InterviewRescheduleRequest.replacement_assignment_id == assignment.id,
                InterviewRescheduleRequest.round_sequence == assignment.round_sequence,
            ),
        )
        .order_by(
            InterviewRescheduleRequest.requested_at.desc(),
            InterviewRescheduleRequest.id.desc(),
        )
        .all()
    )


def pending_request_for_assignment(assignment):
    return (
        InterviewRescheduleRequest.query.filter_by(
            org_id=assignment.org_id,
            assignment_id=assignment.id,
            status="pending",
        )
        .order_by(InterviewRescheduleRequest.id.desc())
        .first()
    )


def open_requests_for_rows(*, org_id, candidate_demand_pairs):
    if not candidate_demand_pairs:
        return {}
    candidates = {candidate_id for candidate_id, _ in candidate_demand_pairs}
    demands = {demand_id for _, demand_id in candidate_demand_pairs}
    records = (
        InterviewRescheduleRequest.query.filter(
            InterviewRescheduleRequest.org_id == org_id,
            InterviewRescheduleRequest.candidate_id.in_(candidates),
            InterviewRescheduleRequest.demand_id.in_(demands),
            InterviewRescheduleRequest.status.in_(OPEN_RESCHEDULE_STATUSES),
        )
        .order_by(InterviewRescheduleRequest.id.desc())
        .all()
    )
    result = {}
    for item in records:
        key = (item.candidate_id, item.demand_id)
        if key in candidate_demand_pairs and key not in result:
            result[key] = item
    return result


def create_reschedule_request(*, assignment, requested_by, reason, proposed_times):
    reason = str(reason or "").strip()
    if not reason:
        raise InterviewRescheduleError(
            "申请改约需要填写原因",
            code="reschedule_reason_required",
            status_code=400,
        )
    if len(reason) > 500:
        raise InterviewRescheduleError(
            "改约原因不能超过 500 字",
            code="reschedule_reason_too_long",
            status_code=400,
        )
    if assignment.interviewer_id != requested_by:
        raise InterviewRescheduleError("Forbidden", code="forbidden", status_code=403)
    if normalize_assignment_status(assignment.status) != "scheduled":
        raise InterviewRescheduleError(
            "面试已进行、已有反馈或已取消，不能申请改约",
            code="assignment_not_reschedulable",
        )
    if InterviewFeedback.query.filter_by(
        org_id=assignment.org_id, assignment_id=assignment.id
    ).first() is not None:
        raise InterviewRescheduleError(
            "面试任务已有反馈，不能申请改约",
            code="assignment_not_reschedulable",
        )
    if not isinstance(proposed_times, list) or not 1 <= len(proposed_times) <= 2:
        raise InterviewRescheduleError(
            "请提供 1 到 2 个建议时间",
            code="proposed_times_required",
            status_code=400,
        )

    normalized_times = []
    for value in proposed_times:
        if value is None:
            raise InterviewRescheduleError(
                "建议时间格式不正确",
                code="invalid_proposed_time",
                status_code=400,
            )
        try:
            normalized = ensure_interview_time_is_future(value)
        except InterviewAssignmentWorkflowError as exc:
            raise InterviewRescheduleError(
                exc.message,
                code=exc.code,
                status_code=exc.status_code,
                details=exc.details,
            ) from exc
        value_iso = normalized.isoformat()
        if value_iso not in normalized_times:
            normalized_times.append(value_iso)
    if not normalized_times:
        raise InterviewRescheduleError(
            "请提供有效的建议时间",
            code="proposed_times_required",
            status_code=400,
        )

    pending = db.session.execute(
        select(InterviewRescheduleRequest).where(
            InterviewRescheduleRequest.org_id == assignment.org_id,
            InterviewRescheduleRequest.assignment_id == assignment.id,
            InterviewRescheduleRequest.status == "pending",
        ).with_for_update()
    ).scalar_one_or_none()
    if pending is not None:
        db.session.rollback()
        raise InterviewRescheduleError(
            "该面试已有待处理的改约申请",
            code="reschedule_request_pending",
        )

    now = utc_now()
    item = InterviewRescheduleRequest(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
        candidate_id=assignment.candidate_id,
        job_id=assignment.job_id,
        demand_id=assignment.demand_id,
        round=assignment.round,
        round_sequence=assignment.round_sequence or 1,
        source="interviewer_request",
        status="pending",
        requested_by=requested_by,
        requested_at=now,
        reason=reason,
        proposed_times=normalized_times,
        original_interviewer_id=assignment.interviewer_id,
        original_scheduled_at=normalize_assignment_datetime(assignment.scheduled_at),
        original_location=assignment.location or "",
        final_location="",
        created_at=now,
        updated_at=now,
    )
    db.session.add(item)
    demand = db.session.get(RecruitmentDemand, assignment.demand_id)
    requester = db.session.get(User, requested_by)
    owner_id = demand.owner_hr_id if demand else None
    if owner_id:
        db.session.add(Notification(
            org_id=assignment.org_id,
            user_id=owner_id,
            demand_id=assignment.demand_id,
            type="interview_reschedule_requested",
            title="面试官申请改约",
            body=(
                f"{requester.name if requester else '面试官'}申请调整第 "
                f"{assignment.round_sequence or 1} 轮面试：{reason}"
            ),
            link=(
                f"/interviews?demand={assignment.demand_id}"
                f"&candidate={assignment.candidate_id}&assignment={assignment.id}"
            ),
        ))
    record_event(
        "interview.reschedule_requested",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "reason": reason,
            "proposed_times": normalized_times,
        },
        commit=False,
    )
    db.session.commit()
    return item


def load_request_for_update(*, org_id, request_id):
    return db.session.execute(
        select(InterviewRescheduleRequest).where(
            InterviewRescheduleRequest.id == request_id,
            InterviewRescheduleRequest.org_id == org_id,
        ).with_for_update()
    ).scalar_one_or_none()


def resolve_reschedule_request(
    *,
    item,
    action,
    processed_by,
    processor_note,
    interviewer_id=None,
    scheduled_at=None,
    location="",
    note="",
):
    if item.status != "pending":
        db.session.rollback()
        raise InterviewRescheduleError(
            "该改约申请已被处理，请刷新后查看",
            code="reschedule_request_already_processed",
        )
    if action not in {"approve", "reject", "cancel_and_wait"}:
        db.session.rollback()
        raise InterviewRescheduleError(
            "无效的改约处理动作",
            code="invalid_reschedule_action",
            status_code=400,
        )
    processor_note = str(processor_note or "").strip()
    if action in {"reject", "cancel_and_wait"} and not processor_note:
        db.session.rollback()
        raise InterviewRescheduleError(
            "请填写处理原因",
            code="processor_note_required",
            status_code=400,
        )

    assignment = db.session.execute(
        select(InterviewAssignment).where(
            InterviewAssignment.id == item.assignment_id,
            InterviewAssignment.org_id == item.org_id,
        ).with_for_update()
    ).scalar_one_or_none()
    if assignment is None:
        db.session.rollback()
        raise InterviewRescheduleError(
            "原面试任务不存在",
            code="assignment_not_found",
            status_code=404,
        )
    now = utc_now()
    item.processed_by = processed_by
    item.processed_at = now
    item.processor_note = processor_note
    item.updated_at = now

    if action == "reject":
        item.status = "rejected"
        db.session.add(Notification(
            org_id=item.org_id,
            user_id=item.requested_by,
            demand_id=item.demand_id,
            type="interview_reschedule_rejected",
            title="改约申请未通过",
            body=f"原面试安排仍然有效。原因：{processor_note}",
            link=(
                f"/interviewer/interviews?demand={item.demand_id}"
                f"&candidate={item.candidate_id}&assignment={item.assignment_id}"
            ),
        ))
        record_event(
            "interview.reschedule_rejected",
            entity_id=item.candidate_id,
            entity_type="candidate",
            demand_id=item.demand_id,
            payload={"request_id": item.id, "assignment_id": item.assignment_id},
            commit=False,
        )
        db.session.commit()
        return item

    if action == "cancel_and_wait":
        item.status = "waiting_reassignment"
        record_event(
            "interview.reschedule_waiting_reassignment",
            entity_id=item.candidate_id,
            entity_type="candidate",
            demand_id=item.demand_id,
            payload={"request_id": item.id, "assignment_id": item.assignment_id},
            commit=False,
        )
        try:
            cancel_interview_assignment(assignment=assignment, reason=processor_note)
        except InterviewAssignmentWorkflowError as exc:
            raise InterviewRescheduleError(
                exc.message,
                code=exc.code,
                status_code=exc.status_code,
                details=exc.details,
            ) from exc
        return item

    if interviewer_id is None or scheduled_at is None:
        db.session.rollback()
        raise InterviewRescheduleError(
            "同意改约时必须确认面试官和最终时间",
            code="reschedule_final_schedule_required",
            status_code=400,
        )
    normalized_time = ensure_interview_time_is_future(scheduled_at)
    normalized_location = str(location or "")[:240]
    if (
        interviewer_id == assignment.interviewer_id
        and normalized_time == normalize_assignment_datetime(assignment.scheduled_at)
        and normalized_location == (assignment.location or "")
        and str(note or "") == (assignment.note or "")
    ):
        db.session.rollback()
        raise InterviewRescheduleError(
            "最终安排没有变化，请调整时间、地点或面试官",
            code="reschedule_no_change",
            status_code=400,
        )

    item.status = "approved"
    item.final_interviewer_id = interviewer_id
    item.final_scheduled_at = normalized_time
    item.final_location = normalized_location
    record_event(
        "interview.reschedule_approved",
        entity_id=item.candidate_id,
        entity_type="candidate",
        demand_id=item.demand_id,
        payload={
            "request_id": item.id,
            "assignment_id": item.assignment_id,
            "final_interviewer_id": interviewer_id,
            "final_scheduled_at": normalized_time.isoformat(),
        },
        commit=False,
    )
    try:
        update_interview_assignment(
            assignment=assignment,
            interviewer_id=interviewer_id,
            scheduled_at=normalized_time,
            location=normalized_location,
            note=str(note or ""),
        )
    except InterviewAssignmentWorkflowError as exc:
        raise InterviewRescheduleError(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details=exc.details,
        ) from exc
    return item


def adjust_assignment_directly(
    *,
    assignment,
    actor_id,
    reason,
    interviewer_id,
    scheduled_at,
    location,
    note,
):
    reason = str(reason or "").strip()
    if not reason:
        raise InterviewRescheduleError(
            "调整面试安排需要填写原因",
            code="change_reason_required",
            status_code=400,
        )
    normalized_time = ensure_interview_time_is_future(scheduled_at)
    now = utc_now()
    item = InterviewRescheduleRequest(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
        candidate_id=assignment.candidate_id,
        job_id=assignment.job_id,
        demand_id=assignment.demand_id,
        round=assignment.round,
        round_sequence=assignment.round_sequence or 1,
        source="recruiter_direct",
        status="approved",
        requested_by=actor_id,
        requested_at=now,
        reason=reason[:500],
        proposed_times=[],
        original_interviewer_id=assignment.interviewer_id,
        original_scheduled_at=normalize_assignment_datetime(assignment.scheduled_at),
        original_location=assignment.location or "",
        final_interviewer_id=interviewer_id,
        final_scheduled_at=normalized_time,
        final_location=str(location or "")[:240],
        processed_by=actor_id,
        processed_at=now,
        processor_note=reason[:500],
        created_at=now,
        updated_at=now,
    )
    db.session.add(item)
    try:
        assignment, deduplicated = update_interview_assignment(
            assignment=assignment,
            interviewer_id=interviewer_id,
            scheduled_at=normalized_time,
            location=location,
            note=note,
        )
    except InterviewAssignmentWorkflowError as exc:
        raise InterviewRescheduleError(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details=exc.details,
        ) from exc
    return assignment, deduplicated, item


def create_replacement_assignment(
    *,
    item,
    context,
    interviewer_id,
    scheduled_at,
    location,
    note,
    processed_by,
):
    if item.status != "waiting_reassignment":
        db.session.rollback()
        raise InterviewRescheduleError(
            "该改约申请当前不需要重新安排",
            code="reschedule_not_waiting_reassignment",
        )
    if context.candidate.id != item.candidate_id or context.demand.id != item.demand_id:
        db.session.rollback()
        raise InterviewRescheduleError(
            "候选人或招聘需求已变化，请刷新后重试",
            code="reschedule_context_changed",
        )
    try:
        assignment, deduplicated = create_interview_assignment(
            context=context,
            interviewer_id=interviewer_id,
            round_name=item.round,
            round_sequence=item.round_sequence,
            is_primary=True,
            scheduled_at=scheduled_at,
            location=str(location or ""),
            note=str(note or ""),
            created_by=processed_by,
            commit=False,
        )
    except InterviewAssignmentWorkflowError as exc:
        raise InterviewRescheduleError(
            exc.message,
            code=exc.code,
            status_code=exc.status_code,
            details=exc.details,
        ) from exc
    if deduplicated:
        db.session.rollback()
        raise InterviewRescheduleError(
            "该轮已有相同面试安排，请刷新后查看",
            code="replacement_assignment_exists",
        )

    normalized_time = normalize_assignment_datetime(assignment.scheduled_at)
    now = utc_now()
    item.replacement_assignment_id = assignment.id
    item.status = "resolved"
    item.final_interviewer_id = interviewer_id
    item.final_scheduled_at = normalized_time
    item.final_location = assignment.location or ""
    item.processed_by = processed_by
    item.processed_at = now
    item.updated_at = now
    notified_user_ids = {item.requested_by, interviewer_id}
    for user_id in notified_user_ids:
        db.session.add(Notification(
            org_id=item.org_id,
            user_id=user_id,
            demand_id=item.demand_id,
            type="interview_reschedule_reassigned",
            title="改约后的面试已重新安排",
            body=(
                f"第 {item.round_sequence} 轮面试已重新安排为 "
                f"{normalized_time.strftime('%m-%d %H:%M') if normalized_time else '时间待确认'}。"
            ),
            link=(
                f"/interviewer/interviews?demand={item.demand_id}"
                f"&candidate={item.candidate_id}&assignment={assignment.id}"
            ),
        ))
    record_event(
        "interview.reschedule_reassigned",
        entity_id=item.candidate_id,
        entity_type="candidate",
        demand_id=item.demand_id,
        payload={
            "request_id": item.id,
            "original_assignment_id": item.assignment_id,
            "replacement_assignment_id": assignment.id,
            "interviewer_id": interviewer_id,
        },
        commit=False,
    )
    db.session.commit()
    return assignment, item
