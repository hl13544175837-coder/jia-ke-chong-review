from datetime import datetime, timedelta

from sqlalchemy import event

from app import db
from app.models import (
    BusinessReviewTask,
    Candidate,
    CandidateDemandFlow,
    Event,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
)
from app.time_utils import utc_now


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_interview_candidate(
    app,
    *,
    owner_id,
    suffix,
    org_id=1,
    interviewer_id=None,
    scheduled_at=None,
    assignment_status="scheduled",
    pipeline_stage="interview",
):
    with app.app_context():
        job = Job(
            org_id=org_id,
            title=f"模板标题-{suffix}",
            city="模板城市",
            department="模板部门",
            jd_text="面试管理合同测试 JD",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=org_id,
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no=f"REQ-MGMT-{suffix}",
            job_title_snapshot=f"需求快照标题-{suffix}",
            city=f"需求城市-{suffix}",
            department=f"需求部门-{suffix}",
            jd_text_snapshot=job.jd_text,
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=org_id,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked=f"候选人-{suffix}",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status="active",
            )
        )
        db.session.add(
            PipelineStage(
                org_id=org_id,
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage=pipeline_stage,
                updated_by=owner_id,
            )
        )
        assignment = None
        if interviewer_id is not None:
            assignment = InterviewAssignment(
                org_id=org_id,
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                round="round_1",
                round_sequence=1,
                is_primary=True,
                primary_slot=1,
                interviewer_id=interviewer_id,
                scheduled_at=scheduled_at,
                location="原会议室",
                note="原备注",
                status=assignment_status,
                created_by=owner_id,
            )
            db.session.add(assignment)
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_id": demand.id,
            "candidate_id": candidate.id,
            "assignment_id": assignment.id if assignment else None,
        }


def test_management_rows_include_unassigned_and_enforce_role_demand_and_org_scope(
    client, make_user, app
):
    first_owner_id, first_owner_token = make_user(
        "mgmt-owner-a@example.com", role="recruiter", name="专员甲"
    )
    second_owner_id, second_owner_token = make_user(
        "mgmt-owner-b@example.com", role="recruiter", name="专员乙"
    )
    _, manager_token = make_user("mgmt-manager@example.com", role="manager")
    _, admin_token = make_user("mgmt-admin@example.com", role="admin")
    interviewer_id, interviewer_token = make_user(
        "mgmt-interviewer@example.com", role="interviewer", name="面试官甲"
    )
    foreign_owner_id, foreign_admin_token = make_user(
        "mgmt-foreign-admin@example.com", role="admin", org_id=2
    )
    own = _seed_interview_candidate(
        app, owner_id=first_owner_id, suffix="OWN"
    )
    assigned = _seed_interview_candidate(
        app,
        owner_id=second_owner_id,
        suffix="TEAM",
        interviewer_id=interviewer_id,
        scheduled_at=datetime(2026, 8, 1, 10, 0),
    )
    foreign = _seed_interview_candidate(
        app, owner_id=foreign_owner_id, suffix="FOREIGN", org_id=2
    )

    own_response = client.get(
        "/api/interview/management-rows", headers=_auth(first_owner_token)
    )
    second_response = client.get(
        "/api/interview/management-rows", headers=_auth(second_owner_token)
    )
    manager_response = client.get(
        "/api/interview/management-rows", headers=_auth(manager_token)
    )
    admin_response = client.get(
        "/api/interview/management-rows", headers=_auth(admin_token)
    )
    foreign_response = client.get(
        "/api/interview/management-rows", headers=_auth(foreign_admin_token)
    )
    interviewer_response = client.get(
        "/api/interview/management-rows", headers=_auth(interviewer_token)
    )

    assert own_response.status_code == 200
    assert second_response.status_code == 200
    assert manager_response.status_code == 200
    assert admin_response.status_code == 200
    assert foreign_response.status_code == 200
    assert interviewer_response.status_code == 403
    assert {row["demand_id"] for row in own_response.get_json()} == {
        own["demand_id"]
    }
    assert {row["demand_id"] for row in second_response.get_json()} == {
        assigned["demand_id"]
    }
    assert {row["demand_id"] for row in manager_response.get_json()} == {
        own["demand_id"],
        assigned["demand_id"],
    }
    assert {row["demand_id"] for row in admin_response.get_json()} == {
        own["demand_id"],
        assigned["demand_id"],
    }
    assert {row["demand_id"] for row in foreign_response.get_json()} == {
        foreign["demand_id"]
    }

    unassigned = own_response.get_json()[0]
    assert unassigned == {
        "candidate_id": own["candidate_id"],
        "name_masked": "候选人-OWN",
        "demand_id": own["demand_id"],
        "job_id": own["job_id"],
        "job_title": "需求快照标题-OWN",
        "job_city": "需求城市-OWN",
        "job_department": "需求部门-OWN",
        "pipeline_stage": "interview",
        "round": None,
        "round_sequence": None,
        "assignment_id": None,
        "is_primary": None,
        "interviewer_id": None,
        "interviewer_name": None,
        "scheduled_at": None,
        "location": "",
        "note": "",
        "assignment_status": "unassigned",
        "feedback_id": None,
        "feedback_submitted": False,
        "feedback_score": None,
        "feedback_passed": None,
        "feedback_result": None,
    }


def test_approved_business_review_is_ready_to_schedule_and_notifies_interviewer_route(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "approved-review-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "approved-review-interviewer@example.com", role="interviewer", name="业务面试官"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="APPROVED-REVIEW",
        pipeline_stage="business_review",
    )
    with app.app_context():
        db.session.add(
            BusinessReviewTask(
                org_id=1,
                demand_id=seeded["demand_id"],
                candidate_id=seeded["candidate_id"],
                reviewer_id=interviewer_id,
                status="approved",
                pending_slot=None,
                created_by=owner_id,
                decided_by=interviewer_id,
                decided_at=utc_now(),
            )
        )
        db.session.commit()

    rows = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )
    assert rows.status_code == 200
    assert rows.get_json()[0]["assignment_status"] == "unassigned"
    assert rows.get_json()[0]["candidate_id"] == seeded["candidate_id"]

    created = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": seeded["candidate_id"],
            "demand_id": seeded["demand_id"],
            "round": "round_1",
            "round_sequence": 1,
            "interviewer_id": interviewer_id,
            "scheduled_at": "2026-08-10T10:00:00",
            "location": "第一会议室",
        },
    )
    assert created.status_code == 201
    with app.app_context():
        latest_stage = (
            PipelineStage.query.filter_by(
                demand_id=seeded["demand_id"],
                candidate_id=seeded["candidate_id"],
            )
            .order_by(PipelineStage.id.desc())
            .first()
        )
        assert latest_stage.stage == "interview"
        notice = Notification.query.filter_by(
            user_id=interviewer_id,
            demand_id=seeded["demand_id"],
            type="interview_assignment",
        ).one()
        assert "新的面试安排" in notice.title
        assert "候选人-APPROVED-REVIEW" in notice.body
        assert "08-10 10:00" in notice.body
        assert "第一会议室" in notice.body
        assert notice.link == (
            f"/interviewer/interviews?demand={seeded['demand_id']}"
            f"&candidate={seeded['candidate_id']}"
        )


def test_only_latest_business_review_decision_can_enter_schedule_queue(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "latest-review-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "latest-review-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="LATEST-REVIEW",
        pipeline_stage="business_review",
    )
    with app.app_context():
        approved = BusinessReviewTask(
            org_id=1,
            demand_id=seeded["demand_id"],
            candidate_id=seeded["candidate_id"],
            reviewer_id=interviewer_id,
            status="approved",
            created_by=owner_id,
            decided_by=interviewer_id,
            decided_at=utc_now(),
        )
        db.session.add(approved)
        db.session.flush()
        approved.pending_slot = None
        db.session.flush()
        needs_info = BusinessReviewTask(
            org_id=1,
            demand_id=seeded["demand_id"],
            candidate_id=seeded["candidate_id"],
            reviewer_id=interviewer_id,
            status="needs_info",
            created_by=owner_id,
            decided_by=interviewer_id,
            decided_at=utc_now() + timedelta(seconds=1),
        )
        db.session.add(needs_info)
        db.session.flush()
        needs_info.pending_slot = None
        db.session.commit()

    rows = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )
    assert rows.status_code == 200
    assert rows.get_json() == []


def test_management_rows_use_latest_pipeline_stage_and_do_not_make_n_plus_one_queries(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "mgmt-query-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "mgmt-query-interviewer@example.com", role="interviewer", name="查询面试官"
    )
    included = []
    for index in range(6):
        included.append(
            _seed_interview_candidate(
                app,
                owner_id=owner_id,
                suffix=f"QUERY-{index}",
                interviewer_id=interviewer_id,
                scheduled_at=datetime(2026, 8, 2, 9 + index, 0),
            )
        )
    excluded = _seed_interview_candidate(
        app, owner_id=owner_id, suffix="LATEST-NOT-INTERVIEW"
    )
    with app.app_context():
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=excluded["candidate_id"],
                job_id=excluded["job_id"],
                demand_id=excluded["demand_id"],
                stage="offer",
                updated_by=owner_id,
                ts=utc_now() + timedelta(seconds=1),
            )
        )
        db.session.commit()

    statements = []

    def track_statement(*_args):
        statements.append(_args[2])

    with app.app_context():
        event.listen(db.engine, "before_cursor_execute", track_statement)
    try:
        response = client.get(
            "/api/interview/management-rows", headers=_auth(owner_token)
        )
    finally:
        with app.app_context():
            event.remove(db.engine, "before_cursor_execute", track_statement)

    assert response.status_code == 200
    assert {row["candidate_id"] for row in response.get_json()} == {
        item["candidate_id"] for item in included
    }
    select_statements = [
        statement for statement in statements if statement.lstrip().upper().startswith("SELECT")
    ]
    assert len(select_statements) <= 4


def test_management_rows_and_assignment_payload_expose_feedback_and_demand_snapshot(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "mgmt-feedback-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "mgmt-feedback-interviewer@example.com", role="interviewer", name="反馈面试官"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="FEEDBACK",
        interviewer_id=interviewer_id,
        scheduled_at=datetime(2026, 8, 3, 10, 0),
        assignment_status="completed",
    )
    with app.app_context():
        feedback = InterviewFeedback(
            org_id=1,
            candidate_id=seeded["candidate_id"],
            job_id=seeded["job_id"],
            demand_id=seeded["demand_id"],
            assignment_id=seeded["assignment_id"],
            round="round_1",
            interviewer_id=interviewer_id,
            score=4,
            passed=True,
            note="建议通过",
        )
        db.session.add(feedback)
        db.session.commit()
        feedback_id = feedback.id

    rows = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )
    assignments = client.get(
        "/api/interview/assignments", headers=_auth(owner_token)
    )

    assert rows.status_code == assignments.status_code == 200
    row = rows.get_json()[0]
    assert row["assignment_id"] == seeded["assignment_id"]
    assert row["feedback_id"] == feedback_id
    assert row["feedback_submitted"] is True
    assert row["feedback_score"] == 4
    assert row["feedback_passed"] is True
    assert row["feedback_result"] == "passed"
    payload = assignments.get_json()[0]
    assert payload["job_title"] == "需求快照标题-FEEDBACK"
    assert payload["job_city"] == "需求城市-FEEDBACK"
    assert payload["job_department"] == "需求部门-FEEDBACK"
    assert payload["pipeline_stage"] == "interview"


def test_management_rows_keep_primary_result_after_pipeline_advances_and_ignore_assistant(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "mgmt-result-owner@example.com", role="recruiter"
    )
    primary_id, primary_token = make_user(
        "mgmt-result-primary@example.com", role="interviewer", name="主面试官"
    )
    assistant_id, _ = make_user(
        "mgmt-result-assistant@example.com", role="interviewer", name="辅助面试官"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="RESULT-AFTER-PIPELINE",
        interviewer_id=primary_id,
        scheduled_at=utc_now() - timedelta(hours=1),
        assignment_status="awaiting_feedback",
    )
    with app.app_context():
        assistant = InterviewAssignment(
            org_id=1,
            candidate_id=seeded["candidate_id"],
            job_id=seeded["job_id"],
            demand_id=seeded["demand_id"],
            round="round_1",
            round_sequence=1,
            is_primary=False,
            primary_slot=None,
            interviewer_id=assistant_id,
            scheduled_at=utc_now() - timedelta(hours=1),
            status="feedback_submitted",
            created_by=owner_id,
        )
        db.session.add(assistant)
        db.session.flush()
        db.session.add(
            InterviewFeedback(
                org_id=1,
                candidate_id=seeded["candidate_id"],
                job_id=seeded["job_id"],
                demand_id=seeded["demand_id"],
                assignment_id=assistant.id,
                round="round_1",
                interviewer_id=assistant_id,
                score=2,
                passed=False,
            )
        )
        db.session.commit()

    primary_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(primary_token),
        json={
            "assignment_id": seeded["assignment_id"],
            "candidate_id": seeded["candidate_id"],
            "demand_id": seeded["demand_id"],
            "round": "round_1",
            "score": 5,
            "passed": True,
        },
    )
    assert primary_feedback.status_code == 201
    with app.app_context():
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=seeded["candidate_id"],
                job_id=seeded["job_id"],
                demand_id=seeded["demand_id"],
                stage="offer",
                updated_by=owner_id,
            )
        )
        db.session.commit()

    response = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )

    assert response.status_code == 200
    assert len(response.get_json()) == 1
    row = response.get_json()[0]
    assert row["assignment_id"] == seeded["assignment_id"]
    assert row["is_primary"] is True
    assert row["pipeline_stage"] == "offer"
    assert row["feedback_result"] == "passed"


def test_management_rows_return_cancelled_interview_candidate_as_unassigned(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "mgmt-cancelled-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "mgmt-cancelled-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="CANCELLED-TO-UNASSIGNED",
        interviewer_id=interviewer_id,
        scheduled_at=datetime(2026, 8, 3, 16, 0),
    )

    cancelled = client.patch(
        f"/api/interview/assignments/{seeded['assignment_id']}/cancel",
        headers=_auth(owner_token),
        json={"reason": "原面试官临时无法参加，等待重新安排"},
    )
    response = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )

    assert cancelled.status_code == 200
    assert response.status_code == 200
    assert len(response.get_json()) == 1
    row = response.get_json()[0]
    assert row["candidate_id"] == seeded["candidate_id"]
    assert row["assignment_id"] is None
    assert row["assignment_status"] == "unassigned"
    assert row["feedback_submitted"] is False


def test_adjust_assignment_validates_scope_interviewer_conflict_and_state(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "adjust-owner@example.com", role="recruiter"
    )
    other_owner_id, other_owner_token = make_user(
        "adjust-other-owner@example.com", role="recruiter"
    )
    _, manager_token = make_user("adjust-manager@example.com", role="manager")
    _, interviewer_token = make_user(
        "adjust-caller-interviewer@example.com", role="interviewer"
    )
    first_interviewer_id, _ = make_user(
        "adjust-first-interviewer@example.com", role="interviewer", name="原面试官"
    )
    second_interviewer_id, _ = make_user(
        "adjust-second-interviewer@example.com", role="interviewer", name="新面试官"
    )
    foreign_interviewer_id, _ = make_user(
        "adjust-foreign-interviewer@example.com",
        role="interviewer",
        name="外组织面试官",
        org_id=2,
    )
    target = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="ADJUST-TARGET",
        interviewer_id=first_interviewer_id,
        scheduled_at=datetime(2026, 8, 4, 10, 0),
    )
    conflict = _seed_interview_candidate(
        app,
        owner_id=other_owner_id,
        suffix="ADJUST-CONFLICT",
        interviewer_id=second_interviewer_id,
        scheduled_at=datetime(2026, 8, 4, 11, 0),
    )
    endpoint = f"/api/interview/assignments/{target['assignment_id']}"

    forbidden = client.patch(
        endpoint,
        headers=_auth(other_owner_token),
        json={"location": "越权会议室"},
    )
    interviewer_forbidden = client.patch(
        endpoint,
        headers=_auth(interviewer_token),
        json={"location": "面试官不能改"},
    )
    foreign = client.patch(
        endpoint,
        headers=_auth(owner_token),
        json={"interviewer_id": foreign_interviewer_id},
    )
    invalid_time = client.patch(
        endpoint,
        headers=_auth(owner_token),
        json={"scheduled_at": "不是时间"},
    )
    schedule_conflict = client.patch(
        endpoint,
        headers=_auth(owner_token),
        json={
            "interviewer_id": second_interviewer_id,
            "scheduled_at": "2026-08-04T11:00:00",
        },
    )

    assert forbidden.status_code == 403
    assert interviewer_forbidden.status_code == 403
    assert foreign.status_code == 400
    assert invalid_time.status_code == 400
    assert schedule_conflict.status_code == 409
    assert schedule_conflict.get_json()["code"] == "interviewer_schedule_conflict"

    updated = client.patch(
        endpoint,
        headers=_auth(manager_token),
        json={
            "interviewer_id": second_interviewer_id,
            "scheduled_at": "2026-08-04T12:30:00",
            "location": "新会议室",
            "note": "请准备系统设计题",
        },
    )
    assert updated.status_code == 200
    assert updated.get_json()["interviewer_id"] == second_interviewer_id
    assert updated.get_json()["scheduled_at"].startswith("2026-08-04T12:30:00")
    assert updated.get_json()["location"] == "新会议室"
    assert updated.get_json()["note"] == "请准备系统设计题"
    assert updated.get_json()["deduplicated"] is False

    with app.app_context():
        notifications = Notification.query.filter_by(
            demand_id=target["demand_id"], type="interview_assignment_updated"
        ).all()
        assert {item.user_id for item in notifications} == {
            first_interviewer_id,
            second_interviewer_id,
        }
        changed = Event.query.filter_by(
            action="interview.assignment_updated",
            demand_id=target["demand_id"],
        ).one()
        assert changed.payload["assignment_id"] == target["assignment_id"]
        assert changed.payload["interviewer_id"] == second_interviewer_id

        assignment = db.session.get(InterviewAssignment, target["assignment_id"])
        assignment.status = "completed"
        db.session.commit()

    blocked_after_completion = client.patch(
        endpoint,
        headers=_auth(manager_token),
        json={"location": "完成后不能改期"},
    )
    assert blocked_after_completion.status_code == 409
    assert blocked_after_completion.get_json()["code"] == "assignment_not_reschedulable"
    assert conflict["assignment_id"] is not None


def test_create_and_update_assignment_reject_past_time(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "past-time-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "past-time-interviewer@example.com", role="interviewer"
    )
    unassigned = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="PAST-CREATE",
    )
    existing = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="PAST-UPDATE",
        interviewer_id=interviewer_id,
        scheduled_at=utc_now() + timedelta(days=1),
    )
    past_time = (utc_now() - timedelta(days=1)).isoformat()

    created = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": unassigned["candidate_id"],
            "demand_id": unassigned["demand_id"],
            "round": "round_1",
            "round_sequence": 1,
            "interviewer_id": interviewer_id,
            "scheduled_at": past_time,
            "location": "过去的会议室",
        },
    )
    updated = client.patch(
        f"/api/interview/assignments/{existing['assignment_id']}",
        headers=_auth(owner_token),
        json={"scheduled_at": past_time},
    )

    assert created.status_code == 400
    assert updated.status_code == 400
    assert created.get_json()["code"] == "interview_time_in_past"
    assert updated.get_json()["code"] == "interview_time_in_past"


def test_interviewer_time_slots_cannot_overlap(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "overlap-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "overlap-interviewer@example.com", role="interviewer"
    )
    first = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="OVERLAP-FIRST",
        interviewer_id=interviewer_id,
        scheduled_at=utc_now() + timedelta(days=2),
    )
    second = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="OVERLAP-SECOND",
        interviewer_id=None,
    )
    with app.app_context():
        first_time = db.session.get(
            InterviewAssignment, first["assignment_id"]
        ).scheduled_at

    response = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": second["candidate_id"],
            "demand_id": second["demand_id"],
            "round": "round_1",
            "round_sequence": 1,
            "interviewer_id": interviewer_id,
            "scheduled_at": (first_time + timedelta(minutes=30)).isoformat(),
            "location": "重叠会议室",
        },
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "interviewer_schedule_conflict"


def test_future_interview_cannot_be_marked_conducted(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "future-conduct-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "future-conduct-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="FUTURE-CONDUCT",
        interviewer_id=interviewer_id,
        scheduled_at=utc_now() + timedelta(days=1),
    )

    response = client.post(
        f"/api/interview/assignments/{seeded['assignment_id']}/mark-conducted",
        headers=_auth(owner_token),
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "interview_not_started"


def test_assignment_cannot_move_a_later_stage_candidate_back_to_interview(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "late-stage-interview-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "late-stage-interviewer@example.com", role="interviewer"
    )

    for stage in ("offer", "onboarded", "rejected", "transferred"):
        seeded = _seed_interview_candidate(
            app,
            owner_id=owner_id,
            suffix=f"LATE-{stage}",
            pipeline_stage=stage,
        )
        response = client.post(
            "/api/interview/assignments",
            headers=_auth(owner_token),
            json={
                "candidate_id": seeded["candidate_id"],
                "demand_id": seeded["demand_id"],
                "round": "round_1",
                "round_sequence": 1,
                "interviewer_id": interviewer_id,
                "scheduled_at": (utc_now() + timedelta(days=3)).isoformat(),
                "location": "不应创建的会议室",
            },
        )
        assert response.status_code == 409
        assert response.get_json()["code"] == "interview_stage_conflict"
        with app.app_context():
            latest = (
                PipelineStage.query.filter_by(
                    demand_id=seeded["demand_id"],
                    candidate_id=seeded["candidate_id"],
                )
                .order_by(PipelineStage.id.desc())
                .first()
            )
            assert latest.stage == stage


def test_mark_conducted_is_explicit_idempotent_and_never_advances_pipeline(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "conduct-owner@example.com", role="recruiter"
    )
    other_owner_id, other_owner_token = make_user(
        "conduct-other-owner@example.com", role="recruiter"
    )
    interviewer_id, interviewer_token = make_user(
        "conduct-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="CONDUCT",
        interviewer_id=interviewer_id,
        scheduled_at=utc_now() - timedelta(days=2),
    )
    endpoint = (
        f"/api/interview/assignments/{seeded['assignment_id']}/mark-conducted"
    )

    listed = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )
    assert listed.status_code == 200
    assert listed.get_json()[0]["assignment_status"] == "scheduled"
    with app.app_context():
        before_stage_ids = [
            item.id
            for item in PipelineStage.query.filter_by(
                demand_id=seeded["demand_id"],
                candidate_id=seeded["candidate_id"],
            ).all()
        ]

    interviewer_forbidden = client.post(endpoint, headers=_auth(interviewer_token))
    other_owner_forbidden = client.post(endpoint, headers=_auth(other_owner_token))
    first = client.post(endpoint, headers=_auth(owner_token))
    second = client.post(endpoint, headers=_auth(owner_token))

    assert interviewer_forbidden.status_code == 403
    assert other_owner_forbidden.status_code == 403
    assert first.status_code == second.status_code == 200
    assert first.get_json()["status"] == "awaiting_feedback"
    assert first.get_json()["deduplicated"] is False
    assert second.get_json()["status"] == "awaiting_feedback"
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        assignment = db.session.get(InterviewAssignment, seeded["assignment_id"])
        assert assignment.status == "awaiting_feedback"
        assert Notification.query.filter_by(
            user_id=interviewer_id,
            demand_id=seeded["demand_id"],
            type="interview_feedback_requested",
        ).count() == 1
        assert Event.query.filter_by(
            action="interview.assignment_conducted",
            demand_id=seeded["demand_id"],
        ).count() == 1
        after_stage_ids = [
            item.id
            for item in PipelineStage.query.filter_by(
                demand_id=seeded["demand_id"],
                candidate_id=seeded["candidate_id"],
            ).all()
        ]
        assert after_stage_ids == before_stage_ids


def test_feedback_reminder_requires_awaiting_feedback_has_short_rate_limit_and_org_scope(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "remind-owner@example.com", role="recruiter"
    )
    _, admin_token = make_user("remind-admin@example.com", role="admin")
    _, foreign_admin_token = make_user(
        "remind-foreign-admin@example.com", role="admin", org_id=2
    )
    interviewer_id, interviewer_token = make_user(
        "remind-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_interview_candidate(
        app,
        owner_id=owner_id,
        suffix="REMIND",
        interviewer_id=interviewer_id,
        scheduled_at=utc_now() - timedelta(hours=1),
    )
    remind_endpoint = (
        f"/api/interview/assignments/{seeded['assignment_id']}/remind-feedback"
    )
    conduct_endpoint = (
        f"/api/interview/assignments/{seeded['assignment_id']}/mark-conducted"
    )

    too_early = client.post(remind_endpoint, headers=_auth(admin_token))
    assert too_early.status_code == 409
    assert too_early.get_json()["code"] == "assignment_not_awaiting_feedback"
    assert client.post(conduct_endpoint, headers=_auth(owner_token)).status_code == 200

    interviewer_forbidden = client.post(
        remind_endpoint, headers=_auth(interviewer_token)
    )
    foreign_hidden = client.post(
        remind_endpoint, headers=_auth(foreign_admin_token)
    )
    first = client.post(remind_endpoint, headers=_auth(admin_token))
    second = client.post(remind_endpoint, headers=_auth(admin_token))

    assert interviewer_forbidden.status_code == 403
    assert foreign_hidden.status_code == 404
    assert first.status_code == second.status_code == 200
    assert first.get_json()["deduplicated"] is False
    assert second.get_json()["deduplicated"] is True
    with app.app_context():
        assert Notification.query.filter_by(
            user_id=interviewer_id,
            demand_id=seeded["demand_id"],
            type="interview_feedback_reminder",
        ).count() == 1
        assert Event.query.filter_by(
            action="interview.feedback_reminded",
            demand_id=seeded["demand_id"],
        ).count() == 1

        assignment = db.session.get(InterviewAssignment, seeded["assignment_id"])
        db.session.add(
            InterviewFeedback(
                org_id=1,
                candidate_id=seeded["candidate_id"],
                job_id=seeded["job_id"],
                demand_id=seeded["demand_id"],
                assignment_id=seeded["assignment_id"],
                round="round_1",
                interviewer_id=interviewer_id,
                score=3,
                passed=None,
            )
        )
        assignment.status = "awaiting_feedback"
        db.session.commit()

    blocked_with_feedback = client.post(remind_endpoint, headers=_auth(admin_token))
    assert blocked_with_feedback.status_code == 409
    assert blocked_with_feedback.get_json()["code"] == "feedback_already_submitted"
