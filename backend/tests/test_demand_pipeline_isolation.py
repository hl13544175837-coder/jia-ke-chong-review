import pytest

from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    CandidateDisposition,
    InterviewAssignment,
    Job,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_sibling_demands(app, first_owner_id, second_owner_id=None, *, headcount=1):
    with app.app_context():
        second_owner_id = second_owner_id or first_owner_id
        job = Job(
            title="同一职位模板",
            city="上海",
            department="产品部",
            jd_text="负责核心产品",
            owner_hr_id=first_owner_id,
        )
        db.session.add(job)
        db.session.flush()
        first = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=first_owner_id,
            request_no="REQ-PIPE-A",
            job_title_snapshot="产品经理（上海）",
            city="上海",
            department="产品部",
            headcount=headcount,
            status="active",
        )
        second = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=second_owner_id,
            request_no="REQ-PIPE-B",
            job_title_snapshot="产品经理（宁波）",
            city="宁波",
            department="交付部",
            headcount=1,
            status="active",
        )
        first_candidate = Candidate(
            owner_hr_id=first_owner_id,
            name_masked="候选人甲",
            resume_json={},
        )
        second_candidate = Candidate(
            owner_hr_id=second_owner_id,
            name_masked="候选人乙",
            resume_json={},
        )
        db.session.add_all([first, second, first_candidate, second_candidate])
        db.session.commit()
        return {
            "job_id": job.id,
            "first_demand_id": first.id,
            "second_demand_id": second.id,
            "first_candidate_id": first_candidate.id,
            "second_candidate_id": second_candidate.id,
        }


def test_sibling_demands_isolate_board_history_offer_and_legacy_job_route(
    client, make_user, app
):
    owner_id, token = make_user("pipeline-isolation@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id)

    for demand_key, candidate_key, salary in (
        ("first_demand_id", "first_candidate_id", "30-35K"),
        ("second_demand_id", "second_candidate_id", "25-30K"),
    ):
        demand_id = seeded[demand_key]
        candidate_id = seeded[candidate_key]
        moved = client.post(
            f"/api/pipeline/demands/{demand_id}/move",
            headers=_auth(token),
            json={"candidate_id": candidate_id, "stage": "offer", "note": salary},
        )
        assert moved.status_code == 200
        saved = client.put(
            f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
            headers=_auth(token),
            json={"salary_range": salary, "approval_status": "approved"},
        )
        assert saved.status_code == 200
        assert saved.get_json()["demand_id"] == demand_id

    first_board = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/board",
        headers=_auth(token),
    )
    second_board = client.get(
        f"/api/pipeline/demands/{seeded['second_demand_id']}/board",
        headers=_auth(token),
    )
    assert [item["candidate_id"] for item in first_board.get_json()["candidates"]] == [
        seeded["first_candidate_id"]
    ]
    assert [item["candidate_id"] for item in second_board.get_json()["candidates"]] == [
        seeded["second_candidate_id"]
    ]

    first_history = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/history/{seeded['first_candidate_id']}",
        headers=_auth(token),
    ).get_json()
    assert first_history["demand_id"] == seeded["first_demand_id"]
    assert [item["stage"] for item in first_history["timeline"]] == ["offer"]

    first_offer = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/offer/{seeded['first_candidate_id']}",
        headers=_auth(token),
    ).get_json()
    second_offer = client.get(
        f"/api/pipeline/demands/{seeded['second_demand_id']}/offer/{seeded['second_candidate_id']}",
        headers=_auth(token),
    ).get_json()
    assert first_offer["salary_range"] == "30-35K"
    assert second_offer["salary_range"] == "25-30K"

    ambiguous = client.get(
        f"/api/pipeline/{seeded['job_id']}/board",
        headers=_auth(token),
    )
    assert ambiguous.status_code == 409
    assert ambiguous.get_json()["code"] == "demand_id_required"
    ambiguous_write = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "job_id": seeded["job_id"],
            "stage": "pending",
        },
    )
    assert ambiguous_write.status_code == 409
    assert ambiguous_write.get_json()["code"] == "demand_id_required"


def test_candidate_cannot_join_a_second_current_demand_and_writes_both_ids(
    client, make_user, app
):
    owner_id, token = make_user("pipeline-single-current@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id)

    joined = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "demand_id": seeded["first_demand_id"],
            "stage": "pending",
        },
    )
    assert joined.status_code == 200
    assert joined.get_json()["demand_id"] == seeded["first_demand_id"]
    assert joined.get_json()["job_id"] == seeded["job_id"]

    conflict = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "demand_id": seeded["second_demand_id"],
            "stage": "pending",
        },
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["code"] == "candidate_active_demand_conflict"

    with app.app_context():
        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        assert candidate.current_demand_id == seeded["first_demand_id"]
        stages = PipelineStage.query.filter_by(candidate_id=candidate.id).all()
        assert [(row.demand_id, row.job_id) for row in stages] == [
            (seeded["first_demand_id"], seeded["job_id"])
        ]
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate.id).count() == 1


def test_first_join_commit_failure_rolls_back_pointer_flow_and_stage(
    make_user, app, monkeypatch
):
    owner_id, _ = make_user("pipeline-join-rollback@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id)

    with app.app_context():
        from app.services.pipeline_service import move_candidate

        def fail_commit():
            raise RuntimeError("simulated join commit failure")

        monkeypatch.setattr(db.session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated join commit failure"):
            move_candidate(
                candidate_id=seeded["first_candidate_id"],
                demand_id=seeded["first_demand_id"],
                org_id=1,
                actor_id=owner_id,
                stage="pending",
            )

        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        assert candidate.current_demand_id is None
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate.id).count() == 0
        assert PipelineStage.query.filter_by(candidate_id=candidate.id).count() == 0


def test_transfer_is_atomic_business_transition_without_disposition(
    client, make_user, app
):
    source_owner_id, _ = make_user("pipeline-source-owner@example.com", role="recruiter")
    target_owner_id, _ = make_user("pipeline-target-owner@example.com", role="recruiter")
    _, manager_token = make_user("pipeline-transfer-manager@example.com", role="manager")
    seeded = _seed_sibling_demands(app, source_owner_id, target_owner_id)

    joined = client.post(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
        headers=_auth(manager_token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "stage": "business_review",
        },
    )
    assert joined.status_code == 200

    transferred = client.post(
        "/api/pipeline/transfer",
        headers=_auth(manager_token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "from_demand_id": seeded["first_demand_id"],
            "to_demand_id": seeded["second_demand_id"],
            "reason": "更适合宁波交付团队",
        },
    )
    assert transferred.status_code == 200
    assert transferred.get_json()["source_terminal_stage"] == "transferred"
    assert transferred.get_json()["to_stage"] == "pending"

    source_board = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/board",
        headers=_auth(manager_token),
    ).get_json()
    target_board = client.get(
        f"/api/pipeline/demands/{seeded['second_demand_id']}/board",
        headers=_auth(manager_token),
    ).get_json()
    assert source_board["candidates"][0]["stage"] == "transferred"
    assert target_board["candidates"][0]["stage"] == "pending"

    advanced = client.post(
        f"/api/pipeline/demands/{seeded['second_demand_id']}/move",
        headers=_auth(manager_token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "stage": "business_review",
        },
    )
    assert advanced.status_code == 200

    with app.app_context():
        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        source_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id,
            demand_id=seeded["first_demand_id"],
        ).one()
        target_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id,
            demand_id=seeded["second_demand_id"],
        ).one()
        assert candidate.current_demand_id == seeded["second_demand_id"]
        assert candidate.owner_hr_id == target_owner_id
        assert source_flow.status == "transferred"
        assert source_flow.owner_hr_id == source_owner_id
        assert source_flow.transfer_reason is None
        assert target_flow.status == "active"
        assert target_flow.owner_hr_id == target_owner_id
        assert target_flow.transfer_from_demand_id == seeded["first_demand_id"]
        assert target_flow.transfer_reason == "更适合宁波交付团队"
        assert CandidateDisposition.query.filter_by(candidate_id=candidate.id).count() == 0


def test_transfer_commit_failure_rolls_back_source_target_pointer_and_flows(
    client, make_user, app, monkeypatch
):
    owner_id, _ = make_user("pipeline-rollback-owner@example.com", role="recruiter")
    _, manager_token = make_user("pipeline-rollback-manager@example.com", role="manager")
    seeded = _seed_sibling_demands(app, owner_id)
    joined = client.post(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
        headers=_auth(manager_token),
        json={"candidate_id": seeded["first_candidate_id"], "stage": "interview"},
    )
    assert joined.status_code == 200

    with app.app_context():
        from app.services.pipeline_service import transfer_candidate

        def fail_commit():
            raise RuntimeError("simulated transfer commit failure")

        monkeypatch.setattr(db.session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated transfer commit failure"):
            transfer_candidate(
                candidate_id=seeded["first_candidate_id"],
                from_demand_id=seeded["first_demand_id"],
                to_demand_id=seeded["second_demand_id"],
                org_id=1,
                actor_id=owner_id,
                reason="测试中途失败",
            )

        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        source_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id,
            demand_id=seeded["first_demand_id"],
        ).one()
        assert candidate.current_demand_id == seeded["first_demand_id"]
        assert source_flow.status == "active"
        assert CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id,
            demand_id=seeded["second_demand_id"],
        ).count() == 0
        assert [
            row.stage
            for row in PipelineStage.query.filter_by(candidate_id=candidate.id)
            .order_by(PipelineStage.id.asc())
            .all()
        ] == ["interview"]


def test_move_audit_failure_rolls_back_stage_flow_pointer_and_disposition(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("pipeline-audit-move@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id)
    from app.services import pipeline_service

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(pipeline_service, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
            headers=_auth(token),
            json={
                "candidate_id": seeded["first_candidate_id"],
                "stage": "rejected",
                "disposition": {"reason": "不应保存"},
            },
        )

    with app.app_context():
        db.session.remove()
        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        assert candidate.current_demand_id is None
        assert PipelineStage.query.filter_by(candidate_id=candidate.id).count() == 0
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate.id).count() == 0
        assert CandidateDisposition.query.filter_by(candidate_id=candidate.id).count() == 0


def test_transfer_audit_failure_rolls_back_both_demands_and_pointer(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("pipeline-audit-transfer@example.com", role="manager")
    seeded = _seed_sibling_demands(app, owner_id)
    joined = client.post(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
        headers=_auth(token),
        json={"candidate_id": seeded["first_candidate_id"], "stage": "interview"},
    )
    assert joined.status_code == 200
    from app.services import pipeline_service

    real_record_event = pipeline_service.record_event

    def fail_transfer(action, *args, **kwargs):
        if action == "pipeline.transferred":
            raise RuntimeError("audit write failed")
        return real_record_event(action, *args, **kwargs)

    monkeypatch.setattr(pipeline_service, "record_event", fail_transfer)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            "/api/pipeline/transfer",
            headers=_auth(token),
            json={
                "candidate_id": seeded["first_candidate_id"],
                "from_demand_id": seeded["first_demand_id"],
                "to_demand_id": seeded["second_demand_id"],
                "reason": "不应保存",
            },
        )

    with app.app_context():
        db.session.remove()
        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        source_flow = CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id, demand_id=seeded["first_demand_id"]
        ).one()
        assert candidate.current_demand_id == seeded["first_demand_id"]
        assert source_flow.status == "active"
        assert CandidateDemandFlow.query.filter_by(
            candidate_id=candidate.id, demand_id=seeded["second_demand_id"]
        ).count() == 0
        assert [row.stage for row in PipelineStage.query.filter_by(
            candidate_id=candidate.id
        ).order_by(PipelineStage.id).all()] == ["interview"]


def test_offer_audit_failure_rolls_back_offer_record(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("pipeline-audit-offer@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id)
    moved = client.post(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
        headers=_auth(token),
        json={"candidate_id": seeded["first_candidate_id"], "stage": "offer"},
    )
    assert moved.status_code == 200
    from app.services import pipeline_service

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(pipeline_service, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.put(
            f"/api/pipeline/demands/{seeded['first_demand_id']}/offer/{seeded['first_candidate_id']}",
            headers=_auth(token),
            json={"salary_range": "不应保存", "approval_status": "approved"},
        )

    with app.app_context():
        db.session.remove()
        assert OfferRecord.query.filter_by(
            candidate_id=seeded["first_candidate_id"],
            demand_id=seeded["first_demand_id"],
        ).count() == 0


def test_onboarded_reaching_hc_suggests_completion_without_closing_demand(
    client, make_user, app
):
    owner_id, token = make_user("pipeline-hc@example.com", role="recruiter")
    seeded = _seed_sibling_demands(app, owner_id, headcount=1)

    response = client.post(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
        headers=_auth(token),
        json={
            "candidate_id": seeded["first_candidate_id"],
            "stage": "onboarded",
        },
    )
    assert response.status_code == 200
    assert response.get_json()["onboarded_count"] == 1
    assert response.get_json()["completion_suggested"] is True
    assert response.get_json()["demand_status"] == "active"

    with app.app_context():
        demand = db.session.get(RecruitmentDemand, seeded["first_demand_id"])
        candidate = db.session.get(Candidate, seeded["first_candidate_id"])
        assert demand.status == "active"
        assert candidate.current_demand_id is None


def test_legacy_job_only_write_resolves_the_single_demand(client, make_user, app):
    owner_id, token = make_user("pipeline-legacy-one@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="唯一需求模板", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-ONLY",
            status="active",
        )
        candidate = Candidate(owner_hr_id=owner_id, name_masked="兼容候选人", resume_json={})
        db.session.add_all([demand, candidate])
        db.session.commit()
        job_id, demand_id, candidate_id = job.id, demand.id, candidate.id

    moved = client.post(
        "/api/pipeline/move",
        headers=_auth(token),
        json={"candidate_id": candidate_id, "job_id": job_id, "stage": "pending"},
    )
    assert moved.status_code == 200
    assert moved.get_json()["demand_id"] == demand_id

    board = client.get(f"/api/pipeline/{job_id}/board", headers=_auth(token))
    assert board.status_code == 200
    assert board.get_json()["demand_id"] == demand_id
    with app.app_context():
        stage = PipelineStage.query.one()
        assert stage.demand_id == demand_id
        assert stage.job_id == job_id
        assert OfferRecord.query.count() == 0


def test_demand_board_excludes_cross_org_candidate_even_if_fact_is_corrupted(
    client, make_user, app
):
    owner_id, _ = make_user("pipeline-org-owner@example.com", role="recruiter", org_id=1)
    _, manager_token = make_user("pipeline-org-manager@example.com", role="manager", org_id=1)
    seeded = _seed_sibling_demands(app, owner_id)
    with app.app_context():
        foreign = Candidate(
            org_id=2,
            name_masked="不应泄露的候选人",
            resume_json={},
        )
        db.session.add(foreign)
        db.session.flush()
        db.session.add(
            PipelineStage(
                org_id=2,
                candidate_id=foreign.id,
                demand_id=seeded["first_demand_id"],
                job_id=seeded["job_id"],
                stage="pending",
            )
        )
        db.session.commit()

    board = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/board",
        headers=_auth(manager_token),
    )
    assert board.status_code == 200
    assert board.get_json()["candidates"] == []


def test_interviewer_demand_reads_are_limited_to_assigned_candidate(
    client, make_user, app
):
    owner_id, owner_token = make_user("pipeline-interviewer-owner@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "pipeline-assigned-interviewer@example.com",
        role="interviewer",
    )
    seeded = _seed_sibling_demands(app, owner_id)
    for candidate_id in (seeded["first_candidate_id"], seeded["second_candidate_id"]):
        moved = client.post(
            f"/api/pipeline/demands/{seeded['first_demand_id']}/move",
            headers=_auth(owner_token),
            json={"candidate_id": candidate_id, "stage": "interview"},
        )
        assert moved.status_code == 200

    with app.app_context():
        db.session.add(
            InterviewAssignment(
                candidate_id=seeded["first_candidate_id"],
                demand_id=seeded["first_demand_id"],
                job_id=seeded["job_id"],
                round="interview_first",
                interviewer_id=interviewer_id,
                is_primary=True,
            )
        )
        db.session.commit()

    board = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/board",
        headers=_auth(interviewer_token),
    )
    assert board.status_code == 200
    assert [item["candidate_id"] for item in board.get_json()["candidates"]] == [
        seeded["first_candidate_id"]
    ]

    assigned_history = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/history/{seeded['first_candidate_id']}",
        headers=_auth(interviewer_token),
    )
    unassigned_history = client.get(
        f"/api/pipeline/demands/{seeded['first_demand_id']}/history/{seeded['second_candidate_id']}",
        headers=_auth(interviewer_token),
    )
    assert assigned_history.status_code == 200
    assert unassigned_history.status_code == 403
