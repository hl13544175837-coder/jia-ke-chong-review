"""Demand-owned operational BI endpoints."""

import re

from flask import Blueprint, g, jsonify, request

from .. import db
from ..middleware.auth import require_auth, require_role
from ..models import Job, RecruitmentDemand, User
from ..services.bi_service import (
    build_demand_operational_metrics,
    build_monthly_staff_performance,
    build_staff_operational_workload,
    build_team_operational_overview,
)
from ..services.demand_context_service import (
    DemandContextError,
    can_read_demand,
    resolve_demand_context,
)
from .access import same_org


bp = Blueprint("bi", __name__)


@bp.get("/bi/overview")
@require_auth
@require_role("manager", "admin")
def overview():
    return jsonify(build_team_operational_overview(g.org_id))


@bp.get("/bi/staff/<int:hr_id>")
@require_auth
def staff_detail(hr_id):
    if g.role == "recruiter" and g.user_id != hr_id:
        return jsonify({"error": "Forbidden"}), 403
    if g.role not in {"recruiter", "manager", "admin"}:
        return jsonify({"error": "Forbidden"}), 403

    user = User.query.filter_by(id=hr_id, org_id=g.org_id).first()
    if user is None:
        return jsonify({"error": "用户不存在"}), 404
    return jsonify(build_staff_operational_workload(g.org_id, hr_id))


@bp.get("/bi/staff/<int:hr_id>/monthly")
@require_auth
def staff_monthly_performance(hr_id):
    if g.role == "recruiter" and g.user_id != hr_id:
        return jsonify({"error": "Forbidden"}), 403
    if g.role not in {"recruiter", "manager", "admin"}:
        return jsonify({"error": "Forbidden"}), 403

    month = (request.args.get("month") or "").strip()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        return jsonify({"error": "月份格式不正确，请使用 YYYY-MM"}), 400
    payload = build_monthly_staff_performance(g.org_id, hr_id, month)
    if payload is None:
        return jsonify({"error": "招聘专员不存在"}), 404
    return jsonify(payload)


@bp.get("/bi/job/<int:job_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def job_funnel(job_id):
    """Proxy legacy Job BI only when the Job resolves to exactly one Demand."""
    job = db.session.get(Job, job_id)
    if job is None or not same_org(job, g.org_id):
        return jsonify({"error": "岗位不存在"}), 404

    try:
        demand = resolve_demand_context(org_id=g.org_id, job_id=job_id)
    except DemandContextError as error:
        return jsonify(error.as_payload()), error.status_code

    if not can_read_demand(g.user_id, g.role, g.org_id, demand):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    payload = build_demand_operational_metrics(demand)
    payload.update(
        {
            "job_id": job_id,
            "job_title": job.title,
            "compatibility": {
                "mode": "single_demand",
                "aggregate": False,
            },
        }
    )
    return jsonify(payload)


@bp.get("/bi/demand/<int:demand_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def demand_operational_metrics(demand_id):
    demand = RecruitmentDemand.query.filter_by(
        id=demand_id,
        org_id=g.org_id,
    ).first()
    if demand is None:
        return jsonify({"error": "需求不存在", "code": "demand_not_found"}), 404
    if not can_read_demand(g.user_id, g.role, g.org_id, demand):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    return jsonify(build_demand_operational_metrics(demand))
