def test_boss_query_download_rejects_revoked_token(client, make_user, app):
    user_id, token = make_user("boss-query-revoked@example.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import User

        user = db.session.get(User, user_id)
        user.token_version += 1
        db.session.commit()

    response = client.get(f"/api/boss/extension/download?token={token}")

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token revoked"


def test_boss_query_download_sets_current_organization(client, make_user, monkeypatch):
    _, token = make_user("boss-query-org@example.com", role="recruiter", org_id=2)
    observed = {}

    from app.api import boss

    original = boss._require_query_token

    def wrapped():
        from flask import g

        error = original()
        observed["org_id"] = getattr(g, "org_id", None)
        return error

    monkeypatch.setattr(boss, "_require_query_token", wrapped)

    response = client.get(f"/api/boss/extension/download?token={token}")

    assert response.status_code == 200
    assert observed["org_id"] == 2
