from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..services.interview_service import PreScreenService
from ..services.interview_workflow_service import (
    FeedbackValidationError,
    InterviewAssignmentWorkflowError,
    InterviewFeedbackEditError,
    active_assignment_filter,
    assignment_is_cancelled,
    cancel_interview_assignment,
    can_manage_interview_context,
    can_read_interview_context,
    create_interview_assignment,
    ensure_interview_has_started,
    feedback_assignment,
    feedback_satisfaction,
    load_assignment_for_update,
    normalize_assignment_datetime,
    normalize_assignment_status,
    normalize_simple_feedback,
    resolve_interview_context,
    update_interview_feedback,
)
from ..services.interview_management_service import (
    interview_management_rows,
    mark_interview_conducted,
    remind_interview_feedback,
    update_interview_assignment,
)
from ..services.interview_reschedule_service import (
    InterviewRescheduleError,
    adjust_assignment_directly,
    create_replacement_assignment,
    create_reschedule_request,
    history_for_assignment,
    load_request_for_update,
    pending_request_for_assignment,
    resolve_reschedule_request,
    serialize_reschedule_request,
)
from ..services.pipeline_service import normalize_pipeline_stage
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
    visible_demand_query,
)
from .. import db
from ..models import (
    Candidate,
    Interview,
    InterviewAssignment,
    InterviewRescheduleRequest,
    Job,
    Notification,
    User,
)
from ..time_utils import utc_now
from .access import (
    same_org,
    visible_candidate_query,
)


def register_interview_assignment_routes(bp):
    from .interview import (
        INTERVIEW_ROUNDS,
        _assignment_payload,
        _assignment_workflow_error_response,
        _context_error_response,
        _load_managed_assignment,
        _parse_datetime,
        _reschedule_error_response,
    )

    @bp.post("/interview/assignments")
    @require_auth
    def create_assignment():
        from ..models import Candidate, User

        if g.role not in ("recruiter", "manager", "admin"):
            return jsonify({"error": "Forbidden"}), 403
        data = request.get_json() or {}
        required = ("candidate_id", "round", "interviewer_id")
        if not all(data.get(k) for k in required) or not (data.get("demand_id") or data.get("job_id")):
            return jsonify({"error": "candidate_id, demand_id, round, interviewer_id required",
                            "code": "demand_id_required"}), 400
        if data["round"] not in INTERVIEW_ROUNDS:
            return jsonify({"error": "无效面试轮次"}), 400
        if "status" in data:
            return jsonify({
                "error": "面试任务状态由服务端管理，请使用取消任务接口",
                "code": "assignment_status_managed_by_server",
            }), 400
        try:
            context = resolve_interview_context(
                org_id=g.org_id,
                candidate_id=data["candidate_id"],
                demand_id=data.get("demand_id"),
                job_id=data.get("job_id"),
                open_only=True,
                require_current=True,
                lock=True,
            )
        except DemandContextError as exc:
            return _context_error_response(exc)
        if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        interviewer = db.session.execute(
            select(User)
            .where(User.id == data["interviewer_id"], User.org_id == g.org_id)
            .with_for_update()
        ).scalar_one_or_none()
        if (
            interviewer is None
            or not same_org(interviewer, g.org_id)
            or interviewer.role not in ("interviewer", "manager", "admin")
            or not interviewer.is_active
        ):
            return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400

        scheduled_at = _parse_datetime(data.get("scheduled_at"))
        round_sequence = data.get("round_sequence", 1)
        if (
            not isinstance(round_sequence, int)
            or isinstance(round_sequence, bool)
            or round_sequence < 1
        ):
            return jsonify({"error": "round_sequence 必须是正整数"}), 400
        fixed_round_sequence = {"round_1": 1, "round_2": 2, "round_3": 3}
        expected_sequence = fixed_round_sequence.get(data["round"])
        if expected_sequence is not None and round_sequence != expected_sequence:
            return jsonify({
                "error": f"{data['round']} 必须对应第 {expected_sequence} 轮",
                "code": "round_sequence_mismatch",
            }), 400
        is_primary = data.get("is_primary", True)
        if not isinstance(is_primary, bool):
            return jsonify({"error": "is_primary 必须是布尔值"}), 400
        try:
            assignment, deduplicated = create_interview_assignment(
                context=context,
                interviewer_id=data["interviewer_id"],
                round_name=data["round"],
                round_sequence=round_sequence,
                is_primary=is_primary,
                scheduled_at=scheduled_at,
                location=str(data.get("location") or ""),
                note=str(data.get("note") or ""),
                created_by=g.user_id,
            )
        except InterviewAssignmentWorkflowError as exc:
            return _assignment_workflow_error_response(exc)
        payload = _assignment_payload(assignment)
        payload["deduplicated"] = deduplicated
        return jsonify(payload), 200 if deduplicated else 201


    @bp.patch("/interview/assignments/<int:assignment_id>")
    @require_auth
    def update_assignment(assignment_id):
        if g.role not in {"recruiter", "manager", "admin"}:
            return jsonify({"error": "Forbidden"}), 403
        data = request.get_json(silent=True) or {}
        editable_fields = {"scheduled_at", "interviewer_id", "location", "note"}
        if not editable_fields.intersection(data):
            return jsonify({
                "error": "请至少提供一个可调整字段",
                "code": "assignment_update_required",
            }), 400
        assignment, error = _load_managed_assignment(assignment_id)
        if error is not None:
            return error

        interviewer_id = data.get("interviewer_id", assignment.interviewer_id)
        if (
            isinstance(interviewer_id, bool)
            or not isinstance(interviewer_id, int)
            or interviewer_id < 1
        ):
            db.session.rollback()
            return jsonify({"error": "interviewer_id 必须是正整数"}), 400
        from ..models import User

        interviewer = db.session.execute(
            select(User)
            .where(User.id == interviewer_id, User.org_id == g.org_id)
            .with_for_update()
        ).scalar_one_or_none()
        if (
            interviewer is None
            or interviewer.role not in {"interviewer", "manager", "admin"}
            or not interviewer.is_active
        ):
            db.session.rollback()
            return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400

        if "scheduled_at" in data:
            scheduled_at = _parse_datetime(data.get("scheduled_at"))
            if data.get("scheduled_at") is not None and scheduled_at is None:
                db.session.rollback()
                return jsonify({"error": "scheduled_at 不是有效时间"}), 400
        else:
            scheduled_at = assignment.scheduled_at
        try:
            assignment, deduplicated, _ = adjust_assignment_directly(
                assignment=assignment,
                actor_id=g.user_id,
                reason=data.get("change_reason") or "招聘专员调整排期",
                interviewer_id=interviewer_id,
                scheduled_at=scheduled_at,
                location=data.get("location", assignment.location),
                note=data.get("note", assignment.note),
            )
        except (InterviewRescheduleError, InterviewAssignmentWorkflowError) as exc:
            return _reschedule_error_response(exc)
        payload = _assignment_payload(assignment)
        payload["deduplicated"] = deduplicated
        return jsonify(payload), 200


    @bp.post("/interview/assignments/<int:assignment_id>/mark-conducted")
    @require_auth
    def mark_assignment_conducted(assignment_id):
        if g.role == "interviewer":
            assignment = InterviewAssignment.query.filter_by(
                id=assignment_id,
                org_id=g.org_id,
                interviewer_id=g.user_id,
            ).filter(active_assignment_filter()).one_or_none()
            if assignment is None:
                return jsonify({"error": "Forbidden"}), 403
        elif g.role in {"recruiter", "manager", "admin"}:
            assignment, error = _load_managed_assignment(assignment_id)
            if error is not None:
                return error
        else:
            return jsonify({"error": "Forbidden"}), 403
        try:
            assignment, deduplicated = mark_interview_conducted(
                assignment=assignment
            )
        except InterviewAssignmentWorkflowError as exc:
            return _assignment_workflow_error_response(exc)
        payload = _assignment_payload(assignment)
        payload["deduplicated"] = deduplicated
        return jsonify(payload), 200


    @bp.post("/interview/assignments/<int:assignment_id>/remind-feedback")
    @require_auth
    def remind_assignment_feedback(assignment_id):
        if g.role not in {"recruiter", "manager", "admin"}:
            return jsonify({"error": "Forbidden"}), 403
        assignment, error = _load_managed_assignment(assignment_id)
        if error is not None:
            return error
        try:
            assignment, deduplicated = remind_interview_feedback(
                assignment=assignment
            )
        except InterviewAssignmentWorkflowError as exc:
            return _assignment_workflow_error_response(exc)
        payload = _assignment_payload(assignment)
        payload["deduplicated"] = deduplicated
        return jsonify(payload), 200


    @bp.patch("/interview/assignments/<int:assignment_id>/cancel")
    @require_auth
    def cancel_assignment(assignment_id):
        """Cancel an uncompleted assignment and release its primary round slot."""
        if g.role not in {"recruiter", "manager", "admin"}:
            return jsonify({"error": "Forbidden"}), 403
        reason = str((request.get_json(silent=True) or {}).get("reason") or "").strip()
        if not reason:
            return jsonify({
                "error": "取消面试任务需要填写原因",
                "code": "cancel_reason_required",
            }), 400

        # Read the immutable Demand reference without a row lock, then lock in the
        # same order as create (Demand -> assignment) to avoid MySQL deadlocks.
        assignment_reference = db.session.execute(
            select(
                InterviewAssignment.demand_id,
                InterviewAssignment.job_id,
                InterviewAssignment.candidate_id,
            ).where(
                InterviewAssignment.id == assignment_id,
                InterviewAssignment.org_id == g.org_id,
            )
        ).one_or_none()
        if assignment_reference is None:
            return jsonify({
                "error": "面试任务不存在",
                "code": "assignment_not_found",
            }), 404

        if assignment_reference.demand_id is not None:
            try:
                demand = resolve_demand_context(
                    org_id=g.org_id,
                    demand_id=assignment_reference.demand_id,
                    job_id=assignment_reference.job_id,
                    lock=True,
                )
            except DemandContextError as exc:
                db.session.rollback()
                return _context_error_response(exc)
            allowed = can_manage_demand(g.user_id, g.role, g.org_id, demand)
        assignment = load_assignment_for_update(
            org_id=g.org_id,
            assignment_id=assignment_id,
        )
        if assignment is None or assignment.demand_id != assignment_reference.demand_id:
            db.session.rollback()
            return jsonify({
                "error": "面试任务已变更，请刷新后重试",
                "code": "assignment_changed",
            }), 409

        if assignment.demand_id is None:
            candidate = db.session.get(Candidate, assignment.candidate_id)
            allowed = g.role in {"manager", "admin"} or (
                g.role == "recruiter"
                and candidate is not None
                and candidate.owner_hr_id in {g.user_id, None}
            )
        if not allowed:
            db.session.rollback()
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

        try:
            assignment, deduplicated = cancel_interview_assignment(
                assignment=assignment,
                reason=reason,
            )
        except InterviewAssignmentWorkflowError as exc:
            return _assignment_workflow_error_response(exc)
        payload = _assignment_payload(assignment)
        payload["deduplicated"] = deduplicated
        return jsonify(payload), 200
