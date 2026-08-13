import io
from datetime import UTC, date, datetime, timedelta


def _auth(token, idempotency_key=None):
    headers = {"Authorization": f"Bearer {token}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def test_core_internal_trial_workflow_reaches_onboarded_and_updates_bi(
    client,
    make_user,
    app,
    tmp_path,
):
    recruiter_id, recruiter_token = make_user(
        "core-trial-recruiter@example.com",
        role="recruiter",
        name="试用招聘专员",
    )
    _, manager_token = make_user(
        "core-trial-manager@example.com",
        role="manager",
        name="试用招聘经理",
    )
    interviewer_id, interviewer_token = make_user(
        "core-trial-interviewer@example.com",
        role="interviewer",
        name="试用面试官",
    )
    app.config.update(
        RESUME_AI_ENABLED=False,
        JOB_PROFILE_AI_ENABLED=False,
        UPLOAD_FOLDER=str(tmp_path / "uploads"),
    )

    demand_response = client.post(
        "/api/demands",
        headers=_auth(recruiter_token, "core-trial-demand"),
        json={
            "job_title": "内部试用后端工程师",
            "jd_text": "负责招聘系统核心服务，熟悉 Python、Flask 和 MySQL。",
            "owner_hr_id": recruiter_id,
            "request_no": "CORE-TRIAL-20260813-001",
            "requester_name": "试用业务负责人",
            "requester_department": "技术中心",
            "hiring_manager_name": "技术负责人",
            "city": "上海",
            "requested_at": "2026-08-13",
            "target_date": "2026-09-30",
            "priority": "A",
            "headcount": 1,
            "status": "active",
        },
    )
    assert demand_response.status_code == 201, demand_response.get_json()
    demand = demand_response.get_json()
    demand_id = demand["id"]
    job_id = demand["job_id"]

    upload_response = client.post(
        "/api/resume/upload",
        headers=_auth(recruiter_token),
        data={
            "files": (
                io.BytesIO(b"%PDF-1.4 core internal trial resume"),
                "core-trial-resume.pdf",
            ),
            "target_demand_id": str(demand_id),
            "source_channel": "内部推荐",
            "source_note": "核心流程试用",
        },
        content_type="multipart/form-data",
    )
    assert upload_response.status_code == 202, upload_response.get_json()
    upload_result = upload_response.get_json()["results"][0]
    assert upload_result["status"] == "needs_confirmation"
    assert "手动补录" in upload_result["reason"]
    candidate_id = upload_result["candidate_id"]

    profile_response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(recruiter_token),
        json={
            "profile": {
                "name": "核心试用候选人",
                "email": "core-trial-candidate@example.com",
                "phone": "13900000001",
                "summary": "五年 Python 后端开发经验",
                "experience": [
                    {
                        "company": "内部试用公司",
                        "position": "后端工程师",
                        "duration": "2021-至今",
                    }
                ],
            },
            "skills": [
                {"tag": "Python", "score": 5},
                {"tag": "Flask", "score": 4},
            ],
        },
    )
    assert profile_response.status_code == 200, profile_response.get_json()
    assert profile_response.get_json()["name_masked"] == "核心试用候选人"

    initial_board = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(recruiter_token),
    )
    assert initial_board.status_code == 200
    initial_row = next(
        item
        for item in initial_board.get_json()["candidates"]
        if item["candidate_id"] == candidate_id
    )
    assert initial_row["stage"] == "pending"

    pending_payload = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "job_id": job_id,
        "stage": "pending",
        "note": "确认进入招聘流程",
    }
    first_pending = client.post(
        f"/api/pipeline/demands/{demand_id}/move",
        headers=_auth(recruiter_token),
        json=pending_payload,
    )
    repeated_pending = client.post(
        f"/api/pipeline/demands/{demand_id}/move",
        headers=_auth(recruiter_token),
        json=pending_payload,
    )
    assert first_pending.status_code == repeated_pending.status_code == 200
    assert first_pending.get_json()["deduplicated"] is False
    assert repeated_pending.get_json()["deduplicated"] is True

    moved_to_interview = client.post(
        f"/api/pipeline/demands/{demand_id}/move",
        headers=_auth(recruiter_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "job_id": job_id,
            "stage": "interview",
            "note": "进入面试",
        },
    )
    assert moved_to_interview.status_code == 200, moved_to_interview.get_json()

    scheduled_at = (
        datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1)
    ).isoformat(timespec="seconds")
    assignment_payload = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "job_id": job_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
        "scheduled_at": scheduled_at,
        "location": "内部会议室",
    }
    assigned = client.post(
        "/api/interview/assignments",
        headers=_auth(recruiter_token),
        json=assignment_payload,
    )
    repeated_assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(recruiter_token),
        json=assignment_payload,
    )
    assert assigned.status_code == 201, assigned.get_json()
    assert repeated_assignment.status_code == 200, repeated_assignment.get_json()
    assert repeated_assignment.get_json()["deduplicated"] is True
    assignment_id = assigned.get_json()["id"]

    with app.app_context():
        from app import db
        from app.models import InterviewAssignment

        assignment = db.session.get(InterviewAssignment, assignment_id)
        assignment.scheduled_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1)
        db.session.commit()

    conducted = client.post(
        f"/api/interview/assignments/{assignment_id}/mark-conducted",
        headers=_auth(recruiter_token),
    )
    assert conducted.status_code == 200, conducted.get_json()
    assert conducted.get_json()["status"] == "awaiting_feedback"

    feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "satisfied",
            "note": "技术基础扎实，建议推进 Offer。",
        },
    )
    assert feedback.status_code == 201, feedback.get_json()

    board_after_feedback = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(recruiter_token),
    ).get_json()
    row_after_feedback = next(
        item
        for item in board_after_feedback["candidates"]
        if item["candidate_id"] == candidate_id
    )
    assert row_after_feedback["stage"] == "interview"

    moved_to_offer = client.post(
        f"/api/pipeline/demands/{demand_id}/move",
        headers=_auth(recruiter_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "job_id": job_id,
            "stage": "offer",
            "note": "面试通过，进入 Offer",
        },
    )
    assert moved_to_offer.status_code == 200, moved_to_offer.get_json()

    saved_offer = client.put(
        f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
        headers=_auth(recruiter_token),
        json={
            "salary_range": "30000",
            "onboard_date": "2026-09-15",
            "note": "核心试用 Offer",
        },
    )
    assert saved_offer.status_code == 200, saved_offer.get_json()
    offer_id = saved_offer.get_json()["id"]

    submitted = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, "core-trial-offer-submit"),
        json={"action": "submit", "comment": "请审批"},
    )
    approved = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(manager_token),
        json={"action": "approve", "comment": "批准"},
    )
    sent = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "send", "channel": "offline"},
    )
    accepted = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "accept", "comment": "候选人接受"},
    )
    onboarded = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, "core-trial-offer-onboard"),
        json={"action": "onboard", "onboard_date": "2026-09-15"},
    )
    assert submitted.status_code == 200, submitted.get_json()
    assert approved.status_code == 200, approved.get_json()
    assert sent.status_code == 200, sent.get_json()
    assert accepted.status_code == 200, accepted.get_json()
    assert onboarded.status_code == 200, onboarded.get_json()
    assert onboarded.get_json()["status"] == "onboarded"
    assert onboarded.get_json()["onboard_date"] == date(2026, 9, 15).isoformat()

    demand_detail = client.get(
        f"/api/demands/{demand_id}",
        headers=_auth(recruiter_token),
    )
    final_board = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(recruiter_token),
    )
    overview = client.get("/api/bi/overview", headers=_auth(manager_token))
    offer_detail = client.get(
        f"/api/offers/{offer_id}",
        headers=_auth(recruiter_token),
    )
    assert demand_detail.status_code == final_board.status_code == overview.status_code == 200
    assert offer_detail.status_code == 200
    assert demand_detail.get_json()["metrics"]["onboarded_count"] == 1
    final_row = next(
        item
        for item in final_board.get_json()["candidates"]
        if item["candidate_id"] == candidate_id
    )
    assert final_row["stage"] == "onboarded"
    overview_row = next(
        item for item in overview.get_json()["demands"] if item["demand_id"] == demand_id
    )
    assert overview_row["funnel"]["onboarded"] == 1
    assert [item["action"] for item in offer_detail.get_json()["history"]] == [
        "saved",
        "submitted",
        "approved",
        "sent",
        "accepted",
        "onboarded",
    ]

    with app.app_context():
        from app.models import Event

        actions = {row.action for row in Event.query.all()}
        assert {
            "demand.created",
            "resume.parse_skipped",
            "resume.profile_updated",
            "pipeline.moved",
            "interview.assigned",
            "interview.feedback",
            "offer.saved",
            "offer.onboarded",
        }.issubset(actions)
