def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_admin_settings_and_user_department_persist_with_version_guard(client, make_user):
    admin_id, admin_token = make_user("settings-admin@example.com", role="admin", org_id=1)
    _, other_admin_token = make_user("settings-other@example.com", role="admin", org_id=1)
    _, recruiter_token = make_user("settings-recruiter@example.com", role="recruiter", org_id=1)

    assert client.get("/api/admin/settings", headers=_auth(recruiter_token)).status_code == 403
    initial = client.get("/api/admin/settings", headers=_auth(admin_token))
    assert initial.status_code == 200
    assert initial.get_json()["version"] == 0

    saved = client.put(
        "/api/admin/settings",
        headers=_auth(admin_token),
        json={
            "version": 0,
            "config": {
                "company_name": "智聘试点公司",
                "system_name": "智聘",
                "default_recruitment_cycle_days": 45,
                "offer_validity_days": 10,
                "departments": ["技术部", "产品部"],
            },
        },
    )
    assert saved.status_code == 200
    assert saved.get_json()["version"] == 1
    assert saved.get_json()["config"]["departments"] == ["技术部", "产品部"]

    stale = client.put(
        "/api/admin/settings",
        headers=_auth(other_admin_token),
        json={"version": 0, "config": saved.get_json()["config"]},
    )
    assert stale.status_code == 409
    assert stale.get_json()["code"] == "settings_version_conflict"

    created = client.post(
        "/api/admin/users",
        headers=_auth(admin_token),
        json={
            "name": "设置验收招聘专员",
            "email": "settings-user@example.com",
            "password": "pw123456",
            "role": "recruiter",
            "department": "产品部",
        },
    )
    assert created.status_code == 201
    user = created.get_json()
    assert user["department"] == "产品部"

    changed = client.patch(
        f"/api/admin/users/{user['id']}",
        headers=_auth(admin_token),
        json={"department": "技术部"},
    )
    assert changed.status_code == 200
    assert changed.get_json()["department"] == "技术部"

    reloaded = client.get("/api/admin/settings", headers=_auth(other_admin_token))
    assert reloaded.status_code == 200
    assert reloaded.get_json()["config"]["default_recruitment_cycle_days"] == 45

    with_admin = client.get("/api/admin/users", headers=_auth(admin_token))
    assert next(item for item in with_admin.get_json() if item["id"] == user["id"])["department"] == "技术部"
