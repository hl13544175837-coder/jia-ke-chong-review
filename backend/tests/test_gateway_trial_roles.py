import pytest
from sqlalchemy.exc import IntegrityError

from app import db
from app.models import User
from app.services.gateway_role_service import (
    parse_gateway_role_map,
    resolve_gateway_role,
)


def test_gateway_role_map_is_case_insensitive_and_rejects_unknown_roles():
    assert parse_gateway_role_map(
        "EMP001:admin, emp002:interviewer, EMP003:unknown, broken"
    ) == {
        "EMP001": "admin",
        "EMP002": "interviewer",
    }


def test_gateway_role_resolution_uses_least_privilege_fallback():
    raw = "EMP001:manager,EMP002:hr_director"

    assert resolve_gateway_role("emp001", raw) == ("manager", True)
    assert resolve_gateway_role("not-mapped", raw) == ("recruiter", False)
    assert resolve_gateway_role("not-mapped", raw, fallback="interviewer") == (
        "interviewer",
        False,
    )
    assert resolve_gateway_role("not-mapped", raw, fallback="owner") == (
        "recruiter",
        False,
    )


def test_gateway_request_creates_and_synchronizes_explicitly_mapped_user(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP="EMP001:interviewer",
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "emp001"})
    assert response.status_code == 200

    with app.app_context():
        user = User.query.filter_by(email="emp001@gateway.local").one()
        assert user.role == "interviewer"
        user.role = "admin"
        db.session.commit()

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "EMP001"})
    assert response.status_code == 200
    with app.app_context():
        assert User.query.filter_by(email="emp001@gateway.local").one().role == "interviewer"


def test_unmapped_gateway_user_defaults_to_recruiter(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP="EMP001:admin",
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "EMP999"})

    assert response.status_code == 200
    with app.app_context():
        user = User.query.filter_by(email="emp999@gateway.local").one()
        assert user.role == "recruiter"


def test_gateway_interviewer_owner_options_exclude_local_demo_accounts(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP="100002:recruiter,100003:interviewer",
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )
    with app.app_context():
        db.session.add(User(
            name="演示账号·招聘专员01",
            email="hr01@mvp.local",
            role="recruiter",
            password_hash="!local-demo",
            org_id=1,
            is_active=True,
        ))
        db.session.add(User(
            name="其他网关招聘专员",
            email="100098@gateway.local",
            role="recruiter",
            password_hash="!gateway-managed",
            org_id=1,
            is_active=True,
        ))
        db.session.commit()

    assert client.get("/api/auth/me", headers={"X-Emp-Code": "100002"}).status_code == 200
    with app.app_context():
        gateway_recruiter_id = User.query.filter_by(
            email="100002@gateway.local"
        ).one().id
    response = client.get(
        "/api/candidates/owner-options",
        headers={"X-Emp-Code": "100003"},
    )

    assert response.status_code == 200
    assert response.get_json() == [
        {
            "id": gateway_recruiter_id,
            "name": "李亚辉",
            "email": "100002@gateway.local",
        }
    ]


def test_gateway_account_choices_only_show_the_four_sit_accounts(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP=(
            "100000:interviewer,100001:manager,100002:recruiter,100003:interviewer"
        ),
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )
    with app.app_context():
        db.session.add_all([
            User(
                name="演示面试官",
                email="interviewer01@mvp.local",
                role="interviewer",
                password_hash="!local-demo",
                org_id=1,
                is_active=True,
            ),
            User(
                name="其他网关用户",
                email="100099@gateway.local",
                role="interviewer",
                password_hash="!gateway-managed",
                org_id=1,
                is_active=True,
            ),
        ])
        db.session.commit()

    for emp_code in ("100000", "100001", "100002", "100003"):
        assert client.get(
            "/api/auth/me", headers={"X-Emp-Code": emp_code}
        ).status_code == 200

    response = client.get(
        "/api/interview/interviewers", headers={"X-Emp-Code": "100001"}
    )

    assert response.status_code == 200
    assert response.get_json() == [
        {
            "id": User.query.filter_by(email="100000@gateway.local").one().id,
            "name": "贵磊",
            "email": "100000@gateway.local",
            "role": "interviewer",
        },
        {
            "id": User.query.filter_by(email="100001@gateway.local").one().id,
            "name": "洪通",
            "email": "100001@gateway.local",
            "role": "manager",
        },
        {
            "id": User.query.filter_by(email="100003@gateway.local").one().id,
            "name": "王杰",
            "email": "100003@gateway.local",
            "role": "interviewer",
        },
    ]


def test_gateway_user_provision_does_not_hide_unrelated_database_failures(
    app, monkeypatch
):
    """只有唯一键并发冲突可重查；连接等真实故障必须原样暴露。"""
    from app.middleware.auth import _provision_gateway_user

    with app.test_request_context("/api/auth/me"):
        monkeypatch.setattr(
            db.session,
            "commit",
            lambda: (_ for _ in ()).throw(RuntimeError("database unavailable")),
        )

        with pytest.raises(RuntimeError, match="database unavailable"):
            _provision_gateway_user("EMP-DB-FAIL")


def test_gateway_user_provision_recovers_only_the_expected_unique_key_race(
    app, monkeypatch
):
    """两个首请求撞同一工号时可重查赢家，不需要额外通用兜底。"""
    from app.middleware.auth import _provision_gateway_user

    with app.test_request_context("/api/auth/me"):
        winner = User(
            org_id=1,
            name="EMP-RACE",
            email="emp-race@gateway.local",
            role="recruiter",
            password_hash="!gateway-managed",
            is_active=True,
        )
        original_commit = db.session.commit
        commit_calls = 0

        def collide_once():
            nonlocal commit_calls
            commit_calls += 1
            if commit_calls == 1:
                raise IntegrityError("insert", {}, Exception("unique"))
            return original_commit()

        original_rollback = db.session.rollback

        def install_winner_after_rollback():
            original_rollback()
            db.session.add(winner)
            original_commit()

        monkeypatch.setattr(db.session, "commit", collide_once)
        monkeypatch.setattr(db.session, "rollback", install_winner_after_rollback)

        resolved = _provision_gateway_user("EMP-RACE")

        assert resolved.id == winner.id
        assert resolved.email == "emp-race@gateway.local"
