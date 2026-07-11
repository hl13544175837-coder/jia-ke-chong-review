from pathlib import Path

from app import db
from app.models import Candidate, Job, PipelineStage, RecruitmentDemand


ROOT = Path(__file__).resolve().parents[2]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_pipeline_uses_single_interview_stage_for_mvp(client, make_user, app):
    owner_id, token = make_user("mvp-pipeline@example.com", role="recruiter", name="流程HR")
    with app.app_context():
        job = Job(title="销售顾问", jd_text="销售跟进")
        candidate = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-MVP-PIPELINE",
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        job_id = job.id
        demand_id = demand.id
        candidate_id = candidate.id

    response = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "stage": "interview",
            "note": "业务确认进入面试",
        },
    )

    assert response.status_code == 200
    counts = client.get(f"/api/pipeline/demands/{demand_id}", headers=_auth(token)).get_json()
    assert counts == {"interview": 1}
    board = client.get(f"/api/pipeline/demands/{demand_id}/board", headers=_auth(token)).get_json()
    assert board["stage_order"] == [
        "pending",
        "ai_screen",
        "business_review",
        "interview",
        "offer",
        "onboarded",
        "rejected",
        "transferred",
    ]
    assert board["candidates"][0]["stage"] == "interview"


def test_bi_staff_workload_uses_generic_interview_stage(client, make_user, app):
    hr_id, hr_token = make_user(
        "mvp-bi-hr@example.com", role="recruiter", name="招聘HR"
    )

    with app.app_context():
        job = Job(
            title="AI 产品经理",
            city="上海",
            department="产品部",
            jd_text="AI 产品",
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=hr_id,
            status="active",
            headcount=1,
        )
        candidate = Candidate(
            owner_hr_id=hr_id,
            name_masked="面试中候选人",
            resume_json={},
        )
        db.session.add_all([demand, candidate])
        db.session.flush()
        db.session.add(
            PipelineStage(
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="interview",
                updated_by=hr_id,
            )
        )
        db.session.commit()

    response = client.get(
        f"/api/bi/staff/{hr_id}", headers=_auth(hr_token)
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["purpose"] == "operational_collaboration"
    assert payload["workload"]["interview"] == 1
    assert "performance" not in payload


def test_seed_pipeline_data_uses_generic_interview_stage():
    seed_text = (ROOT / "backend" / "seed_dev.py").read_text(encoding="utf-8")

    assert '"interview_first"' not in seed_text
    assert '"interview_second"' not in seed_text
    assert '"interview_final"' not in seed_text


def test_migration_normalizes_legacy_pipeline_stages_to_interview(app):
    import migrate_stages

    with app.app_context():
        job = Job(title="迁移测试岗位", jd_text="测试")
        candidates = [
            Candidate(name_masked="一面候选人", resume_json={}),
            Candidate(name_masked="二面候选人", resume_json={}),
            Candidate(name_masked="终面候选人", resume_json={}),
            Candidate(name_masked="当前候选人", resume_json={}),
        ]
        db.session.add(job)
        db.session.add_all(candidates)
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidates[0].id, job_id=job.id, stage="interview_first"),
            PipelineStage(candidate_id=candidates[1].id, job_id=job.id, stage="interview_second"),
            PipelineStage(candidate_id=candidates[2].id, job_id=job.id, stage="interview_final"),
            PipelineStage(candidate_id=candidates[3].id, job_id=job.id, stage="interview"),
        ])
        db.session.commit()

        migrated = migrate_stages.normalize_legacy_interview_stages()
        stages = [stage for (stage,) in db.session.query(PipelineStage.stage).order_by(PipelineStage.id).all()]

    assert migrated == 3
    assert stages == ["interview", "interview", "interview", "interview"]
