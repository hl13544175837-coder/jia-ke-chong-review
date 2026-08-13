def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_ai_architecture_dashboard_admin_only(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/ai-architecture", headers=_auth(rec_token))
    assert r.status_code == 403


def test_admin_ai_architecture_dashboard_exposes_only_safe_tools(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")

    r = client.get("/api/admin/ai-architecture", headers=_auth(admin_token))

    assert r.status_code == 200
    body = r.get_json()
    assert {t["name"] for t in body["read_tools"]} >= {
        "list_candidates",
        "get_candidate",
        "count_summary",
    }
    assert {t["name"] for t in body["write_tools"]} == {"run_match"}
    assert body["permission_model"]["database_access"] is True
    assert body["permission_model"]["write_requires_confirmation"] is True
    assert body["permission_model"]["read_tools_available_to_authenticated_users"] is False
