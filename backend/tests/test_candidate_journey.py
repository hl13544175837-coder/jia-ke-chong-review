from datetime import UTC, datetime, timedelta


def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app, owner_id):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate, RecruitmentDemand
        j = Job(title="后端", jd_text="x", owner_hr_id=owner_id)
        c = Candidate(name_masked="候选人A", resume_json={}, owner_hr_id=owner_id)
        db.session.add_all([j, c]); db.session.flush()
        demand = RecruitmentDemand(
            job_id=j.id,
            owner_hr_id=owner_id,
            request_no=f"REQ-JOURNEY-{owner_id}",
            status="active",
        )
        db.session.add(demand); db.session.commit()
        return j.id, demand.id, c.id

def test_candidate_pipelines_lists_current_stage_per_job(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    jid, did, cid = _seed(app, uid)
    for stage in ["pending", "ai_screen", "interview"]:
        client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "demand_id": did, "stage": stage})
    r = client.get(f"/api/candidates/{cid}/pipelines", headers=_auth(token))
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["pipelines"]) == 1
    assert body["pipelines"][0]["stage"] == "interview"
    assert body["pipelines"][0]["job_id"] == jid
    assert body["pipelines"][0]["demand_id"] == did

def test_journey_aggregates_timeline_and_feedback(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "journey-interviewer@x.com", role="interviewer"
    )
    jid, did, cid = _seed(app, uid)
    client.post("/api/pipeline/move", headers=_auth(token),
                json={"candidate_id": cid, "demand_id": did, "stage": "interview", "note": "n1"})
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(token),
        json={
            "candidate_id": cid,
            "demand_id": did,
            "round": "round_1",
            "interviewer_id": interviewer_id,
        },
    )
    assert assignment.status_code == 201
    feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_token),
        json={
            "assignment_id": assignment.get_json()["id"],
            "candidate_id": cid,
            "demand_id": did,
            "round": "round_1",
            "score": 4,
            "passed": True,
            "strengths": "好",
        },
    )
    assert feedback.status_code == 201
    r = client.get(f"/api/candidates/{cid}/journey?demand_id={did}", headers=_auth(token))
    assert r.status_code == 200
    body = r.get_json()
    assert len(body["timeline"]) == 1
    assert body["timeline"][0]["note"] == "n1"
    assert len(body["feedback"]) == 1 and body["feedback"][0]["score"] == 4


def test_journey_includes_demand_review_business_review_interview_round_and_offer(client, make_user, app):
    owner_id, owner_token = make_user("journey-owner@x.com", role="recruiter", name="张招聘")
    manager_id, _ = make_user("journey-manager@x.com", role="manager", name="李经理")
    interviewer_id, interviewer_token = make_user("journey-round@x.com", role="interviewer", name="面试官01")
    _, demand_id, candidate_id = _seed(app, owner_id)
    now = datetime.now(UTC).replace(tzinfo=None)

    with app.app_context():
        from app import db
        from app.models import (
            BusinessReviewTask,
            InterviewAssignment,
            OfferRecord,
            RecruitmentDemand,
        )

        demand = db.session.get(RecruitmentDemand, demand_id)
        demand.created_by = owner_id
        demand.submitted_at = now - timedelta(days=3)
        demand.approval_status = "approved"
        demand.reviewed_by = manager_id
        demand.reviewed_at = now - timedelta(days=2)
        demand.review_reason = "编制确认通过"
        db.session.add(BusinessReviewTask(
            org_id=demand.org_id,
            demand_id=demand_id,
            candidate_id=candidate_id,
            reviewer_id=interviewer_id,
            created_by=owner_id,
            status="approved",
            hr_note="重点看项目经验",
            business_note="建议进入面试",
            decided_by=interviewer_id,
            decided_at=now - timedelta(days=1),
        ))
        db.session.add(InterviewAssignment(
            org_id=demand.org_id,
            demand_id=demand_id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            created_by=owner_id,
            round="round_1",
            round_sequence=1,
            scheduled_at=now + timedelta(hours=2),
            status="awaiting_feedback",
        ))
        db.session.add(OfferRecord(
            org_id=demand.org_id,
            demand_id=demand_id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            created_by=owner_id,
            salary_range="25k-32k · 14薪",
            approval_status="sent",
            sent_at=now,
        ))
        db.session.commit()

    response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(owner_token),
    )
    assert response.status_code == 200
    journey = response.get_json()
    assert journey["demand_approval"]["submitted_by_name"] == "张招聘"
    assert journey["demand_approval"]["reviewed_by_name"] == "李经理"
    assert journey["demand_approval"]["status"] == "approved"
    assert journey["business_reviews"][0]["business_note"] == "建议进入面试"
    assert journey["interview_rounds"][0]["interviewer_name"] == "面试官01"
    assert journey["interview_rounds"][0]["status"] == "awaiting_feedback"
    assert journey["offers"][0]["status"] == "sent"

    interviewer_response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(interviewer_token),
    )
    assert interviewer_response.status_code == 200
    assert interviewer_response.get_json()["demand_approval"]["reviewed_by_name"] == "李经理"

    _, unrelated_interviewer_token = make_user(
        "journey-unrelated@x.com", role="interviewer", name="无关面试官"
    )
    forbidden = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(unrelated_interviewer_token),
    )
    assert forbidden.status_code == 403

def test_journey_requires_job_id(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    _, _, cid = _seed(app, uid)
    r = client.get(f"/api/candidates/{cid}/journey", headers=_auth(token))
    assert r.status_code == 400

def test_recruiter_cannot_view_others_journey(client, make_user, app):
    owner_id, _ = make_user("owner@x.com", role="recruiter")
    _, other_token = make_user("other@x.com", role="recruiter")
    _, did, cid = _seed(app, owner_id)
    r = client.get(f"/api/candidates/{cid}/journey?demand_id={did}", headers=_auth(other_token))
    assert r.status_code == 403

def test_reassign_owner_manager_only(client, make_user, app):
    owner_id, owner_token = make_user("owner@x.com", role="recruiter")
    new_id, _ = make_user("new@x.com", role="recruiter")
    _, mgr_token = make_user("m@x.com", role="manager")
    _, _, cid = _seed(app, owner_id)
    # recruiter forbidden
    r = client.patch(f"/api/candidates/{cid}/owner", headers=_auth(owner_token),
                     json={"owner_hr_id": new_id})
    assert r.status_code == 403
    # manager ok
    r = client.patch(f"/api/candidates/{cid}/owner", headers=_auth(mgr_token),
                     json={"owner_hr_id": new_id, "reason": "调整试点负责人"})
    assert r.status_code == 200
    assert r.get_json()["owner_hr_id"] == new_id
