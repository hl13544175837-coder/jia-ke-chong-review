from flask import Blueprint, jsonify

from ..middleware.auth import require_auth, require_role
from ..services.integration_capability_service import list_integration_capabilities


bp = Blueprint("integrations", __name__)


@bp.get("/integrations/capabilities")
@require_auth
@require_role("admin")
def list_capabilities():
    return jsonify({"items": list_integration_capabilities()})
