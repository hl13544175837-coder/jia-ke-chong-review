from datetime import UTC, date, datetime, timedelta

from app import db
from app.models import (
    Candidate,
    InterviewAssignment,
    Job,
    PipelineStage,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_operational_facts(app, owner_a_id, owner_b_id, interviewer_id):
    with app.app_context():
        job = Job(
            org_id=1,
            title="后端工程师",
            jd_text="Python",
            owner_hr_id=owner_a_id,
        )
        db.session.add(job)
        db.session.flush()
        demand_a = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_a_id,
            job_title_snapshot="后端工程师（上海）",
            city="上海",
            department="研发一部",
            headcount=2,
            status="active",
            target_date=date.today() + timedelta(days=10),
        )
        demand_b = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_b_id,
            job_title_snapshot="后端工程师（深圳）",
            city="深圳",
            department="研发二部",
            headcount=1,
            status="active",
            target_date=date.today() + timedelta(days=20),
        )
        db.session.add_all([demand_a, demand_b])
        db.session.flush()

        pending_a = Candidate(
            org_id=1,
            owner_hr_id=owner_a_id,
            current_demand_id=demand_a.id,
            name_masked="A-待筛选",
            resume_json={},
        )
        interview_b = Candidate(
            org_id=1,
            owner_hr_id=owner_b_id,
            current_demand_id=demand_b.id,
            name_masked="B-面试中",
            resume_json={},
        )
        db.session.add_all([pending_a, interview_b])
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all(
            [
                PipelineStage(
                    org_id=1,
                    candidate_id=pending_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="pending",
                    updated_by=owner_a_id,
                    ts=now - timedelta(days=9),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=interview_b.id,
                    demand_id=demand_b.id,
                    job_id=job.id,
                    stage="interview",
                    updated_by=owner_b_id,
                    ts=now - timedelta(days=8),
                ),
                InterviewAssignment(
                    org_id=1,
                    candidate_id=pending_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    round="round_1",
                    round_sequence=1,
                    is_primary=True,
                    interviewer_id=interviewer_id,
                    scheduled_at=now - timedelta(days=2),
                    created_by=owner_a_id,
                ),
            ]
        )
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_a_id": demand_a.id,
            "demand_b_id": demand_b.id,
            "pending_a_id": pending_a.id,
        }


def _keys(value):
    if isinstance(value, dict):
        result = set(value)
        for item in value.values():
            result.update(_keys(item))
        return result
    if isinstance(value, list):
        result = set()
        for item in value:
            result.update(_keys(item))
        return result
    return set()


def test_team_overview_keeps_sibling_demands_separate(client, make_user, app):
    owner_a_id, _ = make_user("overview-owner-a@example.com", name="专员A")
    owner_b_id, _ = make_user("overview-owner-b@example.com", name="专员B")
    interviewer_id, _ = make_user(
        "overview-interviewer@example.com", role="interviewer", name="面试官"
    )
    _, manager_token = make_user(
        "overview-manager@example.com", role="manager", name="经理"
    )
    foreign_owner_id, _ = make_user(
        "overview-foreign-owner@example.com", name="其他组织专员", org_id=2
    )
    seeded = _seed_operational_facts(app, owner_a_id, owner_b_id, interviewer_id)
    with app.app_context():
        foreign_job = Job(
            org_id=2,
            title="其他组织职位",
            jd_text="Other",
            owner_hr_id=foreign_owner_id,
        )
        db.session.add(foreign_job)
        db.session.flush()
        db.session.add(
            RecruitmentDemand(
                org_id=2,
                job_id=foreign_job.id,
                owner_hr_id=foreign_owner_id,
                status="active",
            )
        )
        db.session.commit()

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["purpose"] == "operational_collaboration"
    assert "不用于绩效" in payload["purpose_label"]
    assert payload["funnel"]["pending"] == 1
    assert payload["funnel"]["interview"] == 1
    demand_rows = {item["demand_id"]: item for item in payload["demands"]}
    assert set(demand_rows) == {seeded["demand_a_id"], seeded["demand_b_id"]}
    assert demand_rows[seeded["demand_a_id"]]["funnel"]["pending"] == 1
    assert demand_rows[seeded["demand_a_id"]]["funnel"]["interview"] == 0
    assert demand_rows[seeded["demand_b_id"]]["funnel"]["pending"] == 0
    assert demand_rows[seeded["demand_b_id"]]["funnel"]["interview"] == 1

    assert payload["alerts"]
    assert all(item["demand_id"] in demand_rows for item in payload["alerts"])
    assert all(item["owner_hr_id"] in {owner_a_id, owner_b_id} for item in payload["alerts"])
    assert all(item["owner_name"] in {"专员A", "专员B"} for item in payload["alerts"])
    assert all(
        item["action_path"].startswith(
            f"/pipeline?demand={item['demand_id']}"
        )
        for item in payload["alerts"]
    )
    assert {
        "staff",
        "performance",
        "pass_rate",
        "conversion_rate",
        "rank",
        "source_quality",
    }.isdisjoint(_keys(payload))


def test_staff_endpoint_returns_current_workload_without_performance(
    client, make_user, app
):
    owner_a_id, owner_a_token = make_user(
        "workload-owner-a@example.com", name="专员A"
    )
    owner_b_id, owner_b_token = make_user(
        "workload-owner-b@example.com", name="专员B"
    )
    interviewer_id, interviewer_token = make_user(
        "workload-interviewer@example.com", role="interviewer", name="面试官"
    )
    _, manager_token = make_user(
        "workload-manager@example.com", role="manager", name="经理"
    )
    foreign_owner_id, _ = make_user(
        "workload-foreign-owner@example.com", name="其他组织专员", org_id=2
    )
    seeded = _seed_operational_facts(app, owner_a_id, owner_b_id, interviewer_id)

    response = client.get(
        f"/api/bi/staff/{owner_a_id}", headers=_auth(owner_a_token)
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["purpose"] == "operational_collaboration"
    assert payload["hr_id"] == owner_a_id
    assert payload["name"] == "专员A"
    assert payload["workload"] == {
        "active_demands": 1,
        "active_candidates": 1,
        "business_review": 0,
        "interview": 0,
        "offer": 0,
        "outstanding_feedback": 1,
    }
    assert [item["demand_id"] for item in payload["demands"]] == [
        seeded["demand_a_id"]
    ]
    assert {
        "performance",
        "pass_rate",
        "conversion_rate",
        "rank",
    }.isdisjoint(_keys(payload))

    assert client.get(
        f"/api/bi/staff/{owner_a_id}", headers=_auth(owner_b_token)
    ).status_code == 403
    assert client.get(
        f"/api/bi/staff/{owner_a_id}", headers=_auth(interviewer_token)
    ).status_code == 403
    assert client.get(
        f"/api/bi/staff/{owner_a_id}", headers=_auth(manager_token)
    ).status_code == 200
    assert client.get(
        f"/api/bi/staff/{foreign_owner_id}", headers=_auth(manager_token)
    ).status_code == 404


def test_team_overview_empty_state_is_successful_and_not_fabricated(
    client, make_user
):
    _, manager_token = make_user(
        "overview-empty-manager@example.com", role="manager", name="经理"
    )
    _, recruiter_token = make_user(
        "overview-empty-recruiter@example.com", role="recruiter", name="专员"
    )

    assert client.get(
        "/api/bi/overview", headers=_auth(recruiter_token)
    ).status_code == 403

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["alerts"] == []
    assert payload["demands"] == []
    assert payload["funnel"] == {
        "pending": 0,
        "ai_screen": 0,
        "business_review": 0,
        "interview": 0,
        "offer": 0,
        "onboarded": 0,
        "rejected": 0,
        "transferred": 0,
        "pipeline_total": 0,
        "archived_total": 0,
        "funnel_total": 0,
    }


def test_team_overview_surfaces_demand_health_and_collaboration_alerts(
    client, make_user, app
):
    owner_id, _ = make_user("overview-health-owner@example.com", name="专员")
    _, manager_token = make_user(
        "overview-health-manager@example.com", role="manager", name="经理"
    )
    with app.app_context():
        job = Job(
            org_id=1,
            title="产品经理",
            jd_text="产品规划",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        overdue = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="逾期需求",
            status="active",
            requested_at=date.today() - timedelta(days=2),
            target_date=date.today() - timedelta(days=1),
        )
        no_recommendation = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="尚未推荐需求",
            status="active",
            accepted_at=date.today() - timedelta(days=8),
            target_date=date.today() + timedelta(days=20),
        )
        hc_complete = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="HC 已满足需求",
            status="active",
            headcount=1,
            target_date=date.today() + timedelta(days=20),
        )
        business_pending = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="业务待反馈需求",
            status="active",
            target_date=date.today() + timedelta(days=20),
        )
        db.session.add_all(
            [overdue, no_recommendation, hc_complete, business_pending]
        )
        db.session.flush()
        onboarded = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=hc_complete.id,
            name_masked="已入职候选人",
            resume_json={},
        )
        waiting = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=business_pending.id,
            name_masked="待反馈候选人",
            resume_json={},
        )
        db.session.add_all([onboarded, waiting])
        db.session.flush()
        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all(
            [
                PipelineStage(
                    org_id=1,
                    candidate_id=onboarded.id,
                    demand_id=hc_complete.id,
                    job_id=job.id,
                    stage="onboarded",
                    updated_by=owner_id,
                    ts=now - timedelta(days=1),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=waiting.id,
                    demand_id=business_pending.id,
                    job_id=job.id,
                    stage="business_review",
                    updated_by=owner_id,
                    ts=now - timedelta(days=1),
                ),
            ]
        )
        db.session.commit()
        expected = {
            "demand_overdue": overdue.id,
            "hr_no_recommendation": no_recommendation.id,
            "hc_completion_suggested": hc_complete.id,
            "business_feedback_pending": business_pending.id,
        }

    response = client.get("/api/bi/overview", headers=_auth(manager_token))

    assert response.status_code == 200
    alerts = response.get_json()["alerts"]
    alerts_by_kind = {item["kind"]: item for item in alerts}
    for kind, demand_id in expected.items():
        assert alerts_by_kind[kind]["demand_id"] == demand_id
        assert alerts_by_kind[kind]["action_path"].startswith(
            f"/pipeline?demand={demand_id}"
        )
