from flask import Blueprint, g, jsonify, request

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import Candidate, CandidateDemandFlow, Job, RecruitmentDemand
from ..services.demand_context_service import (
    can_manage_demand,
    can_read_demand,
    validate_recruiter_owner,
    visible_demand_query,
)
from ..services.demand_service import (
    ALL_STATUSES,
    DemandValidationError,
    apply_list_filters,
    clean_text,
    create_demand_from_input,
    demand_payload,
    paginate_demands,
    parse_date,
)
from ..time_utils import utc_now
from .access import job_is_active, same_org


bp = Blueprint("demands", __name__)

COMMAND_ONLY_FIELDS = {
    "status",
    "owner_hr_id",
    "priority",
    "close_reason",
    "closed_at",
    "closed_by",
    "downgrade_reason",
}


def _validation_response(fields, message="请检查招聘需求信息"):
    return jsonify(
        {
            "error": message,
            "code": "validation_error",
            "fields": fields,
        }
    ), 400


def _authorized_demand(demand_id, *, manage=False, lock=False):
    if lock:
        demand = db.session.get(RecruitmentDemand, demand_id, with_for_update=True)
    else:
        demand = db.session.get(RecruitmentDemand, demand_id)
    if demand is None or not same_org(demand, g.org_id):
        return None, (jsonify({"error": "需求不存在", "code": "demand_not_found"}), 404)
    allowed = (
        can_manage_demand(g.user_id, g.role, g.org_id, demand)
        if manage
        else can_read_demand(g.user_id, g.role, g.org_id, demand)
    )
    if not allowed:
        return None, (jsonify({"error": "Forbidden", "code": "forbidden"}), 403)
    return demand, None


def _job_for_create(data):
    job_id = data.get("job_id")
    if job_id in (None, ""):
        return None, None
    try:
        normalized_job_id = int(job_id)
    except (TypeError, ValueError):
        return None, _validation_response({"job_id": "请选择有效职位模板"})
    job = db.session.get(Job, normalized_job_id)
    if job is None or not same_org(job, g.org_id):
        return None, (jsonify({"error": "职位模板不存在", "code": "job_not_found"}), 404)
    if not job_is_active(job):
        return None, _validation_response({"job_id": "职位模板已关闭，请先恢复或选择其他模板"})
    return job, None


@bp.get("/demands")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_demands():
    query = visible_demand_query(g.user_id, g.role, g.org_id)
    query = apply_list_filters(query, request.args)
    return jsonify(paginate_demands(query, request.args))


@bp.post("/demands")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_demand():
    data = request.get_json(silent=True) or {}
    job, error = _job_for_create(data)
    if error is not None:
        return error
    try:
        demand, created_job = create_demand_from_input(
            data,
            org_id=g.org_id,
            actor_id=g.user_id,
            actor_role=g.role,
            job=job,
        )
    except DemandValidationError as exc:
        db.session.rollback()
        return jsonify(exc.as_payload()), 400

    try:
        if created_job:
            record_event(
                "job.created",
                entity_id=demand.job_id,
                entity_type="job",
                payload={"source": "demand", "demand_id": demand.id},
                demand_id=demand.id,
                commit=False,
            )
        record_event(
            "demand.created",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload={"job_id": demand.job_id, "owner_hr_id": demand.owner_hr_id},
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True)), 201


@bp.get("/demands/<int:demand_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def get_demand(demand_id):
    demand, error = _authorized_demand(demand_id)
    if error is not None:
        return error
    return jsonify(demand_payload(demand, include_jd=True))


def _apply_editable_fields(demand, data):
    fields = {}
    if "request_no" in data:
        request_no = clean_text(data.get("request_no"), 80)
        if not request_no:
            fields["request_no"] = "需求编号不能为空"
        else:
            duplicate = RecruitmentDemand.query.filter(
                RecruitmentDemand.org_id == g.org_id,
                RecruitmentDemand.request_no == request_no,
                RecruitmentDemand.id != demand.id,
            ).first()
            if duplicate:
                fields["request_no"] = "需求编号已存在"
            else:
                demand.request_no = request_no
    if "requester_name" in data:
        demand.requester_name = clean_text(data.get("requester_name"), 120)
    if "requester_department" in data or "department" in data:
        department = clean_text(
            data.get("requester_department") or data.get("department"), 120
        )
        if not department:
            fields["requester_department"] = "用人部门必填"
        else:
            demand.requester_department = department
            demand.department = department
    if "city" in data or "job_city" in data:
        city = clean_text(data.get("city") or data.get("job_city"), 80)
        if not city:
            fields["city"] = "招聘城市必填"
        else:
            demand.city = city
    if "hiring_manager_name" in data:
        manager = clean_text(data.get("hiring_manager_name"), 120)
        if not manager:
            fields["hiring_manager_name"] = "用人负责人必填"
        else:
            demand.hiring_manager_name = manager
    if "requested_at" in data:
        value = parse_date(data.get("requested_at"))
        if value is None:
            fields["requested_at"] = "提需求日期无效"
        else:
            demand.requested_at = value
    if "accepted_at" in data:
        demand.accepted_at = parse_date(data.get("accepted_at"))
    if "target_date" in data:
        value = parse_date(data.get("target_date"))
        if value is None:
            fields["target_date"] = "期望完成日期无效"
        elif demand.requested_at and value < demand.requested_at:
            fields["target_date"] = "期望完成日期不能早于提需求日期"
        else:
            demand.target_date = value
    if "headcount" in data:
        try:
            value = int(data.get("headcount"))
        except (TypeError, ValueError):
            value = 0
        if value <= 0:
            fields["headcount"] = "HC 必须是大于 0 的整数"
        else:
            demand.headcount = value
    if "note" in data:
        demand.note = clean_text(data.get("note"), 2000)
    return fields


@bp.patch("/demands/<int:demand_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_demand(demand_id):
    demand, error = _authorized_demand(demand_id, manage=True)
    if error is not None:
        return error
    data = request.get_json(silent=True) or {}
    forbidden = sorted(COMMAND_ONLY_FIELDS.intersection(data))
    if forbidden:
        return _validation_response(
            {field: "请使用对应的专用操作" for field in forbidden},
            "状态、负责人、优先级及动作原因不能通过通用编辑修改",
        )
    fields = _apply_editable_fields(demand, data)
    if fields:
        db.session.rollback()
        return _validation_response(fields)
    try:
        record_event(
            "demand.updated",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True))


@bp.post("/demands/<int:demand_id>/close")
@require_auth
@require_role("recruiter", "manager", "admin")
def close_demand(demand_id):
    demand, error = _authorized_demand(demand_id, manage=True, lock=True)
    if error is not None:
        return error
    data = request.get_json(silent=True) or {}
    status = clean_text(data.get("status") or "cancelled", 20)
    if status not in {"filled", "cancelled", "paused", "closed"}:
        return _validation_response(
            {"status": "状态必须是完成、取消、暂停或提前关闭"}
        )
    reason = clean_text(data.get("close_reason"), 1000)
    if not reason:
        return _validation_response({"close_reason": "暂停、取消或关闭原因必填"})
    demand.status = status
    demand.close_reason = reason
    if status == "paused":
        demand.closed_at = None
        demand.closed_by = None
    else:
        demand.closed_at = utc_now()
        demand.closed_by = g.user_id
    try:
        record_event(
            "demand.closed",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload={"status": status, "reason": reason, "job_id": demand.job_id},
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True))


@bp.post("/demands/<int:demand_id>/restore")
@require_auth
@require_role("recruiter", "manager", "admin")
def restore_demand(demand_id):
    demand, error = _authorized_demand(demand_id, manage=True, lock=True)
    if error is not None:
        return error
    note = clean_text((request.get_json(silent=True) or {}).get("note"), 1000)
    if not note:
        return _validation_response({"note": "恢复原因必填"})
    if demand.status not in {"paused", "filled", "cancelled", "closed"}:
        return jsonify({"error": "当前需求不需要恢复", "code": "demand_not_closed"}), 409
    demand.status = "active"
    demand.close_reason = ""
    demand.closed_at = None
    demand.closed_by = None
    demand.note = clean_text(f"{demand.note or ''}\n恢复说明：{note}".strip(), 2000)
    try:
        record_event(
            "demand.restored",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload={"reason": note, "job_id": demand.job_id},
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True))


@bp.post("/demands/<int:demand_id>/downgrade")
@require_auth
@require_role("recruiter", "manager", "admin")
def downgrade_demand(demand_id):
    demand, error = _authorized_demand(demand_id, manage=True)
    if error is not None:
        return error
    data = request.get_json(silent=True) or {}
    priority = clean_text(data.get("priority"), 1).upper()
    reason = clean_text(data.get("downgrade_reason"), 1000)
    fields = {}
    if priority not in {"A", "B", "C"}:
        fields["priority"] = "优先级必须是 A、B 或 C"
    if not reason:
        fields["downgrade_reason"] = "优先级调整原因必填"
    if fields:
        return _validation_response(fields)
    demand.priority = priority
    demand.downgrade_reason = reason
    try:
        record_event(
            "demand.downgraded",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload={"priority": priority, "reason": reason},
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True))


@bp.patch("/demands/<int:demand_id>/owner")
@require_auth
@require_role("manager", "admin")
def reassign_demand_owner(demand_id):
    demand, error = _authorized_demand(demand_id, manage=True, lock=True)
    if error is not None:
        return error
    data = request.get_json(silent=True) or {}
    target = validate_recruiter_owner(data.get("owner_hr_id"), g.org_id)
    reason = clean_text(data.get("reason"), 240)
    fields = {}
    if target is None:
        fields["owner_hr_id"] = "请选择当前组织内启用的招聘专员"
    if not reason:
        fields["reason"] = "转派原因必填"
    if fields:
        return _validation_response(fields)
    if target.id == demand.owner_hr_id:
        return jsonify({"error": "目标负责人没有变化", "code": "owner_unchanged"}), 409

    pointed_candidates = (
        Candidate.query.filter_by(
            org_id=g.org_id,
            current_demand_id=demand.id,
        )
        .order_by(Candidate.id)
        .with_for_update()
        .all()
    )
    active_flows = (
        CandidateDemandFlow.query.filter_by(
            org_id=g.org_id,
            demand_id=demand.id,
            status="active",
        )
        .order_by(CandidateDemandFlow.candidate_id)
        .with_for_update()
        .all()
    )
    pointed_by_id = {candidate.id: candidate for candidate in pointed_candidates}
    flow_candidate_ids = [flow.candidate_id for flow in active_flows]
    if (
        len(flow_candidate_ids) != len(set(flow_candidate_ids))
        or set(flow_candidate_ids) != set(pointed_by_id)
    ):
        conflict_ids = sorted(set(flow_candidate_ids) ^ set(pointed_by_id))
        db.session.rollback()
        return jsonify({
            "error": "候选人当前需求归属不一致，请先修复数据后再转派",
            "code": "demand_owner_projection_conflict",
            "candidate_id": conflict_ids[0] if conflict_ids else None,
        }), 409

    all_active_flows = (
        CandidateDemandFlow.query.filter(
            CandidateDemandFlow.org_id == g.org_id,
            CandidateDemandFlow.candidate_id.in_(flow_candidate_ids),
            CandidateDemandFlow.status == "active",
        )
        .order_by(CandidateDemandFlow.candidate_id, CandidateDemandFlow.id)
        .with_for_update()
        .all()
        if flow_candidate_ids
        else []
    )
    active_counts = {}
    for flow in all_active_flows:
        active_counts[flow.candidate_id] = active_counts.get(flow.candidate_id, 0) + 1
    if any(active_counts.get(candidate_id) != 1 for candidate_id in flow_candidate_ids):
        conflict_id = next(
            candidate_id
            for candidate_id in flow_candidate_ids
            if active_counts.get(candidate_id) != 1
        )
        db.session.rollback()
        return jsonify({
            "error": "候选人当前需求归属不一致，请先修复数据后再转派",
            "code": "demand_owner_projection_conflict",
            "candidate_id": conflict_id,
        }), 409

    locked_candidates = []
    for flow in active_flows:
        candidate = pointed_by_id[flow.candidate_id]
        if (
            candidate.deleted_at is not None
            or candidate.org_id != g.org_id
            or candidate.current_demand_id != demand.id
        ):
            db.session.rollback()
            return jsonify({
                "error": "候选人当前需求归属不一致，请先修复数据后再转派",
                "code": "demand_owner_projection_conflict",
                "candidate_id": flow.candidate_id,
            }), 409
        locked_candidates.append((flow, candidate))

    old_owner_id = demand.owner_hr_id
    demand.owner_hr_id = target.id
    candidate_ids = []
    for flow, candidate in locked_candidates:
        flow.owner_hr_id = target.id
        candidate.owner_hr_id = target.id
        candidate_ids.append(candidate.id)
    try:
        record_event(
            "demand.owner_reassigned",
            entity_id=demand.id,
            entity_type="demand",
            demand_id=demand.id,
            payload={
                "from": old_owner_id,
                "to": target.id,
                "reason": reason,
                "active_candidate_ids": candidate_ids,
            },
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(demand_payload(demand, include_jd=True))
