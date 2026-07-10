def _auth(token):
    return {"Authorization": f"Bearer {token}"}


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
