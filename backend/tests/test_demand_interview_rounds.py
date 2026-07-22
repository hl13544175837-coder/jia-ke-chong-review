import pytest
from sqlalchemy.exc import IntegrityError
from urllib.parse import parse_qs, urlsplit

from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    Event,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    InterviewNotificationDelivery,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_demand_flow(app, owner_id, suffix="A"):
    with app.app_context():
        job = Job(
            title="面试测试岗位",
            city="上海",
            department="技术部",
            jd_text="验证系统设计与业务判断",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            city="上海",
            department="技术部",
            job_title_snapshot=job.title,
            jd_text_snapshot=job.jd_text,
            request_no=f"REQ-IV-{suffix}",
            requester_department="技术部",
            hiring_manager_name="技术负责人",
            requested_at=__import__("datetime").date(2026, 7, 10),
            target_date=__import__("datetime").date(2026, 8, 10),
            headcount=1,
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked=f"候选人{suffix}",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status="active",
            )
        )
        db.session.add(
            PipelineStage(
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="interview",
                updated_by=owner_id,
            )
        )
        db.session.commit()
        return job.id, demand.id, candidate.id


def test_primary_feedback_completes_round_but_never_advances_pipeline(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-round-owner@example.com", role="recruiter")
    primary_id, primary_token = make_user(
        "iv-round-primary@example.com", role="interviewer", name="主面试官"
    )
    assistant_id, assistant_token = make_user(
        "iv-round-assistant@example.com", role="interviewer", name="辅助面试官"
    )
    job_id, demand_id, candidate_id = _seed_demand_flow(app, owner_id)

    primary = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": primary_id,
        },
    )
    assistant = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": False,
            "interviewer_id": assistant_id,
        },
    )
    assert primary.status_code == assistant.status_code == 201
    assert primary.get_json()["demand_id"] == demand_id
    assert primary.get_json()["is_primary"] is True

    before = _latest_stage_ids(app, demand_id, candidate_id)
    assistant_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(assistant_token),
        json={
            "assignment_id": assistant.get_json()["id"],
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 4,
            "passed": True,
        },
    )
    assert assistant_feedback.status_code == 201
    assert assistant_feedback.get_json()["round_completed"] is False
    assert _latest_stage_ids(app, demand_id, candidate_id) == before

    primary_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(primary_token),
        json={
            "assignment_id": primary.get_json()["id"],
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 5,
            "passed": True,
        },
    )
    assert primary_feedback.status_code == 201
    assert primary_feedback.get_json()["round_completed"] is True
    assert primary_feedback.get_json()["next_action"] == "awaiting_hr_decision"
    assert _latest_stage_ids(app, demand_id, candidate_id) == before

    with app.app_context():
        refreshed = db.session.get(InterviewAssignment, primary.get_json()["id"])
        assert refreshed.status == "completed"


def test_assignment_creates_interviewer_todo_and_primary_feedback_notifies_owner(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-todo-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "iv-todo-primary@example.com", role="interviewer", name="主面试官"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "TODO")

    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": interviewer_id,
        },
    )
    assert assignment.status_code == 201

    notification_list = client.get(
        "/api/notifications",
        headers=_auth(interviewer_token),
    )
    assert notification_list.status_code == 200
    assert notification_list.get_json()["notifications"][0]["demand_id"] == demand_id

    with app.app_context():
        todo = Notification.query.filter_by(
            user_id=interviewer_id,
            demand_id=demand_id,
            type="interview_assignment",
        ).one()
        assert "待反馈" in todo.title
        assert f"demand={demand_id}" in todo.link
        assert f"candidate={candidate_id}" in todo.link
        assigned_event = Event.query.filter_by(
            action="interview.assigned", demand_id=demand_id
        ).one()
        assert assigned_event.payload["assignment_id"] == assignment.get_json()["id"]

    feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_token),
        json={
            "assignment_id": assignment.get_json()["id"],
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 4,
            "passed": True,
        },
    )
    assert feedback.status_code == 201
    assert feedback.get_json()["next_action"] == "awaiting_hr_decision"

    with app.app_context():
        decision = Notification.query.filter_by(
            user_id=owner_id,
            demand_id=demand_id,
            type="interview_feedback_ready",
        ).one()
        assert "HR 确认" in decision.title
        assert f"demand={demand_id}" in decision.link


def test_webhook_access_link_accepts_task_and_submits_feedback(
    client, make_user, app, monkeypatch
):
    owner_id, owner_token = make_user(
        "iv-link-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "iv-link-interviewer@example.com", role="interviewer", name="链接面试官"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "LINK")
    delivered = {}

    class Response:
        status_code = 200

        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return {}

    def post_webhook(url, *, json, headers, timeout):
        delivered.update({
            "url": url,
            "json": json,
            "headers": headers,
            "timeout": timeout,
        })
        return Response()

    app.config.update(
        PUBLIC_APP_BASE_URL="https://hiring.example.test",
        INTERVIEW_NOTIFICATION_WEBHOOK_URL=(
            "https://wecom-gateway.example.test/interviews"
        ),
        INTERVIEW_NOTIFICATION_WEBHOOK_MODE="generic",
    )
    from app.services import interview_notification_service

    monkeypatch.setattr(
        interview_notification_service.requests,
        "post",
        post_webhook,
    )
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": interviewer_id,
            "scheduled_at": "2026-07-25T10:00:00",
            "location": "线上会议室",
        },
    )
    assert assignment.status_code == 201
    assert assignment.get_json()["demand_request_no"] == "REQ-IV-LINK"
    assert assignment.get_json()["notification_delivery"]["status"] == "sent"
    assert delivered["url"] == "https://wecom-gateway.example.test/interviews"
    assert delivered["headers"]["Idempotency-Key"].startswith(
        "interview-assignment-"
    )
    access_url = delivered["json"]["access_url"]
    token = parse_qs(urlsplit(access_url).fragment)["token"][0]

    details = client.post("/api/interview/access/get", json={"token": token})
    assert details.status_code == 200
    assert details.get_json()["candidate_name"] == "候选人LINK"
    assert details.get_json()["can_respond"] is True

    accepted = client.post(
        "/api/interview/access/respond",
        json={"token": token, "decision": "accepted"},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["response_status"] == "accepted"
    assert accepted.get_json()["deduplicated"] is False

    feedback = client.post(
        "/api/interview/access/feedback",
        json={
            "token": token,
            "score": 5,
            "passed": True,
            "strengths": "系统设计扎实",
            "concerns": "需要补充管理案例",
            "evaluation": {"专业能力": 5, "沟通表达": 4},
            "note": "建议进入下一步",
        },
    )
    assert feedback.status_code == 201
    assert feedback.get_json()["round_completed"] is True
    after = client.post("/api/interview/access/get", json={"token": token})
    assert after.get_json()["feedback_submitted"] is True
    assert after.get_json()["can_submit_feedback"] is False

    with app.app_context():
        delivery = InterviewNotificationDelivery.query.filter_by(
            assignment_id=assignment.get_json()["id"]
        ).one()
        assert delivery.attempts == 1
        event = Event.query.filter_by(
            action="interview.assignment_responded",
            actor_id=interviewer_id,
        ).one()
        assert event.source == "interview_access_link"


def test_declined_access_task_releases_slot_for_reassignment(client, make_user, app):
    owner_id, owner_token = make_user(
        "iv-decline-owner@example.com", role="recruiter"
    )
    first_id, first_token = make_user(
        "iv-decline-first@example.com", role="interviewer"
    )
    second_id, _ = make_user(
        "iv-decline-second@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "DECLINE")
    app.config["PUBLIC_APP_BASE_URL"] = "https://hiring.example.test"
    common = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "round": "round_1",
        "round_sequence": 1,
        "is_primary": True,
    }
    first = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": first_id},
    )
    assert first.status_code == 201
    with app.app_context():
        from app.services.interview_notification_service import (
            create_interview_access_token,
        )

        stored = db.session.get(InterviewAssignment, first.get_json()["id"])
        token = create_interview_access_token(stored)

    declined = client.post(
        "/api/interview/access/respond",
        json={
            "token": token,
            "decision": "declined",
            "reason": "时间冲突，无法参加",
        },
    )
    assert declined.status_code == 200
    assert declined.get_json()["response_status"] == "declined"
    assert declined.get_json()["can_submit_feedback"] is False

    own_assignments = client.get(
        "/api/interview/assignments", headers=_auth(first_token)
    )
    assert own_assignments.status_code == 200
    assert own_assignments.get_json() == []
    rejected_feedback = client.post(
        "/api/interview/access/feedback",
        json={"token": token, "score": 4, "passed": True},
    )
    assert rejected_feedback.status_code == 404
    assert rejected_feedback.get_json()["code"] == "assignment_not_found"

    replacement = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": second_id},
    )
    assert replacement.status_code == 201
    assert replacement.get_json()["id"] != first.get_json()["id"]

    visible = client.get(
        f"/api/interview/assignments?demand_id={demand_id}",
        headers=_auth(owner_token),
    ).get_json()
    declined_item = next(
        item for item in visible if item["id"] == first.get_json()["id"]
    )
    assert declined_item["response_reason"] == "时间冲突，无法参加"


def test_assignment_audit_failure_rolls_back_assignment_and_notification(
    client, make_user, app, monkeypatch
):
    owner_id, owner_token = make_user("iv-assignment-audit-owner@example.com", role="recruiter")
    interviewer_id, _ = make_user("iv-assignment-audit-iv@example.com", role="interviewer")
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "ASSIGN-AUDIT")
    from app.services import interview_workflow_service

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(interview_workflow_service, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            "/api/interview/assignments",
            headers=_auth(owner_token),
            json={
                "candidate_id": candidate_id,
                "demand_id": demand_id,
                "round": "round_1",
                "round_sequence": 1,
                "is_primary": True,
                "interviewer_id": interviewer_id,
            },
        )

    with app.app_context():
        db.session.remove()
        assert InterviewAssignment.query.filter_by(demand_id=demand_id).count() == 0
        assert Notification.query.filter_by(
            demand_id=demand_id, type="interview_assignment"
        ).count() == 0
        assert Event.query.filter_by(action="interview.assigned", demand_id=demand_id).count() == 0


def test_feedback_audit_failure_rolls_back_feedback_status_and_notification(
    client, make_user, app, monkeypatch
):
    owner_id, owner_token = make_user("iv-feedback-audit-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "iv-feedback-audit-iv@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "FEEDBACK-AUDIT")
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": interviewer_id,
        },
    )
    assert assignment.status_code == 201
    assignment_id = assignment.get_json()["id"]
    from app.services import interview_workflow_service

    original_record_event = interview_workflow_service.record_event

    def guarded_fail_feedback(action, *args, **kwargs):
        if action == "interview.feedback":
            raise RuntimeError("audit write failed")
        return original_record_event(action, *args, **kwargs)

    monkeypatch.setattr(
        interview_workflow_service,
        "record_event",
        guarded_fail_feedback,
    )
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            "/api/interview/feedback",
            headers=_auth(interviewer_token),
            json={
                "assignment_id": assignment_id,
                "candidate_id": candidate_id,
                "demand_id": demand_id,
                "round": "round_1",
                "score": 5,
                "passed": True,
            },
        )

    with app.app_context():
        db.session.remove()
        assert InterviewFeedback.query.filter_by(assignment_id=assignment_id).count() == 0
        assert db.session.get(InterviewAssignment, assignment_id).status == "scheduled"
        assert Notification.query.filter_by(
            demand_id=demand_id, type="interview_feedback_ready"
        ).count() == 0


def _latest_stage_ids(app, demand_id, candidate_id):
    with app.app_context():
        return [
            row.id
            for row in PipelineStage.query.filter_by(
                demand_id=demand_id,
                candidate_id=candidate_id,
            ).order_by(PipelineStage.id).all()
        ]


def test_only_one_active_primary_interviewer_per_round_sequence(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-primary-owner@example.com", role="recruiter")
    first_id, _ = make_user("iv-primary-first@example.com", role="interviewer")
    second_id, _ = make_user("iv-primary-second@example.com", role="interviewer")
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "PRIMARY")

    first = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": first_id,
        },
    )
    second = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": second_id,
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.get_json()["code"] == "primary_interviewer_exists"


def test_database_rejects_duplicate_primary_slot_for_same_demand_round(
    make_user, app
):
    owner_id, _ = make_user("iv-db-owner@example.com", role="recruiter")
    first_id, _ = make_user("iv-db-first@example.com", role="interviewer")
    second_id, _ = make_user("iv-db-second@example.com", role="interviewer")
    job_id, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "DB-PRIMARY")

    with app.app_context():
        db.session.add(
            InterviewAssignment(
                org_id=1,
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=demand_id,
                round="round_1",
                round_sequence=1,
                is_primary=True,
                primary_slot=1,
                interviewer_id=first_id,
                status="scheduled",
                created_by=owner_id,
            )
        )
        db.session.commit()
        db.session.add(
            InterviewAssignment(
                org_id=1,
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=demand_id,
                round="round_1",
                round_sequence=1,
                is_primary=True,
                primary_slot=1,
                interviewer_id=second_id,
                status="scheduled",
                created_by=owner_id,
            )
        )
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_database_rejects_duplicate_feedback_for_one_assignment(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-fb-owner@example.com", role="recruiter")
    interviewer_id, _ = make_user("iv-fb-reviewer@example.com", role="interviewer")
    job_id, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "DB-FEEDBACK")
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": interviewer_id,
        },
    )
    assert assignment.status_code == 201

    with app.app_context():
        common = {
            "org_id": 1,
            "candidate_id": candidate_id,
            "job_id": job_id,
            "demand_id": demand_id,
            "assignment_id": assignment.get_json()["id"],
            "round": "round_1",
            "interviewer_id": interviewer_id,
        }
        db.session.add(InterviewFeedback(**common, score=4))
        db.session.commit()
        db.session.add(InterviewFeedback(**common, score=5))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_feedback_retry_by_assignment_returns_original_row(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-retry-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "iv-retry-reviewer@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "FB-RETRY")
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": interviewer_id,
        },
    )
    payload = {
        "assignment_id": assignment.get_json()["id"],
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "round": "round_1",
        "score": 4,
        "passed": True,
    }

    first = client.post(
        "/api/interview/feedback", headers=_auth(interviewer_token), json=payload
    )
    retry = client.post(
        "/api/interview/feedback", headers=_auth(interviewer_token), json=payload
    )

    assert first.status_code == 201
    assert retry.status_code == 200
    assert retry.get_json()["id"] == first.get_json()["id"]
    assert retry.get_json()["deduplicated"] is True
    with app.app_context():
        assert InterviewFeedback.query.filter_by(
            assignment_id=assignment.get_json()["id"]
        ).count() == 1


def test_ai_screen_is_demand_scoped_and_read_only_for_pipeline(
    client, make_user, app, monkeypatch
):
    owner_id, owner_token = make_user("iv-ai-owner@example.com", role="recruiter")
    job_id, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "AI")
    from app.services.interview_service import PreScreenService

    monkeypatch.setattr(
        PreScreenService,
        "build_report",
        lambda self, pairs, jd: {
            "avg_score": 1.0,
            "pass_recommended": False,
            "details": [],
        },
    )
    before = _latest_stage_ids(app, demand_id, candidate_id)

    response = client.post(
        "/api/interview/submit",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "qa_pairs": [{"q": "问题", "a": "回答"}],
        },
    )

    assert response.status_code == 200
    assert response.get_json()["decision_required"] is True
    assert response.get_json()["pipeline_changed"] is False
    assert _latest_stage_ids(app, demand_id, candidate_id) == before
    with app.app_context():
        interview = Interview.query.one()
        assert interview.demand_id == demand_id
        assert interview.job_id == job_id
        assert interview.pass_recommended is False


def test_job_only_interview_request_is_rejected_when_job_has_multiple_demands(
    client, make_user, app
):
    owner_id, owner_token = make_user("iv-ambiguous-owner@example.com", role="recruiter")
    interviewer_id, _ = make_user("iv-ambiguous-interviewer@example.com", role="interviewer")
    job_id, first_demand_id, candidate_id = _seed_demand_flow(app, owner_id, "AMB-A")
    with app.app_context():
        first = db.session.get(RecruitmentDemand, first_demand_id)
        sibling = RecruitmentDemand(
            job_id=job_id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            city="宁波",
            department="交付部",
            job_title_snapshot=first.job_title_snapshot,
            jd_text_snapshot=first.jd_text_snapshot,
            request_no="REQ-IV-AMB-B",
            requester_department="交付部",
            hiring_manager_name="交付负责人",
            requested_at=first.requested_at,
            target_date=first.target_date,
            headcount=1,
            status="active",
        )
        db.session.add(sibling)
        db.session.commit()

    response = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "job_id": job_id,
            "round": "round_1",
            "interviewer_id": interviewer_id,
        },
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_id_required"


def test_assignment_and_feedback_are_isolated_between_sibling_demands(
    client, make_user, app
):
    first_owner_id, first_token = make_user("iv-isolate-first@example.com", role="recruiter")
    second_owner_id, second_token = make_user("iv-isolate-second@example.com", role="recruiter")
    interviewer_id, _ = make_user("iv-isolate-interviewer@example.com", role="interviewer")
    job_id, first_demand_id, candidate_id = _seed_demand_flow(app, first_owner_id, "ISO-A")
    with app.app_context():
        sibling = RecruitmentDemand(
            job_id=job_id,
            owner_hr_id=second_owner_id,
            created_by=second_owner_id,
            city="苏州",
            department="二部",
            job_title_snapshot="面试测试岗位",
            jd_text_snapshot="验证系统设计与业务判断",
            request_no="REQ-IV-ISO-B",
            requester_department="二部",
            hiring_manager_name="二部负责人",
            requested_at=__import__("datetime").date(2026, 7, 10),
            target_date=__import__("datetime").date(2026, 8, 10),
            headcount=1,
            status="active",
        )
        db.session.add(sibling)
        db.session.commit()
        second_demand_id = sibling.id

    blocked = client.post(
        "/api/interview/assignments",
        headers=_auth(second_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": first_demand_id,
            "round": "round_1",
            "interviewer_id": interviewer_id,
        },
    )
    assert blocked.status_code == 403

    own = client.post(
        "/api/interview/assignments",
        headers=_auth(first_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": first_demand_id,
            "round": "round_1",
            "interviewer_id": interviewer_id,
            "is_primary": True,
        },
    )
    assert own.status_code == 201
    first_list = client.get(
        f"/api/interview/assignments?demand_id={first_demand_id}",
        headers=_auth(first_token),
    )
    second_list = client.get(
        f"/api/interview/assignments?demand_id={second_demand_id}",
        headers=_auth(second_token),
    )
    assert [item["id"] for item in first_list.get_json()] == [own.get_json()["id"]]
    assert second_list.get_json() == []


def test_job_only_interview_writes_require_an_existing_demand(
    client, make_user, app, monkeypatch
):
    owner_id, owner_token = make_user(
        "iv-no-demand-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "iv-no-demand-interviewer@example.com", role="interviewer"
    )
    with app.app_context():
        job = Job(
            title="尚未创建需求的岗位模板",
            jd_text="岗位模板不能直接承载面试事实",
            owner_hr_id=owner_id,
        )
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="无需求候选人",
            resume_json={},
        )
        db.session.add_all([job, candidate])
        db.session.commit()
        job_id, candidate_id = job.id, candidate.id
    from app.services.interview_service import PreScreenService

    monkeypatch.setattr(
        PreScreenService,
        "generate_questions",
        lambda *args, **kwargs: pytest.fail("无 Demand 时不应调用 LLM"),
    )
    monkeypatch.setattr(
        PreScreenService,
        "build_report",
        lambda *args, **kwargs: pytest.fail("无 Demand 时不应调用 LLM"),
    )

    requests = [
        client.post(
            "/api/interview/assignments",
            headers=_auth(owner_token),
            json={
                "candidate_id": candidate_id,
                "job_id": job_id,
                "round": "round_1",
                "interviewer_id": interviewer_id,
            },
        ),
        client.post(
            "/api/interview/start",
            headers=_auth(owner_token),
            json={"candidate_id": candidate_id, "job_id": job_id},
        ),
        client.post(
            "/api/interview/submit",
            headers=_auth(owner_token),
            json={
                "candidate_id": candidate_id,
                "job_id": job_id,
                "qa_pairs": [{"q": "问题", "a": "回答"}],
            },
        ),
    ]

    assert [(response.status_code, response.get_json().get("code")) for response in requests] == [
        (404, "demand_not_found"),
        (404, "demand_not_found"),
        (404, "demand_not_found"),
    ]
    with app.app_context():
        assert InterviewAssignment.query.count() == 0
        assert Interview.query.count() == 0


def test_feedback_requires_an_assignment_for_the_current_actor(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "iv-unassigned-owner@example.com", role="recruiter"
    )
    _, manager_token = make_user(
        "iv-unassigned-manager@example.com", role="manager"
    )
    _, demand_id, candidate_id = _seed_demand_flow(
        app, owner_id, "UNASSIGNED-FEEDBACK"
    )
    payload = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "round": "round_1",
        "score": 5,
        "passed": True,
    }

    owner_response = client.post(
        "/api/interview/feedback", headers=_auth(owner_token), json=payload
    )
    manager_response = client.post(
        "/api/interview/feedback", headers=_auth(manager_token), json=payload
    )

    for response in (owner_response, manager_response):
        assert response.status_code == 404
        assert response.get_json()["code"] == "assignment_not_found"
    with app.app_context():
        assert InterviewFeedback.query.count() == 0


def test_recruiter_interview_lists_follow_demand_ownership_after_transfer(
    client, make_user, app
):
    first_owner_id, first_token = make_user(
        "iv-list-first@example.com", role="recruiter"
    )
    second_owner_id, second_token = make_user(
        "iv-list-second@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "iv-list-interviewer@example.com", role="interviewer"
    )
    job_id, first_demand_id, candidate_id = _seed_demand_flow(
        app, first_owner_id, "LIST-FIRST"
    )
    with app.app_context():
        first_demand = db.session.get(RecruitmentDemand, first_demand_id)
        second_demand = RecruitmentDemand(
            job_id=job_id,
            owner_hr_id=second_owner_id,
            created_by=second_owner_id,
            city="上海",
            department="技术部",
            job_title_snapshot=first_demand.job_title_snapshot,
            jd_text_snapshot=first_demand.jd_text_snapshot,
            request_no="REQ-IV-LIST-SECOND",
            requester_department="技术部",
            hiring_manager_name="技术负责人",
            requested_at=first_demand.requested_at,
            target_date=first_demand.target_date,
            headcount=1,
            status="active",
        )
        db.session.add(second_demand)
        db.session.flush()
        candidate = db.session.get(Candidate, candidate_id)
        candidate.owner_hr_id = second_owner_id
        candidate.current_demand_id = second_demand.id
        first_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate_id,
            demand_id=first_demand_id,
        ).one()
        first_flow.status = "transferred"
        db.session.add(
            CandidateDemandFlow(
                candidate_id=candidate_id,
                demand_id=second_demand.id,
                owner_hr_id=second_owner_id,
                status="active",
                transfer_from_demand_id=first_demand_id,
            )
        )
        facts = [
            Interview(
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=first_demand_id,
                qa_json=[],
                ai_report={},
                score=3,
            ),
            Interview(
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=second_demand.id,
                qa_json=[],
                ai_report={},
                score=4,
            ),
            InterviewFeedback(
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=first_demand_id,
                round="round_1",
                interviewer_id=interviewer_id,
                score=3,
            ),
            InterviewFeedback(
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=second_demand.id,
                round="round_2",
                interviewer_id=interviewer_id,
                score=4,
            ),
        ]
        db.session.add_all(facts)
        db.session.commit()
        second_demand_id = second_demand.id

    first_feedback = client.get(
        "/api/interview/feedback", headers=_auth(first_token)
    ).get_json()
    second_feedback = client.get(
        "/api/interview/feedback", headers=_auth(second_token)
    ).get_json()
    first_records = client.get("/api/interviews", headers=_auth(first_token)).get_json()
    second_records = client.get("/api/interviews", headers=_auth(second_token)).get_json()

    assert {item["demand_id"] for item in first_feedback} == {first_demand_id}
    assert {item["demand_id"] for item in second_feedback} == {second_demand_id}
    assert {item["demand_id"] for item in first_records} == {first_demand_id}
    assert {item["demand_id"] for item in second_records} == {second_demand_id}


def test_assignment_status_is_server_managed_and_cancel_releases_primary_slot(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "iv-cancel-owner@example.com", role="recruiter"
    )
    first_id, first_token = make_user(
        "iv-cancel-first@example.com", role="interviewer"
    )
    second_id, _ = make_user(
        "iv-cancel-second@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "CANCEL")
    common = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "round": "round_1",
        "round_sequence": 1,
        "is_primary": True,
    }

    forged = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": first_id, "status": "Cancelled"},
    )
    assert forged.status_code == 400
    assert forged.get_json()["code"] == "assignment_status_managed_by_server"

    first = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": first_id},
    )
    assert first.status_code == 201
    cancelled = client.patch(
        f"/api/interview/assignments/{first.get_json()['id']}/cancel",
        headers=_auth(owner_token),
        json={"reason": "面试官临时无法参加"},
    )
    assert cancelled.status_code == 200
    assert cancelled.get_json()["status"] == "cancelled"

    same_interviewer_replacement = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": first_id},
    )
    assert same_interviewer_replacement.status_code == 201
    assert same_interviewer_replacement.get_json()["id"] != first.get_json()["id"]
    cancelled_again = client.patch(
        f"/api/interview/assignments/{same_interviewer_replacement.get_json()['id']}/cancel",
        headers=_auth(owner_token),
        json={"reason": "改由其他面试官参加"},
    )
    assert cancelled_again.status_code == 200

    replacement = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={**common, "interviewer_id": second_id},
    )
    assert replacement.status_code == 201

    for payload in (
        {
            "assignment_id": first.get_json()["id"],
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 4,
        },
        {
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 4,
        },
    ):
        response = client.post(
            "/api/interview/feedback", headers=_auth(first_token), json=payload
        )
        assert response.status_code == 404
        assert response.get_json()["code"] == "assignment_not_found"

    own_assignments = client.get(
        "/api/interview/assignments", headers=_auth(first_token)
    )
    assert own_assignments.status_code == 200
    assert own_assignments.get_json() == []


def test_assignment_rejects_coerced_primary_and_round_sequence_values(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "iv-assignment-types-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "iv-assignment-types-interviewer@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(app, owner_id, "TYPES")
    base = {
        "candidate_id": candidate_id,
        "demand_id": demand_id,
        "round": "round_1",
        "interviewer_id": interviewer_id,
    }

    for invalid in (
        {"round_sequence": 0},
        {"round_sequence": -1},
        {"round_sequence": "1"},
        {"is_primary": "false"},
    ):
        response = client.post(
            "/api/interview/assignments",
            headers=_auth(owner_token),
            json={**base, **invalid},
        )
        assert response.status_code == 400

    with app.app_context():
        assert InterviewAssignment.query.filter_by(
            demand_id=demand_id,
            candidate_id=candidate_id,
        ).count() == 0


def test_mixed_case_cancelled_assignment_grants_no_candidate_or_pipeline_access(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "iv-cancel-access-owner@example.com", role="recruiter"
    )
    interviewer_id, interviewer_token = make_user(
        "iv-cancel-access-interviewer@example.com", role="interviewer"
    )
    _, demand_id, candidate_id = _seed_demand_flow(
        app, owner_id, "CANCEL-ACCESS"
    )
    assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "interviewer_id": interviewer_id,
        },
    )
    assert assignment.status_code == 201
    with app.app_context():
        stored = db.session.get(InterviewAssignment, assignment.get_json()["id"])
        stored.status = " Cancelled "
        stored.primary_slot = 1
        db.session.commit()

    candidates = client.get("/api/candidates", headers=_auth(interviewer_token))
    board = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(interviewer_token),
    )
    feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(interviewer_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "score": 4,
        },
    )

    assert candidates.status_code == 200
    assert candidates.get_json() == []
    assert board.status_code == 403
    assert feedback.status_code == 404
    assert feedback.get_json()["code"] == "assignment_not_found"

    repaired = client.patch(
        f"/api/interview/assignments/{assignment.get_json()['id']}/cancel",
        headers=_auth(owner_token),
        json={"reason": "规范历史取消任务"},
    )
    assert repaired.status_code == 200
    assert repaired.get_json()["status"] == "cancelled"
    with app.app_context():
        stored = db.session.get(InterviewAssignment, assignment.get_json()["id"])
        assert stored.primary_slot is None


def test_legacy_null_demand_ai_report_list_and_detail_remain_readable(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "iv-legacy-report-owner@example.com", role="recruiter"
    )
    with app.app_context():
        job = Job(title="历史岗位", jd_text="历史 JD", owner_hr_id=owner_id)
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="历史候选人",
            resume_json={},
        )
        db.session.add_all([job, candidate])
        db.session.flush()
        report = Interview(
            candidate_id=candidate.id,
            job_id=job.id,
            demand_id=None,
            qa_json=[],
            ai_report={"legacy": True},
            score=3,
        )
        db.session.add(report)
        db.session.commit()
        report_id = report.id

    listed = client.get("/api/interviews", headers=_auth(owner_token))
    detail = client.get(
        f"/api/interview/{report_id}", headers=_auth(owner_token)
    )

    assert listed.status_code == 200
    assert [item["id"] for item in listed.get_json()] == [report_id]
    assert detail.status_code == 200
    assert detail.get_json()["demand_id"] is None
    assert detail.get_json()["ai_report"] == {"legacy": True}


@pytest.mark.parametrize("operation", ["start", "submit"])
def test_ai_interview_revalidates_current_demand_after_llm(
    client, make_user, app, monkeypatch, operation
):
    owner_id, owner_token = make_user(
        f"iv-toctou-{operation}@example.com", role="recruiter"
    )
    _, first_demand_id, candidate_id = _seed_demand_flow(
        app, owner_id, f"TOCTOU-{operation}"
    )
    with app.app_context():
        first = db.session.get(RecruitmentDemand, first_demand_id)
        second = RecruitmentDemand(
            job_id=first.job_id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no=f"REQ-IV-TOCTOU-{operation}-2",
            job_title_snapshot=first.job_title_snapshot,
            jd_text_snapshot=first.jd_text_snapshot,
            status="active",
        )
        db.session.add(second)
        db.session.commit()
        second_demand_id = second.id

    def transfer_during_llm(*_args, **_kwargs):
        candidate = db.session.get(Candidate, candidate_id)
        old_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate_id,
            demand_id=first_demand_id,
        ).one()
        old_flow.status = "transferred"
        candidate.current_demand_id = second_demand_id
        candidate.owner_hr_id = owner_id
        db.session.add(
            CandidateDemandFlow(
                candidate_id=candidate_id,
                demand_id=second_demand_id,
                owner_hr_id=owner_id,
                status="active",
                transfer_from_demand_id=first_demand_id,
            )
        )
        db.session.commit()
        if operation == "start":
            return ["问题"]
        return {"avg_score": 4.0, "pass_recommended": True, "details": []}

    from app.services.interview_service import PreScreenService

    monkeypatch.setattr(
        PreScreenService,
        "generate_questions" if operation == "start" else "build_report",
        transfer_during_llm,
    )
    payload = {
        "candidate_id": candidate_id,
        "demand_id": first_demand_id,
    }
    if operation == "submit":
        payload["qa_pairs"] = [{"q": "问题", "a": "回答"}]

    response = client.post(
        f"/api/interview/{operation}",
        headers=_auth(owner_token),
        json=payload,
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "candidate_not_in_demand"
    with app.app_context():
        assert Interview.query.count() == 0
