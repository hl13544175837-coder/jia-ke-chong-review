# -*- coding: utf-8 -*-
"""
本地开发专用的公司网关模拟（仅 debug 模式注册，生产环境不加载）。

背景：前端登录页走公司网关流程（POST /pgs/oauth/login → GET /pgs/oauth/api/profile
→ POST /pgs/oauth/api/queryCurrentUserMenu），本地开发环境没有公司网关，
打开页面会卡在登录页无法演示。本蓝图在 debug 模式下模拟这三个接口，
让本地可以用种子账号正常登录。

注意（重要）：
- 仅用于本地开发/演示，**不校验密码**（前端只发送 md5 后的密码，后端无法回验
  bcrypt 存储的哈希；本地 mock 直接按账号匹配用户后签发真实 JWT）。
- 不修改任何正式业务逻辑；生产环境（FLASK_DEBUG=false）不会注册本蓝图，
  对线上完全无影响。
"""

from datetime import timedelta

import jwt
from flask import Blueprint, current_app, jsonify, request

from .. import db
from ..models import User
from ..time_utils import utc_now

bp = Blueprint("gateway_dev_mock", __name__)

# 按角色返回前端权限菜单 code（/talent-map 等页面依赖这些 code 放行）
ROLE_MENU_CODES = {
    "admin": ["index", "candidates", "interviews", "demands", "pipeline", "bi", "settings"],
    "hr_director": ["index", "candidates", "interviews", "demands", "pipeline", "bi", "settings"],
    "manager": ["index", "candidates", "interviews", "demands", "pipeline", "bi", "settings"],
    "recruiter": ["index", "candidates", "interviews", "demands"],
    "interviewer": ["index", "candidates", "interviews"],
}


def _issue_token(user):
    exp = utc_now() + timedelta(hours=current_app.config["JWT_EXPIRY_HOURS"])
    return jwt.encode(
        {
            "user_id": user.id,
            "role": user.role,
            "token_version": user.token_version or 0,
            "exp": exp,
        },
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )


def _resolve_user_from_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(
            auth[7:],
            current_app.config["JWT_SECRET"],
            algorithms=["HS256"],
        )
    except Exception:
        return None
    return db.session.get(User, payload.get("user_id"))


@bp.post("/oauth/login")
def oauth_login():
    """模拟公司网关登录：按账号(email/姓名)匹配用户，签发真实 JWT。仅开发用，不校验密码。"""
    data = request.get_json(silent=True) or {}
    account = str(data.get("account") or "").strip()
    user = User.query.filter(db.or_(User.email == account, User.name == account)).first()
    if user is None or not user.is_active:
        return jsonify({"succ": False, "code": 0, "msg": "账号不存在或已停用（本地开发网关）"}), 200
    return jsonify({"succ": True, "code": 1, "data": {"token": _issue_token(user)}})


@bp.get("/oauth/api/profile")
def oauth_profile():
    """模拟公司网关用户信息接口。"""
    user = _resolve_user_from_token()
    if user is None:
        return jsonify({"succ": False, "code": 0, "msg": "invalid token"}), 401
    return jsonify({
        "succ": True,
        "code": 1,
        "data": {
            "userInfo": {
                "empName": user.name,
                "ymEmpCode": user.email.split("@")[0] if "@" in user.email else user.email,
                "role": user.role,
            }
        },
    })


@bp.post("/oauth/api/queryCurrentUserMenu")
def oauth_menu():
    """模拟公司网关菜单/权限接口。"""
    user = _resolve_user_from_token()
    if user is None:
        return jsonify({"succ": False, "code": 0, "msg": "invalid token"}), 401
    codes = ROLE_MENU_CODES.get(user.role, ROLE_MENU_CODES["recruiter"])
    return jsonify({"succ": True, "code": 1, "data": [{"code": code, "children": []} for code in codes]})
