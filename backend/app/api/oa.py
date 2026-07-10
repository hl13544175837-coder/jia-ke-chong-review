from flask import Blueprint, jsonify, request, g

from ..middleware.auth import require_auth
from ..services.oa_merak_service import (
    call_merak_endpoint,
    list_merak_endpoints,
    merak_proxy_status,
)

bp = Blueprint("oa", __name__)

_OA_ROLES = {"recruiter", "manager", "admin"}


def _require_oa_role():
    if g.role not in _OA_ROLES:
        return jsonify({"error": "Forbidden"}), 403
    return None


@bp.get("/oa/merak/endpoints")
@require_auth
def merak_endpoints():
    denied = _require_oa_role()
    if denied:
        return denied
    return jsonify({
        **merak_proxy_status(),
        "endpoints": list_merak_endpoints(),
    })


@bp.post("/oa/merak/proxy/<endpoint_key>")
@require_auth
def merak_proxy(endpoint_key):
    denied = _require_oa_role()
    if denied:
        return denied
    result = call_merak_endpoint(endpoint_key, request.get_json(silent=True) or {})
    status_code = int(result.pop("status_code", 200) or 200)
    return jsonify(result), status_code
