def test_register_ignores_role_forces_recruiter(client):
    r = client.post("/api/auth/register", json={
        "name": "Mallory", "email": "m@x.com", "password": "pw123456", "role": "admin"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "recruiter"  # 自封 admin 被拒绝，落库为 recruiter

def test_deactivated_user_cannot_login(client, make_user):
    make_user("dead@x.com", role="recruiter", password="pw123456", is_active=False)
    r = client.post("/api/auth/login", json={"email": "dead@x.com", "password": "pw123456"})
    assert r.status_code == 403
    assert "停用" in r.get_json()["error"]

def test_active_user_can_login(client, make_user):
    user_id, _ = make_user("ok@x.com", role="manager", password="pw123456")
    r = client.post("/api/auth/login", json={"email": "ok@x.com", "password": "pw123456"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"
    assert r.get_json()["user_id"] == user_id


def test_login_rejects_non_string_password_without_server_error(client, make_user):
    make_user("typed-password@x.com", password="pw123456")

    for password in (123456, True, [], {}):
        response = client.post(
            "/api/auth/login",
            json={"email": "typed-password@x.com", "password": password},
        )

        assert response.status_code == 401
        assert response.get_json() == {"error": "Invalid credentials"}


def test_login_rejects_non_object_json_and_non_string_email(client, make_user):
    make_user("typed-login@x.com", password="pw123456")

    payloads = (
        [],
        "typed-login@x.com",
        123456,
        {"email": ["typed-login@x.com"], "password": "pw123456"},
        {"email": {"value": "typed-login@x.com"}, "password": "pw123456"},
    )
    for payload in payloads:
        response = client.post("/api/auth/login", json=payload)

        assert response.status_code == 401
        assert response.get_json() == {"error": "Invalid credentials"}


def test_register_rejects_non_object_json_without_server_error(client):
    for payload in ([], "bad-register", 123456):
        response = client.post("/api/auth/register", json=payload)

        assert response.status_code == 400
        assert response.get_json() == {"error": "email and password required"}


def test_register_rejects_non_string_name_without_server_error(client):
    response = client.post(
        "/api/auth/register",
        json={"name": ["bad"], "email": "bad-name@x.com", "password": "pw123456"},
    )

    assert response.status_code == 400


def test_change_password_rejects_non_object_and_non_string_values(client, make_user):
    _, token = make_user("typed-change@x.com", password="oldpw123")
    headers = {"Authorization": f"Bearer {token}"}
    payloads = (
        [],
        "bad-change",
        123456,
        {"old_password": "oldpw123", "new_password": 123456},
        {"old_password": ["oldpw123"], "new_password": "newpw123"},
    )

    for payload in payloads:
        response = client.post("/api/auth/change-password", headers=headers, json=payload)

        assert response.status_code == 400

def test_register_empty_body_returns_400(client):
    r = client.post("/api/auth/register", json={})
    assert r.status_code == 400


def test_deactivated_user_token_is_rejected(client, make_user, app):
    user_id, token = make_user("token-dead@x.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import User

        user = db.session.get(User, user_id)
        user.is_active = False
        db.session.commit()

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_role_change_takes_effect_without_waiting_for_token_expiry(client, make_user, app):
    user_id, token = make_user("token-role@x.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import User

        user = db.session.get(User, user_id)
        user.role = "recruiter"
        db.session.commit()

    r = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_change_password_revokes_existing_token(client, make_user):
    _, token = make_user("self-reset@x.com", role="recruiter", password="oldpw123")

    before = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert before.status_code == 200

    changed = client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"old_password": "oldpw123", "new_password": "newpw123"},
    )
    assert changed.status_code == 200

    after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert after.status_code == 401

    new_login = client.post("/api/auth/login", json={
        "email": "self-reset@x.com",
        "password": "newpw123",
    })
    assert new_login.status_code == 200


def test_token_with_invalid_version_is_rejected(client, make_user):
    import jwt
    from datetime import UTC, datetime, timedelta
    from app.config import TestingConfig

    user_id, _ = make_user("bad-version@x.com", role="recruiter")
    token = jwt.encode(
        {
            "user_id": user_id,
            "role": "recruiter",
            "token_version": "bad",
            "exp": datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
        },
        TestingConfig.JWT_SECRET,
        algorithm="HS256",
    )

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_auth_disabled_does_not_bypass_auth_in_production(app):
    from app.middleware.auth import _auth_disabled

    app.config.update(
        AUTH_DISABLED=True,
        TESTING=False,
        FLASK_DEBUG=False,
        ALLOW_INSECURE_SIT_STARTUP=False,
    )

    with app.test_request_context("/api/auth/me"):
        assert _auth_disabled() is False


def test_require_auth_exposes_the_user_it_already_validated(app, client, make_user):
    """接口应复用鉴权层查到的用户，不应再查询并防御“不存在”的死分支。"""
    from flask import g, jsonify
    from app.middleware.auth import require_auth

    user_id, token = make_user("auth-context@example.com", role="recruiter")

    @app.get("/_test/authenticated-user")
    @require_auth
    def authenticated_user_probe():
        return jsonify({
            "id": g.authenticated_user.id,
            "role": g.authenticated_user.role,
        })

    response = client.get(
        "/_test/authenticated-user",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"id": user_id, "role": "recruiter"}
    assert "authenticated_user" not in g


def test_auth_me_reuses_the_single_user_lookup(
    app, client, make_user, monkeypatch
):
    from app import db

    _, token = make_user("single-auth-query@example.com", role="recruiter")
    original_get = db.session.get
    calls = []

    def track_get(model, identifier, *args, **kwargs):
        calls.append((model, identifier))
        return original_get(model, identifier, *args, **kwargs)

    monkeypatch.setattr(db.session, "get", track_get)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert len(calls) == 1
