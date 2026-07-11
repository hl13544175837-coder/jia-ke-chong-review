from datetime import UTC, datetime, timedelta

from app import db
from app.models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_sibling_demand_facts(app, owner_a_id, owner_b_id, actor_id, interviewer_id):
    with app.app_context():
        job = Job(
            org_id=1,
            title="后端工程师",
            city="上海",
            department="研发部",
            jd_text="Python",
            owner_hr_id=actor_id,
        )
        db.session.add(job)
        db.session.flush()
        demand_a = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_a_id,
            job_title_snapshot="后端工程师（上海）",
            department="研发一部",
            city="上海",
            headcount=2,
            status="active",
        )
        demand_b = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_b_id,
            job_title_snapshot="后端工程师（深圳）",
            department="研发二部",
            city="深圳",
            headcount=1,
            status="active",
        )
        db.session.add_all([demand_a, demand_b])
        db.session.flush()

        rejected_a = Candidate(
            org_id=1,
            owner_hr_id=actor_id,
            name_masked="A-已淘汰",
            resume_json={},
        )
        transferred = Candidate(
            org_id=1,
            owner_hr_id=owner_b_id,
            name_masked="A-已转出",
            resume_json={},
        )
        onboarded_a = Candidate(
            org_id=1,
            owner_hr_id=owner_a_id,
            name_masked="A-已入职",
            resume_json={},
        )
        interview_a = Candidate(
            org_id=1,
            owner_hr_id=actor_id,
            name_masked="A-待反馈",
            resume_json={},
        )
        rejected_b = Candidate(
            org_id=1,
            owner_hr_id=owner_b_id,
            name_masked="B-已淘汰",
            resume_json={},
        )
        db.session.add_all(
            [rejected_a, transferred, onboarded_a, interview_a, rejected_b]
        )
        db.session.flush()

        now = datetime.now(UTC).replace(tzinfo=None)
        db.session.add_all(
            [
                PipelineStage(
                    org_id=1,
                    candidate_id=rejected_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="pending",
                    updated_by=actor_id,
                    ts=now - timedelta(days=5),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=rejected_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="rejected",
                    updated_by=actor_id,
                    ts=now - timedelta(days=4),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=transferred.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="transferred",
                    updated_by=actor_id,
                    ts=now - timedelta(days=3),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=transferred.id,
                    demand_id=demand_b.id,
                    job_id=job.id,
                    stage="pending",
                    updated_by=actor_id,
                    ts=now - timedelta(days=2),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=onboarded_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="onboarded",
                    updated_by=actor_id,
                    ts=now - timedelta(days=2),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=interview_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    stage="interview",
                    updated_by=actor_id,
                    ts=now - timedelta(days=8),
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=rejected_b.id,
                    demand_id=demand_b.id,
                    job_id=job.id,
                    stage="rejected",
                    updated_by=actor_id,
                    ts=now - timedelta(days=1),
                ),
            ]
        )

        assignment_a = InterviewAssignment(
            org_id=1,
            candidate_id=interview_a.id,
            demand_id=demand_a.id,
            job_id=job.id,
            round="round_1",
            round_sequence=1,
            is_primary=True,
            interviewer_id=interviewer_id,
            scheduled_at=now - timedelta(days=2),
            created_by=actor_id,
        )
        assignment_b = InterviewAssignment(
            org_id=1,
            candidate_id=interview_a.id,
            demand_id=demand_b.id,
            job_id=job.id,
            round="round_1",
            round_sequence=1,
            is_primary=True,
            interviewer_id=interviewer_id,
            scheduled_at=now - timedelta(days=1),
            created_by=actor_id,
        )
        db.session.add_all([assignment_a, assignment_b])
        db.session.flush()
        db.session.add(
            InterviewFeedback(
                org_id=1,
                candidate_id=interview_a.id,
                demand_id=demand_b.id,
                assignment_id=assignment_b.id,
                job_id=job.id,
                round="round_1",
                interviewer_id=interviewer_id,
                score=4,
                passed=True,
            )
        )
        db.session.add_all(
            [
                OfferRecord(
                    org_id=1,
                    candidate_id=interview_a.id,
                    demand_id=demand_a.id,
                    job_id=job.id,
                    approval_status="draft",
                    created_by=actor_id,
                ),
                OfferRecord(
                    org_id=1,
                    candidate_id=transferred.id,
                    demand_id=demand_b.id,
                    job_id=job.id,
                    approval_status="approved",
                    created_by=actor_id,
                ),
                OfferRecord(
                    org_id=1,
                    candidate_id=rejected_b.id,
                    demand_id=demand_b.id,
                    job_id=job.id,
                    approval_status="approved",
                    created_by=actor_id,
                ),
            ]
        )
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_a_id": demand_a.id,
            "demand_b_id": demand_b.id,
            "interview_a_id": interview_a.id,
            "rejected_b_id": rejected_b.id,
        }


def test_demand_bi_isolates_sibling_facts_and_labels_current_responsibility(
    client, make_user, app
):
    actor_id, _ = make_user("bi-actor@example.com", role="recruiter", name="历史操作人")
    owner_a_id, _ = make_user("bi-owner-a@example.com", role="recruiter", name="当前负责人A")
    owner_b_id, _ = make_user("bi-owner-b@example.com", role="recruiter", name="当前负责人B")
    interviewer_id, _ = make_user(
        "bi-interviewer@example.com", role="interviewer", name="面试官"
    )
    _, manager_token = make_user("bi-manager@example.com", role="manager", name="经理")
    seeded = _seed_sibling_demand_facts(
        app, owner_a_id, owner_b_id, actor_id, interviewer_id
    )

    response = client.get(
        f"/api/bi/demand/{seeded['demand_a_id']}",
        headers=_auth(manager_token),
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["scope"] == {
        "type": "demand",
        "demand_id": seeded["demand_a_id"],
        "job_id": seeded["job_id"],
    }
    assert payload["purpose"] == "operational_collaboration"
    assert "不用于绩效" in payload["purpose_label"]

    assert payload["funnel"]["interview"] == 1
    assert payload["funnel"]["onboarded"] == 1
    assert payload["funnel"]["rejected"] == 1
    assert payload["funnel"]["transferred"] == 1
    assert payload["funnel"].get("pending", 0) == 0
    assert payload["funnel"]["pipeline_total"] == 1
    assert payload["funnel"]["archived_total"] == 3

    assert payload["hc"] == {
        "headcount": 2,
        "onboarded_count": 1,
        "remaining": 1,
        "completion_rate": 50.0,
        "completion_suggested": False,
    }
    assert payload["offers"]["total"] == 1
    assert payload["offers"]["by_status"] == {"draft": 1}
    assert payload["outstanding_feedback"]["count"] == 1
    assert payload["outstanding_feedback"]["items"][0]["candidate_id"] == seeded[
        "interview_a_id"
    ]

    candidate_ids = {item["candidate_id"] for item in payload["stage_age"]}
    assert seeded["rejected_b_id"] not in candidate_ids
    assert payload["current_responsibility"]["owner_hr_id"] == owner_a_id
    assert payload["current_responsibility"]["owner_name"] == "当前负责人A"
    assert payload["current_responsibility"]["label"] == "当前协同责任人"


def test_demand_bi_enforces_demand_owner_scope(client, make_user, app):
    actor_id, _ = make_user("bi-scope-actor@example.com", role="recruiter")
    owner_a_id, owner_a_token = make_user(
        "bi-scope-owner-a@example.com", role="recruiter"
    )
    owner_b_id, owner_b_token = make_user(
        "bi-scope-owner-b@example.com", role="recruiter"
    )
    interviewer_id, interviewer_token = make_user(
        "bi-scope-interviewer@example.com", role="interviewer"
    )
    seeded = _seed_sibling_demand_facts(
        app, owner_a_id, owner_b_id, actor_id, interviewer_id
    )

    own = client.get(
        f"/api/bi/demand/{seeded['demand_a_id']}", headers=_auth(owner_a_token)
    )
    sibling_owner = client.get(
        f"/api/bi/demand/{seeded['demand_a_id']}", headers=_auth(owner_b_token)
    )
    interviewer = client.get(
        f"/api/bi/demand/{seeded['demand_a_id']}", headers=_auth(interviewer_token)
    )

    assert own.status_code == 200
    assert sibling_owner.status_code == 403
    assert interviewer.status_code == 403


def test_legacy_job_bi_rejects_ambiguous_sibling_demands(client, make_user, app):
    actor_id, _ = make_user("bi-legacy-actor@example.com", role="recruiter")
    owner_a_id, _ = make_user("bi-legacy-owner-a@example.com", role="recruiter")
    owner_b_id, _ = make_user("bi-legacy-owner-b@example.com", role="recruiter")
    interviewer_id, _ = make_user(
        "bi-legacy-interviewer@example.com", role="interviewer"
    )
    _, manager_token = make_user("bi-legacy-manager@example.com", role="manager")
    seeded = _seed_sibling_demand_facts(
        app, owner_a_id, owner_b_id, actor_id, interviewer_id
    )

    response = client.get(
        f"/api/bi/job/{seeded['job_id']}", headers=_auth(manager_token)
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_id_required"


def test_legacy_job_bi_proxies_when_job_has_exactly_one_demand(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "bi-single-owner@example.com", role="recruiter", name="需求负责人"
    )
    with app.app_context():
        job = Job(
            org_id=1,
            title="产品经理",
            jd_text="产品规划",
            owner_hr_id=None,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="产品经理",
            department="产品部",
            city="上海",
            headcount=1,
            status="active",
        )
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="候选人",
            resume_json={},
        )
        db.session.add_all([demand, candidate])
        db.session.flush()
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=job.id,
                stage="pending",
                updated_by=owner_id,
            )
        )
        db.session.commit()
        job_id = job.id
        demand_id = demand.id

    response = client.get(f"/api/bi/job/{job_id}", headers=_auth(owner_token))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["compatibility"] == {
        "mode": "single_demand",
        "aggregate": False,
    }
    assert payload["scope"]["demand_id"] == demand_id
    assert payload["funnel"]["pending"] == 1


def test_legacy_job_bi_does_not_aggregate_job_without_demand(
    client, make_user, app
):
    _, manager_token = make_user(
        "bi-no-demand-manager@example.com", role="manager"
    )
    with app.app_context():
        job = Job(
            org_id=1,
            title="尚未建需求的职位模板",
            jd_text="只是模板",
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    response = client.get(f"/api/bi/job/{job_id}", headers=_auth(manager_token))

    assert response.status_code == 404
    assert response.get_json()["code"] == "demand_not_found"
