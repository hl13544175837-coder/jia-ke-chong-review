from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
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
