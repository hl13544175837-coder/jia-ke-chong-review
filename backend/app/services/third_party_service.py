"""三方应用（银河 / 集团门户 / 乾坤）接口调用公共封装。

流程：
1. 用 Apollo 下发的 `mcp.sso.token` 作为 token 头，调 MCP 登录接口
   （/mcp/user/loginByYmEmpCode?ymEmpCode=工号），换取该员工的三应用 token：
     - yhToken  → 银河(yh / galaxy)
     - goToken  → 集团门户(go / portal)
     - omgToken → 乾坤(omg / qiankun)
2. 用对应 token 调各应用接口。

对外公共方法：
    request_app_api(app, ym_emp_code, method, path, ...) -> requests.Response
    get_app_json(app, ym_emp_code, path, ...) -> dict         # GET 便捷封装
    login_by_emp_code(ym_emp_code) -> dict                    # 原始登录返回（含用户信息）
    get_app_token(app, ym_emp_code) -> str                    # 只取某应用 token

配置（环境变量 / Apollo 注入，均可）：
    MCP_SSO_TOKEN        MCP 登录用的 sso token（留空则读 Apollo 注入的 `mcp.sso.token`）
    MCP_BASE_URL         MCP 登录服务前缀（默认 parktest 测试地址）
    YH_BASE_URL / GO_BASE_URL / OMG_BASE_URL        三应用接口前缀（调用前必填）
    YH_TOKEN_HEADER / GO_TOKEN_HEADER / OMG_TOKEN_HEADER  三应用 token 头名（默认 token）
    THIRD_PARTY_LOGIN_TTL   MCP 登录结果缓存秒数（默认 300）
"""
from __future__ import annotations

import logging
import os
import threading
import time

import requests

log = logging.getLogger("third_party")

# 应用 key → 登录返回里的 token 字段
APP_TOKEN_FIELD = {"yh": "yhToken", "go": "goToken", "omg": "omgToken"}
# 各种叫法归一到 yh / go / omg
APP_ALIASES = {
    "yh": "yh", "galaxy": "yh", "银河": "yh", "yhtoken": "yh",
    "go": "go", "portal": "go", "集团门户": "go", "gotoken": "go",
    "omg": "omg", "qiankun": "omg", "乾坤": "omg", "omgtoken": "omg",
}
_APP_BASE_ENV = {"yh": "YH_BASE_URL", "go": "GO_BASE_URL", "omg": "OMG_BASE_URL"}
_APP_HEADER_ENV = {"yh": "YH_TOKEN_HEADER", "go": "GO_TOKEN_HEADER", "omg": "OMG_TOKEN_HEADER"}
_DEFAULT_TOKEN_HEADER = "token"
_HTTP_TIMEOUT = 8

_login_cache: dict[str, dict] = {}
_login_lock = threading.Lock()


class ThirdPartyError(Exception):
    """三方接口调用异常（配置缺失 / 登录失败 / 请求失败）。"""


def _cfg(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def _mcp_sso_token() -> str:
    # 显式 MCP_SSO_TOKEN 优先；否则用 Apollo 注入的 `mcp.sso.token`
    return _cfg("MCP_SSO_TOKEN") or (os.environ.get("mcp.sso.token") or "").strip()


def _mcp_base_url() -> str:
    return _cfg("MCP_BASE_URL", "https://parktest.yimidida.com/hrai/hr-ai-ms").rstrip("/")


def _login_ttl() -> int:
    try:
        return int(_cfg("THIRD_PARTY_LOGIN_TTL", "300"))
    except ValueError:
        return 300


def _resolve_app(app: str) -> str:
    raw = str(app).strip()
    key = APP_ALIASES.get(raw.lower()) or APP_ALIASES.get(raw)
    if not key:
        raise ThirdPartyError(f"未知应用：{app}（可选 yh/银河、go/集团门户、omg/乾坤）")
    return key


def current_emp_code() -> str:
    """请求上下文里的当前工号（前端随 X-Emp-Code 头下发）。无则返回空串。"""
    try:
        from flask import g, request

        code = getattr(g, "emp_code", None)
        if code:
            return str(code).strip()
        return (request.headers.get("X-Emp-Code") or "").strip()
    except Exception:  # noqa: BLE001 - 非请求上下文
        return ""


def login_by_emp_code(ym_emp_code: str, force: bool = False) -> dict:
    """用 mcp.sso.token 换取该工号的三应用 token 及用户信息（带 TTL 缓存）。"""
    ym_emp_code = str(ym_emp_code or "").strip()
    if not ym_emp_code:
        raise ThirdPartyError("ymEmpCode 不能为空")

    now = time.time()
    if not force:
        with _login_lock:
            cached = _login_cache.get(ym_emp_code)
            if cached and cached["exp"] > now:
                return cached["data"]

    sso = _mcp_sso_token()
    if not sso:
        raise ThirdPartyError("缺少 mcp.sso.token（确认 Apollo 已注入或设置 MCP_SSO_TOKEN）")

    url = f"{_mcp_base_url()}/mcp/user/loginByYmEmpCode"
    try:
        resp = requests.get(
            url, params={"ymEmpCode": ym_emp_code}, headers={"token": sso}, timeout=_HTTP_TIMEOUT
        )
    except requests.RequestException as exc:
        raise ThirdPartyError(f"MCP 登录请求失败：{exc}") from exc

    if not resp.ok:
        raise ThirdPartyError(f"MCP 登录 HTTP {resp.status_code}")
    body = resp.json() if resp.content else {}
    if str(body.get("code")) != "200":
        raise ThirdPartyError(f"MCP 登录失败：{body.get('message') or body.get('code')}")

    data = body.get("data") or {}
    with _login_lock:
        _login_cache[ym_emp_code] = {"data": data, "exp": now + _login_ttl()}
    return data


def get_app_token(app: str, ym_emp_code: str) -> str:
    """取某应用（yh/go/omg）的 token。"""
    key = _resolve_app(app)
    data = login_by_emp_code(ym_emp_code)
    token = data.get(APP_TOKEN_FIELD[key])
    if not token:
        raise ThirdPartyError(f"MCP 登录未返回 {APP_TOKEN_FIELD[key]}（app={app}）")
    return str(token)


def request_app_api(
    app: str,
    ym_emp_code: str,
    method: str,
    path: str,
    *,
    base_url: str | None = None,
    token_header: str | None = None,
    headers: dict | None = None,
    **kwargs,
) -> requests.Response:
    """公共方法：调用银河/集团门户/乾坤 的接口，自动带上对应应用的 token 头。

    app：yh/银河、go/集团门户、omg/乾坤
    base_url：不传则读 {YH,GO,OMG}_BASE_URL；token_header 不传则读 *_TOKEN_HEADER（默认 token）
    其余 kwargs 透传给 requests（params/json/data/timeout 等）。
    """
    key = _resolve_app(app)
    base = (base_url or _cfg(_APP_BASE_ENV[key])).rstrip("/")
    if not base:
        raise ThirdPartyError(f"未配置 {app} 接口地址（设置 {_APP_BASE_ENV[key]}）")
    header_name = token_header or _cfg(_APP_HEADER_ENV[key]) or _DEFAULT_TOKEN_HEADER
    token = get_app_token(app, ym_emp_code)

    merged_headers = {header_name: token}
    if headers:
        merged_headers.update(headers)
    url = f"{base}/{str(path).lstrip('/')}"
    kwargs.setdefault("timeout", _HTTP_TIMEOUT)
    try:
        return requests.request(method.upper(), url, headers=merged_headers, **kwargs)
    except requests.RequestException as exc:
        raise ThirdPartyError(f"{app} 接口请求失败：{exc}") from exc


def get_app_json(app: str, ym_emp_code: str, path: str, **kwargs) -> dict:
    """GET 三应用接口并返回 JSON（非 2xx 抛 ThirdPartyError）。"""
    resp = request_app_api(app, ym_emp_code, "GET", path, **kwargs)
    if not resp.ok:
        raise ThirdPartyError(f"{app} 接口 HTTP {resp.status_code}：{resp.text[:200]}")
    return resp.json() if resp.content else {}
