"""Stable user-facing error messages for failures whose details stay in logs."""

PUBLIC_RESUME_PARSE_ERROR = "简历解析失败，请重试或人工补录"
PUBLIC_AI_TOOL_ERROR = "AI 服务暂时不可用，请稍后重试"

_SAFE_RESUME_MESSAGES = {
    "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。",
}

_RESUME_ERROR_HINTS = (
    (
        ("暂时无法连接", "连接失败", "Failed to connect", "ConnectionError"),
        "AI 识别服务暂时无法连接，请联系管理员检查网络或服务配置",
    ),
    (
        ("超时", "Timeout", "timed out"),
        "AI 识别超时，请稍后重试或人工补录",
    ),
    (
        ("401", "403", "鉴权", "Authorization", "InvalidApiKey"),
        "AI 识别服务鉴权失败，请联系管理员检查识别服务配置",
    ),
    (
        ("未配置", "DASHSCOPE", "占位符", "必须使用 HTTPS", "缺少主机名"),
        "AI 识别服务未正确配置，请联系管理员检查识别服务配置",
    ),
)


def public_resume_parse_error(status, value):
    raw = str(value or "").strip()
    if not raw:
        return None
    if status in {"pending", "processing"} and raw.startswith(
        ("queued:", "worker:")
    ):
        return None
    if raw in _SAFE_RESUME_MESSAGES:
        return raw
    for hints, message in _RESUME_ERROR_HINTS:
        if any(hint.lower() in raw.lower() for hint in hints):
            return message
    return PUBLIC_RESUME_PARSE_ERROR


def stored_resume_parse_error(value):
    return public_resume_parse_error("failed", value) or PUBLIC_RESUME_PARSE_ERROR
