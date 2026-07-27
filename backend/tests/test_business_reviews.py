import pytest

from app import db
from app.models import (
    BusinessReviewTask,
    Candidate,
    CandidateDemandFlow,
    Event,
    Interview,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_review_case(
    app,
    owner_id,
    *,
    suffix="BASE",
    approval_status="approved",
    demand_status="active",
    flow_status="active",
):
    with app.app_context():
        job = Job(
            org_id=1,
            title="Data Analyst",
            city="Shanghai",
            department="Operations",
            jd_text="Own operating-data analysis",
            jd_structured={
                "must_have_skills": ["SQL"],
                "responsibilities": ["Own operating-data analysis"],
            },
            status="active",
        )
        db.session.add(job)
        db.session.flush()
        demand_values = {
            "org_id": 1,
            "job_id": job.id,
            "owner_hr_id": owner_id,
            "request_no": f"REQ-BUSINESS-REVIEW-{suffix}",
            "status": demand_status,
            "city": job.city,
            "department": job.department,
            "job_title_snapshot": job.title,
            "jd_text_snapshot": job.jd_text,
        }
        # Task 1 adds this field. Keeping the fixture constructible before that
        # integration lets the Task 4 route tests demonstrate their own RED.
        if hasattr(RecruitmentDemand, "approval_status"):
            demand_values["approval_status"] = approval_status
        demand = RecruitmentDemand(**demand_values)
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="Review Candidate",
            resume_json={"skills": ["SQL"], "summary": "Analytics projects"},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                org_id=1,
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status=flow_status,
            )
        )
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="ai_screen",
                updated_by=owner_id,
            )
        )
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_id": demand.id,
            "candidate_id": candidate.id,
        }


def _stage_rows(app, case):
    with app.app_context():
        rows = (
            PipelineStage.query.filter_by(
                candidate_id=case["candidate_id"],
                demand_id=case["demand_id"],
            )
            .order_by(PipelineStage.id.asc())
            .all()
        )
        return [row.stage for row in rows]


def _push_review(client, token, case, reviewer_id, **overrides):
    payload = {
        "demand_id": case["demand_id"],
        "candidate_id": case["candidate_id"],
        "reviewer_id": reviewer_id,
        "hr_note": "Please verify the SQL project experience",
        "due_at": "2030-08-01T10:30:00Z",
    }
    payload.update(overrides)
    response = client.post(
        "/api/business-reviews",
        headers=_auth(token),
        json=payload,
    )
    assert response.status_code in {200, 201}
    return response


@pytest.mark.parametrize("decision", ["approved", "rejected", "needs_info"])
def test_assigned_reviewer_can_submit_fixed_decisions_without_advancing_pipeline(
    client, make_user, app, decision
):
    hr_id, hr_token = make_user("hr-review@example.com", role="recruiter")
    reviewer_id, reviewer_token = make_user(
        "business-review@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix=decision.upper())

    task = _push_review(client, hr_token, case, reviewer_id).get_json()
    stages_after_push = _stage_rows(app, case)
    assert stages_after_push[-1] == "business_review"
    note = "Concrete reason" if decision != "approved" else ""

    response = client.post(
        f"/api/business-reviews/{task['id']}/decision",
        headers=_auth(reviewer_token),
        json={"decision": decision, "note": note},
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == decision
    assert _stage_rows(app, case) == stages_after_push
    with app.app_context():
        assert Interview.query.filter_by(
            candidate_id=case["candidate_id"], demand_id=case["demand_id"]
        ).count() == 0
        flow = CandidateDemandFlow.query.filter_by(
            candidate_id=case["candidate_id"], demand_id=case["demand_id"]
        ).one()
        assert flow.status == "active"
        decision_event = Event.query.filter_by(
            action="business_review.decided", demand_id=case["demand_id"]
        ).one()
        assert decision_event.payload["decision"] == decision
        owner_notice = Notification.query.filter_by(
            user_id=hr_id,
            demand_id=case["demand_id"],
            type="business_review_decided",
        ).one()
        assert owner_notice.user_id == hr_id
        assert owner_notice.link == (
            f"/candidates?demand={case['demand_id']}"
            f"&candidate={case['candidate_id']}"
        )
        assert "Review Candidate" in owner_notice.body
        assert "Data Analyst" in owner_notice.body
        assert "任务 #" not in owner_notice.body


@pytest.mark.parametrize("decision", ["rejected", "needs_info"])
def test_rejection_and_needs_info_require_a_reason(
    client, make_user, app, decision
):
    hr_id, hr_token = make_user(f"hr-{decision}@example.com", role="recruiter")
    reviewer_id, reviewer_token = make_user(
        f"reviewer-{decision}@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix=f"REASON-{decision}")
    task = _push_review(client, hr_token, case, reviewer_id).get_json()

    response = client.post(
        f"/api/business-reviews/{task['id']}/decision",
        headers=_auth(reviewer_token),
        json={"decision": decision, "note": "   "},
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "business_review_note_required"
    detail = client.get(
        f"/api/business-reviews/{task['id']}", headers=_auth(reviewer_token)
    )
    assert detail.status_code == 200
    assert detail.get_json()["status"] == "pending"


def test_duplicate_pending_push_reuses_task_and_side_effects(
    client, make_user, app
):
    hr_id, hr_token = make_user("hr-dedupe@example.com", role="recruiter")
    reviewer_id, reviewer_token = make_user(
        "business-dedupe@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix="DEDUPE")

    first_response = _push_review(client, hr_token, case, reviewer_id)
    second_response = _push_review(client, hr_token, case, reviewer_id)
    first = first_response.get_json()
    second = second_response.get_json()

    assert first_response.status_code == 201
    assert second_response.status_code == 200
    assert first["id"] == second["id"]
    assert second["deduplicated"] is True
    assert _stage_rows(app, case) == ["ai_screen", "business_review"]
    with app.app_context():
        assert Notification.query.filter_by(
            user_id=reviewer_id,
            demand_id=case["demand_id"],
            type="business_review_assigned",
        ).count() == 1
        assert Event.query.filter_by(
            action="business_review.created", demand_id=case["demand_id"]
        ).count() == 1
    mine = client.get("/api/business-reviews/mine", headers=_auth(reviewer_token))
    assert mine.status_code == 200
    assert [item["id"] for item in mine.get_json()] == [first["id"]]


def test_owner_can_explicitly_reassign_one_pending_review_without_creating_a_duplicate(
    client, make_user, app
):
    hr_id, hr_token = make_user("hr-reassign-review@example.com", role="recruiter")
    reviewer_a_id, reviewer_a_token = make_user(
        "business-review-a@example.com", role="interviewer", name="业务筛选人A"
    )
    reviewer_b_id, reviewer_b_token = make_user(
        "business-review-b@example.com", role="interviewer", name="业务筛选人B"
    )
    case = _seed_review_case(app, hr_id, suffix="REASSIGN")
    task = _push_review(client, hr_token, case, reviewer_a_id).get_json()

    response = client.patch(
        f"/api/business-reviews/{task['id']}/reviewer",
        headers=_auth(hr_token),
        json={"reviewer_id": reviewer_b_id},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["id"] == task["id"]
    assert payload["reviewer_id"] == reviewer_b_id
    assert payload["reviewer_name"] == "业务筛选人B"
    assert payload["unchanged"] is False

    old_mine = client.get(
        "/api/business-reviews/mine", headers=_auth(reviewer_a_token)
    )
    new_mine = client.get(
        "/api/business-reviews/mine", headers=_auth(reviewer_b_token)
    )
    assert old_mine.get_json() == []
    assert [item["id"] for item in new_mine.get_json()] == [task["id"]]

    with app.app_context():
        assert BusinessReviewTask.query.filter_by(
            demand_id=case["demand_id"],
            candidate_id=case["candidate_id"],
            status="pending",
        ).count() == 1
        event = Event.query.filter_by(
            action="business_review.reassigned", entity_id=task["id"]
        ).one()
        assert event.payload["old_reviewer_id"] == reviewer_a_id
        assert event.payload["new_reviewer_id"] == reviewer_b_id
        old_notice = Notification.query.filter_by(
            user_id=reviewer_a_id,
            demand_id=case["demand_id"],
            type="business_review_reassigned_away",
        ).one()
        new_notice = Notification.query.filter_by(
            user_id=reviewer_b_id,
            demand_id=case["demand_id"],
            type="business_review_reassigned",
        ).one()
        assert old_notice.user_id == reviewer_a_id
        assert new_notice.link == f"/interviewer/screening?task={task['id']}"


def test_invalid_reassignment_keeps_the_original_pending_reviewer(
    client, make_user, app
):
    hr_id, hr_token = make_user("hr-invalid-reassign@example.com", role="recruiter")
    reviewer_id, _ = make_user(
        "business-original@example.com", role="interviewer"
    )
    inactive_id, _ = make_user(
        "business-inactive@example.com", role="interviewer", is_active=False
    )
    case = _seed_review_case(app, hr_id, suffix="INVALID-REASSIGN")
    task = _push_review(client, hr_token, case, reviewer_id).get_json()

    response = client.patch(
        f"/api/business-reviews/{task['id']}/reviewer",
        headers=_auth(hr_token),
        json={"reviewer_id": inactive_id},
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_business_reviewer"
    with app.app_context():
        saved = db.session.get(BusinessReviewTask, task["id"])
        assert saved.reviewer_id == reviewer_id
        assert Event.query.filter_by(
            action="business_review.reassigned", entity_id=task["id"]
        ).count() == 0


def test_review_payload_exposes_latest_demand_stage_after_handoff(
    client, make_user, app
):
    hr_id, hr_token = make_user(
        "hr-review-stage-payload@example.com", role="recruiter"
    )
    reviewer_id, reviewer_token = make_user(
        "review-stage-payload@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix="PAYLOAD-STAGE")
    task = _push_review(client, hr_token, case, reviewer_id).get_json()
    decided = client.post(
        f"/api/business-reviews/{task['id']}/decision",
        headers=_auth(reviewer_token),
        json={"decision": "approved", "note": ""},
    )
    assert decided.status_code == 200
    with app.app_context():
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=case["candidate_id"],
                job_id=case["job_id"],
                demand_id=case["demand_id"],
                stage="onboarded",
                updated_by=hr_id,
            )
        )
        db.session.commit()

    response = client.get("/api/business-reviews", headers=_auth(hr_token))

    assert response.status_code == 200
    assert response.get_json()[0]["candidate"]["current_stage"] == "onboarded"


@pytest.mark.parametrize(
    "later_stage", ["interview", "offer", "onboarded", "rejected", "transferred"]
)
def test_business_review_cannot_move_a_later_stage_candidate_backwards(
    client, make_user, app, later_stage
):
    hr_id, hr_token = make_user(
        f"hr-stage-{later_stage}@example.com", role="recruiter"
    )
    reviewer_id, _ = make_user(
        f"reviewer-stage-{later_stage}@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix=f"STAGE-{later_stage}")
    with app.app_context():
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=case["candidate_id"],
                job_id=case["job_id"],
                demand_id=case["demand_id"],
                stage=later_stage,
                updated_by=hr_id,
            )
        )
        db.session.commit()

    response = client.post(
        "/api/business-reviews",
        headers=_auth(hr_token),
        json={
            "demand_id": case["demand_id"],
            "candidate_id": case["candidate_id"],
            "reviewer_id": reviewer_id,
        },
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "business_review_stage_conflict"
    assert _stage_rows(app, case)[-1] == later_stage


def test_task_lists_and_detail_are_scoped_to_owner_and_assigned_reviewer(
    client, make_user, app
):
    hr_id, hr_token = make_user(
        "hr-scope@example.com", role="recruiter", name="Owner HR"
    )
    reviewer_id, reviewer_token = make_user(
        "business-scope@example.com", role="interviewer", name="Assigned Reviewer"
    )
    _, unrelated_token = make_user(
        "business-unrelated@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix="SCOPE")
    task = _push_review(client, hr_token, case, reviewer_id).get_json()

    owner_list = client.get("/api/business-reviews", headers=_auth(hr_token))
    assigned_list = client.get(
        "/api/business-reviews/mine", headers=_auth(reviewer_token)
    )
    unrelated_list = client.get(
        "/api/business-reviews/mine", headers=_auth(unrelated_token)
    )
    unrelated_detail = client.get(
        f"/api/business-reviews/{task['id']}", headers=_auth(unrelated_token)
    )
    unrelated_decision = client.post(
        f"/api/business-reviews/{task['id']}/decision",
        headers=_auth(unrelated_token),
        json={"decision": "approved", "note": ""},
    )

    assert owner_list.status_code == 200
    assert [item["id"] for item in owner_list.get_json()] == [task["id"]]
    assert assigned_list.status_code == 200
    assert [item["id"] for item in assigned_list.get_json()] == [task["id"]]
    assert unrelated_list.status_code == 200
    assert unrelated_list.get_json() == []
    assert unrelated_detail.status_code == 403
    assert unrelated_decision.status_code == 403

    detail = client.get(
        f"/api/business-reviews/{task['id']}", headers=_auth(reviewer_token)
    )
    assert detail.status_code == 200
    payload = detail.get_json()
    assert payload["demand"] == {
        "id": case["demand_id"],
        "request_no": "REQ-BUSINESS-REVIEW-SCOPE",
        "job_id": case["job_id"],
        "job_title": "Data Analyst",
        "department": "Operations",
        "city": "Shanghai",
        "jd_text": "Own operating-data analysis",
        "focus_points": ["SQL", "Own operating-data analysis"],
        "owner_hr_id": hr_id,
    }
    assert payload["candidate"]["id"] == case["candidate_id"]
    assert payload["candidate"]["resume_json"]["skills"] == ["SQL"]
    assert payload["reviewer_name"] == "Assigned Reviewer"
    assert payload["creator_name"] == "Owner HR"
    assert payload["created_by_name"] == "Owner HR"
    assert payload["candidate"]["parse_status"] == "ok"
    assert payload["due_at"].startswith("2030-08-01T10:30:00")
    assert "raw_file_path" not in str(payload)


def test_owner_can_remind_pending_business_reviewer_without_duplicate_notifications(
    client, make_user, app
):
    hr_id, hr_token = make_user(
        "hr-review-reminder@example.com", role="recruiter"
    )
    reviewer_id, _ = make_user(
        "review-reminder@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id, suffix="REMINDER")
    task = _push_review(client, hr_token, case, reviewer_id).get_json()

    first = client.post(
        f"/api/business-reviews/{task['id']}/remind",
        headers=_auth(hr_token),
    )
    second = client.post(
        f"/api/business-reviews/{task['id']}/remind",
        headers=_auth(hr_token),
    )

    assert first.status_code == 200
    assert first.get_json()["deduplicated"] is False
    assert second.status_code == 200
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        assert Notification.query.filter_by(
            org_id=1,
            user_id=reviewer_id,
            demand_id=case["demand_id"],
            type="business_review_reminder",
        ).count() == 1
        assert Event.query.filter_by(
            action="business_review.reminded",
            entity_id=task["id"],
        ).count() == 1


def test_recruiter_cannot_push_another_owners_candidate(
    client, make_user, app
):
    owner_id, _ = make_user("hr-owner@example.com", role="recruiter")
    _, other_token = make_user("hr-other@example.com", role="recruiter")
    reviewer_id, _ = make_user("business-owner@example.com", role="interviewer")
    case = _seed_review_case(app, owner_id, suffix="OWNER")

    response = client.post(
        "/api/business-reviews",
        headers=_auth(other_token),
        json={
            "demand_id": case["demand_id"],
            "candidate_id": case["candidate_id"],
            "reviewer_id": reviewer_id,
        },
    )

    assert response.status_code == 403


def test_push_requires_approved_active_demand_active_flow_and_business_reviewer(
    client, make_user, app
):
    hr_id, hr_token = make_user("hr-validation@example.com", role="recruiter")
    reviewer_id, _ = make_user(
        "business-validation@example.com", role="interviewer"
    )
    non_reviewer_id, _ = make_user(
        "not-business-reviewer@example.com", role="recruiter"
    )
    unapproved = _seed_review_case(
        app, hr_id, suffix="UNAPPROVED", approval_status="pending"
    )
    inactive_flow = _seed_review_case(
        app, hr_id, suffix="INACTIVE-FLOW", flow_status="closed"
    )
    valid = _seed_review_case(app, hr_id, suffix="BAD-REVIEWER")

    unapproved_response = client.post(
        "/api/business-reviews",
        headers=_auth(hr_token),
        json={**unapproved, "reviewer_id": reviewer_id},
    )
    inactive_flow_response = client.post(
        "/api/business-reviews",
        headers=_auth(hr_token),
        json={**inactive_flow, "reviewer_id": reviewer_id},
    )
    reviewer_response = client.post(
        "/api/business-reviews",
        headers=_auth(hr_token),
        json={**valid, "reviewer_id": non_reviewer_id},
    )

    assert unapproved_response.status_code == 409
    assert unapproved_response.get_json()["code"] == "demand_not_approved"
    assert inactive_flow_response.status_code == 409
    assert inactive_flow_response.get_json()["code"] == "candidate_not_in_demand"
    assert reviewer_response.status_code == 400
    assert reviewer_response.get_json()["code"] == "invalid_business_reviewer"
