from app.services.public_errors import (
    PUBLIC_RESUME_PARSE_ERROR,
    public_resume_parse_error,
    stored_resume_parse_error,
)


def test_connection_failure_maps_to_reachable_safe_message():
    raw = "图片简历识别服务暂时无法连接，请稍后重新解析"
    message = stored_resume_parse_error(raw)
    assert message != PUBLIC_RESUME_PARSE_ERROR
    assert "无法连接" in message


def test_timeout_maps_to_timeout_safe_message():
    raw = "图片简历识别超时（超过 120 秒），请稍后重新解析"
    message = stored_resume_parse_error(raw)
    assert message != PUBLIC_RESUME_PARSE_ERROR
    assert "超时" in message


def test_auth_failure_maps_to_config_safe_message():
    raw = "图片简历识别服务返回异常（HTTP 401，错误码 InvalidApiKey），请检查百炼配置后重新解析"
    message = stored_resume_parse_error(raw)
    assert message != PUBLIC_RESUME_PARSE_ERROR
    assert "鉴权" in message or "配置" in message


def test_unknown_error_keeps_generic_safe_message():
    assert stored_resume_parse_error("某个没有分类的异常") == PUBLIC_RESUME_PARSE_ERROR


def test_queue_markers_stay_hidden_while_processing():
    assert public_resume_parse_error("pending", "queued:node-1") is None
    assert public_resume_parse_error("processing", "worker:node-1:2026-08-07T00:00:00") is None
