from datetime import datetime, timezone
import math
import bcrypt

from flask import Blueprint, request, jsonify, g
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import Event, User
from ..services.agent_service import get_agent_architecture_dashboard
from ..services.settings_service import SettingsError, get_settings, save_settings

bp = Blueprint("admin", __name__)
VALID_ROLES = {"recruiter", "interviewer", "manager", "admin"}


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _clean_text(value, limit):
    return str(value or "").strip()[:limit]


def _user_payload(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department or "",
        "org_id": user.org_id,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@bp.get("/admin/users")
@require_auth
@require_role("admin")
def list_users():
    users = User.query.filter(User.org_id == g.org_id).order_by(User.id.asc()).all()
    return jsonify([_user_payload(user) for user in users])


@bp.post("/admin/users")
@require_auth
@require_role("admin")
def create_user():
    data = request.get_json(silent=True) or {}
    email = _clean_text(data.get("email"), 100).lower()
    name = _clean_text(data.get("name"), 100)
    password = str(data.get("password") or "")
    role = _clean_text(data.get("role") or "recruiter", 20)
    department = _clean_text(data.get("department"), 120)

    if not email or "@" not in email:
        return jsonify({"error": "需要提供有效邮箱"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "邮箱已存在"}), 409
    if len(password) < 6:
        return jsonify({"error": "密码至少 6 位"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"无效角色。可选：{sorted(VALID_ROLES)}"}), 400

    user = User(
        org_id=g.org_id,
        name=name or email.split("@")[0],
        email=email,
        role=role,
        department=department,
        password_hash=_hash_password(password),
        is_active=True,
    )
    try:
        db.session.add(user)
        db.session.flush()
        record_event("user.created", entity_id=user.id, entity_type="user",
                     payload={"role": user.role}, commit=False)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify(_user_payload(user)), 201


@bp.get("/admin/settings")
@require_auth
@require_role("admin")
def get_admin_settings():
    return jsonify(get_settings(g.org_id))


@bp.put("/admin/settings")
@require_auth
@require_role("admin")
def update_admin_settings():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(save_settings(
            org_id=g.org_id,
            actor_id=g.user_id,
            expected_version=data.get("version"),
            config=data.get("config"),
        ))
    except SettingsError as error:
        return jsonify(error.as_payload()), error.status_code


@bp.get("/admin/ai-architecture")
@require_auth
@require_role("admin")
def ai_architecture():
    return jsonify(get_agent_architecture_dashboard())


def _positive_int_arg(name, default, max_value=None):
    value = request.args.get(name, default, type=int)
    value = max(1, value or default)
    if max_value is not None:
        value = min(value, max_value)
    return value


def _parse_datetime_arg(name):
    raw = request.args.get(name, "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


@bp.get("/admin/audit-logs")
@require_auth
@require_role("admin")
def audit_logs():
    actor_id = request.args.get("actor_id", type=int)
    raw_demand_id = request.args.get("demand_id")
    try:
        demand_id = int(raw_demand_id) if raw_demand_id is not None else None
    except (TypeError, ValueError):
        return jsonify({
            "error": "demand_id 必须是整数",
            "code": "invalid_demand_id",
        }), 400
    action = request.args.get("action", "").strip()
    entity_type = request.args.get("entity_type", "").strip()
    page = _positive_int_arg("page", 1)
    per_page = _positive_int_arg("per_page", 50, max_value=200)
    from_dt = _parse_datetime_arg("from")
    to_dt = _parse_datetime_arg("to")

    query = Event.query.filter(Event.org_id == g.org_id)
    if actor_id is not None:
        query = query.filter(Event.actor_id == actor_id)
    if demand_id is not None:
        query = query.filter(Event.demand_id == demand_id)
    if action:
        query = query.filter(Event.action == action)
    if entity_type:
        query = query.filter(Event.entity_type == entity_type)
    if from_dt:
        query = query.filter(Event.ts >= from_dt)
    if to_dt:
        query = query.filter(Event.ts <= to_dt)

    query = query.order_by(Event.ts.desc(), Event.id.desc())
    total = query.count()
    logs = query.offset((page - 1) * per_page).limit(per_page).all()

    actor_ids = {log.actor_id for log in logs if log.actor_id is not None}
    actor_names = {}
    if actor_ids:
        users = User.query.filter(User.id.in_(actor_ids)).all()
        actor_names = {user.id: user.name for user in users}

    return jsonify({
        "logs": [{
            "id": log.id,
            "source": "event",
            "actor_id": log.actor_id,
            "actor_name": actor_names.get(log.actor_id),
            "actor_role": log.actor_role,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "demand_id": log.demand_id,
            "payload": log.payload or {},
            "request_id": log.request_id,
            "ip": log.ip,
            "user_agent": log.user_agent,
            "result": log.result,
            "failure_reason": log.failure_reason,
            "event_source": log.source,
            "severity": log.severity,
            "ts": log.ts.isoformat() if log.ts else None,
        } for log in logs],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, math.ceil(total / per_page)),
    })


@bp.patch("/admin/users/<int:user_id>")
@require_auth
@require_role("admin")
def update_user(user_id):
    data = request.get_json() or {}
    user = db.session.get(User, user_id)
    if user is None or user.org_id != g.org_id:
        return jsonify({"error": "用户不存在"}), 404
    new_role = data.get("role", user.role)
    new_is_active = data.get("is_active", user.is_active)
    new_name = _clean_text(data.get("name", user.name), 100)
    new_department = _clean_text(data.get("department", user.department), 120)
    if "role" in data and new_role not in VALID_ROLES:
        return jsonify({"error": f"无效角色。可选：{sorted(VALID_ROLES)}"}), 400
    if "is_active" in data and not isinstance(new_is_active, bool):
        return jsonify({"error": "is_active 必须是布尔值"}), 400
    if user_id == g.user_id:
        if new_is_active is False or new_role != "admin":
            return jsonify({"error": "不能停用或降级自己的账号"}), 400

    role_changed = new_role != user.role
    active_changed = new_is_active != user.is_active
    if role_changed or active_changed:
        user.token_version = (user.token_version or 0) + 1
    if role_changed:
        user.role = new_role
        record_event("user.role_changed", entity_id=user_id, entity_type="user",
                     payload={"role": new_role}, commit=False)
    if active_changed:
        user.is_active = new_is_active
        record_event("user.active_changed", entity_id=user_id, entity_type="user",
                     payload={"is_active": user.is_active}, commit=False)
    if new_name and new_name != user.name:
        user.name = new_name
        record_event("user.name_changed", entity_id=user_id, entity_type="user", commit=False)
    if new_department != (user.department or ""):
        user.department = new_department
        record_event("user.department_changed", entity_id=user_id, entity_type="user", commit=False)
    db.session.commit()
    return jsonify(_user_payload(user))


@bp.post("/admin/users/<int:user_id>/reset-password")
@require_auth
@require_role("admin")
def reset_user_password(user_id):
    data = request.get_json(silent=True) or {}
    password = str(data.get("password") or "")
    if len(password) < 6:
        return jsonify({"error": "密码至少 6 位"}), 400
    user = db.session.get(User, user_id)
    if user is None or user.org_id != g.org_id:
        return jsonify({"error": "用户不存在"}), 404
    try:
        user.password_hash = _hash_password(password)
        user.token_version = (user.token_version or 0) + 1
        db.session.flush()
        record_event("user.password_reset", entity_id=user_id, entity_type="user",
                     commit=False)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return jsonify({"status": "ok", "id": user.id})
