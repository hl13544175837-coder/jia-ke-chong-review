import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_match_preview_distinguishes_unconfigured_job_from_zero_match(
    client, make_user, app
):
    user_id, token = make_user(
        "match-readiness@example.com", role="recruiter"
    )
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, RecruitmentDemand

        unconfigured_job = Job(
            title="未配置技能岗位",
            jd_text="负责平台建设",
            jd_structured={},
            owner_hr_id=user_id,
            status="active",
        )
        configured_job = Job(
            title="Python 岗位",
            jd_text="负责 Python 平台建设",
            jd_structured={"must_have_skills": ["Python"]},
            owner_hr_id=user_id,
            status="active",
        )
        candidate = Candidate(
            owner_hr_id=user_id,
            name_masked="技能候选人",
            resume_json={},
        )
        db.session.add_all([unconfigured_job, configured_job, candidate])
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="Python", score=5))
        unconfigured_demand = RecruitmentDemand(
            job_id=unconfigured_job.id,
            owner_hr_id=user_id,
            request_no="REQ-MATCH-UNCONFIGURED",
            status="active",
            approval_status="approved",
        )
        configured_demand = RecruitmentDemand(
            job_id=configured_job.id,
            owner_hr_id=user_id,
            request_no="REQ-MATCH-CONFIGURED",
            status="active",
            approval_status="approved",
        )
        db.session.add_all([unconfigured_demand, configured_demand])
        db.session.commit()
        candidate_id = candidate.id
        unconfigured_demand_id = unconfigured_demand.id
        configured_demand_id = configured_demand.id

    unconfigured = client.post(
        "/api/candidates/match/preview",
        headers=_auth(token),
        json={
            "demand_id": unconfigured_demand_id,
            "candidate_ids": [candidate_id],
        },
    )
    configured = client.post(
        "/api/candidates/match/preview",
        headers=_auth(token),
        json={
            "demand_id": configured_demand_id,
            "candidate_ids": [candidate_id],
        },
    )

    assert unconfigured.status_code == configured.status_code == 200
    assert unconfigured.get_json()["match_configured"] is False
    assert unconfigured.get_json()["required_skills"] == []
    assert configured.get_json()["match_configured"] is True
    assert configured.get_json()["required_skills"] == ["Python"]
    assert configured.get_json()["results"][0]["score"] > 0


def test_batch_add_to_pipeline_adds_only_missing_candidates(client, make_user, app):
    user_id, token = make_user("batch-pipeline@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, RecruitmentDemand

        job = Job(title="增长产品经理", jd_text="负责增长", owner_hr_id=user_id)
        first = Candidate(owner_hr_id=user_id, name_masked="候选人A", resume_json={})
        second = Candidate(owner_hr_id=user_id, name_masked="候选人B", resume_json={})
        db.session.add_all([job, first, second])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=user_id,
            request_no="REQ-BATCH-1",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        first.current_demand_id = demand.id
        db.session.add(PipelineStage(
            candidate_id=first.id,
            job_id=job.id,
            demand_id=demand.id,
            stage="pending",
            updated_by=user_id,
        ))
        db.session.commit()
        job_id = job.id
        demand_id = demand.id
        first_id = first.id
        second_id = second.id

    response = client.post(
        f"/api/jobs/{job_id}/batch-pipeline",
        headers=_auth(token),
        json={
            "demand_id": demand_id,
            "candidate_ids": [first_id, second_id, second_id, 999999],
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["job_id"] == job_id
    assert body["demand_id"] == demand_id
    assert body["added"] == 1
    assert body["skipped_existing"] == 1
    assert body["skipped_missing"] == 1

    with app.app_context():
        from app.models import PipelineStage

        rows = PipelineStage.query.filter_by(demand_id=demand_id).all()
        assert len(rows) == 2
        assert sum(1 for row in rows if row.candidate_id == second_id) == 1
        assert db.session.get(Candidate, second_id).current_demand_id == demand_id


def test_batch_add_requires_demand_when_job_template_has_sibling_demands(
    client, make_user, app
):
    user_id, token = make_user("batch-ambiguous@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, RecruitmentDemand

        job = Job(title="产品经理", jd_text="负责产品", owner_hr_id=user_id)
        candidate = Candidate(owner_hr_id=user_id, name_masked="候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        db.session.add_all([
            RecruitmentDemand(job_id=job.id, owner_hr_id=user_id, request_no="REQ-A"),
            RecruitmentDemand(job_id=job.id, owner_hr_id=user_id, request_no="REQ-B"),
        ])
        db.session.commit()
        job_id = job.id
        candidate_id = candidate.id

    response = client.post(
        f"/api/jobs/{job_id}/batch-pipeline",
        headers=_auth(token),
        json={"candidate_ids": [candidate_id]},
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_id_required"


def test_batch_add_to_pipeline_rejects_interviewer(client, make_user, app):
    _, interviewer_token = make_user("batch-interviewer@example.com", role="interviewer")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job

        job = Job(title="后端工程师", jd_text="负责后端")
        candidate = Candidate(name_masked="候选人C", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()
        job_id = job.id
        candidate_id = candidate.id

    response = client.post(
        f"/api/jobs/{job_id}/batch-pipeline",
        headers=_auth(interviewer_token),
        json={"candidate_ids": [candidate_id]},
    )

    assert response.status_code == 403


def test_batch_add_rolls_back_moves_when_summary_audit_fails(
    client, make_user, app, monkeypatch
):
    user_id, token = make_user("batch-audit@example.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, RecruitmentDemand

        job = Job(title="批量审计岗位", jd_text="x", owner_hr_id=user_id)
        candidate = Candidate(owner_hr_id=user_id, name_masked="批量候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id, owner_hr_id=user_id, request_no="REQ-BATCH-AUDIT", status="active"
        )
        db.session.add(demand)
        db.session.commit()
        job_id, demand_id, candidate_id = job.id, demand.id, candidate.id

    from app.api import jobs as jobs_api

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(jobs_api, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            f"/api/jobs/{job_id}/batch-pipeline",
            headers=_auth(token),
            json={"demand_id": demand_id, "candidate_ids": [candidate_id]},
        )

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, Event, PipelineStage

        db.session.remove()
        assert db.session.get(Candidate, candidate_id).current_demand_id is None
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate_id).count() == 0
        assert PipelineStage.query.filter_by(candidate_id=candidate_id).count() == 0
        assert Event.query.filter_by(
            action="pipeline.moved", entity_id=candidate_id
        ).count() == 0


def test_talent_pool_candidates_can_preview_match_join_and_reactivate(
    client,
    make_user,
    app,
):
    user_id, token = make_user("talent-pool-reuse@example.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, PipelineStage, RecruitmentDemand

        job = Job(
            title="Python 工程师",
            jd_text="负责 Python 与 SQL 开发",
            jd_structured={"skill_tags_raw": "Python, SQL"},
            owner_hr_id=user_id,
        )
        new_candidate = Candidate(
            owner_hr_id=user_id,
            name_masked="人才库候选人",
            resume_json={},
        )
        rejected_candidate = Candidate(
            owner_hr_id=user_id,
            name_masked="待重新启用候选人",
            resume_json={},
        )
        onboarded_candidate = Candidate(
            owner_hr_id=user_id,
            name_masked="已入职候选人",
            resume_json={},
        )
        db.session.add_all([job, new_candidate, rejected_candidate, onboarded_candidate])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=user_id,
            request_no="REQ-TALENT-POOL-REUSE",
            status="active",
            approval_status="approved",
        )
        other_demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=user_id,
            request_no="REQ-TALENT-POOL-OTHER",
            status="active",
            approval_status="approved",
        )
        db.session.add_all([demand, other_demand])
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=new_candidate.id, tag="Python", score=5),
            PipelineStage(
                candidate_id=rejected_candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="rejected",
                updated_by=user_id,
                note="本轮经验不足",
            ),
            PipelineStage(
                candidate_id=onboarded_candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="onboarded",
                updated_by=user_id,
            ),
            PipelineStage(
                candidate_id=rejected_candidate.id,
                job_id=job.id,
                demand_id=other_demand.id,
                stage="rejected",
                updated_by=user_id,
                note="另一招聘需求未通过",
            ),
        ])
        db.session.commit()
        demand_id = demand.id
        new_candidate_id = new_candidate.id
        rejected_candidate_id = rejected_candidate.id
        onboarded_candidate_id = onboarded_candidate.id

    preview = client.post(
        "/api/candidates/match/preview",
        headers=_auth(token),
        json={
            "demand_id": demand_id,
            "candidate_ids": [new_candidate_id, rejected_candidate_id],
        },
    )
    assert preview.status_code == 200
    preview_by_candidate = {
        item["candidate_id"]: item
        for item in preview.get_json()["results"]
    }
    assert preview_by_candidate[new_candidate_id]["score"] > 0
    assert preview_by_candidate[new_candidate_id]["latest_stage"] is None
    assert preview_by_candidate[rejected_candidate_id]["latest_stage"] == "rejected"

    first_add = client.post(
        "/api/candidates/pipeline/add",
        headers=_auth(token),
        json={
            "demand_id": demand_id,
            "candidate_ids": [new_candidate_id, rejected_candidate_id],
            "reactivate_rejected": True,
        },
    )
    assert first_add.status_code == 200
    assert first_add.get_json()["added"] == 1
    assert first_add.get_json()["skipped_conflict"] == 1
    assert first_add.get_json()["failures"][0]["code"] == "reactivation_reason_required"

    talent_pool = client.get(
        "/api/candidates?pipeline_status=not_in_pipeline&page=1&per_page=20",
        headers=_auth(token),
    )
    assert talent_pool.status_code == 200
    talent_pool_ids = {
        candidate["id"] for candidate in talent_pool.get_json()["candidates"]
    }
    assert rejected_candidate_id in talent_pool_ids
    assert new_candidate_id not in talent_pool_ids
    assert onboarded_candidate_id not in talent_pool_ids

    reactivate = client.post(
        "/api/candidates/pipeline/add",
        headers=_auth(token),
        json={
            "demand_id": demand_id,
            "candidate_ids": [rejected_candidate_id],
            "reactivate_rejected": True,
            "reason": "候选人补充了符合岗位要求的新项目经验",
        },
    )
    assert reactivate.status_code == 200
    assert reactivate.get_json()["reactivated"] == 1

    active_pipeline = client.get(
        "/api/candidates?pipeline_status=in_pipeline&page=1&per_page=20",
        headers=_auth(token),
    )
    assert active_pipeline.status_code == 200
    assert rejected_candidate_id in {
        candidate["id"] for candidate in active_pipeline.get_json()["candidates"]
    }

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, PipelineStage

        rejected = db.session.get(Candidate, rejected_candidate_id)
        latest = PipelineStage.query.filter_by(
            candidate_id=rejected_candidate_id,
            demand_id=demand_id,
        ).order_by(PipelineStage.id.desc()).first()
        flow = CandidateDemandFlow.query.filter_by(
            candidate_id=rejected_candidate_id,
            demand_id=demand_id,
        ).one()
        assert rejected.current_demand_id == demand_id
        assert latest.stage == "pending"
        assert "人才库重新启用" in latest.note
        assert flow.status == "active"
