from datetime import date, datetime

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, select

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import Job, PipelineStage, RecruitmentDemand, User
from .access import can_manage_job, job_is_active, same_org
from .jobs import _extract_jd_structured
from .pipeline import _latest_stage_subquery

bp = Blueprint("demands", __name__)

PRIORITIES = {"A", "B", "C"}
OPEN_DEMAND_STATUSES = {"pending", "active", "paused"}
COMMAND_ONLY_FIELDS = {
    "status",
    "owner_hr_id",
    "priority",
    "close_reason",
    "downgrade_reason",
}
INTERVIEW_PROGRESS_STAGES = {
    "interview",
    "interview_first",
    "interview_second",
    "interview_final",
    "offer",
    "onboarded",
}
OFFER_STAGES = {"offer", "onboarded"}


def _clean(value, limit):
    return str(value or "").strip()[:limit]


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _clean_priority(value, default="B"):
    priority = str(value or default).strip().upper()[:1]
    return priority if priority in PRIORITIES else default


def _clean_headcount(value):
    try:
        return max(1, int(value or 1))
    except (TypeError, ValueError):
        return 1


def _can_manage_demand(demand):
    if not same_org(demand, g.org_id):
        return False
    if g.role in ("manager", "admin"):
        return True
    if demand.owner_hr_id == g.user_id:
        return True
    return demand.job is not None and can_manage_job(g.user_id, g.role, demand.job)


def _demand_query_for_current_user():
    query = RecruitmentDemand.query.filter(RecruitmentDemand.org_id == g.org_id).join(Job)
    if g.role == "recruiter":
        query = query.filter(
            db.or_(
                RecruitmentDemand.owner_hr_id == g.user_id,
                Job.owner_hr_id == g.user_id,
                Job.owner_hr_id.is_(None),
            )
        )
    return query


def _open_demand_statement(org_id, job_id, exclude_demand_id=None):
    statement = select(RecruitmentDemand).where(
        RecruitmentDemand.org_id == org_id,
        RecruitmentDemand.job_id == job_id,
        RecruitmentDemand.status.in_(OPEN_DEMAND_STATUSES),
    )
    if exclude_demand_id is not None:
        statement = statement.where(RecruitmentDemand.id != exclude_demand_id)
    return statement.order_by(RecruitmentDemand.id.asc()).limit(1).with_for_update()


def _open_demand_for_job(job_id, exclude_demand_id=None):
    statement = _open_demand_statement(
        org_id=g.org_id,
        job_id=job_id,
        exclude_demand_id=exclude_demand_id,
    )
    return db.session.execute(statement).scalar_one_or_none()


def _locked_job(job_id):
    return db.session.execute(
        select(Job).where(Job.id == job_id).with_for_update()
    ).scalar_one_or_none()


def _open_demand_conflict_response(job_id, exclude_demand_id=None):
    existing = _open_demand_for_job(job_id, exclude_demand_id=exclude_demand_id)
    if existing is None:
        return None
    return jsonify({
        "error": "该岗位画像已有未结束需求，请进入已有需求或另建岗位画像",
        "existing_demand_id": existing.id,
    }), 409


def _distinct_stage_count(job_id, stages):
    return (
        db.session.query(func.count(func.distinct(PipelineStage.candidate_id)))
        .filter(PipelineStage.org_id == g.org_id)
        .filter(PipelineStage.job_id == job_id)
        .filter(PipelineStage.stage.in_(stages))
        .scalar()
        or 0
    )


def _demand_metrics(job_id):
    recommended_count = (
        db.session.query(func.count(func.distinct(PipelineStage.candidate_id)))
        .filter(PipelineStage.org_id == g.org_id)
        .filter(PipelineStage.job_id == job_id)
        .scalar()
        or 0
    )
    latest = _latest_stage_subquery(job_id)
    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .group_by(PipelineStage.stage)
        .all()
    )
    current_counts = {}
    for stage, count in rows:
        normalized = "interview" if stage in INTERVIEW_PROGRESS_STAGES and stage not in OFFER_STAGES else stage
        current_counts[normalized] = current_counts.get(normalized, 0) + count
    interview_count = _distinct_stage_count(job_id, INTERVIEW_PROGRESS_STAGES)
    offer_count = _distinct_stage_count(job_id, OFFER_STAGES)
    onboarded_count = _distinct_stage_count(job_id, {"onboarded"})
    return {
        "recommended_count": recommended_count,
        "business_review_count": current_counts.get("business_review", 0),
        "interview_count": interview_count,
        "offer_count": offer_count,
        "onboarded_count": onboarded_count,
        "current_stage_counts": current_counts,
    }


def _risk_flags(demand, metrics):
    flags = []
    today = date.today()
    if demand.target_date and demand.target_date < today and demand.status in ("pending", "active"):
        flags.append("overdue")
    if metrics["business_review_count"] > 0:
        flags.append("business_feedback_pending")
    if metrics["recommended_count"] >= 20 and metrics["interview_count"] == 0:
        flags.append("low_interview_conversion")
    if demand.requested_at and demand.status in ("pending", "active"):
        age_days = (today - demand.requested_at).days
        if age_days >= 60:
            flags.append("open_too_long")
    if metrics["recommended_count"] == 0 and demand.status in ("pending", "active"):
        start_date = demand.accepted_at or demand.requested_at
        if start_date and (today - start_date).days >= 7:
            flags.append("hr_no_recommendation")
    return flags


def _demand_payload(demand):
    job = demand.job
    owner = (
        User.query
        .filter(User.id == demand.owner_hr_id, User.org_id == demand.org_id)
        .first()
        if demand.owner_hr_id
        else None
    )
    metrics = _demand_metrics(demand.job_id)
    return {
        "id": demand.id,
        "job_id": demand.job_id,
        "job_title": job.title if job else "",
        "job_city": job.city if job else "",
        "job_department": job.department if job else "",
        "job_code": job.job_code if job else "",
        "owner_hr_id": demand.owner_hr_id,
        "owner_hr_name": owner.name if owner else "",
        "request_no": demand.request_no or "",
        "requester_name": demand.requester_name or "",
        "requester_department": demand.requester_department or "",
        "hiring_manager_name": demand.hiring_manager_name or "",
        "requested_at": demand.requested_at.isoformat() if demand.requested_at else None,
        "accepted_at": demand.accepted_at.isoformat() if demand.accepted_at else None,
        "target_date": demand.target_date.isoformat() if demand.target_date else None,
        "priority": demand.priority or "B",
        "headcount": demand.headcount or 1,
        "status": demand.status or "active",
        "close_reason": demand.close_reason or "",
        "downgrade_reason": demand.downgrade_reason or "",
        "note": demand.note or "",
        "metrics": metrics,
        "risk_flags": _risk_flags(demand, metrics),
        "created_at": demand.created_at.isoformat() if demand.created_at else None,
        "updated_at": demand.updated_at.isoformat() if demand.updated_at else None,
    }


def _apply_demand_fields(demand, data):
    if "request_no" in data:
        demand.request_no = _clean(data.get("request_no"), 80)
    if "requester_name" in data:
        demand.requester_name = _clean(data.get("requester_name"), 120)
    if "requester_department" in data:
        demand.requester_department = _clean(data.get("requester_department"), 120)
    if "hiring_manager_name" in data:
        demand.hiring_manager_name = _clean(data.get("hiring_manager_name"), 120)
    if "requested_at" in data:
        demand.requested_at = _parse_date(data.get("requested_at"))
    if "accepted_at" in data:
        demand.accepted_at = _parse_date(data.get("accepted_at"))
    if "target_date" in data:
        demand.target_date = _parse_date(data.get("target_date"))
    if "headcount" in data:
        demand.headcount = _clean_headcount(data.get("headcount"))
    if "note" in data:
        demand.note = _clean(data.get("note"), 2000)


def _create_job_profile_from_demand(data):
    title = _clean(data.get("job_title") or data.get("title"), 200)
    jd_text = str(data.get("jd_text") or data.get("job_description") or "").strip()
    if not title or not jd_text:
        return None, jsonify({"error": "job_title and jd_text required when job_id is omitted"}), 400

    job = Job(
        org_id=g.org_id,
        title=title,
        city=_clean(data.get("job_city") or data.get("city"), 80),
        department=_clean(
            data.get("job_department") or data.get("department") or data.get("requester_department"),
            120,
        ),
        job_code=_clean(data.get("job_code") or data.get("request_no"), 80),
        jd_text=jd_text,
        jd_structured=_extract_jd_structured(None, jd_text),
        owner_hr_id=g.user_id,
        status="active",
    )
    db.session.add(job)
    db.session.flush()
    return job, None, None


@bp.get("/demands")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_demands():
    status = request.args.get("status")
    q = _demand_query_for_current_user()
    if status:
        q = q.filter(RecruitmentDemand.status == status)
    demands = q.order_by(RecruitmentDemand.updated_at.desc(), RecruitmentDemand.id.desc()).all()
    return jsonify([_demand_payload(item) for item in demands])


@bp.post("/demands")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_demand():
    data = request.get_json() or {}
    job_id = data.get("job_id")
    requested_status = str(data.get("status") or "active").strip()
    if requested_status not in OPEN_DEMAND_STATUSES:
        return jsonify({"error": "新建需求的 status 必须是 pending、active 或 paused"}), 400
    created_job_profile = False
    if job_id:
        job = _locked_job(job_id)
        if job is None:
            return jsonify({"error": "岗位不存在"}), 404
        if not same_org(job, g.org_id):
            return jsonify({"error": "岗位不存在"}), 404
        if not can_manage_job(g.user_id, g.role, job):
            return jsonify({"error": "Forbidden"}), 403
        conflict = _open_demand_conflict_response(job.id)
        if conflict is not None:
            return conflict
        if not job_is_active(job):
            return jsonify({"error": "岗位已关闭，请先恢复在招后再创建需求"}), 400
    else:
        job, error_response, status_code = _create_job_profile_from_demand(data)
        if error_response is not None:
            return error_response, status_code
        created_job_profile = True

    demand = RecruitmentDemand(
        org_id=g.org_id,
        job_id=job.id,
        owner_hr_id=g.user_id,
        priority=_clean_priority(data.get("priority")),
        headcount=_clean_headcount(data.get("headcount")),
        status=requested_status,
    )
    _apply_demand_fields(demand, data)
    db.session.add(demand)
    db.session.commit()
    if created_job_profile:
        record_event("job.created", entity_id=job.id, entity_type="job", payload={"source": "demand"})
    record_event("demand.created", entity_id=demand.id, entity_type="demand", payload={"job_id": job.id})
    return jsonify(_demand_payload(demand)), 201


@bp.get("/demands/<int:demand_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def get_demand(demand_id):
    demand = db.get_or_404(RecruitmentDemand, demand_id)
    if not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    if not _can_manage_demand(demand):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_demand_payload(demand))


@bp.patch("/demands/<int:demand_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_demand(demand_id):
    demand = db.get_or_404(RecruitmentDemand, demand_id)
    if not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    if not _can_manage_demand(demand):
        return jsonify({"error": "无权编辑该需求"}), 403
    data = request.get_json() or {}
    forbidden = sorted(COMMAND_ONLY_FIELDS.intersection(data))
    if forbidden:
        return jsonify({
            "error": "状态、负责人、优先级及动作原因必须通过专用操作修改",
            "fields": forbidden,
        }), 400
    _apply_demand_fields(demand, data)
    db.session.commit()
    record_event("demand.updated", entity_id=demand.id, entity_type="demand")
    return jsonify(_demand_payload(demand))


@bp.post("/demands/<int:demand_id>/close")
@require_auth
@require_role("recruiter", "manager", "admin")
def close_demand(demand_id):
    demand = db.get_or_404(RecruitmentDemand, demand_id)
    if not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    if not _can_manage_demand(demand):
        return jsonify({"error": "无权关闭该需求"}), 403
    data = request.get_json() or {}
    status = str(data.get("status") or "cancelled").strip()
    if status not in {"filled", "cancelled", "paused"}:
        return jsonify({"error": "status must be filled, cancelled or paused"}), 400
    close_reason = _clean(data.get("close_reason"), 1000)
    if not close_reason:
        return jsonify({"error": "关闭或暂停原因必填"}), 400
    demand.status = status
    demand.close_reason = close_reason
    if status in {"filled", "cancelled"} and demand.job:
        if _open_demand_for_job(demand.job_id, exclude_demand_id=demand.id) is None:
            demand.job.status = "closed"
    record_event(
        "demand.closed",
        entity_id=demand.id,
        entity_type="demand",
        payload={"status": status, "reason": close_reason, "job_id": demand.job_id},
    )
    return jsonify(_demand_payload(demand))


@bp.post("/demands/<int:demand_id>/restore")
@require_auth
@require_role("recruiter", "manager", "admin")
def restore_demand(demand_id):
    demand = db.get_or_404(RecruitmentDemand, demand_id)
    if not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    if not _can_manage_demand(demand):
        return jsonify({"error": "无权恢复该需求"}), 403
    data = request.get_json() or {}
    restore_note = _clean(data.get("note"), 1000)
    if not restore_note:
        return jsonify({"error": "恢复原因必填"}), 400
    if demand.job:
        _locked_job(demand.job_id)
    conflict = _open_demand_conflict_response(demand.job_id, exclude_demand_id=demand.id)
    if conflict is not None:
        return conflict
    demand.status = "active"
    demand.close_reason = ""
    demand.note = _clean(
        f"{demand.note or ''}\n恢复说明：{restore_note}".strip(),
        2000,
    )
    if demand.job:
        demand.job.status = "active"
    record_event(
        "demand.restored",
        entity_id=demand.id,
        entity_type="demand",
        payload={"reason": restore_note, "job_id": demand.job_id},
    )
    return jsonify(_demand_payload(demand))


@bp.post("/demands/<int:demand_id>/downgrade")
@require_auth
@require_role("recruiter", "manager", "admin")
def downgrade_demand(demand_id):
    demand = db.get_or_404(RecruitmentDemand, demand_id)
    if not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    if not _can_manage_demand(demand):
        return jsonify({"error": "无权降级该需求"}), 403
    data = request.get_json() or {}
    raw_priority = str(data.get("priority") or "").strip().upper()
    if raw_priority not in PRIORITIES:
        return jsonify({"error": "priority must be A, B or C"}), 400
    downgrade_reason = _clean(data.get("downgrade_reason"), 1000)
    if not downgrade_reason:
        return jsonify({"error": "优先级调整原因必填"}), 400
    demand.priority = raw_priority
    demand.downgrade_reason = downgrade_reason
    record_event(
        "demand.downgraded",
        entity_id=demand.id,
        entity_type="demand",
        payload={"priority": demand.priority, "reason": downgrade_reason, "job_id": demand.job_id},
    )
    return jsonify(_demand_payload(demand))


@bp.patch("/demands/<int:demand_id>/owner")
@require_auth
@require_role("manager", "admin")
def reassign_demand_owner(demand_id):
    data = request.get_json(silent=True) or {}
    new_owner_id = data.get("owner_hr_id")
    reason = _clean(data.get("reason"), 240)
    if not new_owner_id:
        return jsonify({"error": "owner_hr_id required"}), 400
    if not reason:
        return jsonify({"error": "转派原因必填"}), 400

    demand = db.session.get(RecruitmentDemand, demand_id, with_for_update=True)
    if demand is None or not same_org(demand, g.org_id):
        return jsonify({"error": "需求不存在"}), 404
    job = _locked_job(demand.job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "关联岗位不存在"}), 404

    conflict = _open_demand_conflict_response(demand.job_id, exclude_demand_id=demand.id)
    if conflict is not None:
        return conflict

    target = db.session.get(User, new_owner_id)
    if target is None or not same_org(target, g.org_id):
        return jsonify({"error": "目标用户不存在"}), 404
    if target.role != "recruiter" or not target.is_active:
        return jsonify({"error": "需求负责人必须是启用中的招聘专员"}), 400

    old_owner_id = demand.owner_hr_id
    demand.owner_hr_id = target.id
    job.owner_hr_id = target.id
    record_event(
        "demand.owner_reassigned",
        entity_id=demand.id,
        entity_type="demand",
        payload={
            "from": old_owner_id,
            "to": target.id,
            "job_id": job.id,
            "reason": reason,
        },
    )
    return jsonify(_demand_payload(demand))
