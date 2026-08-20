from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from ..middleware.auth import require_auth, require_role
from ..services.online_resume_service import (
    OnlineResumeService,
    OnlineResumeValidationError,
)
from ..services.account_display_service import SIT_GATEWAY_ACCOUNT_EMAILS


bp = Blueprint("online_resumes", __name__)


def _optional_int_arg(name: str) -> int | None:
    value = request.args.get(name)
    if value is None or not value.strip():
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise OnlineResumeValidationError("年龄格式无效") from exc


def _optional_utc_datetime_arg(name: str) -> datetime | None:
    value = request.args.get(name)
    if value is None or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise OnlineResumeValidationError("导入时间格式无效") from exc
    if parsed.tzinfo is not None and parsed.utcoffset() is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


@bp.get("/online-resumes")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_online_resumes():
    try:
        age_from = _optional_int_arg("age_from")
        age_to = _optional_int_arg("age_to")
        created_from = _optional_utc_datetime_arg("created_from")
        created_to = _optional_utc_datetime_arg("created_to")
        if age_from is not None and age_to is not None and age_from > age_to:
            raise OnlineResumeValidationError("最小年龄不能大于最大年龄")
        if created_from is not None and created_to is not None and created_from > created_to:
            raise OnlineResumeValidationError("开始时间不能晚于结束时间")
        result = OnlineResumeService().list_for_actor(
            org_id=g.org_id,
            actor_id=g.user_id,
            role=g.role,
            page=max(1, request.args.get("page", 1, type=int)),
            per_page=min(100, max(1, request.args.get("per_page", 20, type=int))),
            demand_id=request.args.get("demand_id", type=int),
            gender=request.args.get("gender"),
            age_from=age_from,
            age_to=age_to,
            created_from=created_from,
            created_to=created_to,
            source_platform=request.args.get("source_platform"),
            education_level=request.args.get("education_level"),
            location=request.args.get("location"),
            keyword=request.args.get("keyword"),
            owner_hr_id=request.args.get("owner_hr_id", type=int),
        )
    except OnlineResumeValidationError as exc:
        return jsonify({"error": exc.message}), 400
    return jsonify(result)


@bp.get("/online-resumes/owner-options")
@require_auth
@require_role("recruiter", "manager", "admin")
def online_resume_owner_options():
    return jsonify(OnlineResumeService().owner_options(
        org_id=g.org_id,
        allowed_emails=(
            SIT_GATEWAY_ACCOUNT_EMAILS if getattr(g, "gateway_auth", False) else None
        ),
    ))


@bp.get("/online-resumes/demand-options")
@require_auth
@require_role("recruiter", "manager", "admin")
def online_resume_demand_options():
    return jsonify(OnlineResumeService().demand_options(org_id=g.org_id))


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
    if resume.owner_hr_id != g.user_id:
        return jsonify({"error": "只有导入人可以修改在线简历"}), 403
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
    service.delete(
        resume,
        actor_id=g.user_id,
        actor_role=g.role,
    )
    return jsonify({"ok": True})
