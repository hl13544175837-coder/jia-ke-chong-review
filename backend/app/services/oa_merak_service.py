from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from flask import current_app


@dataclass(frozen=True)
class MerakEndpoint:
    key: str
    method: str
    path: str
    label: str
    use_case: str
    mutating: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "method": self.method,
            "path": self.path,
            "label": self.label,
            "use_case": self.use_case,
            "mutating": self.mutating,
        }


MERAK_ENDPOINTS: List[MerakEndpoint] = [
    MerakEndpoint("meeting_room_find_area", "POST", "/meetingRoom/findArea", "查询会议室区域", "面试邀约需要选择会议室区域时复用。", False),
    MerakEndpoint("meeting_room_find_list", "POST", "/meetingRoom/findList", "查询可用会议室", "按日期和时间段查询可预定会议室。", False),
    MerakEndpoint("meeting_room_reserve", "POST", "/meetingRoom/reserve", "预定会议室", "面试邀约确认后预定会议室。", True),
    MerakEndpoint("meeting_room_find_my_reserve", "POST", "/meetingRoom/findMyReserve", "查询我的会议室预定", "查看当前用户已发起的会议室预定。", False),
    MerakEndpoint("meeting_room_update_status", "POST", "/meetingRoom/updateSta", "更新会议室预定状态", "取消、结束或更新会议室预定状态。", True),
    MerakEndpoint("meeting_room_query_h5", "POST", "/meetingRoom/queryByIdForH5", "查询会议室预定详情", "通过预定 ID 查看会议室详情。", False),
    MerakEndpoint("schedule_new", "POST", "/schedule/newSchedule", "新建日程", "面试邀约同步到 OA 日程。", True),
    MerakEndpoint("schedule_query_list", "POST", "/schedule/queryScheduleList", "查询日程列表", "查看当前用户日程安排。", False),
    MerakEndpoint("schedule_query_by_id", "POST", "/schedule/queryScheduleById", "查询日程详情", "查看某条面试日程详情。", False),
    MerakEndpoint("schedule_edit", "POST", "/schedule/editSchedule", "编辑日程", "面试改期后同步 OA 日程。", True),
    MerakEndpoint("schedule_delete", "POST", "/schedule/deleteSchedule", "删除日程", "面试取消后同步删除 OA 日程。", True),
    MerakEndpoint("schedule_add_notice", "POST", "/schedule/addNotice", "日程回执/提醒", "保留给日程接受、提醒等协同动作。", True),
    MerakEndpoint("contact_query_sync_wx_emp", "GET", "/contactList/querySyncWxEmp", "通讯录员工模糊查询", "把面试官姓名或工号映射到公司通讯录人员。", False),
]

_ENDPOINT_BY_KEY = {endpoint.key: endpoint for endpoint in MERAK_ENDPOINTS}


def list_merak_endpoints() -> List[Dict[str, Any]]:
    return [endpoint.to_dict() for endpoint in MERAK_ENDPOINTS]


def is_merak_proxy_configured() -> bool:
    if not current_app.config.get("OA_MERAK_PROXY_ENABLED"):
        return False
    base_url = str(current_app.config.get("OA_MERAK_BASE_URL") or "").strip()
    bearer_token = str(current_app.config.get("OA_MERAK_BEARER_TOKEN") or "").strip()
    if not base_url or not bearer_token:
        return False
    try:
        parsed = urlparse(base_url)
        port = parsed.port
    except ValueError:
        return False
    return bool(
        parsed.scheme.lower() == "https"
        and parsed.hostname
        and parsed.netloc
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
        and (port is None or 1 <= port <= 65535)
    )


def merak_proxy_status() -> Dict[str, Any]:
    return {
        "configured": is_merak_proxy_configured(),
        "base_url_configured": bool(current_app.config.get("OA_MERAK_BASE_URL") or ""),
        "bearer_token_configured": bool(current_app.config.get("OA_MERAK_BEARER_TOKEN") or ""),
        "https_required": True,
        "source_project": "merak-front",
        "notes": [
            "接口来自 merak-front 的 ajax/meeting.js 白名单。",
            "只有显式启用、配置合法 HTTPS 地址和 Bearer Token 后才会真实调用公司 OA。",
        ],
    }


def call_merak_endpoint(endpoint_key: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    endpoint = _ENDPOINT_BY_KEY.get(endpoint_key)
    if endpoint is None:
        return {"ok": False, "status_code": 404, "error": f"未知 OA/Merak 接口：{endpoint_key}"}
    if endpoint.mutating:
        return {
            "ok": False,
            "status_code": 403,
            "error": "OA/Merak 写操作不能通过通用代理执行，请使用带确认、权限校验、审计和幂等保护的专用业务接口",
        }
    if not is_merak_proxy_configured():
        return {"ok": False, "status_code": 503, "error": "OA/Merak 代理未配置，暂不能真实调用公司 OA"}

    base_url = str(current_app.config["OA_MERAK_BASE_URL"]).rstrip("/")
    timeout = current_app.config.get("OA_MERAK_TIMEOUT_SECONDS", 8)
    headers = {"Content-Type": "application/json"}
    bearer_token = str(current_app.config["OA_MERAK_BEARER_TOKEN"]).strip()
    headers["Authorization"] = f"Bearer {bearer_token}"

    url = f"{base_url}{endpoint.path}"
    try:
        if endpoint.method == "GET":
            response = requests.get(url, params=payload or {}, headers=headers, timeout=timeout)
        else:
            response = requests.post(url, json=payload or {}, headers=headers, timeout=timeout)
    except requests.RequestException as exc:
        return {"ok": False, "status_code": 502, "error": f"OA/Merak 调用失败：{exc}"}

    try:
        data = response.json()
    except ValueError:
        data = response.text[:2000]

    return {
        "ok": response.ok,
        "status_code": response.status_code,
        "endpoint": endpoint.to_dict(),
        "data": data,
    }
