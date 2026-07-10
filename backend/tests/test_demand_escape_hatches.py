from datetime import date


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job_and_demand(
    app,
    *,
    owner_id,
    status="active",
    request_no="REQ-ESCAPE",
    job=None,
):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        if job is None:
            job = Job(
                title="测试工程师",
                jd_text="负责系统测试",
                owner_hr_id=owner_id,
            )
            db.session.add(job)
            db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            city="上海",
            department="研发部",
            job_title_snapshot=job.title,
            jd_text_snapshot=job.jd_text,
            request_no=request_no,
            requester_name="用人负责人",
            hiring_manager_name="用人负责人",
            requested_at=date(2026, 7, 10),
            target_date=date(2026, 8, 10),
            headcount=1,
            status=status,
            close_reason="业务暂缓" if status == "paused" else "",
        )
        db.session.add(demand)
        db.session.commit()
        return job.id, demand.id


def test_hidden_boss_write_routes_fail_closed_before_external_account_lookup(
    client, make_user, app
):
    recruiter_id, token = make_user(
        "boss-p0-closed@example.com", role="recruiter"
    )
    job_id, _ = _seed_job_and_demand(app, owner_id=recruiter_id)

    batch_response = client.post(
        "/api/boss/candidates/batch-import",
        headers=_auth(token),
        json={
            "items": [{"geek_id": "boss-geek-1", "name": "候选人"}],
            "target_job_id": job_id,
        },
    )
    ai_response = client.post(
        "/api/boss/candidates/ai-screen",
        headers=_auth(token),
        json={"candidate_ids": [1], "job_id": job_id},
    )

    assert batch_response.status_code == 410
    assert batch_response.get_json()["error"]["code"] == "feature_not_available"
    assert ai_response.status_code == 410
    assert ai_response.get_json()["error"]["code"] == "feature_not_available"

    with app.app_context():
        from app.models import Interview, PipelineStage, UploadBatch

        assert UploadBatch.query.count() == 0
        assert PipelineStage.query.count() == 0
        assert Interview.query.count() == 0


def test_boss_service_cannot_write_job_scoped_pipeline_or_ai_interview(app, make_user):
    recruiter_id, _ = make_user(
        "boss-service-closed@example.com", role="recruiter"
    )
    job_id, _ = _seed_job_and_demand(app, owner_id=recruiter_id)

    with app.app_context():
        from app import db
        from app.models import Candidate, Interview, PipelineStage
        from app.services.boss_pipeline_service import BossPipelineService

        candidate = Candidate(
            owner_hr_id=recruiter_id,
            name_masked="BOSS 候选人",
            resume_json={"raw_markdown": "# BOSS 候选人"},
        )
        db.session.add(candidate)
        db.session.commit()

        result = BossPipelineService().ai_screen(
            owner_hr_id=recruiter_id,
            candidate_ids=[candidate.id],
            job_id=job_id,
        )

        assert result["ok"] is False
        assert result["error"]["code"] == "feature_not_available"
        assert PipelineStage.query.count() == 0
        assert Interview.query.count() == 0


def test_paused_demand_rejects_new_interview_assignment(client, make_user, app):
    recruiter_id, token = make_user(
        "paused-demand-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "paused-demand-interviewer@example.com", role="interviewer"
    )
    job_id, demand_id = _seed_job_and_demand(
        app, owner_id=recruiter_id, status="paused"
    )

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow

        candidate = Candidate(
            owner_hr_id=recruiter_id,
            current_demand_id=demand_id,
            name_masked="暂停需求候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                candidate_id=candidate.id,
                demand_id=demand_id,
                owner_hr_id=recruiter_id,
                status="active",
            )
        )
        db.session.commit()
        candidate_id = candidate.id

    response = client.post(
        "/api/interview/assignments",
        headers=_auth(token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "job_id": job_id,
            "round": "round_1",
            "round_sequence": 1,
            "interviewer_id": interviewer_id,
            "is_primary": True,
        },
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_not_open"

    with app.app_context():
        from app.models import InterviewAssignment

        assert InterviewAssignment.query.count() == 0


def test_candidate_search_requires_exact_demand_when_job_has_siblings(
    client, make_user, app
):
    admin_id, token = make_user(
        "candidate-demand-filter@example.com", role="admin"
    )
    job_id, first_demand_id = _seed_job_and_demand(
        app, owner_id=admin_id, request_no="REQ-FIRST"
    )

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage

        job = db.session.get(Job, job_id)
        _, second_demand_id = _seed_job_and_demand(
            app,
            owner_id=admin_id,
            request_no="REQ-SECOND",
            job=job,
        )
        first = Candidate(
            owner_hr_id=admin_id,
            name_masked="需求一候选人",
            resume_json={},
        )
        second = Candidate(
            owner_hr_id=admin_id,
            name_masked="需求二候选人",
            resume_json={},
        )
        db.session.add_all([first, second])
        db.session.flush()
        db.session.add_all(
            [
                PipelineStage(
                    candidate_id=first.id,
                    demand_id=first_demand_id,
                    job_id=job_id,
                    stage="pending",
                    updated_by=admin_id,
                ),
                PipelineStage(
                    candidate_id=second.id,
                    demand_id=second_demand_id,
                    job_id=job_id,
                    stage="pending",
                    updated_by=admin_id,
                ),
            ]
        )
        db.session.commit()

    exact = client.get(
        f"/api/candidates?demand_id={first_demand_id}&stage=pending&page=1&per_page=20",
        headers=_auth(token),
    )
    ambiguous = client.get(
        f"/api/candidates?job_id={job_id}&stage=pending&page=1&per_page=20",
        headers=_auth(token),
    )

    assert exact.status_code == 200
    assert [item["name_masked"] for item in exact.get_json()["candidates"]] == [
        "需求一候选人"
    ]
    assert ambiguous.status_code == 409
    assert ambiguous.get_json()["code"] == "demand_id_required"


def test_direct_candidate_owner_write_blocks_active_flow_even_if_pointer_drifted(
    client, make_user, app
):
    manager_id, token = make_user(
        "owner-drift-manager@example.com", role="manager"
    )
    old_owner_id, _ = make_user(
        "owner-drift-old@example.com", role="recruiter"
    )
    new_owner_id, _ = make_user(
        "owner-drift-new@example.com", role="recruiter"
    )
    _, demand_id = _seed_job_and_demand(app, owner_id=old_owner_id)

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow

        candidate = Candidate(
            owner_hr_id=old_owner_id,
            current_demand_id=None,
            name_masked="指针漂移候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                candidate_id=candidate.id,
                demand_id=demand_id,
                owner_hr_id=old_owner_id,
                status="active",
            )
        )
        db.session.commit()
        candidate_id = candidate.id

    response = client.patch(
        f"/api/candidates/{candidate_id}/owner",
        headers=_auth(token),
        json={"owner_hr_id": new_owner_id, "reason": "测试绕过"},
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "owner_managed_by_demand"
    assert response.get_json()["demand_id"] == demand_id

    with app.app_context():
        from app import db
        from app.models import Candidate

        assert db.session.get(Candidate, candidate_id).owner_hr_id == old_owner_id
