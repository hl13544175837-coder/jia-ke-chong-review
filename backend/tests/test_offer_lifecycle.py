from datetime import date


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

    onboarded = client.post(
        f"/api/offers/{offer_id}/actions",
        headers=_auth(recruiter_token),
        json={"action": "onboard", "onboard_date": "2026-08-15"},
    )
    assert onboarded.status_code == 200, onboarded.get_json()
    assert onboarded.get_json()["status"] == "onboarded"
    assert onboarded.get_json()["onboard_date"] == date(2026, 8, 15).isoformat()

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


def test_offer_state_machine_and_org_role_boundaries(client, make_user, app):
    recruiter_id, recruiter_token = make_user(
        "offer-boundary@example.com",
        role="recruiter",
    )
    _, manager_token = make_user("offer-manager-2@example.com", role="manager")
    _, interviewer_token = make_user("offer-interviewer@example.com", role="interviewer")
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
