from datetime import UTC, datetime, timedelta
from pathlib import Path

from app import db
from app.models import Candidate, CandidateDemandFlow, Job, PipelineStage, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_interview_flow(app, owner_id):
    with app.app_context():
        job = Job(
            org_id=1,
            title="跨轮次承接测试岗位",
            jd_text="验证一面信息能被二面面试官只读承接",
            status="active",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no=f"REQ-HANDOFF-{job.id}",
            status="active",
            job_title_snapshot=job.title,
            jd_text_snapshot=job.jd_text,
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="跨轮次候选人",
            resume_json={"extracted_info": {"name": "跨轮次候选人"}},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add_all(
            [
                CandidateDemandFlow(
                    org_id=1,
                    candidate_id=candidate.id,
                    demand_id=demand.id,
                    owner_hr_id=owner_id,
                    status="active",
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=candidate.id,
                    job_id=job.id,
                    demand_id=demand.id,
                    stage="interview",
                    updated_by=owner_id,
                ),
            ]
        )
        db.session.commit()
        return demand.id, candidate.id


def test_second_round_can_always_read_previous_feedback_and_first_round_is_read_only(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "round-handoff-owner@example.com", role="recruiter", name="招聘专员"
    )
    first_id, first_token = make_user(
        "round-handoff-first@example.com", role="interviewer", name="一面面试官"
    )
    second_id, second_token = make_user(
        "round-handoff-second@example.com", role="interviewer", name="二面面试官"
    )
    _, unrelated_token = make_user(
        "round-handoff-unrelated@example.com", role="interviewer", name="无关面试官"
    )
    demand_id, candidate_id = _seed_interview_flow(app, owner_id)

    first_assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_1",
            "round_sequence": 1,
            "is_primary": True,
            "interviewer_id": first_id,
            "scheduled_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            "location": "一面会议室",
        },
    )
    assert first_assignment.status_code == 201
    first_assignment_id = first_assignment.get_json()["id"]

    # 模拟预约完成后时间自然经过，进入招聘专员可确认“已面试”的时点。
    with app.app_context():
        from app.models import InterviewAssignment

        stored_first = db.session.get(InterviewAssignment, first_assignment_id)
        stored_first.scheduled_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=2)
        db.session.commit()

    unrelated_conducted = client.post(
        f"/api/interview/assignments/{first_assignment_id}/mark-conducted",
        headers=_auth(unrelated_token),
    )
    assert unrelated_conducted.status_code == 403

    conducted = client.post(
        f"/api/interview/assignments/{first_assignment_id}/mark-conducted",
        headers=_auth(first_token),
    )
    assert conducted.status_code == 200
    assert conducted.get_json()["status"] == "awaiting_feedback"

    first_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(first_token),
        json={
            "assignment_id": first_assignment_id,
            "satisfaction": "satisfied",
            "note": "一面通过：沟通清晰，建议进入二面",
        },
    )
    assert first_feedback.status_code == 201
    first_feedback_id = first_feedback.get_json()["id"]

    second_assignment = client.post(
        "/api/interview/assignments",
        headers=_auth(owner_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "round": "round_2",
            "round_sequence": 2,
            "is_primary": True,
            "interviewer_id": second_id,
            "scheduled_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            "location": "二面会议室",
        },
    )
    assert second_assignment.status_code == 201
    second_assignment_id = second_assignment.get_json()["id"]

    second_tasks = client.get("/api/interview/assignments", headers=_auth(second_token))
    assert second_tasks.status_code == 200
    assert [item["id"] for item in second_tasks.get_json()] == [second_assignment_id]

    first_tasks = client.get("/api/interview/assignments", headers=_auth(first_token))
    assert first_tasks.status_code == 200
    assert second_assignment_id not in [item["id"] for item in first_tasks.get_json()]

    journey_before = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(second_token),
    )
    assert journey_before.status_code == 200
    journey_before_payload = journey_before.get_json()
    assert [item["note"] for item in journey_before_payload["feedback"]] == [
        "一面通过：沟通清晰，建议进入二面"
    ]
    rounds = journey_before_payload["interview_rounds"]
    assert [item["round_sequence"] for item in rounds] == [1, 2]
    assert rounds[0]["interviewer_name"] == "一面面试官"
    assert rounds[0]["feedback"]["note"] == "一面通过：沟通清晰，建议进入二面"
    assert rounds[1]["interviewer_name"] == "二面面试官"
    assert rounds[1]["feedback"] is None

    owner_journey = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(owner_token),
    )
    assert owner_journey.status_code == 200
    assert (
        owner_journey.get_json()["interview_rounds"][0]["feedback"]["note"]
        == "一面通过：沟通清晰，建议进入二面"
    )

    forbidden_edit = client.patch(
        f"/api/interview/feedback/{first_feedback_id}",
        headers=_auth(second_token),
        json={"satisfaction": "unsatisfied", "note": "不得修改一面评价"},
    )
    assert forbidden_edit.status_code == 403

    unrelated = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(unrelated_token),
    )
    assert unrelated.status_code == 403

    with app.app_context():
        from app.models import InterviewAssignment

        stored_second = db.session.get(InterviewAssignment, second_assignment_id)
        stored_second.scheduled_at = (
            datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1)
        )
        db.session.commit()

    second_conducted = client.post(
        f"/api/interview/assignments/{second_assignment_id}/mark-conducted",
        headers=_auth(second_token),
    )
    assert second_conducted.status_code == 200

    second_feedback = client.post(
        "/api/interview/feedback",
        headers=_auth(second_token),
        json={
            "assignment_id": second_assignment_id,
            "satisfaction": "satisfied",
            "note": "二面独立评价完成",
        },
    )
    assert second_feedback.status_code == 201

    journey_after = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(second_token),
    )
    assert journey_after.status_code == 200
    journey_after_payload = journey_after.get_json()
    assert {
        item["note"] for item in journey_after_payload["feedback"]
    } == {"一面通过：沟通清晰，建议进入二面", "二面独立评价完成"}
    rounds_after = journey_after_payload["interview_rounds"]
    assert rounds_after[0]["feedback"]["note"] == "一面通过：沟通清晰，建议进入二面"

    first_journey_after = client.get(
        f"/api/candidates/{candidate_id}/journey?demand_id={demand_id}",
        headers=_auth(first_token),
    )
    assert first_journey_after.status_code == 200
    first_journey_payload = first_journey_after.get_json()
    assert [
        item["round_sequence"] for item in first_journey_payload["interview_rounds"]
    ] == [1]
    assert [item["note"] for item in first_journey_payload["feedback"]] == [
        "一面通过：沟通清晰，建议进入二面"
    ]
    assert first_journey_payload["decision_summary"]["feedback_count"] == 1


def test_dev_seed_provides_two_distinct_interviewer_accounts_for_round_handoff():
    backend_dir = Path(__file__).resolve().parents[1]
    seed_source = (backend_dir / "seed_dev.py").read_text(encoding="utf-8")
    running_guide = (backend_dir.parent / "RUNNING.md").read_text(encoding="utf-8")
    oauth_bridge = (
        backend_dir.parent / "scripts" / "local-oauth-bridge.mjs"
    ).read_text(encoding="utf-8")

    assert 'email="interviewer01@mvp.local"' in seed_source
    assert 'email="interviewer02@mvp.local"' in seed_source
    assert "interviewer01@mvp.local" in running_guide
    assert "interviewer02@mvp.local" in running_guide
    assert "interviewer02@mvp.local" in oauth_bridge
