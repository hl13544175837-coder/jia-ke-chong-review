from datetime import timedelta

import pytest

from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    Event,
    InterviewAssignment,
    Job,
    RecruitmentDemand,
)
from app.time_utils import utc_now


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_assignment(
    app,
    owner_id,
    interviewer_id,
    *,
    scheduled_at=None,
    status="awaiting_feedback",
):
    with app.app_context():
        job = Job(
            org_id=1,
            title="后端工程师",
            jd_text="熟悉 Python",
            status="active",
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-FEEDBACK-EDIT",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="反馈候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                org_id=1,
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status="active",
            )
        )
        assignment = InterviewAssignment(
            org_id=1,
            candidate_id=candidate.id,
            job_id=job.id,
            demand_id=demand.id,
            round="interview_first",
            round_sequence=1,
            is_primary=True,
            primary_slot=1,
            interviewer_id=interviewer_id,
            scheduled_at=scheduled_at,
            status=status,
            created_by=owner_id,
        )
        db.session.add(assignment)
        db.session.commit()
        return assignment.id


def test_future_interview_cannot_receive_feedback(client, make_user, app):
    hr_id, _ = make_user("future-feedback-owner@example.com", role="recruiter")
    interviewer_id, token = make_user(
        "future-feedback-author@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(
        app,
        hr_id,
        interviewer_id,
        scheduled_at=utc_now() + timedelta(days=1),
    )

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "satisfied",
            "note": "不应提前提交",
        },
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "interview_not_started"


def test_interviewer_cannot_mark_future_interview_conducted(
    client,
    make_user,
    app,
):
    hr_id, _ = make_user(
        "future-conducted-owner@example.com",
        role="recruiter",
    )
    interviewer_id, interviewer_token = make_user(
        "future-conducted-interviewer@example.com",
        role="interviewer",
    )
    assignment_id = _seed_assignment(
        app,
        hr_id,
        interviewer_id,
        scheduled_at=utc_now() + timedelta(days=1),
        status="scheduled",
    )

    response = client.post(
        f"/api/interview/assignments/{assignment_id}/mark-conducted",
        headers=_auth(interviewer_token),
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "interview_not_started"


def test_interviewer_submits_satisfaction_and_note(client, make_user, app):
    hr_id, _ = make_user("feedback-owner@example.com", role="recruiter")
    interviewer_id, token = make_user(
        "feedback-author@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "satisfied",
            "note": "符合 JD 重点，可继续推进。",
        },
    )

    assert response.status_code == 201
    assert response.get_json()["satisfaction"] == "satisfied"
    assert response.get_json()["note"] == "符合 JD 重点，可继续推进。"


def test_interviewer_submits_structured_feedback_in_existing_columns(
    client, make_user, app
):
    hr_id, _ = make_user("structured-owner@example.com", role="recruiter")
    interviewer_id, token = make_user(
        "structured-author@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)
    payload = {
        "assignment_id": assignment_id,
        "satisfaction": "satisfied",
        "job_match": "high",
        "recommendation": "next_round",
        "strengths": "Python 基础扎实，表达清楚",
        "concerns": "分布式项目经验需要二面确认",
        "note": "建议进入二面",
    }

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json=payload,
    )

    assert response.status_code == 201
    result = response.get_json()
    assert result["job_match"] == "high"
    assert result["recommendation"] == "next_round"
    assert result["strengths"] == payload["strengths"]
    assert result["concerns"] == payload["concerns"]
    with app.app_context():
        from app.models import InterviewFeedback

        stored = InterviewFeedback.query.filter_by(
            assignment_id=assignment_id
        ).one()
        assert stored.strengths == payload["strengths"]
        assert stored.concerns == payload["concerns"]
        assert stored.evaluation_json["job_match"] == "high"
        assert stored.evaluation_json["recommendation"] == "next_round"


def test_original_interviewer_can_edit_feedback_with_audit(client, make_user, app):
    hr_id, _ = make_user("feedback-edit-owner@example.com", role="recruiter")
    interviewer_id, token = make_user(
        "feedback-edit-author@example.com",
        role="interviewer",
        name="反馈面试官",
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)
    created = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "satisfied",
            "note": "初次评价",
        },
    )
    assert created.status_code == 201
    feedback_id = created.get_json()["id"]

    response = client.patch(
        f"/api/interview/feedback/{feedback_id}",
        headers=_auth(token),
        json={"satisfaction": "pending", "note": "补充观察"},
    )

    assert response.status_code == 200
    assert response.get_json()["note"] == "补充观察"
    assert response.get_json()["updated_by"] == interviewer_id
    assert response.get_json()["updated_by_name"] == "反馈面试官"
    listed = client.get(
        "/api/interview/feedback", headers=_auth(token)
    ).get_json()
    assert listed[0]["updated_by_name"] == "反馈面试官"
    with app.app_context():
        event = Event.query.filter_by(
            action="interview.feedback_updated", entity_id=feedback_id
        ).one()
        assert event.payload["before"] == {
            "satisfaction": "satisfied",
            "job_match": "",
            "recommendation": "",
            "strengths": "",
            "concerns": "",
            "note": "初次评价",
        }
        assert event.payload["after"] == {
            "satisfaction": "pending",
            "job_match": "",
            "recommendation": "",
            "strengths": "",
            "concerns": "",
            "note": "补充观察",
        }


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"satisfaction": "excellent", "note": ""}, "satisfaction"),
        ({"satisfaction": "pending", "note": "过" * 1001}, "note"),
    ],
)
def test_simple_feedback_validation(client, make_user, app, payload, field):
    hr_id, _ = make_user(
        f"feedback-validation-owner-{field}@example.com", role="recruiter"
    )
    interviewer_id, token = make_user(
        f"feedback-validation-author-{field}@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={"assignment_id": assignment_id, **payload},
    )

    assert response.status_code == 400
    assert field in response.get_json()["fields"]


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        (
            {
                "satisfaction": "satisfied",
                "job_match": "high",
                "recommendation": "next_round",
                "strengths": "",
                "concerns": "待确认",
                "note": "建议推进",
            },
            "strengths",
        ),
        (
            {
                "satisfaction": "unsatisfied",
                "job_match": "low",
                "recommendation": "reject",
                "strengths": "有相关经验",
                "concerns": "",
                "note": "不建议推进",
            },
            "concerns",
        ),
        (
            {
                "satisfaction": "pending",
                "job_match": "medium",
                "recommendation": "hold",
                "strengths": "表达清楚",
                "concerns": "经验待核实",
                "note": "",
            },
            "note",
        ),
        (
            {
                "satisfaction": "satisfied",
                "job_match": "unknown",
                "recommendation": "next_round",
                "strengths": "优势",
                "concerns": "",
                "note": "",
            },
            "job_match",
        ),
        (
            {
                "satisfaction": "satisfied",
                "job_match": "high",
                "recommendation": "skip",
                "strengths": "优势",
                "concerns": "",
                "note": "",
            },
            "recommendation",
        ),
        (
            {
                "satisfaction": "satisfied",
                "job_match": "high",
                "recommendation": "next_round",
                "strengths": "过" * 1001,
                "concerns": "",
                "note": "",
            },
            "strengths",
        ),
    ],
)
def test_structured_feedback_validation(
    client, make_user, app, payload, field
):
    hr_id, _ = make_user(
        f"structured-validation-owner-{field}@example.com", role="recruiter"
    )
    interviewer_id, token = make_user(
        f"structured-validation-author-{field}@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)

    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={"assignment_id": assignment_id, **payload},
    )

    assert response.status_code == 400
    assert field in response.get_json()["fields"]


def test_unrelated_interviewer_cannot_edit_feedback(client, make_user, app):
    hr_id, _ = make_user("feedback-denied-owner@example.com", role="recruiter")
    author_id, author_token = make_user(
        "feedback-denied-author@example.com", role="interviewer"
    )
    _, unrelated_token = make_user(
        "feedback-denied-other@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, author_id)
    created = client.post(
        "/api/interview/feedback",
        headers=_auth(author_token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "satisfied",
            "note": "原始评价",
        },
    )
    assert created.status_code == 201
    feedback_id = created.get_json()["id"]

    denied = client.patch(
        f"/api/interview/feedback/{feedback_id}",
        headers=_auth(unrelated_token),
        json={"satisfaction": "unsatisfied", "note": "不应写入"},
    )

    assert denied.status_code == 403


@pytest.mark.parametrize("role", ["manager", "admin"])
def test_manager_and_admin_can_correct_feedback(client, make_user, app, role):
    hr_id, _ = make_user(
        f"feedback-correct-owner-{role}@example.com", role="recruiter"
    )
    author_id, author_token = make_user(
        f"feedback-correct-author-{role}@example.com", role="interviewer"
    )
    actor_id, actor_token = make_user(
        f"feedback-correct-{role}@example.com", role=role
    )
    assignment_id = _seed_assignment(app, hr_id, author_id)
    created = client.post(
        "/api/interview/feedback",
        headers=_auth(author_token),
        json={
            "assignment_id": assignment_id,
            "satisfaction": "pending",
            "note": "待补充",
        },
    )
    assert created.status_code == 201

    corrected = client.patch(
        f"/api/interview/feedback/{created.get_json()['id']}",
        headers=_auth(actor_token),
        json={"satisfaction": "satisfied", "note": "已根据现场记录修正"},
    )

    assert corrected.status_code == 200
    assert corrected.get_json()["updated_by"] == actor_id
