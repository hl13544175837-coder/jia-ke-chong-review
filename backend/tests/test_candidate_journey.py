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


def test_candidate_pipelines_hides_cross_org_job_relation(client, make_user, app):
    owner_id, owner_token = make_user(
        "pipeline-cross-job-owner@x.com",
        role="recruiter",
        org_id=1,
    )
    foreign_owner_id, _ = make_user(
        "pipeline-cross-job-foreign@x.com",
        role="recruiter",
        org_id=2,
    )
    _, demand_id, candidate_id = _seed(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import Job, PipelineStage, RecruitmentDemand

        foreign_job = Job(
            org_id=2,
            title="SECRET-FOREIGN-PIPELINE-JOB",
            jd_text="SECRET-FOREIGN-PIPELINE-JD",
            owner_hr_id=foreign_owner_id,
            status="active",
        )
        db.session.add(foreign_job)
        db.session.flush()
        demand = db.session.get(RecruitmentDemand, demand_id)
        demand.job_id = foreign_job.id
        demand.job_title_snapshot = ""
        db.session.add(PipelineStage(
            org_id=1,
            demand_id=demand_id,
            job_id=foreign_job.id,
            candidate_id=candidate_id,
            stage="ai_screen",
            updated_by=owner_id,
        ))
        db.session.commit()

    response = client.get(
        f"/api/candidates/{candidate_id}/pipelines",
        headers=_auth(owner_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["pipelines"] == [{
        "demand_id": demand_id,
        "job_id": None,
        "job_title": None,
        "department": "",
        "city": "",
        "demand_status": "active",
        "stage": "ai_screen",
        "updated_at": body["pipelines"][0]["updated_at"],
    }]
    assert "SECRET-FOREIGN-PIPELINE" not in str(body)


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
    assert body["current_stage"] == "interview"
    assert len(body["feedback"]) == 1 and body["feedback"][0]["score"] == 4
    actions = {item["action"] for item in body["activity"]}
    assert {"stage_changed", "interview_scheduled", "feedback_submitted"} <= actions
    assert all(
        {
            "id",
            "occurred_at",
            "actor_name",
            "action",
            "title",
            "detail",
            "round_sequence",
            "reason",
        } <= item.keys()
        for item in body["activity"]
    )
    stage_activity = next(
        item for item in body["activity"] if item["action"] == "stage_changed"
    )
    assert stage_activity["reason"] == "n1"
    assert all(item["reason"] for item in body["activity"])
    assert [item["occurred_at"] for item in body["activity"]] == sorted(
        [item["occurred_at"] for item in body["activity"]], reverse=True
    )


def test_journey_includes_demand_review_business_review_interview_round_and_offer(client, make_user, app):
    owner_id, owner_token = make_user("journey-owner@x.com", role="recruiter", name="张招聘")
    manager_id, _ = make_user("journey-manager@x.com", role="manager", name="李经理")
    interviewer_id, interviewer_token = make_user(
        "100003@gateway.local", role="interviewer", name="100003"
    )
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
    assert journey["business_reviews"][0]["reviewer_name"] == "王杰"
    assert journey["interview_rounds"][0]["interviewer_name"] == "王杰"
    assert journey["interview_rounds"][0]["status"] == "awaiting_feedback"
    assert journey["offers"][0]["status"] == "sent"

    interviewer_response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(interviewer_token),
    )
    assert interviewer_response.status_code == 200
    interviewer_journey = interviewer_response.get_json()
    assert interviewer_journey["demand_approval"] == {
        "status": "approved",
        "submitted_by_name": None,
        "submitted_at": None,
        "reviewed_by_name": None,
        "reviewed_at": None,
        "reason": "",
        "history": [],
    }
    assert interviewer_journey["business_reviews"] == []
    assert interviewer_journey["timeline"] == []
    assert interviewer_journey["ai_interviews"] == []
    assert interviewer_journey["dispositions"] == []
    assert interviewer_journey["offers"] == []
    assert "25k-32k" not in str(interviewer_journey)

    _, unrelated_interviewer_token = make_user(
        "journey-unrelated@x.com", role="interviewer", name="无关面试官"
    )
    forbidden = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(unrelated_interviewer_token),
    )
    assert forbidden.status_code == 403


def test_journey_never_resolves_user_names_from_another_org(client, make_user, app):
    owner_id, owner_token = make_user(
        "journey-org-owner@x.com", role="recruiter", name="本组织招聘", org_id=1
    )
    outsider_id, _ = make_user(
        "journey-org-outsider@x.com", role="manager", name="外部组织敏感姓名", org_id=2
    )
    _, demand_id, candidate_id = _seed(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import (
            BusinessReviewTask,
            CandidateDisposition,
            Event,
            InterviewAssignment,
            InterviewFeedback,
            PipelineStage,
            RecruitmentDemand,
        )

        demand = db.session.get(RecruitmentDemand, demand_id)
        demand.created_by = outsider_id
        demand.reviewed_by = outsider_id
        demand.approval_status = "approved"
        db.session.add(Event(
            org_id=demand.org_id,
            demand_id=demand.id,
            actor_id=outsider_id,
            actor_role="manager",
            action="demand.approved",
            entity_id=demand.id,
            entity_type="recruitment_demand",
            payload={},
        ))
        db.session.add(PipelineStage(
            org_id=demand.org_id,
            demand_id=demand.id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            stage="interview",
            updated_by=outsider_id,
            note="历史阶段记录",
        ))
        db.session.add(BusinessReviewTask(
            org_id=demand.org_id,
            demand_id=demand.id,
            candidate_id=candidate_id,
            reviewer_id=outsider_id,
            created_by=outsider_id,
            decided_by=outsider_id,
            status="approved",
        ))
        assignment = InterviewAssignment(
            org_id=demand.org_id,
            demand_id=demand.id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            interviewer_id=outsider_id,
            created_by=owner_id,
            round="round_1",
            round_sequence=1,
            status="completed",
        )
        db.session.add(assignment)
        db.session.flush()
        db.session.add(InterviewFeedback(
            org_id=demand.org_id,
            demand_id=demand.id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            assignment_id=assignment.id,
            interviewer_id=outsider_id,
            round="round_1",
            score=4,
            passed=True,
        ))
        db.session.add(CandidateDisposition(
            org_id=demand.org_id,
            demand_id=demand.id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            created_by=outsider_id,
            reason="experience_gap",
        ))
        db.session.commit()

    response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(owner_token),
    )
    assert response.status_code == 200
    journey = response.get_json()
    assert journey["demand_approval"]["submitted_by_name"] is None
    assert journey["demand_approval"]["reviewed_by_name"] is None
    assert journey["demand_approval"]["history"][0]["actor_name"] is None
    assert journey["business_reviews"][0]["created_by_name"] is None
    assert journey["business_reviews"][0]["reviewer_name"] is None
    assert journey["business_reviews"][0]["decided_by_name"] is None
    assert journey["timeline"][0]["updated_by_name"] is None
    assert journey["feedback"][0]["interviewer_name"] is None
    assert journey["interview_rounds"][0]["interviewer_name"] is None
    assert journey["dispositions"][0]["created_by_name"] is None
    assert "外部组织敏感姓名" not in str(journey)


def test_journey_hides_cross_org_demand_job_but_keeps_local_history(
    client,
    make_user,
    app,
):
    owner_id, owner_token = make_user(
        "journey-cross-job-owner@x.com",
        role="recruiter",
        org_id=1,
    )
    foreign_owner_id, _ = make_user(
        "journey-cross-job-foreign@x.com",
        role="recruiter",
        org_id=2,
    )
    _, demand_id, candidate_id = _seed(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import Job, PipelineStage, RecruitmentDemand

        foreign_job = Job(
            org_id=2,
            title="SECRET-FOREIGN-JOURNEY-JOB",
            jd_text="SECRET-FOREIGN-JOURNEY-JD",
            owner_hr_id=foreign_owner_id,
            status="active",
        )
        db.session.add(foreign_job)
        db.session.flush()
        demand = db.session.get(RecruitmentDemand, demand_id)
        demand.job_id = foreign_job.id
        demand.job_title_snapshot = ""
        db.session.add(PipelineStage(
            org_id=1,
            demand_id=demand_id,
            job_id=foreign_job.id,
            candidate_id=candidate_id,
            stage="ai_screen",
            updated_by=owner_id,
            note="本组织旅程记录",
        ))
        db.session.commit()

    response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(owner_token),
    )

    assert response.status_code == 200
    journey = response.get_json()
    assert journey["job_id"] is None
    assert journey["job_title"] is None
    assert journey["current_stage"] == "ai_screen"
    assert journey["timeline"][0]["note"] == "本组织旅程记录"
    assert "SECRET-FOREIGN-JOURNEY" not in str(journey)


def test_business_reviewer_without_interview_assignment_cannot_see_interview_results(
    client, make_user, app
):
    owner_id, _ = make_user(
        "journey-review-owner@x.com", role="recruiter", name="招聘专员"
    )
    reviewer_id, reviewer_token = make_user(
        "journey-business-only@x.com", role="interviewer", name="仅业务筛选人"
    )
    interviewer_id, _ = make_user(
        "journey-assigned-interviewer@x.com", role="interviewer", name="实际面试官"
    )
    _, demand_id, candidate_id = _seed(app, owner_id)

    with app.app_context():
        from app import db
        from app.models import (
            BusinessReviewTask,
            InterviewAssignment,
            InterviewFeedback,
            RecruitmentDemand,
        )

        demand = db.session.get(RecruitmentDemand, demand_id)
        db.session.add(BusinessReviewTask(
            org_id=demand.org_id,
            demand_id=demand_id,
            candidate_id=candidate_id,
            reviewer_id=reviewer_id,
            created_by=owner_id,
            status="approved",
            business_note="只负责业务筛选",
        ))
        assignment = InterviewAssignment(
            org_id=demand.org_id,
            demand_id=demand_id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            created_by=owner_id,
            round="round_1",
            round_sequence=1,
            status="completed",
        )
        db.session.add(assignment)
        db.session.flush()
        db.session.add(InterviewFeedback(
            org_id=demand.org_id,
            demand_id=demand_id,
            job_id=demand.job_id,
            candidate_id=candidate_id,
            assignment_id=assignment.id,
            interviewer_id=interviewer_id,
            round="round_1",
            score=5,
            passed=True,
            note="不应被业务筛选人看到",
        ))
        db.session.commit()

    response = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(reviewer_token),
    )
    assert response.status_code == 200
    journey = response.get_json()
    assert journey["interview_rounds"] == []
    assert journey["feedback"] == []
    assert "不应被业务筛选人看到" not in str(journey)

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
