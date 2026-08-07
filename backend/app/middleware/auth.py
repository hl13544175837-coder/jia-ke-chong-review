import functools
import jwt
from flask import request, jsonify, g, current_app
from .. import db


AGENT_IMPORT_SCOPE = "agent_import"


def _auth_disabled():
    """是否处于“网关统一鉴权、后端不再校验 JWT”模式。

    只有显式开启 AUTH_DISABLED，且当前是明确不安全的环境（本地 debug /
    可丢弃 SIT / 测试）时才生效。这样即使 GA/生产误设 AUTH_DISABLED=true，
    也不会真正关闭鉴权（fail-safe）。
    """
    cfg = current_app.config
    if not cfg.get("AUTH_DISABLED"):
        return False
    return bool(
        cfg.get("FLASK_DEBUG")
        or cfg.get("ALLOW_INSECURE_SIT_STARTUP")
        or cfg.get("TESTING")
    )


def _provision_gateway_user(emp_code):
    """按网关工号 find-or-create 一个后端用户（承载 g.user_id 的外键/审计/org）。

    真实姓名、角色、组织后续随身份集成对接；当前用工号占位、给默认角色。
    工号以合成邮箱 `<工号>@gateway.local` 作为唯一键，避免加库表列。
    """
    from ..models import User
    from ..services.gateway_role_service import (
        normalize_employee_code,
        resolve_gateway_role,
    )

    normalized_code = normalize_employee_code(emp_code)
    email = f"{normalized_code.lower()}@gateway.local"
    role, explicitly_mapped = resolve_gateway_role(
        normalized_code,
        current_app.config.get("AUTH_GATEWAY_ROLE_MAP"),
        current_app.config.get("AUTH_GATEWAY_USER_ROLE"),
    )
    user = User.query.filter_by(email=email).first()
    if user is not None:
        if explicitly_mapped and user.role != role:
            user.role = role
            db.session.commit()
        return user

    user = User(
        name=normalized_code,
        email=email,
        role=role,
        password_hash="!gateway-managed",  # 非法哈希：该账号不能用密码登录
        org_id=1,
        is_active=True,
        token_version=0,
    )
    db.session.add(user)
    try:
        db.session.commit()
    except Exception:  # 并发首次请求可能撞唯一键，回滚后重查
        db.session.rollback()
        user = User.query.filter_by(email=email).first()
    return user


def _resolve_gateway_user():
    """鉴权关闭时的当前用户。

    优先用请求头 X-Emp-Code（网关工号）find-or-create 用户；无工号头时回退到
    配置的默认账号 > 第一个在职 admin > 第一个在职用户。
    后端仍需一个真实 User 承载 g.user_id（外键归属、审计、org 过滤都依赖它）。
    """
    from ..models import User

    emp_code = (request.headers.get("X-Emp-Code") or "").strip()
    if emp_code:
        return _provision_gateway_user(emp_code)

    email = (current_app.config.get("AUTH_DISABLED_USER_EMAIL") or "").strip()
    base = User.query.filter_by(is_active=True)
    user = None
    if email:
        user = base.filter_by(email=email).first()
    if user is None:
        user = base.filter_by(role="admin").order_by(User.id).first()
    if user is None:
        user = base.order_by(User.id).first()
    return user


def authenticate_token(token, *, required_scope=None):
    """Validate a JWT against current user state, version, and token scope."""

    if not token:
        return None, (jsonify({"error": "Missing token"}), 401)
    try:
        payload = jwt.decode(
            token,
            current_app.config["JWT_SECRET"],
            algorithms=["HS256"],
        )
        from ..models import User

        user_id = payload.get("user_id")
        if user_id is None:
            return None, (jsonify({"error": "Invalid token"}), 401)
        user = db.session.get(User, user_id)
        if not user:
            return None, (jsonify({"error": "User not found"}), 401)
        if not user.is_active:
            return None, (jsonify({"error": "账号已停用，请联系管理员"}), 403)
        try:
            token_version = int(payload.get("token_version", 0) or 0)
        except (TypeError, ValueError):
            return None, (jsonify({"error": "Invalid token"}), 401)
        if token_version != (user.token_version or 0):
            return None, (jsonify({"error": "Token revoked"}), 401)
        scope = payload.get("scope")
        legacy_test_import_token = bool(
            current_app.config.get("TESTING")
            and required_scope == AGENT_IMPORT_SCOPE
            and scope is None
            and "token_version" not in payload
        )
        if required_scope is None:
            if scope is not None:
                return None, (jsonify({"error": "Forbidden"}), 403)
        elif scope != required_scope and not legacy_test_import_token:
            return None, (jsonify({"error": "Forbidden"}), 403)
        if required_scope == AGENT_IMPORT_SCOPE:
            if user.role != "recruiter":
                return None, (jsonify({"error": "Forbidden"}), 403)
            if not legacy_test_import_token:
                try:
                    token_org_id = int(payload.get("org_id"))
                except (TypeError, ValueError):
                    return None, (jsonify({"error": "Invalid token"}), 401)
                if token_org_id != (user.org_id or 1):
                    return None, (jsonify({"error": "Token revoked"}), 401)
        return user, None
    except jwt.ExpiredSignatureError:
        return None, (jsonify({"error": "Token expired"}), 401)
    except jwt.InvalidTokenError:
        return None, (jsonify({"error": "Invalid token"}), 401)


def require_auth(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        # 网关统一鉴权模式：跳过 JWT 校验，用默认用户身份，避免网关不透明 token
        # 被当作 JWT 解析而报 "Invalid token"。
        if _auth_disabled():
            user = _resolve_gateway_user()
            if user is None:
                return jsonify({
                    "error": "已开启网关鉴权模式(AUTH_DISABLED)，但库中没有可用账号，请先创建一个用户",
                }), 500
            g.user_id = user.id
            g.role = user.role
            g.org_id = user.org_id or 1
            g.gateway_auth = True
            return f(*args, **kwargs)

        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user, error = authenticate_token(token)
        if error is not None:
            return error
        g.user_id = user.id
        g.role = user.role
        g.org_id = user.org_id or 1
        return f(*args, **kwargs)
    return decorated


def require_agent_import_auth(f):
    """Allow only the narrow JWT issued for external Agent resume imports."""

    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user, error = authenticate_token(
            token,
            required_scope=AGENT_IMPORT_SCOPE,
        )
        if error is not None:
            return error
        g.user_id = user.id
        g.role = user.role
        g.org_id = user.org_id or 1
        g.auth_scope = AGENT_IMPORT_SCOPE
        g.audit_source = "external_agent"
        return f(*args, **kwargs)

    return decorated


def require_role(*roles):
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "role") or g.role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator
