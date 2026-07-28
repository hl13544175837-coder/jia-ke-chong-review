from datetime import datetime

from app import db
from app.models import Candidate, Job, PipelineStage, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_monthly_facts(app, owner_a_id, owner_b_id):
    with app.app_context():
        job_a = Job(org_id=1, title="AI算法工程师", jd_text="算法", owner_hr_id=owner_a_id)
        job_old = Job(org_id=1, title="Java开发工程师", jd_text="Java", owner_hr_id=owner_a_id)
        job_b = Job(org_id=1, title="产品经理", jd_text="产品", owner_hr_id=owner_b_id)
        db.session.add_all([job_a, job_old, job_b])
        db.session.flush()

        demand_a = RecruitmentDemand(
            org_id=1,
            job_id=job_a.id,
            owner_hr_id=owner_a_id,
            job_title_snapshot="AI算法工程师",
            department="算法部",
            city="北京",
            request_no="REQ-MONTH-A",
            headcount=2,
            status="active",
            created_at=datetime(2026, 7, 2, 8, 0),
        )
        demand_old = RecruitmentDemand(
            org_id=1,
            job_id=job_old.id,
            owner_hr_id=owner_a_id,
            job_title_snapshot="Java开发工程师",
            department="研发部",
            city="上海",
            request_no="REQ-MONTH-OLD",
            headcount=1,
            status="closed",
            created_at=datetime(2026, 6, 20, 8, 0),
        )
        demand_b = RecruitmentDemand(
            org_id=1,
            job_id=job_b.id,
            owner_hr_id=owner_b_id,
            job_title_snapshot="产品经理",
            department="产品部",
            city="深圳",
            request_no="REQ-MONTH-B",
            headcount=1,
            status="active",
            created_at=datetime(2026, 7, 3, 8, 0),
        )
        db.session.add_all([demand_a, demand_old, demand_b])
        db.session.flush()

        candidates = [
            Candidate(org_id=1, owner_hr_id=owner_a_id, name_masked="A-候选人1", resume_json={}),
            Candidate(org_id=1, owner_hr_id=owner_a_id, name_masked="A-候选人2", resume_json={}),
            Candidate(org_id=1, owner_hr_id=owner_a_id, name_masked="A-候选人3", resume_json={}),
            Candidate(org_id=1, owner_hr_id=owner_b_id, name_masked="B-候选人1", resume_json={}),
        ]
        db.session.add_all(candidates)
        db.session.flush()

        def stage(candidate, demand, name, month_day, stage_name):
            return PipelineStage(
                org_id=1,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=demand.job_id,
                stage=stage_name,
                updated_by=demand.owner_hr_id,
                ts=datetime(2026, month_day[0], month_day[1], 9, 0),
            )

        stages = [
            stage(candidates[0], demand_a, "A1", (7, 3), "pending"),
            stage(candidates[0], demand_a, "A1", (7, 4), "ai_screen"),
            stage(candidates[0], demand_a, "A1", (7, 5), "business_review"),
            stage(candidates[0], demand_a, "A1", (7, 6), "interview"),
            stage(candidates[0], demand_a, "A1", (7, 7), "offer"),
            stage(candidates[0], demand_a, "A1", (7, 8), "onboarded"),
            stage(candidates[1], demand_a, "A2", (7, 10), "pending"),
            stage(candidates[1], demand_a, "A2", (7, 11), "ai_screen"),
            stage(candidates[2], demand_old, "A3", (6, 28), "pending"),
            stage(candidates[2], demand_old, "A3", (7, 12), "interview"),
            # 同一候选人参与不同需求时，每个需求都应单独计入月度漏斗。
            stage(candidates[0], demand_old, "A1-OLD", (7, 14), "pending"),
            stage(candidates[3], demand_b, "B1", (7, 13), "pending"),
        ]
        db.session.add_all(stages)
        db.session.commit()
        return {"demand_a_id": demand_a.id, "demand_old_id": demand_old.id, "demand_b_id": demand_b.id}


def test_monthly_staff_performance_is_scoped_by_owner_and_month(
    client, make_user, app
):
    owner_a_id, owner_a_token = make_user(
        "monthly-owner-a@example.com", name="专员A"
    )
    owner_b_id, _ = make_user("monthly-owner-b@example.com", name="专员B")
    _, manager_token = make_user(
        "monthly-manager@example.com", role="manager", name="经理"
    )
    seeded = _seed_monthly_facts(app, owner_a_id, owner_b_id)

    response = client.get(
        f"/api/bi/staff/{owner_a_id}/monthly?month=2026-07",
        headers=_auth(owner_a_token),
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["month"] == "2026-07"
    assert payload["owner"]["name"] == "专员A"
    assert payload["summary"]["funnel"] == {
        "resumes": 4,
        "screened": 3,
        "business_review": 2,
        "interview": 2,
        "offer": 1,
        "hired": 1,
    }
    assert payload["summary"]["conversion_rates"] == {
        "resume_to_screened": 75.0,
        "screened_to_business_review": 66.7,
        "business_review_to_interview": 100.0,
        "interview_to_offer": 50.0,
        "offer_to_hired": 100.0,
    }
    assert payload["summary"]["overall_conversion_rate"] == 25.0
    assert {row["demand_id"] for row in payload["demands"]} == {
        seeded["demand_a_id"],
        seeded["demand_old_id"],
    }
    assert seeded["demand_b_id"] not in {row["demand_id"] for row in payload["demands"]}
    assert client.get(
        f"/api/bi/staff/{owner_a_id}/monthly?month=2026-07",
        headers=_auth(manager_token),
    ).status_code == 200

    empty_response = client.get(
        f"/api/bi/staff/{owner_a_id}/monthly?month=2026-08",
        headers=_auth(owner_a_token),
    )
    assert empty_response.status_code == 200
    empty_summary = empty_response.get_json()["summary"]
    assert empty_summary["funnel"] == {
        "resumes": 0,
        "screened": 0,
        "business_review": 0,
        "interview": 0,
        "offer": 0,
        "hired": 0,
    }
    assert all(value is None for value in empty_summary["conversion_rates"].values())
    assert empty_summary["overall_conversion_rate"] is None


def test_monthly_staff_performance_rejects_other_recruiters(client, make_user):
    owner_a_id, _ = make_user("monthly-owner-a2@example.com", name="专员A")
    owner_b_id, owner_b_token = make_user("monthly-owner-b2@example.com", name="专员B")
    assert client.get(
        f"/api/bi/staff/{owner_a_id}/monthly?month=2026-07",
        headers=_auth(owner_b_token),
    ).status_code == 403
