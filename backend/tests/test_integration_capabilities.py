EXPECTED_CAPABILITY_CODES = {
    "recruitment_demand_oa",
    "wecom_material_delivery",
    "wecom_calendar",
    "wecom_scorecard_delivery",
    "meeting_arrangement",
    "offer_oa",
    "offer_delivery",
    "hris_onboarding",
}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_integration_capabilities_require_auth(client):
    response = client.get("/api/integrations/capabilities")

    assert response.status_code == 401


def test_integration_capabilities_require_admin(client, make_user):
    for role in ("recruiter", "manager", "interviewer"):
        _, token = make_user(f"integration-{role}@example.com", role=role)

        response = client.get(
            "/api/integrations/capabilities",
            headers=_auth(token),
        )

        assert response.status_code == 403


def test_integration_capabilities_list_the_target_mode_boundaries(client, make_user):
    _, token = make_user("integration-admin@example.com", role="admin")

    response = client.get(
        "/api/integrations/capabilities",
        headers=_auth(token),
    )

    assert response.status_code == 200
    capabilities = response.get_json()["items"]
    assert {item["code"] for item in capabilities} == EXPECTED_CAPABILITY_CODES
    assert len(capabilities) == len(EXPECTED_CAPABILITY_CODES)

    by_code = {item["code"]: item for item in capabilities}
    assert any("MQ" in item for item in by_code["recruitment_demand_oa"]["required_inputs"])
    assert any("回调域名" in item for item in by_code["wecom_calendar"]["required_inputs"])

    for capability in capabilities:
        assert set(capability) == {
            "code",
            "name",
            "owner",
            "mode",
            "health",
            "description",
            "required_inputs",
        }
        assert capability["name"]
        assert capability["owner"]
        assert capability["description"]
        assert capability["required_inputs"]


def test_unconfigured_capabilities_never_report_fake_success(client, make_user):
    _, token = make_user("integration-status@example.com", role="admin")

    response = client.get(
        "/api/integrations/capabilities",
        headers=_auth(token),
    )

    assert response.status_code == 200
    for capability in response.get_json()["items"]:
        assert capability["mode"] == "manual_bridge"
        assert capability["health"] == "unconfigured"


def test_one_broken_adapter_does_not_hide_other_capabilities(
    client,
    make_user,
    monkeypatch,
):
    from app.services import integration_capability_service

    class BrokenAdapter:
        capability_code = "offer_oa"

        def runtime_status(self):
            raise RuntimeError("connection failed")

    monkeypatch.setattr(
        integration_capability_service,
        "get_adapter",
        lambda code: BrokenAdapter() if code == "offer_oa" else None,
    )
    _, token = make_user("integration-isolation@example.com", role="admin")

    response = client.get(
        "/api/integrations/capabilities",
        headers=_auth(token),
    )

    assert response.status_code == 200
    by_code = {item["code"]: item for item in response.get_json()["items"]}
    assert len(by_code) == len(EXPECTED_CAPABILITY_CODES)
    assert by_code["offer_oa"]["mode"] == "manual_bridge"
    assert by_code["offer_oa"]["health"] == "unavailable"
    assert by_code["hris_onboarding"]["health"] == "unconfigured"
