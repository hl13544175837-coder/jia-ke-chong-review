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
    list_pending_reschedule_requests,
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
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now
from .access import (
    same_org,
    visible_candidate_query,
)


def register_interview_reschedule_routes(bp):
    from .interview import (
        INTERVIEW_ROUNDS,
        _assignment_payload,
        _assignment_workflow_error_response,
        _context_error_response,
        _load_managed_assignment,
        _parse_datetime,
        _reschedule_error_response,
    )

    @bp.post("/interview/assignments/<int:assignment_id>/reschedule-requests")
    @require_auth
    def request_assignment_reschedule(assignment_id):
        if g.role != "interviewer":
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        assignment = InterviewAssignment.query.filter_by(
            id=assignment_id,
            org_id=g.org_id,
        ).one_or_none()
        if assignment is None:
            return jsonify({
                "error": "面试任务不存在",
                "code": "assignment_not_found",
            }), 404
        if assignment.interviewer_id != g.user_id:
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

        data = request.get_json(silent=True) or {}
        raw_times = data.get("proposed_times")
        parsed_times = []
        if isinstance(raw_times, list):
            parsed_times = [_parse_datetime(value) for value in raw_times]
        try:
            item = create_reschedule_request(
                assignment=assignment,
                requested_by=g.user_id,
                reason=data.get("reason"),
                proposed_times=parsed_times,
            )
        except (InterviewRescheduleError, InterviewAssignmentWorkflowError) as exc:
            return _reschedule_error_response(exc)
        return jsonify(serialize_reschedule_request(item)), 201


    @bp.get("/interview/assignments/<int:assignment_id>/reschedule-history")
    @require_auth
    def assignment_reschedule_history(assignment_id):
        assignment = InterviewAssignment.query.filter_by(
            id=assignment_id,
            org_id=g.org_id,
        ).one_or_none()
        if assignment is None:
            return jsonify({
                "error": "面试任务不存在",
                "code": "assignment_not_found",
            }), 404
        if g.role == "interviewer":
            if assignment.interviewer_id != g.user_id:
                return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        elif g.role in {"recruiter", "manager", "admin"}:
            try:
                demand = resolve_demand_context(
                    org_id=g.org_id,
                    demand_id=assignment.demand_id,
                    job_id=assignment.job_id,
                )
            except DemandContextError as exc:
                return _context_error_response(exc)
            if not can_manage_demand(g.user_id, g.role, g.org_id, demand):
                return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        else:
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        return jsonify([
            serialize_reschedule_request(item)
            for item in history_for_assignment(assignment)
        ])


    @bp.patch("/interview/reschedule-requests/<int:request_id>")
    @require_auth
    def process_reschedule_request(request_id):
        if g.role not in {"recruiter", "manager", "admin"}:
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        item = load_request_for_update(org_id=g.org_id, request_id=request_id)
        if item is None:
            db.session.rollback()
            return jsonify({
                "error": "改约申请不存在",
                "code": "reschedule_request_not_found",
            }), 404
        try:
            demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=item.demand_id,
                job_id=item.job_id,
            )
        except DemandContextError as exc:
            db.session.rollback()
            return _context_error_response(exc)
        if not can_manage_demand(g.user_id, g.role, g.org_id, demand):
            db.session.rollback()
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

        data = request.get_json(silent=True) or {}
        action = str(data.get("action") or "").strip()
        interviewer_id = data.get("interviewer_id")
        scheduled_at = None
        if action == "approve":
            if (
                isinstance(interviewer_id, bool)
                or not isinstance(interviewer_id, int)
                or interviewer_id < 1
            ):
                db.session.rollback()
                return jsonify({"error": "请选择最终面试官"}), 400
            interviewer = User.query.filter_by(
                id=interviewer_id,
                org_id=g.org_id,
                is_active=True,
            ).one_or_none()
            if interviewer is None or interviewer.role not in {"interviewer", "manager", "admin"}:
                db.session.rollback()
                return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400
            scheduled_at = _parse_datetime(data.get("scheduled_at"))
            if scheduled_at is None:
                db.session.rollback()
                return jsonify({
                    "error": "请选择有效的最终面试时间",
                    "code": "reschedule_final_schedule_required",
                }), 400
        try:
            item = resolve_reschedule_request(
                item=item,
                action=action,
                processed_by=g.user_id,
                processor_note=data.get("processor_note"),
                interviewer_id=interviewer_id,
                scheduled_at=scheduled_at,
                location=data.get("location", ""),
                note=data.get("note", ""),
            )
        except (InterviewRescheduleError, InterviewAssignmentWorkflowError) as exc:
            return _reschedule_error_response(exc)
        return jsonify(serialize_reschedule_request(item)), 200


    @bp.post("/interview/reschedule-requests/<int:request_id>/replacement")
    @require_auth
    def replace_cancelled_reschedule_assignment(request_id):
        if g.role not in {"recruiter", "manager", "admin"}:
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        reference = InterviewRescheduleRequest.query.filter_by(
            id=request_id,
            org_id=g.org_id,
        ).one_or_none()
        if reference is None:
            return jsonify({
                "error": "改约申请不存在",
                "code": "reschedule_request_not_found",
            }), 404
        try:
            context = resolve_interview_context(
                org_id=g.org_id,
                candidate_id=reference.candidate_id,
                demand_id=reference.demand_id,
                job_id=reference.job_id,
                open_only=True,
                require_current=True,
                lock=True,
            )
        except DemandContextError as exc:
            return _context_error_response(exc)
        if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
            db.session.rollback()
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        item = load_request_for_update(org_id=g.org_id, request_id=request_id)
        if item is None:
            db.session.rollback()
            return jsonify({
                "error": "改约申请已变化，请刷新后重试",
                "code": "reschedule_request_changed",
            }), 409

        data = request.get_json(silent=True) or {}
        interviewer_id = data.get("interviewer_id")
        if (
            isinstance(interviewer_id, bool)
            or not isinstance(interviewer_id, int)
            or interviewer_id < 1
        ):
            db.session.rollback()
            return jsonify({"error": "请选择面试官"}), 400
        interviewer = User.query.filter_by(
            id=interviewer_id,
            org_id=g.org_id,
            is_active=True,
        ).one_or_none()
        if interviewer is None or interviewer.role not in {"interviewer", "manager", "admin"}:
            db.session.rollback()
            return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400
        scheduled_at = _parse_datetime(data.get("scheduled_at"))
        if scheduled_at is None:
            db.session.rollback()
            return jsonify({"error": "请选择有效的面试时间"}), 400
        try:
            assignment, item = create_replacement_assignment(
                item=item,
                context=context,
                interviewer_id=interviewer_id,
                scheduled_at=scheduled_at,
                location=data.get("location", ""),
                note=data.get("note", ""),
                processed_by=g.user_id,
            )
        except (InterviewRescheduleError, InterviewAssignmentWorkflowError) as exc:
            return _reschedule_error_response(exc)
        return jsonify({
            "assignment": _assignment_payload(assignment),
            "reschedule_request": serialize_reschedule_request(item),
        }), 201


    @bp.get("/interview/reschedule-requests/pending")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def pending_reschedule_requests():
        """工作台待确认改约聚合：当前角色可见需求下的 pending 申请，按申请时间倒序。"""
        visible_demand_ids = visible_demand_query(
            g.user_id, g.role, g.org_id
        ).with_entities(RecruitmentDemand.id)
        items = list_pending_reschedule_requests(
            org_id=g.org_id,
            visible_demand_ids=visible_demand_ids,
        )
        return jsonify(items)
