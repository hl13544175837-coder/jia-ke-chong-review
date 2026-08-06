"""Stable user-facing error messages for failures whose details stay in logs."""

PUBLIC_RESUME_PARSE_ERROR = "简历解析失败，请重试或人工补录"
PUBLIC_AI_TOOL_ERROR = "AI 服务暂时不可用，请稍后重试"

_SAFE_RESUME_MESSAGES = {
    "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。",
}


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
    return PUBLIC_RESUME_PARSE_ERROR


def stored_resume_parse_error(value):
    return public_resume_parse_error("failed", value) or PUBLIC_RESUME_PARSE_ERROR
