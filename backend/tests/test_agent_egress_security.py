from app.services.agent_service import _tool_web_search


def test_web_search_is_disabled_by_default(app):
    app.config["AGENT_WEB_SEARCH_ENABLED"] = False
    with app.app_context():
        assert _tool_web_search("上海 Java 薪资趋势")["error"] == "联网搜索未启用"


def test_web_search_blocks_candidate_pii_when_enabled(app):
    app.config["AGENT_WEB_SEARCH_ENABLED"] = True
    with app.app_context():
        result = _tool_web_search("候选人张三 手机号 13800138000")
    assert result["error"] == "搜索内容包含招聘隐私信息，已阻止发送到外部服务"
