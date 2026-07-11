def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_json_write_replay_with_same_idempotency_key_returns_first_result(client, make_user, app):
    _, admin_token = make_user("idem-admin@example.com", role="admin")
    headers = {
        **_auth(admin_token),
        "Idempotency-Key": "create-user:idem-replay",
    }
    payload = {
        "name": "幂等用户",
        "email": "idem-user@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }

    first = client.post("/api/admin/users", headers=headers, json=payload)
    second = client.post("/api/admin/users", headers=headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.headers["X-Idempotent-Replay"] == "true"
    assert second.get_json()["id"] == first.get_json()["id"]
    with app.app_context():
        from app.models import User

        assert User.query.filter_by(email="idem-user@example.com").count() == 1


def test_same_idempotency_key_with_different_body_is_rejected(client, make_user, app):
    _, admin_token = make_user("idem-admin-conflict@example.com", role="admin")
    headers = {
        **_auth(admin_token),
        "Idempotency-Key": "create-user:idem-conflict",
    }
    first_payload = {
        "name": "第一位",
        "email": "idem-conflict-a@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }
    second_payload = {
        "name": "第二位",
        "email": "idem-conflict-b@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }

    first = client.post("/api/admin/users", headers=headers, json=first_payload)
    second = client.post("/api/admin/users", headers=headers, json=second_payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert "Idempotency-Key" in second.get_json()["error"]
    with app.app_context():
        from app.models import User

        assert User.query.filter_by(email="idem-conflict-a@example.com").count() == 1
        assert User.query.filter_by(email="idem-conflict-b@example.com").count() == 0


def test_idempotent_replay_cannot_bypass_role_change(client, make_user):
    actor_id, actor_token = make_user("idem-role-actor@example.com", role="admin")
    _, controlling_admin_token = make_user("idem-role-controller@example.com", role="admin")
    headers = {
        **_auth(actor_token),
        "Idempotency-Key": "create-user:before-role-change",
    }
    payload = {
        "name": "只创建一次",
        "email": "idem-before-role-change@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }
    first = client.post("/api/admin/users", headers=headers, json=payload)
    changed = client.patch(
        f"/api/admin/users/{actor_id}",
        headers=_auth(controlling_admin_token),
        json={"role": "recruiter"},
    )
    replay = client.post("/api/admin/users", headers=headers, json=payload)

    assert first.status_code == 201
    assert changed.status_code == 200
    assert replay.status_code == 401
    assert replay.get_json()["error"] == "Token revoked"
    assert "X-Idempotent-Replay" not in replay.headers


def test_idempotent_replay_cannot_bypass_account_deactivation(client, make_user):
    actor_id, actor_token = make_user("idem-inactive-actor@example.com", role="admin")
    _, controlling_admin_token = make_user("idem-inactive-controller@example.com", role="admin")
    headers = {
        **_auth(actor_token),
        "Idempotency-Key": "create-user:before-deactivation",
    }
    payload = {
        "name": "停用前创建",
        "email": "idem-before-deactivation@example.com",
        "password": "pw123456",
        "role": "recruiter",
    }
    first = client.post("/api/admin/users", headers=headers, json=payload)
    deactivated = client.patch(
        f"/api/admin/users/{actor_id}",
        headers=_auth(controlling_admin_token),
        json={"is_active": False},
    )
    replay = client.post("/api/admin/users", headers=headers, json=payload)

    assert first.status_code == 201
    assert deactivated.status_code == 200
    assert replay.status_code == 403
    assert "X-Idempotent-Replay" not in replay.headers
