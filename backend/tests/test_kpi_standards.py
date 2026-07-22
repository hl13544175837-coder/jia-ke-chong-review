def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _custom_config():
    return {
        "block_categories": [
            {"id": "requirements", "name": "需求不清晰", "keywords": ["需求模糊", "画像变化"]},
            {"id": "feedback", "name": "反馈延迟", "keywords": ["未反馈", "拖延"]},
            {"id": "other", "name": "其他原因", "keywords": []},
        ],
        "risk_thresholds": {
            "high_if_status_paused_or_closed": True,
            "high_if_zero_fill_and_blocked": True,
            "attention_hc_gap_ratio": 0.6,
            "attention_if_blocked": True,
            "deadline_warning_days": 10,
            "stale_stage_days": 5,
            "no_recommendation_days": 4,
            "low_interview_candidate_threshold": 12,
            "open_too_long_days": 45,
        },
        "process_health_thresholds": {
            "green_threshold": 75,
            "yellow_threshold": 45,
        },
    }


def _effective_custom_config():
    config = _custom_config()
    return {
        "block_categories": config["block_categories"],
        "risk_thresholds": {
            key: config["risk_thresholds"][key]
            for key in (
                "deadline_warning_days",
                "stale_stage_days",
                "no_recommendation_days",
                "low_interview_candidate_threshold",
                "open_too_long_days",
            )
        },
    }


def test_kpi_standards_are_org_scoped_versioned_and_audited(client, make_user, app):
    manager_id, manager_token = make_user(
        "kpi-manager@example.com",
        role="manager",
        name="招聘主管",
    )
    _, admin_token = make_user("kpi-admin@example.com", role="admin")
    _, other_org_manager_token = make_user(
        "kpi-other@example.com",
        role="manager",
        org_id=2,
    )

    defaults = client.get("/api/kpi-standards", headers=_auth(manager_token))
    assert defaults.status_code == 200
    assert defaults.get_json()["version"] == 0
    assert "process_health_thresholds" not in defaults.get_json()["config"]

    saved = client.put(
        "/api/kpi-standards",
        headers=_auth(manager_token),
        json={"version": 0, "config": _custom_config()},
    )
    assert saved.status_code == 200
    assert saved.get_json()["version"] == 1
    assert saved.get_json()["updated_by"] == manager_id
    assert saved.get_json()["updated_by_name"] == "招聘主管"

    after_refresh = client.get("/api/kpi-standards", headers=_auth(admin_token))
    assert after_refresh.status_code == 200
    assert after_refresh.get_json()["config"] == _effective_custom_config()

    other_org = client.get("/api/kpi-standards", headers=_auth(other_org_manager_token))
    assert other_org.status_code == 200
    assert other_org.get_json()["version"] == 0
    assert other_org.get_json()["config"] != _effective_custom_config()

    stale = client.put(
        "/api/kpi-standards",
        headers=_auth(admin_token),
        json={"version": 0, "config": _custom_config()},
    )
    assert stale.status_code == 409
    assert stale.get_json()["code"] == "kpi_standards_version_conflict"

    reset = client.post(
        "/api/kpi-standards/reset",
        headers=_auth(admin_token),
        json={"version": 1},
    )
    assert reset.status_code == 200
    assert reset.get_json()["version"] == 2
    assert reset.get_json()["config"]["risk_thresholds"]["deadline_warning_days"] == 14

    with app.app_context():
        from app.models import Event, KpiStandard

        row = KpiStandard.query.filter_by(org_id=1).one()
        assert row.version == 2
        assert [
            item.action
            for item in Event.query.filter(Event.action.like("kpi_standards.%")).order_by(Event.id).all()
        ] == ["kpi_standards.updated", "kpi_standards.reset"]


def test_kpi_standards_reject_unauthorized_and_invalid_writes(client, make_user):
    _, recruiter_token = make_user("kpi-recruiter@example.com", role="recruiter")
    _, interviewer_token = make_user("kpi-interviewer@example.com", role="interviewer")
    _, manager_token = make_user("kpi-manager-invalid@example.com", role="manager")

    assert client.get("/api/kpi-standards", headers=_auth(recruiter_token)).status_code == 403
    assert client.get("/api/kpi-standards", headers=_auth(interviewer_token)).status_code == 403

    invalid = _custom_config()
    invalid["block_categories"][0]["name"] = ""
    invalid["risk_thresholds"]["deadline_warning_days"] = 0
    invalid["process_health_thresholds"] = {
        "green_threshold": 30,
        "yellow_threshold": 60,
    }
    response = client.put(
        "/api/kpi-standards",
        headers=_auth(manager_token),
        json={"version": 0, "config": invalid},
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_kpi_standards"
    assert set(response.get_json()["fields"]) == {
        "block_categories.0.name",
        "risk_thresholds.deadline_warning_days",
    }
