import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}

def test_list_users_admin_only(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(rec_token))
    assert r.status_code == 403  # 非 admin 禁止

def test_admin_lists_and_updates_role(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(admin_token))
    assert r.status_code == 200
    assert "r@x.com" in [u["email"] for u in r.get_json()]
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "manager"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"


def test_admin_user_update_validates_all_fields_before_mutation(client, make_user, app):
    _, admin_token = make_user("atomic-admin@x.com", role="admin")
    target_id, _ = make_user("atomic-target@x.com", role="recruiter")

    response = client.patch(
        f"/api/admin/users/{target_id}",
        headers=_auth(admin_token),
        json={"role": "manager", "is_active": "false"},
    )

    assert response.status_code == 400
    with app.app_context():
        from app import db
        from app.models import Event, User

        target = db.session.get(User, target_id)
        assert target.role == "recruiter"
        assert target.is_active is True
        assert Event.query.filter_by(
            action="user.role_changed", entity_id=target_id
        ).count() == 0


def test_admin_role_change_revokes_existing_token(client, make_user):
    _, admin_token = make_user("role-revoke-admin@x.com", role="admin")
    target_id, target_token = make_user("role-revoke-target@x.com", role="recruiter")

    changed = client.patch(
        f"/api/admin/users/{target_id}",
        headers=_auth(admin_token),
        json={"role": "manager"},
    )
    after = client.get("/api/auth/me", headers=_auth(target_token))

    assert changed.status_code == 200
    assert after.status_code == 401
    assert after.get_json()["error"] == "Token revoked"

def test_admin_creates_user_and_new_user_can_login(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    r = client.post("/api/admin/users", headers=_auth(admin_token), json={
        "name": "业务面试官",
        "email": "interviewer-new@x.com",
        "password": "pw123456",
        "role": "interviewer",
    })
    assert r.status_code == 201
    body = r.get_json()
    assert body["email"] == "interviewer-new@x.com"
    assert body["role"] == "interviewer"
    assert body["is_active"] is True

    login = client.post("/api/auth/login", json={
        "email": "interviewer-new@x.com",
        "password": "pw123456",
    })
    assert login.status_code == 200


def test_admin_create_user_rolls_back_when_audit_event_fails(
    app, client, make_user, monkeypatch
):
    _, admin_token = make_user("create-audit-admin@x.com", role="admin")

    from app import db
    from app.api import admin as admin_api
    from app.models import Event, User

    def fail_audit_event(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(admin_api, "record_event", fail_audit_event)

    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            "/api/admin/users",
            headers=_auth(admin_token),
            json={
                "name": "审计失败用户",
                "email": "create-audit-target@x.com",
                "password": "pw123456",
                "role": "interviewer",
            },
        )

    with app.app_context():
        db.session.remove()
        assert User.query.filter_by(email="create-audit-target@x.com").count() == 0
        assert Event.query.filter_by(action="user.created").count() == 0


def test_admin_resets_user_password(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("reset@x.com", role="recruiter", password="oldpw123")

    r = client.post(
        f"/api/admin/users/{target_id}/reset-password",
        headers=_auth(admin_token),
        json={"password": "newpw123"},
    )
    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"

    old_login = client.post("/api/auth/login", json={
        "email": "reset@x.com",
        "password": "oldpw123",
    })
    assert old_login.status_code == 401

    new_login = client.post("/api/auth/login", json={
        "email": "reset@x.com",
        "password": "newpw123",
    })
    assert new_login.status_code == 200


def test_admin_reset_password_revokes_existing_token(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, target_token = make_user("reset-token@x.com", role="recruiter", password="oldpw123")

    before = client.get("/api/auth/me", headers=_auth(target_token))
    assert before.status_code == 200

    r = client.post(
        f"/api/admin/users/{target_id}/reset-password",
        headers=_auth(admin_token),
        json={"password": "newpw123"},
    )
    assert r.status_code == 200

    after = client.get("/api/auth/me", headers=_auth(target_token))
    assert after.status_code == 401

    new_login = client.post("/api/auth/login", json={
        "email": "reset-token@x.com",
        "password": "newpw123",
    })
    assert new_login.status_code == 200


def test_admin_reset_password_rolls_back_when_audit_event_fails(
    app, client, make_user, monkeypatch
):
    _, admin_token = make_user("reset-audit-admin@x.com", role="admin")
    target_id, _ = make_user(
        "reset-audit-target@x.com", role="recruiter", password="oldpw123"
    )

    from app import db
    from app.api import admin as admin_api
    from app.models import Event, User

    with app.app_context():
        target = db.session.get(User, target_id)
        original_password_hash = target.password_hash
        original_token_version = target.token_version

    def fail_audit_event(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(admin_api, "record_event", fail_audit_event)

    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            f"/api/admin/users/{target_id}/reset-password",
            headers=_auth(admin_token),
            json={"password": "newpw123"},
        )

    with app.app_context():
        db.session.remove()
        target = db.session.get(User, target_id)
        assert target.password_hash == original_password_hash
        assert target.token_version == original_token_version
        assert Event.query.filter_by(
            action="user.password_reset", entity_id=target_id
        ).count() == 0

def test_admin_deactivates_user(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"is_active": False})
    assert r.status_code == 200
    assert r.get_json()["is_active"] is False

def test_invalid_role_rejected(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "superuser"})
    assert r.status_code == 400

def test_patch_user_not_found(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    r = client.patch("/api/admin/users/99999", headers=_auth(admin_token),
                     json={"role": "manager"})
    assert r.status_code == 404

def test_patch_forbidden_for_non_admin(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    target_id, _ = make_user("t@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(rec_token),
                     json={"role": "manager"})
    assert r.status_code == 403

def test_admin_cannot_self_deactivate(client, make_user):
    admin_id, admin_token = make_user("a@x.com", role="admin")
    r = client.patch(f"/api/admin/users/{admin_id}", headers=_auth(admin_token),
                     json={"is_active": False})
    assert r.status_code == 400
