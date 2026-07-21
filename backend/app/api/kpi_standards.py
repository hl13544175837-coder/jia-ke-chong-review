from flask import Blueprint, g, jsonify, request

from ..middleware.auth import require_auth
from ..services.kpi_standard_service import (
    KpiStandardError,
    get_kpi_standards,
    save_kpi_standards,
)


bp = Blueprint("kpi_standards", __name__)


def _allowed():
    return g.role in {"manager", "admin"}


def _error_response(error):
    return jsonify(error.as_payload()), error.status_code


@bp.get("/kpi-standards")
@require_auth
def get_standards():
    if not _allowed():
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(get_kpi_standards(g.org_id))


@bp.put("/kpi-standards")
@require_auth
def update_standards():
    if not _allowed():
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    try:
        payload = save_kpi_standards(
            org_id=g.org_id,
            actor_id=g.user_id,
            expected_version=data.get("version"),
            config=data.get("config"),
        )
    except KpiStandardError as error:
        return _error_response(error)
    return jsonify(payload)


@bp.post("/kpi-standards/reset")
@require_auth
def reset_standards():
    if not _allowed():
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    try:
        payload = save_kpi_standards(
            org_id=g.org_id,
            actor_id=g.user_id,
            expected_version=data.get("version"),
            config=None,
            reset=True,
        )
    except KpiStandardError as error:
        return _error_response(error)
    return jsonify(payload)
