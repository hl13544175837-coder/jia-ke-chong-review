from datetime import timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    InterviewAssignment,
    InterviewRescheduleRequest,
    OnlineResume,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
)
from app.time_utils import utc_now


ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_assignment(app, *, owner_id, interviewer_id, suffix):
    scheduled_at = utc_now() + timedelta(days=3)
    with app.app_context():
        job = Job(
            org_id=1,
            title=f"改约岗位-{suffix}",
            city="上海",
            department="技术部",
            jd_text="改约流程测试 JD",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no=f"REQ-RESCHEDULE-{suffix}",
            job_title_snapshot=job.title,
            city=job.city,
            department=job.department,
            jd_text_snapshot=job.jd_text,
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked=f"候选人-{suffix}",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateDemandFlow(
            org_id=1,
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        ))
        db.session.add(PipelineStage(
            org_id=1,
            candidate_id=candidate.id,
            job_id=job.id,
            demand_id=demand.id,
            stage="interview",
            updated_by=owner_id,
        ))
        assignment = InterviewAssignment(
            org_id=1,
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
            note="原安排",
            status="scheduled",
            created_by=owner_id,
        )
        db.session.add(assignment)
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_id": demand.id,
            "candidate_id": candidate.id,
            "assignment_id": assignment.id,
            "scheduled_at": scheduled_at,
        }


def _request_reschedule(client, token, assignment_id, *, offset_days=5):
    first = utc_now() + timedelta(days=offset_days)
    second = first + timedelta(hours=3)
    response = client.post(
        f"/api/interview/assignments/{assignment_id}/reschedule-requests",
        headers=_auth(token),
        json={
            "reason": "与客户会议冲突，请协助改约",
            "proposed_times": [first.isoformat(), second.isoformat()],
        },
    )
    return response, first, second


def test_interviewer_request_keeps_original_schedule_and_notifies_owner(
    client, make_user, app
):
    owner_id, _ = make_user("reschedule-owner@example.com", role="recruiter", name="招聘专员")
    interviewer_id, interviewer_token = make_user(
        "reschedule-interviewer@example.com", role="interviewer", name="原面试官"
    )
    other_interviewer_id, other_interviewer_token = make_user(
        "reschedule-other@example.com", role="interviewer", name="其他面试官"
    )
    seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=interviewer_id, suffix="REQUEST"
    )

    response, first, second = _request_reschedule(
        client, interviewer_token, seeded["assignment_id"]
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["status"] == "pending"
    assert payload["source"] == "interviewer_request"
    assert payload["reason"] == "与客户会议冲突，请协助改约"
    assert payload["proposed_times"] == [first.isoformat(), second.isoformat()]
    assert payload["original_interviewer_id"] == interviewer_id
    assert payload["original_scheduled_at"] == seeded["scheduled_at"].isoformat()

    with app.app_context():
        assignment = db.session.get(InterviewAssignment, seeded["assignment_id"])
        assert assignment.interviewer_id == interviewer_id
        assert assignment.scheduled_at == seeded["scheduled_at"]
        notification = Notification.query.filter_by(
            user_id=owner_id,
            demand_id=seeded["demand_id"],
            type="interview_reschedule_requested",
        ).one()
        assert "原面试官" in notification.body
        assert "客户会议冲突" in notification.body

    duplicate, _, _ = _request_reschedule(
        client, interviewer_token, seeded["assignment_id"], offset_days=6
    )
    forbidden, _, _ = _request_reschedule(
        client, other_interviewer_token, seeded["assignment_id"], offset_days=7
    )
    assert duplicate.status_code == 409
    assert duplicate.get_json()["code"] == "reschedule_request_pending"
    assert forbidden.status_code == 403
    assert other_interviewer_id != interviewer_id


def test_request_validation_rejects_empty_reason_past_time_and_completed_task(
    client, make_user, app
):
    owner_id, _ = make_user("reschedule-validation-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "reschedule-validation-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=interviewer_id, suffix="VALIDATE"
    )

    empty_reason = client.post(
        f"/api/interview/assignments/{seeded['assignment_id']}/reschedule-requests",
        headers=_auth(interviewer_token),
        json={"reason": "", "proposed_times": [(utc_now() + timedelta(days=4)).isoformat()]},
    )
    past_time = client.post(
        f"/api/interview/assignments/{seeded['assignment_id']}/reschedule-requests",
        headers=_auth(interviewer_token),
        json={"reason": "需要改期", "proposed_times": [(utc_now() - timedelta(days=1)).isoformat()]},
    )
    assert empty_reason.status_code == 400
    assert empty_reason.get_json()["code"] == "reschedule_reason_required"
    assert past_time.status_code == 400
    assert past_time.get_json()["code"] == "interview_time_in_past"

    with app.app_context():
        assignment = db.session.get(InterviewAssignment, seeded["assignment_id"])
        assignment.status = "completed"
        db.session.commit()
    completed, _, _ = _request_reschedule(
        client, interviewer_token, seeded["assignment_id"]
    )
    assert completed.status_code == 409
    assert completed.get_json()["code"] == "assignment_not_reschedulable"


def test_recruiter_approves_same_interviewer_or_rejects_without_losing_history(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "reschedule-approve-owner@example.com", role="recruiter", name="招聘专员甲"
    )
    interviewer_id, interviewer_token = make_user(
        "reschedule-approve-interviewer@example.com", role="interviewer", name="面试官甲"
    )
    seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=interviewer_id, suffix="APPROVE"
    )
    requested, first, _ = _request_reschedule(
        client, interviewer_token, seeded["assignment_id"]
    )
    request_id = requested.get_json()["id"]
    final_time = first + timedelta(hours=1)

    approved = client.patch(
        f"/api/interview/reschedule-requests/{request_id}",
        headers=_auth(owner_token),
        json={
            "action": "approve",
            "interviewer_id": interviewer_id,
            "scheduled_at": final_time.isoformat(),
            "location": "新会议室",
            "note": "改约后安排",
            "processor_note": "已与双方确认",
        },
    )
    assert approved.status_code == 200
    payload = approved.get_json()
    assert payload["status"] == "approved"
    assert payload["final_interviewer_id"] == interviewer_id
    assert payload["final_scheduled_at"] == final_time.isoformat()
    assert payload["processed_by"] == owner_id

    with app.app_context():
        assignment = db.session.get(InterviewAssignment, seeded["assignment_id"])
        assert assignment.scheduled_at == final_time
        assert assignment.location == "新会议室"
        stored = db.session.get(InterviewRescheduleRequest, request_id)
        assert stored.original_scheduled_at == seeded["scheduled_at"]
        assert stored.final_scheduled_at == final_time

    history = client.get(
        f"/api/interview/assignments/{seeded['assignment_id']}/reschedule-history",
        headers=_auth(interviewer_token),
    )
    assert history.status_code == 200
    assert history.get_json()[0]["status"] == "approved"
    assert history.get_json()[0]["processor_name"] == "招聘专员甲"

    second_seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=interviewer_id, suffix="REJECT"
    )
    second_request, _, _ = _request_reschedule(
        client, interviewer_token, second_seeded["assignment_id"], offset_days=8
    )
    rejected = client.patch(
        f"/api/interview/reschedule-requests/{second_request.get_json()['id']}",
        headers=_auth(owner_token),
        json={"action": "reject", "processor_note": "项目节点无法调整"},
    )
    assert rejected.status_code == 200
    assert rejected.get_json()["status"] == "rejected"
    with app.app_context():
        unchanged = db.session.get(InterviewAssignment, second_seeded["assignment_id"])
        assert unchanged.scheduled_at == second_seeded["scheduled_at"]


def test_recruiter_can_change_interviewer_and_direct_adjustment_is_logged(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "reschedule-change-owner@example.com", role="recruiter", name="招聘专员乙"
    )
    first_id, first_token = make_user(
        "reschedule-change-first@example.com", role="interviewer", name="原面试官"
    )
    second_id, second_token = make_user(
        "reschedule-change-second@example.com", role="interviewer", name="新面试官"
    )
    seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=first_id, suffix="CHANGE"
    )
    requested, first_time, _ = _request_reschedule(
        client, first_token, seeded["assignment_id"]
    )

    approved = client.patch(
        f"/api/interview/reschedule-requests/{requested.get_json()['id']}",
        headers=_auth(owner_token),
        json={
            "action": "approve",
            "interviewer_id": second_id,
            "scheduled_at": first_time.isoformat(),
            "location": "线上会议",
            "note": "交接给新面试官",
            "processor_note": "原面试官时间冲突",
        },
    )
    assert approved.status_code == 200
    assert approved.get_json()["final_interviewer_id"] == second_id

    new_interviewer_history = client.get(
        f"/api/interview/assignments/{seeded['assignment_id']}/reschedule-history",
        headers=_auth(second_token),
    )
    assert new_interviewer_history.status_code == 200
    assert new_interviewer_history.get_json()[0]["original_interviewer_name"] == "原面试官"
    assert new_interviewer_history.get_json()[0]["final_interviewer_name"] == "新面试官"

    direct_time = first_time + timedelta(days=1)
    direct = client.patch(
        f"/api/interview/assignments/{seeded['assignment_id']}",
        headers=_auth(owner_token),
        json={
            "interviewer_id": second_id,
            "scheduled_at": direct_time.isoformat(),
            "location": "线上会议 2",
            "note": "只调整时间",
            "change_reason": "候选人临时冲突",
        },
    )
    assert direct.status_code == 200
    with app.app_context():
        direct_record = InterviewRescheduleRequest.query.filter_by(
            assignment_id=seeded["assignment_id"],
            source="recruiter_direct",
        ).one()
        assert direct_record.status == "approved"
        assert direct_record.reason == "候选人临时冲突"
        assert direct_record.original_interviewer_id == second_id
        assert direct_record.final_interviewer_id == second_id


def test_cancel_and_wait_then_create_linked_replacement_with_same_interviewer(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "reschedule-replace-owner@example.com", role="recruiter", name="招聘专员丙"
    )
    interviewer_id, interviewer_token = make_user(
        "reschedule-replace-interviewer@example.com", role="interviewer", name="原面试官"
    )
    seeded = _seed_assignment(
        app, owner_id=owner_id, interviewer_id=interviewer_id, suffix="REPLACE"
    )
    requested, _, _ = _request_reschedule(
        client, interviewer_token, seeded["assignment_id"]
    )
    request_id = requested.get_json()["id"]

    waiting = client.patch(
        f"/api/interview/reschedule-requests/{request_id}",
        headers=_auth(owner_token),
        json={"action": "cancel_and_wait", "processor_note": "时间暂时无法确认"},
    )
    assert waiting.status_code == 200
    assert waiting.get_json()["status"] == "waiting_reassignment"

    with app.app_context():
        cancelled = db.session.get(InterviewAssignment, seeded["assignment_id"])
        assert cancelled.status == "cancelled"
        assert cancelled.primary_slot is None
        latest_stage = PipelineStage.query.filter_by(
            candidate_id=seeded["candidate_id"], demand_id=seeded["demand_id"]
        ).order_by(PipelineStage.id.desc()).first()
        assert latest_stage.stage == "interview"

    management = client.get(
        "/api/interview/management-rows", headers=_auth(owner_token)
    )
    assert management.status_code == 200
    row = next(item for item in management.get_json() if item["candidate_id"] == seeded["candidate_id"])
    assert row["assignment_status"] == "unassigned"
    assert row["reschedule_request"]["status"] == "waiting_reassignment"
    assert row["reschedule_request"]["id"] == request_id

    replacement_time = utc_now() + timedelta(days=10)
    replacement = client.post(
        f"/api/interview/reschedule-requests/{request_id}/replacement",
        headers=_auth(owner_token),
        json={
            "interviewer_id": interviewer_id,
            "scheduled_at": replacement_time.isoformat(),
            "location": "重新确认会议室",
            "note": "取消后重新激活",
        },
    )
    assert replacement.status_code == 201
    replacement_payload = replacement.get_json()
    assert replacement_payload["reschedule_request"]["status"] == "resolved"
    assert replacement_payload["reschedule_request"]["replacement_assignment_id"] == replacement_payload["assignment"]["id"]
    assert replacement_payload["assignment"]["interviewer_id"] == interviewer_id

    assignments = client.get(
        "/api/interview/assignments", headers=_auth(interviewer_token)
    )
    assert assignments.status_code == 200
    replacement_row = next(item for item in assignments.get_json() if item["id"] == replacement_payload["assignment"]["id"])
    assert replacement_row["reschedule_history"][0]["assignment_id"] == seeded["assignment_id"]
    assert replacement_row["reschedule_history"][0]["replacement_assignment_id"] == replacement_payload["assignment"]["id"]

    with app.app_context():
        notification_types = {
            item.type for item in Notification.query.filter_by(
                demand_id=seeded["demand_id"], user_id=interviewer_id
            ).all()
        }
        assert "interview_assignment_cancelled" in notification_types
        assert "interview_reschedule_reassigned" in notification_types


def test_revision_13_adds_reschedule_history_table_and_indexes(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'interview-reschedule.db'}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    OnlineResume.__table__.drop(bind=engine)
    InterviewRescheduleRequest.__table__.drop(bind=engine)
    engine.dispose()

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.stamp(config, "20260729_12")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert "interview_reschedule_requests" in inspector.get_table_names()
    assert {
        "assignment_id",
        "replacement_assignment_id",
        "proposed_times",
        "original_scheduled_at",
        "final_scheduled_at",
        "processor_note",
    }.issubset({
        item["name"]
        for item in inspector.get_columns("interview_reschedule_requests")
    })
    assert {
        "ix_interview_reschedule_org_assignment_status",
        "ix_interview_reschedule_org_candidate_demand_round",
    }.issubset({
        item["name"]
        for item in inspector.get_indexes("interview_reschedule_requests")
    })
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260811_18"
    engine.dispose()
