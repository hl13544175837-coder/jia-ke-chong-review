from datetime import UTC, datetime, timedelta

import jwt


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, email, password="pw123456"):
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.get_json()["token"]


def _issue_agent_token(client, login_token, **headers):
    response = client.post(
        "/api/agent-imports/token",
        headers={**_bearer(login_token), **headers},
    )
    assert response.status_code == 200
    return response.get_json()


def _make_demand(app, owner_id, *, org_id=1):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        job = Job(
            org_id=org_id,
            title="Java开发",
            jd_text="Java",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=org_id,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="Java开发",
            request_no=f"REQ-AGENT-AUTH-{owner_id}",
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        return demand.id


def _online_resume_item(demand_id, *, owner_hr_id=None):
    item = {
        "external_record_id": "boss-auth-001",
        "demand_id": demand_id,
        "boss_account": "招聘专员-BOSS账号",
        "source_platform": "BOSS直聘",
        "display_name": "Agent导入候选人",
        "source_url": "https://www.zhipin.com/web/chat/index",
        "resume_json": {"extracted_info": {"name": "Agent导入候选人"}},
        "resume_text": "Agent导入候选人的完整在线简历原文。",
        "chat_json": [
            {
                "sender": "candidate",
                "text": "可以了解",
                "sent_at": "2026-08-07T09:00:00+08:00",
            }
        ],
    }
    if owner_hr_id is not None:
        item["owner_hr_id"] = owner_hr_id
    return item


def test_recruiter_issues_30_day_agent_import_token_with_server_identity(
    client, make_user, app
):
    user_id, _ = make_user(
        "agent-token-owner@example.com",
        role="recruiter",
        org_id=7,
    )
    login_token = _login(client, "agent-token-owner@example.com")

    result = _issue_agent_token(client, login_token)
    payload = jwt.decode(
        result["token"],
        app.config["JWT_SECRET"],
        algorithms=["HS256"],
    )

    assert result["scope"] == "agent_import"
    assert payload["scope"] == "agent_import"
    assert payload["user_id"] == user_id
    assert payload["org_id"] == 7
    assert payload["token_version"] == 0
    assert timedelta(days=29, hours=23) < (
        datetime.fromtimestamp(payload["exp"], UTC)
        - datetime.fromtimestamp(payload["iat"], UTC)
    ) <= timedelta(days=30)


def test_only_recruiter_can_issue_agent_import_token(client, make_user):
    for role in ("manager", "admin", "interviewer"):
        email = f"agent-token-{role}@example.com"
        make_user(email, role=role)
        login_token = _login(client, email)

        response = client.post(
            "/api/agent-imports/token",
            headers=_bearer(login_token),
        )

        assert response.status_code == 403


def test_login_token_cannot_import_but_scoped_token_can_reach_both_import_routes(
    client, make_user
):
    make_user("agent-token-boundary@example.com", role="recruiter")
    login_token = _login(client, "agent-token-boundary@example.com")

    ordinary_online = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(login_token),
        json={"items": []},
    )
    ordinary_full = client.post(
        "/api/agent-imports/full-resumes",
        headers=_bearer(login_token),
    )

    agent_token = _issue_agent_token(client, login_token)["token"]
    scoped_online = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(agent_token),
        json={"items": []},
    )
    scoped_full = client.post(
        "/api/agent-imports/full-resumes",
        headers=_bearer(agent_token),
    )

    assert ordinary_online.status_code == 403
    assert ordinary_full.status_code == 403
    assert scoped_online.status_code == 400
    assert scoped_full.status_code == 400


def test_legacy_test_fixture_token_never_bypasses_scope_in_production(
    client, make_user, app
):
    _, fixture_token = make_user(
        "agent-token-no-production-bypass@example.com",
        role="recruiter",
    )
    app.config["TESTING"] = False

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(fixture_token),
        json={"items": []},
    )

    assert response.status_code == 403


def test_agent_import_token_cannot_access_normal_authenticated_routes(
    client, make_user
):
    make_user("agent-token-narrow@example.com", role="recruiter")
    login_token = _login(client, "agent-token-narrow@example.com")
    agent_token = _issue_agent_token(client, login_token)["token"]

    assert client.get(
        "/api/auth/me",
        headers=_bearer(agent_token),
    ).status_code == 403
    assert client.get(
        "/api/online-resumes",
        headers=_bearer(agent_token),
    ).status_code == 403


def test_agent_import_token_uses_server_user_and_ignores_requested_owner(
    client, make_user, app
):
    owner_id, _ = make_user(
        "agent-token-server-owner@example.com",
        role="recruiter",
        org_id=3,
    )
    other_id, _ = make_user(
        "agent-token-request-owner@example.com",
        role="recruiter",
        org_id=3,
    )
    demand_id = _make_demand(app, owner_id, org_id=3)
    login_token = _login(client, "agent-token-server-owner@example.com")
    agent_token = _issue_agent_token(client, login_token)["token"]

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(agent_token),
        json={"items": [_online_resume_item(demand_id, owner_hr_id=other_id)]},
    )

    assert response.status_code == 200
    with app.app_context():
        from app.models import OnlineResume

        imported = OnlineResume.query.one()
        assert imported.owner_hr_id == owner_id
        assert imported.org_id == 3


def test_agent_import_token_is_revoked_by_deactivation_and_token_version_change(
    client, make_user, app
):
    user_id, _ = make_user("agent-token-revoke@example.com", role="recruiter")
    login_token = _login(client, "agent-token-revoke@example.com")
    agent_token = _issue_agent_token(client, login_token)["token"]

    with app.app_context():
        from app import db
        from app.models import User

        user = db.session.get(User, user_id)
        user.is_active = False
        db.session.commit()

    deactivated = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(agent_token),
        json={"items": []},
    )
    assert deactivated.status_code == 403

    with app.app_context():
        from app import db
        from app.models import User

        user = db.session.get(User, user_id)
        user.is_active = True
        user.token_version = 1
        db.session.commit()

    revoked = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(agent_token),
        json={"items": []},
    )
    assert revoked.status_code == 401


def test_expired_agent_import_token_is_rejected(client, make_user, app):
    user_id, _ = make_user("agent-token-expired@example.com", role="recruiter")
    expired_token = jwt.encode(
        {
            "user_id": user_id,
            "token_version": 0,
            "org_id": 1,
            "scope": "agent_import",
            "exp": datetime.now(UTC) - timedelta(seconds=1),
        },
        app.config["JWT_SECRET"],
        algorithm="HS256",
    )

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_bearer(expired_token),
        json={"items": []},
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token expired"


def test_token_response_is_not_persisted_in_audit_or_idempotency_payload(
    client, make_user, app, caplog
):
    make_user("agent-token-secret@example.com", role="recruiter")
    login_token = _login(client, "agent-token-secret@example.com")

    result = _issue_agent_token(client, login_token)
    issued_token = result["token"]

    with app.app_context():
        from app.models import AuditLog, Event, IdempotencyRecord

        assert Event.query.count() == 0
        assert AuditLog.query.count() == 0
        assert all(
            issued_token not in str(event.payload)
            for event in Event.query.all()
        )
        assert all(
            issued_token not in str(record.response_json)
            for record in IdempotencyRecord.query.all()
        )
    assert issued_token not in caplog.text


def test_token_endpoint_refuses_idempotency_storage(client, make_user, app):
    make_user("agent-token-idempotency@example.com", role="recruiter")
    login_token = _login(client, "agent-token-idempotency@example.com")

    response = client.post(
        "/api/agent-imports/token",
        headers={
            **_bearer(login_token),
            "Idempotency-Key": "must-not-cache-agent-token",
        },
    )

    assert response.status_code == 400
    assert "Idempotency-Key" in response.get_json()["error"]
    with app.app_context():
        from app.models import IdempotencyRecord

        assert IdempotencyRecord.query.count() == 0
