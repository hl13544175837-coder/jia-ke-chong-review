def test_healthcheck_is_available_without_auth(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "ok",
        "service": "zhipin-server",
    }


def test_actuator_info_exposes_only_non_secret_build_identity(client):
    response = client.get("/actuator/info")

    assert response.status_code == 200
    payload = response.get_json()["app"]
    assert payload == {
        "name": "zhipin-server",
        "description": "智聘 · AI 招聘管理系统",
        "version": "local",
        "channel": "local",
        "build_time": "unknown",
        "schema": "20260730_13",
    }
    serialized = str(payload).lower()
    assert "secret" not in serialized
    assert "password" not in serialized
    assert "database" not in serialized
