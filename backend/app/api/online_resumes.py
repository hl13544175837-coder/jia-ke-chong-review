from flask import Blueprint, g, jsonify, request

from ..middleware.auth import require_auth, require_role
from ..services.online_resume_service import (
    OnlineResumeService,
    OnlineResumeValidationError,
)


bp = Blueprint("online_resumes", __name__)


@bp.get("/online-resumes")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_online_resumes():
    result = OnlineResumeService().list_for_actor(
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
        page=max(1, request.args.get("page", 1, type=int)),
        per_page=min(100, max(1, request.args.get("per_page", 20, type=int))),
        demand_id=request.args.get("demand_id", type=int),
    )
    return jsonify(result)


@bp.get("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def online_resume_detail(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    return jsonify({"item": service.serialize(resume)})


@bp.patch("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_online_resume(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "请提供正确的修改内容"}), 400
    try:
        updated = service.update_profile(
            resume,
            display_name=payload.get("display_name", resume.display_name),
            resume_json=payload.get("resume_json", resume.resume_json),
        )
    except OnlineResumeValidationError as exc:
        return jsonify({"error": exc.message}), 400
    return jsonify({"item": service.serialize(updated)})


@bp.delete("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def delete_online_resume(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    service.delete(resume)
    return jsonify({"ok": True})
