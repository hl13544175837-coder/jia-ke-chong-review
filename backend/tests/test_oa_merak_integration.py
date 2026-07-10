import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_merak_endpoint_catalog_exposes_reusable_meeting_and_schedule_apis(client, make_user):
    _, token = make_user("oa-catalog@example.com", role="recruiter")

    response = client.get("/api/oa/merak/endpoints", headers=_auth(token))

    assert response.status_code == 200
    body = response.get_json()
    assert body["configured"] is False
    assert body["source_project"] == "merak-front"
    endpoint_keys = {item["key"] for item in body["endpoints"]}
    assert {
        "meeting_room_find_list",
        "meeting_room_reserve",
        "schedule_new",
        "contact_query_sync_wx_emp",
    }.issubset(endpoint_keys)


def test_merak_proxy_requires_configuration_before_calling_company_oa(client, make_user):
    _, token = make_user("oa-proxy@example.com", role="recruiter")

    response = client.post(
        "/api/oa/merak/proxy/meeting_room_find_list",
        headers=_auth(token),
        json={"reserveDate": "2026-07-09"},
    )

    assert response.status_code == 503
    body = response.get_json()
    assert body["ok"] is False
    assert "OA/Merak" in body["error"]


def test_merak_endpoint_catalog_explicitly_marks_semantic_writes(client, make_user):
    _, token = make_user("oa-mutating-catalog@example.com", role="recruiter")

    response = client.get("/api/oa/merak/endpoints", headers=_auth(token))

    assert response.status_code == 200
    endpoints = {item["key"]: item for item in response.get_json()["endpoints"]}
    assert {key for key, item in endpoints.items() if item["mutating"]} == {
        "meeting_room_reserve",
        "meeting_room_update_status",
        "schedule_new",
        "schedule_edit",
        "schedule_delete",
        "schedule_add_notice",
    }
    assert all(isinstance(item["mutating"], bool) for item in endpoints.values())


@pytest.mark.parametrize("endpoint_key", [
    "meeting_room_reserve",
    "meeting_room_update_status",
    "schedule_new",
    "schedule_edit",
    "schedule_delete",
    "schedule_add_notice",
])
def test_merak_generic_proxy_fails_closed_for_semantic_writes_before_network(
    client,
    make_user,
    app,
    monkeypatch,
    endpoint_key,
):
    _, token = make_user(f"oa-write-{endpoint_key}@example.com", role="recruiter")
    app.config.update(
        OA_MERAK_PROXY_ENABLED=True,
        OA_MERAK_BASE_URL="https://oa.example.test",
        OA_MERAK_BEARER_TOKEN="test-token",
    )
    calls = []

    class FakeResponse:
        ok = True
        status_code = 200

        @staticmethod
        def json():
            return {"code": 0}

    def fake_post(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse()

    monkeypatch.setattr("app.services.oa_merak_service.requests.post", fake_post)

    response = client.post(
        f"/api/oa/merak/proxy/{endpoint_key}",
        headers=_auth(token),
        json={"id": "external-resource"},
    )

    assert response.status_code == 403
    assert response.get_json()["ok"] is False
    assert calls == []


def test_merak_generic_proxy_allows_configured_semantic_query(
    client,
    make_user,
    app,
    monkeypatch,
):
    _, token = make_user("oa-query-proxy@example.com", role="recruiter")
    app.config.update(
        OA_MERAK_PROXY_ENABLED=True,
        OA_MERAK_BASE_URL="https://oa.example.test",
        OA_MERAK_BEARER_TOKEN="test-token",
    )
    calls = []

    class FakeResponse:
        ok = True
        status_code = 200

        @staticmethod
        def json():
            return {"code": 0, "rows": []}

    def fake_post(*args, **kwargs):
        calls.append((args, kwargs))
        return FakeResponse()

    monkeypatch.setattr("app.services.oa_merak_service.requests.post", fake_post)

    response = client.post(
        "/api/oa/merak/proxy/meeting_room_find_list",
        headers=_auth(token),
        json={"reserveDate": "2026-07-09"},
    )

    assert response.status_code == 200
    assert response.get_json()["data"] == {"code": 0, "rows": []}
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("base_url", "token"),
    [
        ("https://oa.example.test", ""),
        ("http://oa.example.test", "test-token"),
        ("https://user:password@oa.example.test", "test-token"),
        ("not-a-url", "test-token"),
    ],
)
def test_merak_query_proxy_fails_closed_for_incomplete_or_unsafe_transport_config(
    client,
    make_user,
    app,
    monkeypatch,
    base_url,
    token,
):
    _, auth_token = make_user(
        f"oa-config-{abs(hash((base_url, token)))}@example.com",
        role="recruiter",
    )
    app.config.update(
        OA_MERAK_PROXY_ENABLED=True,
        OA_MERAK_BASE_URL=base_url,
        OA_MERAK_BEARER_TOKEN=token,
    )
    calls = []

    def fake_post(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("unsafe OA configuration must not reach the network")

    monkeypatch.setattr("app.services.oa_merak_service.requests.post", fake_post)

    response = client.post(
        "/api/oa/merak/proxy/meeting_room_find_list",
        headers=_auth(auth_token),
        json={"reserveDate": "2026-07-10"},
    )

    assert response.status_code == 503
    assert response.get_json()["ok"] is False
    assert calls == []


def test_interviewer_cannot_call_merak_proxy_catalog(client, make_user):
    _, token = make_user("oa-interviewer@example.com", role="interviewer")

    response = client.get("/api/oa/merak/endpoints", headers=_auth(token))

    assert response.status_code == 403
