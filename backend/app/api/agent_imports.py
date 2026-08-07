from flask import Blueprint, g, jsonify, request

from ..middleware.auth import require_auth, require_role
from ..services.online_resume_service import (
    OnlineResumeService,
    OnlineResumeValidationError,
)


bp = Blueprint("agent_imports", __name__)


@bp.post("/agent-imports/online-resumes")
@require_auth
@require_role("recruiter")
def import_online_resumes():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "请提供正确的导入内容"}), 400
    try:
        result = OnlineResumeService().import_batch(
            org_id=g.org_id,
            owner_hr_id=g.user_id,
            role=g.role,
            items=payload.get("items"),
        )
    except OnlineResumeValidationError as exc:
        return jsonify({"error": exc.message}), 400
    return jsonify(result), 200
