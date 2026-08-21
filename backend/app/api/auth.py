import bcrypt
import hashlib
from datetime import timedelta
from flask import Blueprint, request, jsonify, g, current_app
import jwt
from ..middleware.auth import require_auth
from ..middleware.rate_limit import rate_limit
from .. import db
from ..models import User
from ..services.account_display_service import account_display_name
from ..time_utils import utc_now

bp = Blueprint("auth", __name__)


def _request_json_object() -> dict:
    """认证接口只接受 JSON 对象，避免数组或标量触发服务器异常。"""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify(pw: str, hashed: str) -> bool:
    if not isinstance(pw, str) or not isinstance(hashed, str):
        return False
    try:
        if bcrypt.checkpw(pw.encode(), hashed.encode()):
            return True
    except ValueError:
        pass
    if len(hashed) == 64 and all(c in "0123456789abcdef" for c in hashed.lower()):
        return hashlib.sha256(pw.encode()).hexdigest() == hashed
    return False


@bp.post("/auth/register")
def register():
    if not current_app.config.get("ALLOW_PUBLIC_REGISTRATION", False):
        return jsonify({"error": "公开注册已关闭，请联系管理员创建账号"}), 403
    data = _request_json_object()
    if (
        not isinstance(data.get("email"), str)
        or not data.get("email")
        or not isinstance(data.get("password"), str)
        or not data.get("password")
        or ("name" in data and not isinstance(data.get("name"), str))
    ):
        return jsonify({"error": "email and password required"}), 400
    if User.query.filter_by(email=data.get("email")).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(
        org_id=1,
        name=data.get("name", ""),
        email=data["email"],
        role="recruiter",  # 安全：注册一律为 recruiter，特权角色由 admin 分配
        password_hash=_hash(data["password"]),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email, "role": user.role}), 201


@bp.post("/auth/login")
@rate_limit("auth.login")
def login():
    data = _request_json_object()
    email = data.get("email")
    password = data.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid credentials"}), 401
    user = User.query.filter_by(email=email).first()
    if not user or not _verify(password, user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401
    if not user.is_active:
        return jsonify({"error": "账号已停用，请联系管理员"}), 403
    exp = utc_now() + timedelta(hours=current_app.config["JWT_EXPIRY_HOURS"])
    token = jwt.encode(
        {
            "user_id": user.id,
            "role": user.role,
            "token_version": user.token_version or 0,
            "exp": exp,
        },
        current_app.config["JWT_SECRET"], algorithm="HS256"
    )
    return jsonify({
        "token": token,
        "user_id": user.id,
        "role": user.role,
        "name": account_display_name(user),
    })


@bp.get("/auth/me")
@require_auth
def me():
    """当前登录用户信息（前端刷新角色/姓名，不必只依赖 JWT 解析）。"""
    user = g.authenticated_user
    return jsonify({
        "id": user.id, "name": account_display_name(user), "email": user.email, "role": user.role,
    })


@bp.post("/auth/change-password")
@require_auth
def change_password():
    """修改当前用户密码：校验旧密码后更新。"""
    data = _request_json_object()
    old_pw = data.get("old_password") if "old_password" in data else data.get("old")
    new_pw = data.get("new_password") if "new_password" in data else data.get("new")
    if (
        not isinstance(old_pw, str)
        or not old_pw
        or not isinstance(new_pw, str)
        or not new_pw
    ):
        return jsonify({"error": "需要提供旧密码和新密码"}), 400
    if len(new_pw) < 6:
        return jsonify({"error": "新密码至少 6 位"}), 400
    user = g.authenticated_user
    if not _verify(old_pw, user.password_hash):
        return jsonify({"error": "旧密码不正确"}), 400
    user.password_hash = _hash(new_pw)
    user.token_version = (user.token_version or 0) + 1
    db.session.commit()
    return jsonify({"status": "ok"})
