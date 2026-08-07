from datetime import timedelta

import jwt
from flask import Blueprint, current_app, g, jsonify, request

from .. import db
from ..middleware.auth import (
    AGENT_IMPORT_SCOPE,
    require_agent_import_auth,
    require_auth,
    require_role,
)
from ..models import User
from ..services.online_resume_service import (
    OnlineResumeService,
    OnlineResumeValidationError,
)
from ..services.resumes.upload_service import handle_resume_upload
from ..time_utils import utc_now


bp = Blueprint("agent_imports", __name__)


@bp.post("/agent-imports/token")
@require_auth
@require_role("recruiter")
def create_agent_import_token():
    if request.headers.get("Idempotency-Key"):
        return jsonify({
            "error": "生成导入凭证不支持 Idempotency-Key",
        }), 400
    user = db.session.get(User, g.user_id)
    if user is None or not user.is_active or user.role != "recruiter":
        return jsonify({"error": "Forbidden"}), 403

    issued_at = utc_now()
    expires_at = issued_at + timedelta(
        days=current_app.config["AGENT_IMPORT_TOKEN_EXPIRY_DAYS"],
    )
    token = jwt.encode(
        {
            "user_id": user.id,
            "token_version": user.token_version or 0,
            "org_id": user.org_id or 1,
            "scope": AGENT_IMPORT_SCOPE,
            "iat": issued_at,
            "exp": expires_at,
        },
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )
    return jsonify({
        "token": token,
        "scope": AGENT_IMPORT_SCOPE,
        "expires_at": expires_at.isoformat() + "Z",
    })


@bp.post("/agent-imports/online-resumes")
@require_agent_import_auth
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


@bp.post("/agent-imports/full-resumes")
@require_agent_import_auth
def import_full_resumes():
    return handle_resume_upload(
        require_target_demand=True,
        require_structured_metadata=True,
        source_channel_override="BOSS直聘",
        reject_zip=True,
    )
