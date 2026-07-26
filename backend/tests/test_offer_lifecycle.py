from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError


def _auth(token, **extra):
    return {"Authorization": f"Bearer {token}", **extra}


def _seed_offer_candidate(app, owner_id, *, org_id=1):
    with app.app_context():
        from app import db
        from app.models import (
            Candidate,
            CandidateDemandFlow,
            Job,
            PipelineStage,
            RecruitmentDemand,
        )

        job = Job(
            org_id=org_id,
            title="高级产品经理",
            department="产品中心",
            jd_text="负责招聘产品",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=org_id,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no=f"REQ-OFFER-{org_id}-{job.id}",
            department="产品二组",
            job_title_snapshot=job.title,
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=org_id,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="候选人甲",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status="active",
            )
        )
        db.session.add(
            PipelineStage(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=job.id,
                stage="offer",
                updated_by=owner_id,
            )
        )
        db.session.commit()
        return demand.id, job.id, candidate.id


def _add_offer_candidate(app, owner_id, demand_id, *, name):
    with app.app_context():
        from app import db
        from app.models import (
            Candidate,
            CandidateDemandFlow,
            PipelineStage,
            RecruitmentDemand,
        )

        demand = db.session.get(RecruitmentDemand, demand_id)
        candidate = Candidate(
            org_id=demand.org_id,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked=name,
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            CandidateDemandFlow(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                owner_hr_id=owner_id,
                status="active",
            )
        )
        db.session.add(
            PipelineStage(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=demand.job_id,
                stage="offer",
                updated_by=owner_id,
            )
        )
        db.session.commit()
        return candidate.id


def test_offer_lifecycle_is_persisted_audited_and_updates_pipeline(
    client,
    make_user,
    app,
):
    recruiter_id, recruiter_token = make_user(
        "offer-owner@example.com",
        role="recruiter",
        name="招聘李华",
    )
    _, manager_token = make_user(
        "offer-manager@example.com",
        role="manager",
        name="招聘主管",
    )
    demand_id, job_id, candidate_id = _seed_offer_candidate(app, recruiter_id)

    created = client.put(
        f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
        headers=_auth(recruiter_token),
        json={
            "salary_range": "35000",
            "onboard_date": "2026-08-15",
            "approval_status": "approved",
            "note": "终面已通过",
        },
    )
    assert created.status_code == 200
    offer = created.get_json()
    assert offer["status"] == "draft"
    assert offer["approval_status"] == "draft"
    assert offer["candidate_name"] == "候选人甲"
    assert offer["position"] == "高级产品经理"
    assert offer["department"] == "产品二组"
    offer_id = offer["id"]

    listed = client.get(
        "/api/offers?search=候选人甲&status=draft",
        headers=_auth(recruiter_token),
    )
    assert listed.status_code == 200
    assert listed.get_json()["items"][0]["id"] == offer_id

    submitted = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, **{"Idempotency-Key": "submit-offer-1"}),
        json={"action": "submit", "comment": "请审批"},
    )
    assert submitted.status_code == 200
    assert submitted.get_json()["status"] == "pending"
    replayed = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, **{"Idempotency-Key": "submit-offer-1"}),
        json={"action": "submit", "comment": "请审批"},
    )
    assert replayed.status_code == 200
    assert replayed.headers["X-Idempotent-Replay"] == "true"

    denied = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "approve", "comment": "越权审批"},
    )
    assert denied.status_code == 403

    approved = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(manager_token),
        json={"action": "approve", "comment": "预算内，同意"},
    )
    assert approved.status_code == 200
    assert approved.get_json()["status"] == "approved"

    sent = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "send", "channel": "email"},
    )
    assert sent.status_code == 200
    assert sent.get_json()["status"] == "sent"
    assert sent.get_json()["expires_at"] is not None

    accepted = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "accept", "comment": "候选人已确认"},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["status"] == "accepted"

    accepted_demand = client.get(
        f"/api/demands/{demand_id}",
        headers=_auth(recruiter_token),
    )
    assert accepted_demand.status_code == 200
    assert accepted_demand.get_json()["metrics"]["onboarded_count"] == 0
    assert accepted_demand.get_json()["completion_suggested"] is False

    onboarded = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, **{"Idempotency-Key": "onboard-offer-1"}),
        json={"action": "onboard", "onboard_date": "2026-08-15"},
    )
    assert onboarded.status_code == 200, onboarded.get_json()
    assert onboarded.get_json()["status"] == "onboarded"
    assert onboarded.get_json()["onboard_date"] == date(2026, 8, 15).isoformat()

    with app.app_context():
        from app.models import IdempotencyRecord

        assert [row.idempotency_key for row in IdempotencyRecord.query.all()] == [
            "submit-offer-1",
            "onboard-offer-1",
        ]

    replayed_onboard = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token, **{"Idempotency-Key": "onboard-offer-1"}),
        json={"action": "onboard", "onboard_date": "2026-08-15"},
    )
    assert replayed_onboard.status_code == 200
    assert replayed_onboard.headers["X-Idempotent-Replay"] == "true"

    onboarded_demand = client.get(
        f"/api/demands/{demand_id}",
        headers=_auth(recruiter_token),
    )
    assert onboarded_demand.status_code == 200
    assert onboarded_demand.get_json()["metrics"]["onboarded_count"] == 1
    assert onboarded_demand.get_json()["completion_suggested"] is True

    detail = client.get(f"/api/offers/{offer_id}", headers=_auth(recruiter_token))
    assert detail.status_code == 200
    actions = [item["action"] for item in detail.get_json()["history"]]
    assert actions == ["saved", "submitted", "approved", "sent", "accepted", "onboarded"]
    assert detail.get_json()["candidate_reply"]["answer"] == "accepted"

    board = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(recruiter_token),
    ).get_json()
    candidate = next(item for item in board["candidates"] if item["candidate_id"] == candidate_id)
    assert candidate["stage"] == "onboarded"

    with app.app_context():
        from app.models import Event

        audit_actions = [
            row.action
            for row in Event.query.filter(Event.action.like("offer.%")).order_by(Event.id).all()
        ]
        assert audit_actions == [
            "offer.saved",
            "offer.submitted",
            "offer.approved",
            "offer.sent",
            "offer.accepted",
            "offer.onboarded",
        ]


def test_accepted_offer_locks_headcount_until_released(client, make_user, app):
    recruiter_id, recruiter_token = make_user(
        "offer-capacity-owner@example.com",
        role="recruiter",
    )
    _, manager_token = make_user(
        "offer-capacity-manager@example.com",
        role="manager",
    )
    demand_id, _, first_candidate_id = _seed_offer_candidate(app, recruiter_id)
    second_candidate_id = _add_offer_candidate(
        app,
        recruiter_id,
        demand_id,
        name="候选人乙",
    )

    offer_ids = []
    for candidate_id in (first_candidate_id, second_candidate_id):
        created = client.put(
            f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
            headers=_auth(recruiter_token),
            json={"salary_range": "30000", "note": "容量保护验收"},
        )
        assert created.status_code == 200
        offer_id = created.get_json()["id"]
        offer_ids.append(offer_id)
        assert client.post(
            f"/api/offers/{offer_id}/actions",
            headers=_auth(recruiter_token),
            json={"action": "submit"},
        ).status_code == 200
        assert client.post(
            f"/api/offers/{offer_id}/actions",
            headers=_auth(manager_token),
            json={"action": "approve"},
        ).status_code == 200
        assert client.post(
            f"/api/offers/{offer_id}/actions",
            headers=_auth(recruiter_token),
            json={"action": "send"},
        ).status_code == 200

    first_accepted = client.post(
        f"/api/offers/{offer_ids[0]}/actions",
        headers=_auth(recruiter_token),
        json={"action": "accept", "comment": "首位候选人已接受"},
    )
    assert first_accepted.status_code == 200

    demand = client.get(
        f"/api/demands/{demand_id}",
        headers=_auth(recruiter_token),
    ).get_json()
    assert demand["metrics"]["accepted_offer_count"] == 1
    assert demand["metrics"]["locked_headcount"] == 1
    assert demand["metrics"]["remaining_headcount"] == 0

    capacity_conflict = client.post(
        f"/api/offers/{offer_ids[1]}/actions",
        headers=_auth(recruiter_token),
        json={"action": "accept", "comment": "第二位候选人也接受"},
    )
    assert capacity_conflict.status_code == 409
    assert capacity_conflict.get_json()["code"] == "demand_headcount_locked"

    released = client.post(
        f"/api/offers/{offer_ids[0]}/actions",
        headers=_auth(recruiter_token),
        json={"action": "withdraw", "comment": "候选人放弃，释放名额"},
    )
    assert released.status_code == 200
    second_accepted = client.post(
        f"/api/offers/{offer_ids[1]}/actions",
        headers=_auth(recruiter_token),
        json={"action": "accept", "comment": "释放后由第二位候选人锁定"},
    )
    assert second_accepted.status_code == 200


def test_direct_pipeline_onboarding_is_rejected_without_side_effects(client, make_user, app):
    recruiter_id, recruiter_token = make_user(
        "offer-direct-onboard@example.com",
        role="recruiter",
    )
    demand_id, job_id, candidate_id = _seed_offer_candidate(app, recruiter_id)

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, Event, PipelineStage
        from app.services.pipeline_service import PipelineServiceError, move_candidate

        with pytest.raises(PipelineServiceError) as captured:
            move_candidate(
                candidate_id=candidate_id,
                demand_id=demand_id,
                org_id=1,
                actor_id=recruiter_id,
                stage="onboarded",
            )
        assert captured.value.status_code == 409
        assert captured.value.code == "offer_onboard_action_required"
        assert PipelineStage.query.filter_by(candidate_id=candidate_id).count() == 1
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate_id).one().status == "active"
        assert db.session.get(Candidate, candidate_id).current_demand_id == demand_id
        assert Event.query.filter_by(entity_id=candidate_id).count() == 0

    legacy = client.post(
        "/api/pipeline/move",
        headers=_auth(recruiter_token),
        json={
            "candidate_id": candidate_id,
            "demand_id": demand_id,
            "job_id": job_id,
            "stage": "onboarded",
        },
    )
    demand_scoped = client.post(
        f"/api/pipeline/demands/{demand_id}/move",
        headers=_auth(recruiter_token),
        json={"candidate_id": candidate_id, "stage": "onboarded"},
    )
    for response in (legacy, demand_scoped):
        assert response.status_code == 409
        assert response.get_json()["code"] == "offer_onboard_action_required"

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, Event, PipelineStage

        assert PipelineStage.query.filter_by(candidate_id=candidate_id).count() == 1
        assert CandidateDemandFlow.query.filter_by(candidate_id=candidate_id).one().status == "active"
        assert db.session.get(Candidate, candidate_id).current_demand_id == demand_id
        assert Event.query.filter_by(entity_id=candidate_id).count() == 0


def test_offer_state_machine_and_org_role_boundaries(client, make_user, app):
    recruiter_id, recruiter_token = make_user(
        "offer-boundary@example.com",
        role="recruiter",
    )
    _, manager_token = make_user("offer-manager-2@example.com", role="manager")
    _, interviewer_token = make_user("offer-interviewer@example.com", role="interviewer")
    _, unknown_role_token = make_user("offer-unknown@example.com", role="auditor")
    _, other_org_manager_token = make_user(
        "offer-other-org@example.com",
        role="manager",
        org_id=2,
    )
    demand_id, _, candidate_id = _seed_offer_candidate(app, recruiter_id)
    offer = client.put(
        f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
        headers=_auth(recruiter_token),
        json={"salary_range": "30000", "note": "草稿"},
    ).get_json()

    invalid = client.post(
        f"/api/offers/{offer['id']}/actions",
        headers=_auth(manager_token),
        json={"action": "approve"},
    )
    assert invalid.status_code == 409
    assert invalid.get_json()["code"] == "invalid_offer_transition"

    interviewer_list = client.get("/api/offers", headers=_auth(interviewer_token))
    assert interviewer_list.status_code == 403
    assert client.get(
        "/api/offers", headers=_auth(unknown_role_token)
    ).status_code == 403
    assert client.get(
        f"/api/offers/{offer['id']}",
        headers=_auth(other_org_manager_token),
    ).status_code == 404

    client.post(
        f"/api/offers/{offer['id']}/actions",
        headers=_auth(recruiter_token),
        json={"action": "submit"},
    )
    locked = client.put(
        f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
        headers=_auth(recruiter_token),
        json={"salary_range": "1", "note": "绕过审批"},
    )
    assert locked.status_code == 409
    assert locked.get_json()["code"] == "offer_not_editable"


def test_offer_list_reports_legacy_unmapped_rows_without_crashing(client, make_user, app):
    recruiter_id, _ = make_user("offer-legacy-owner@example.com", role="recruiter")
    _, manager_token = make_user("offer-legacy-manager@example.com", role="manager")
    _, job_id, candidate_id = _seed_offer_candidate(app, recruiter_id)
    with app.app_context():
        from app import db
        from app.models import OfferRecord

        db.session.add(
            OfferRecord(
                org_id=1,
                candidate_id=candidate_id,
                job_id=job_id,
                demand_id=None,
                salary_range="历史记录",
                approval_status="draft",
                created_by=recruiter_id,
            )
        )
        db.session.commit()

    response = client.get("/api/offers", headers=_auth(manager_token))
    assert response.status_code == 200
    assert response.get_json() == {
        "items": [],
        "total": 0,
        "unmapped_total": 1,
    }


def test_first_offer_insert_race_returns_conflict_without_overwriting_winner(
    client,
    make_user,
    app,
    monkeypatch,
):
    recruiter_id, recruiter_token = make_user(
        "offer-race-owner@example.com",
        role="recruiter",
    )
    demand_id, job_id, candidate_id = _seed_offer_candidate(app, recruiter_id)

    with app.app_context():
        from app import db
        from app.models import OfferRecord

        winner = OfferRecord(
            org_id=1,
            candidate_id=candidate_id,
            demand_id=demand_id,
            job_id=job_id,
            salary_range="并发赢家草稿",
            approval_status="draft",
            note="先写入的请求",
            created_by=recruiter_id,
        )
        db.session.add(winner)
        db.session.commit()
        winner_id = winner.id

        session_class = type(db.session())
        original_execute = session_class.execute
        hid_existing_offer_once = False

        def execute_with_stale_first_offer_read(session, statement, *args, **kwargs):
            nonlocal hid_existing_offer_once
            sql = str(statement).lower()
            if not hid_existing_offer_once and "from offer_records" in sql:
                hid_existing_offer_once = True

                class _NoOfferFound:
                    @staticmethod
                    def scalar_one_or_none():
                        return None

                return _NoOfferFound()
            return original_execute(session, statement, *args, **kwargs)

        monkeypatch.setattr(session_class, "execute", execute_with_stale_first_offer_read)

    response = client.put(
        f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
        headers=_auth(recruiter_token),
        json={"salary_range": "并发输家草稿", "note": "不应覆盖"},
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "offer_already_exists"
    assert "刷新" in response.get_json()["error"]

    with app.app_context():
        from app import db
        from app.models import OfferEvent, OfferRecord

        offers = OfferRecord.query.filter_by(
            org_id=1,
            demand_id=demand_id,
            candidate_id=candidate_id,
        ).all()
        assert len(offers) == 1
        assert offers[0].id == winner_id
        assert offers[0].salary_range == "并发赢家草稿"
        assert offers[0].note == "先写入的请求"
        assert OfferEvent.query.filter_by(offer_id=winner_id).count() == 0
        assert db.session.execute(db.text("SELECT 1")).scalar_one() == 1


def test_unrelated_offer_integrity_error_is_not_mislabeled(
    client,
    make_user,
    app,
    monkeypatch,
):
    recruiter_id, recruiter_token = make_user(
        "offer-unrelated-integrity@example.com",
        role="recruiter",
    )
    demand_id, _, candidate_id = _seed_offer_candidate(app, recruiter_id)
    unrelated = IntegrityError(
        "INSERT INTO offer_records ...",
        {},
        RuntimeError("NOT NULL constraint failed: offer_records.job_id"),
    )

    with app.app_context():
        from app import db
        from app.models import OfferRecord

        session_class = type(db.session())
        original_flush = session_class.flush

        def raise_unrelated_integrity_error(session, *args, **kwargs):
            if any(isinstance(item, OfferRecord) for item in session.new):
                raise unrelated
            return original_flush(session, *args, **kwargs)

        monkeypatch.setattr(
            session_class,
            "flush",
            raise_unrelated_integrity_error,
        )

    with pytest.raises(IntegrityError) as captured:
        client.put(
            f"/api/pipeline/demands/{demand_id}/offer/{candidate_id}",
            headers=_auth(recruiter_token),
            json={"salary_range": "30000"},
        )
    assert captured.value is unrelated

    with app.app_context():
        from app import db
        from app.models import OfferRecord

        assert OfferRecord.query.count() == 0
        assert db.session.execute(db.text("SELECT 1")).scalar_one() == 1
