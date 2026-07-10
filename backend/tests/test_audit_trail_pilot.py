from app import db
from app.models import Candidate, CandidateTag, Event, Job, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_candidate(app, owner_id, name="候选人A"):
    with app.app_context():
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked=name,
            email_masked="candidate@example.com",
            phone_masked="13800138000",
            resume_json={
                "extracted_info": {
                    "name": name,
                    "email": "candidate@example.com",
                    "phone": "13800138000",
                    "summary": "有后端经验",
                },
                "skills": [{"skill_name": "Python", "score": 5}],
            },
        )
        job = Job(
            org_id=1,
            owner_hr_id=owner_id,
            title="后端工程师",
            jd_text="Python 后端",
            jd_structured={"skill_tags_raw": "Python,5,BE"},
        )
        db.session.add_all([candidate, job])
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="Python", score=5))
        db.session.commit()
        return candidate.id, job.id


def _latest_event(action):
    return Event.query.filter_by(action=action).order_by(Event.id.desc()).first()


def test_opening_resume_detail_records_audit_context(app, client, make_user):
    owner_id, token = make_user("audit-viewer@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(
        f"/api/resume/{candidate_id}",
        headers={
            **_auth(token),
            "X-Request-ID": "req-view-1",
            "X-Forwarded-For": "203.0.113.8",
            "User-Agent": "AuditTest/1.0",
        },
    )

    assert response.status_code == 200
    with app.app_context():
        event = _latest_event("candidate.viewed")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.actor_role == "recruiter"
        assert event.entity_type == "candidate"
        assert event.entity_id == candidate_id
        assert event.request_id == "req-view-1"
        assert event.ip == "203.0.113.8"
        assert event.user_agent == "AuditTest/1.0"
        assert event.result == "success"
        assert event.source == "ui"
        assert event.severity == "info"


def test_candidate_export_downloads_csv_and_records_audit(app, client, make_user):
    owner_id, token = make_user("audit-exporter@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(f"/api/candidates/{candidate_id}/export", headers=_auth(token))

    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert f"candidate-{candidate_id}.csv" in response.headers["Content-Disposition"]
    assert "候选人A" in response.get_data(as_text=True)
    with app.app_context():
        event = _latest_event("candidate.exported")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.entity_id == candidate_id
        assert event.result == "success"


def test_forbidden_candidate_access_records_warning_event(app, client, make_user):
    owner_id, owner_token = make_user("audit-owner@example.com", role="recruiter")
    _, other_token = make_user("audit-other@example.com", role="recruiter")
    candidate_id, _ = _seed_candidate(app, owner_id)

    response = client.get(f"/api/resume/{candidate_id}", headers=_auth(other_token))

    assert response.status_code == 403
    with app.app_context():
        event = _latest_event("security.forbidden")
        assert event is not None
        assert event.actor_role == "recruiter"
        assert event.entity_type == "candidate"
        assert event.entity_id == candidate_id
        assert event.result == "denied"
        assert event.severity == "warning"
        assert event.payload["path"] == f"/api/resume/{candidate_id}"


def test_agent_write_records_ai_source_and_result(app, client, make_user):
    owner_id, token = make_user("audit-agent@example.com", role="recruiter")
    _, job_id = _seed_candidate(app, owner_id)

    response = client.post(
        "/api/agent/execute",
        headers=_auth(token),
        json={"tool": "run_match", "args": {"job_id": job_id}},
    )

    assert response.status_code == 200
    with app.app_context():
        event = _latest_event("agent.write")
        assert event is not None
        assert event.actor_id == owner_id
        assert event.source == "ai"
        assert event.result == "success"
        assert event.payload["tool"] == "run_match"
        assert event.payload["target_ids"]["job_id"] == job_id


def test_admin_audit_logs_filter_and_return_demand_id(app, client, make_user):
    actor_id, _ = make_user("audit-demand-actor@example.com", role="recruiter")
    _, admin_token = make_user("audit-demand-admin@example.com", role="admin")

    with app.app_context():
        job = Job(org_id=1, title="测试岗位", jd_text="测试")
        db.session.add(job)
        db.session.flush()
        demand_a = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=actor_id,
            status="active",
        )
        demand_b = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=actor_id,
            status="active",
        )
        db.session.add_all([demand_a, demand_b])
        db.session.flush()
        key_actions = [
            "demand.created",
            "demand.owner_reassigned",
            "demand.closed",
            "pipeline.transferred",
            "interview.assigned",
            "interview.feedback",
            "offer.saved",
        ]
        for action in key_actions:
            db.session.add(
                Event(
                    org_id=1,
                    actor_id=actor_id,
                    actor_role="recruiter",
                    action=action,
                    entity_type="demand",
                    entity_id=demand_a.id,
                    demand_id=demand_a.id,
                )
            )
        db.session.add(
            Event(
                org_id=1,
                actor_id=actor_id,
                actor_role="recruiter",
                action="demand.created",
                entity_type="demand",
                entity_id=demand_b.id,
                demand_id=demand_b.id,
            )
        )
        db.session.commit()
        demand_a_id = demand_a.id

    response = client.get(
        f"/api/admin/audit-logs?demand_id={demand_a_id}&per_page=50",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    logs = response.get_json()["logs"]
    assert {item["action"] for item in logs} == set(key_actions)
    assert {item["demand_id"] for item in logs} == {demand_a_id}


def test_admin_audit_logs_reject_invalid_demand_filter(client, make_user):
    _, admin_token = make_user("audit-invalid-demand-admin@example.com", role="admin")

    response = client.get(
        "/api/admin/audit-logs?demand_id=not-an-integer",
        headers=_auth(admin_token),
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_demand_id"


def test_demand_owner_transfer_does_not_rewrite_historical_actor(
    app, client, make_user
):
    old_owner_id, _ = make_user("audit-old-owner@example.com", role="recruiter")
    new_owner_id, _ = make_user("audit-new-owner@example.com", role="recruiter")
    manager_id, manager_token = make_user(
        "audit-transfer-manager@example.com", role="manager"
    )

    with app.app_context():
        job = Job(org_id=1, title="产品经理", jd_text="产品规划")
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=old_owner_id,
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        historical = Event(
            org_id=1,
            actor_id=old_owner_id,
            actor_role="recruiter",
            action="pipeline.moved",
            entity_type="candidate",
            entity_id=99,
            demand_id=demand.id,
        )
        db.session.add(historical)
        db.session.commit()
        demand_id = demand.id
        historical_id = historical.id

    response = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": new_owner_id, "reason": "调整当前协同责任"},
    )

    assert response.status_code == 200
    with app.app_context():
        historical = db.session.get(Event, historical_id)
        reassigned = _latest_event("demand.owner_reassigned")
        assert historical.actor_id == old_owner_id
        assert reassigned.actor_id == manager_id
        assert reassigned.demand_id == demand_id
