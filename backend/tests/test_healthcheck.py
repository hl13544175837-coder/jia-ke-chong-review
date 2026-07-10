def test_healthcheck_is_available_without_auth(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "ok",
        "service": "zhipin-server",
    }
