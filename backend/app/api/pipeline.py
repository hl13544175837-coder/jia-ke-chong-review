from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from .. import db
from ..middleware.auth import require_auth, require_role
from ..models import (
    BusinessReviewTask,
    Candidate,
    InterviewAssignment,
    PipelineStage,
    RecruitmentDemand,
)
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    can_read_demand,
    resolve_demand_context,
)
from ..services.pipeline_service import (
    LEGACY_INTERVIEW_STAGES,
    PIPELINE_STAGE_ORDER,
    STAGE_ORDER,
    PipelineServiceError,
    move_candidate,
    normalize_pipeline_stage,
    parse_date,
    pipeline_board,
    pipeline_counts,
    pipeline_history,
    stage_sort_index,
    transfer_candidate as transfer_candidate_service,
)
from ..services.offer_service import (
    get_offer_by_id,
    get_offer_record,
    list_offer_workbench,
    list_offer_records,
    offer_payload,
    save_offer_record,
    register_oa_result,
    transition_offer,
)
from ..services.interview_workflow_service import active_assignment_filter
from .access import visible_candidate_query


bp = Blueprint("pipeline", __name__)


# Compatibility exports used by existing read-only modules. They remain
# job-scoped until those callers move to explicit Demand context.
def _stage_sort_index(stage):
    return stage_sort_index(stage)


def _parse_date(value):
    return parse_date(value)


def _latest_stage_subquery(job_id=None):
    query = db.session.query(
        PipelineStage.candidate_id.label("candidate_id"),
        PipelineStage.job_id.label("job_id"),
        func.max(PipelineStage.id).label("max_id"),
    )
    if job_id is not None:
        query = query.filter(PipelineStage.job_id == job_id)
    return query.group_by(PipelineStage.candidate_id, PipelineStage.job_id).subquery()


def _error_response(error):
    return jsonify(error.as_payload()), error.status_code


def _resolve_demand(*, demand_id=None, job_id=None):
    return resolve_demand_context(
        org_id=g.org_id,
        demand_id=demand_id,
        job_id=job_id,
        open_only=False,
    )


def _read_scope(demand):
    if g.role != "interviewer":
        return can_read_demand(g.user_id, g.role, g.org_id, demand), None
    if demand.created_by == g.user_id or demand.default_interviewer_id == g.user_id:
        return True, None
    assigned_ids = {
        row[0]
        for row in (
            db.session.query(InterviewAssignment.candidate_id)
            .filter_by(
                org_id=g.org_id,
                interviewer_id=g.user_id,
                demand_id=demand.id,
            )
            .filter(active_assignment_filter())
            .distinct()
            .all()
        )
    }
    assigned_ids.update(
        row[0]
        for row in (
            db.session.query(BusinessReviewTask.candidate_id)
            .filter_by(
                org_id=g.org_id,
                reviewer_id=g.user_id,
                demand_id=demand.id,
            )
            .distinct()
            .all()
        )
    )
    if not assigned_ids:
        sibling_count = RecruitmentDemand.query.filter_by(
            org_id=g.org_id,
            job_id=demand.job_id,
        ).count()
        if sibling_count == 1:
            assigned_ids = {
                row[0]
                for row in (
                    db.session.query(InterviewAssignment.candidate_id)
                    .filter_by(
                        org_id=g.org_id,
                        interviewer_id=g.user_id,
                        demand_id=None,
                        job_id=demand.job_id,
                    )
                    .filter(active_assignment_filter())
                    .distinct()
                    .all()
                )
            }
    return bool(assigned_ids), sorted(assigned_ids)


def _manage_allowed(demand):
    return can_manage_demand(g.user_id, g.role, g.org_id, demand)


def _route_demand(route_demand_id=None, legacy_job_id=None):
    return _resolve_demand(demand_id=route_demand_id, job_id=legacy_job_id)


def _path_id_mismatch(path_id, body_id):
    if path_id is None or body_id is None:
        return False
    try:
        return int(body_id) != path_id
    except (TypeError, ValueError):
        return True


@bp.post("/pipeline/move")
@bp.post("/pipeline/demands/<int:demand_id>/move")
@require_auth
def move_stage(demand_id=None):
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    to_stage = data.get("stage")
    if not candidate_id or not to_stage:
        return jsonify({"error": "candidate_id, stage required"}), 400
    if normalize_pipeline_stage(to_stage) == "onboarded":
        return jsonify({
            "error": "确认入职必须通过已接受 Offer 的确认入职操作完成，请前往 Offer 管理处理",
            "code": "offer_onboard_action_required",
        }), 409

    body_demand_id = data.get("demand_id")
    if _path_id_mismatch(demand_id, body_demand_id):
        return jsonify({"error": "路径 demand_id 与请求体不一致", "code": "demand_id_mismatch"}), 409
    try:
        demand = _resolve_demand(
            demand_id=demand_id if demand_id is not None else body_demand_id,
            job_id=data.get("job_id"),
        )
        if not _manage_allowed(demand):
            return jsonify({"error": "Forbidden"}), 403
        if visible_candidate_query(g.user_id, g.role).filter(
            Candidate.id == candidate_id
        ).first() is None:
            return jsonify({"error": "Forbidden"}), 403
        result = move_candidate(
            candidate_id=candidate_id,
            demand_id=demand.id,
            org_id=g.org_id,
            actor_id=g.user_id,
            stage=to_stage,
            note=data.get("note"),
            disposition_data=data.get("disposition"),
        )
    except (DemandContextError, PipelineServiceError) as error:
        return _error_response(error)

    return jsonify(result)


@bp.post("/pipeline/transfer")
@bp.post("/pipeline/demands/<int:from_demand_id>/transfer")
@require_auth
def transfer_candidate(from_demand_id=None):
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    reason = str(data.get("reason") or "").strip()
    if not candidate_id:
        return jsonify({"error": "candidate_id required"}), 400

    body_from_demand_id = data.get("from_demand_id")
    if _path_id_mismatch(from_demand_id, body_from_demand_id):
        return jsonify({"error": "路径 demand_id 与转出需求不一致", "code": "demand_id_mismatch"}), 409

    try:
        source = _resolve_demand(
            demand_id=from_demand_id if from_demand_id is not None else body_from_demand_id,
            job_id=data.get("from_job_id"),
        )
        target = _resolve_demand(
            demand_id=data.get("to_demand_id"),
            job_id=data.get("to_job_id"),
        )
        if not _manage_allowed(source) or not _manage_allowed(target):
            return jsonify({"error": "Forbidden"}), 403
        result = transfer_candidate_service(
            candidate_id=candidate_id,
            from_demand_id=source.id,
            to_demand_id=target.id,
            org_id=g.org_id,
            actor_id=g.user_id,
            reason=reason,
        )
    except (DemandContextError, PipelineServiceError) as error:
        return _error_response(error)

    return jsonify(result)


@bp.get("/pipeline/<int:job_id>")
@bp.get("/pipeline/demands/<int:demand_id>")
@require_auth
def get_pipeline(job_id=None, demand_id=None):
    try:
        demand = _route_demand(route_demand_id=demand_id, legacy_job_id=job_id)
    except DemandContextError as error:
        return _error_response(error)
    allowed, candidate_ids = _read_scope(demand)
    if not allowed:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(pipeline_counts(demand, candidate_ids=candidate_ids))


@bp.get("/pipeline/<int:job_id>/board")
@bp.get("/pipeline/demands/<int:demand_id>/board")
@require_auth
def get_board(job_id=None, demand_id=None):
    try:
        demand = _route_demand(route_demand_id=demand_id, legacy_job_id=job_id)
    except DemandContextError as error:
        return _error_response(error)
    allowed, candidate_ids = _read_scope(demand)
    if not allowed:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(pipeline_board(demand, candidate_ids=candidate_ids))


@bp.get("/pipeline/<int:job_id>/history/<int:candidate_id>")
@bp.get("/pipeline/demands/<int:demand_id>/history/<int:candidate_id>")
@require_auth
def get_history(candidate_id, job_id=None, demand_id=None):
    try:
        demand = _route_demand(route_demand_id=demand_id, legacy_job_id=job_id)
    except DemandContextError as error:
        return _error_response(error)
    allowed, candidate_ids = _read_scope(demand)
    if not allowed or (candidate_ids is not None and candidate_id not in candidate_ids):
        return jsonify({"error": "Forbidden"}), 403
    candidate = Candidate.query.filter_by(
        id=candidate_id,
        org_id=g.org_id,
        deleted_at=None,
    ).first()
    if candidate is None:
        return jsonify({"error": "候选人不存在", "code": "candidate_not_found"}), 404
    return jsonify(pipeline_history(demand, candidate_id))


@bp.get("/pipeline/<int:job_id>/offer/<int:candidate_id>")
@bp.get("/pipeline/demands/<int:demand_id>/offer/<int:candidate_id>")
@require_auth
def get_offer(candidate_id, job_id=None, demand_id=None):
    try:
        demand = _route_demand(route_demand_id=demand_id, legacy_job_id=job_id)
    except DemandContextError as error:
        return _error_response(error)
    allowed, candidate_ids = _read_scope(demand)
    if not allowed or (candidate_ids is not None and candidate_id not in candidate_ids):
        return jsonify({"error": "Forbidden"}), 403
    candidate = Candidate.query.filter_by(
        id=candidate_id,
        org_id=g.org_id,
        deleted_at=None,
    ).first()
    if candidate is None:
        return jsonify({"error": "候选人不存在", "code": "candidate_not_found"}), 404
    return jsonify(get_offer_record(demand, candidate_id))


@bp.get("/offers")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_offers():
    statuses = [item for item in request.args.get("status", "").split(",") if item]
    return jsonify(
        list_offer_records(
            org_id=g.org_id,
            user_id=g.user_id,
            role=g.role,
            search=request.args.get("search"),
            statuses=statuses,
        )
    )


@bp.get("/offers/workbench")
@require_auth
@require_role("recruiter", "manager", "admin")
def offer_workbench():
    return jsonify(
        list_offer_workbench(
            org_id=g.org_id,
            user_id=g.user_id,
            role=g.role,
            search=request.args.get("search"),
        )
    )


@bp.get("/offers/<int:offer_id>")
@require_auth
def get_offer_detail(offer_id):
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    try:
        offer, demand = get_offer_by_id(offer_id=offer_id, org_id=g.org_id)
    except PipelineServiceError as error:
        return _error_response(error)
    if not can_read_demand(g.user_id, g.role, g.org_id, demand):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(offer_payload(offer, demand=demand, candidate_id=offer.candidate_id))


@bp.post("/offers/<int:offer_id>/actions")
@require_auth
def run_offer_action(offer_id):
    if g.role == "interviewer":
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    action = str(data.get("action") or "").strip().lower()
    if action in {"approve", "reject"} and g.role not in {"manager", "admin"}:
        return jsonify({
            "error": "Offer 需要招聘经理或管理员确认",
            "code": "offer_approval_forbidden",
        }), 403
    if action not in {"approve", "reject"} and g.role not in {"recruiter", "admin"}:
        return jsonify({
            "error": "该步骤需要招聘专员处理",
            "code": "offer_operation_forbidden",
        }), 403
    try:
        _, demand = get_offer_by_id(offer_id=offer_id, org_id=g.org_id)
        if not _manage_allowed(demand):
            return jsonify({"error": "Forbidden"}), 403
        payload = transition_offer(
            offer_id=offer_id,
            org_id=g.org_id,
            actor_id=g.user_id,
            action=action,
            data=data,
        )
    except PipelineServiceError as error:
        return _error_response(error)
    return jsonify(payload)


@bp.put("/pipeline/<int:job_id>/offer/<int:candidate_id>")
@bp.put("/pipeline/demands/<int:demand_id>/offer/<int:candidate_id>")
@require_auth
def save_offer(candidate_id, job_id=None, demand_id=None):
    if g.role not in {"recruiter", "admin"}:
        return jsonify({
            "error": "Offer 方案需要招聘专员维护",
            "code": "offer_edit_forbidden",
        }), 403
    try:
        demand = _route_demand(route_demand_id=demand_id, legacy_job_id=job_id)
        if not _manage_allowed(demand):
            return jsonify({"error": "Forbidden"}), 403
        payload = save_offer_record(
            demand_id=demand.id,
            candidate_id=candidate_id,
            org_id=g.org_id,
            actor_id=g.user_id,
            data=request.get_json() or {},
        )
    except (DemandContextError, PipelineServiceError) as error:
        return _error_response(error)
    return jsonify(payload)


@bp.put("/pipeline/demands/<int:demand_id>/offer/<int:candidate_id>/oa-registration")
@require_auth
@require_role("recruiter", "manager", "admin")
def save_offer_oa_registration(demand_id, candidate_id):
    try:
        demand = _route_demand(route_demand_id=demand_id)
        if not _manage_allowed(demand):
            return jsonify({"error": "Forbidden"}), 403
        payload = register_oa_result(
            demand_id=demand.id,
            candidate_id=candidate_id,
            org_id=g.org_id,
            actor_id=g.user_id,
            data=request.get_json() or {},
        )
    except (DemandContextError, PipelineServiceError) as error:
        return _error_response(error)
    return jsonify(payload)
