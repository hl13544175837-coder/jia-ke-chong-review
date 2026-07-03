def test_boss_routes_are_registered(app):
    routes = {str(rule.rule) for rule in app.url_map.iter_rules()}
    assert "/api/boss/accounts" in routes
    assert "/api/boss/status" in routes
    assert "/api/boss/extension/download" in routes
