from datetime import datetime

from flask import Blueprint, Response, g, jsonify

from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..services.analytics_service import analytics_csv, build_analytics_overview


bp = Blueprint("analytics", __name__)


@bp.get("/analytics/overview")
@require_auth
@require_role("manager", "admin", "hr_director")
def overview():
    return jsonify(build_analytics_overview(g.org_id))


@bp.get("/dashboard/stats")
@require_auth
def dashboard_stats():
    """工作台数据概览（所有角色可用）：返回团队级汇总，供首页统计卡展示。"""
    payload = build_analytics_overview(g.org_id)
    return jsonify({
        "summary": payload.get("summary", {}),
        "funnel": payload.get("funnel", {}),
    })


@bp.get("/analytics/export")
@require_auth
@require_role("manager", "admin", "hr_director")
def export_overview():
    payload = build_analytics_overview(g.org_id)
    record_event(
        "analytics.exported",
        entity_type="analytics",
        payload={"format": "csv", "demand_count": len(payload["demands"])},
    )
    filename = f"招聘进展_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        "\ufeff" + analytics_csv(payload),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
