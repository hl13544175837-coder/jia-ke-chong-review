from datetime import timedelta

from app import db
from app.models import Candidate, CandidateDemandFlow, Job, RecruitmentDemand
from app.time_utils import utc_now


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_demand_with_flows(app, owner_id):
    with app.app_context():
        job = Job(
            title="关闭流程一致性岗位",
            jd_text="验证关闭需求时释放候选人",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()

        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-CLOSE-FLOW-CLEANUP",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()

        active_candidate = Candidate(
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="进行中候选人",
            resume_json={},
        )
        completed_candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="历史候选人",
            resume_json={},
        )
        db.session.add_all([active_candidate, completed_candidate])
        db.session.flush()

        completed_at = utc_now() - timedelta(days=1)
        active_flow = CandidateDemandFlow(
            candidate_id=active_candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        )
        completed_flow = CandidateDemandFlow(
            candidate_id=completed_candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="completed",
            ended_at=completed_at,
        )
        db.session.add_all([active_flow, completed_flow])
        db.session.commit()
        return {
            "demand_id": demand.id,
            "active_candidate_id": active_candidate.id,
            "active_flow_id": active_flow.id,
            "completed_flow_id": completed_flow.id,
            "completed_at": completed_at,
        }


def test_closing_demand_releases_candidates_from_active_flows(
    client, make_user, app
):
    owner_id, token = make_user("close-flow@example.com", role="recruiter")
    seeded = _seed_demand_with_flows(app, owner_id)

    response = client.post(
        f"/api/demands/{seeded['demand_id']}/close",
        headers=_auth(token),
        json={"status": "closed", "close_reason": "业务决定停止招聘"},
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "closed"
    with app.app_context():
        db.session.remove()
        demand = db.session.get(RecruitmentDemand, seeded["demand_id"])
        active_flow = db.session.get(
            CandidateDemandFlow, seeded["active_flow_id"]
        )
        completed_flow = db.session.get(
            CandidateDemandFlow, seeded["completed_flow_id"]
        )
        candidate = db.session.get(Candidate, seeded["active_candidate_id"])

        assert demand.status == "closed"
        assert demand.closed_at is not None
        assert demand.closed_by == owner_id
        assert active_flow.status == "completed"
        assert active_flow.ended_at is not None
        assert candidate.current_demand_id is None
        assert completed_flow.status == "completed"
        assert completed_flow.ended_at == seeded["completed_at"]


def test_pausing_demand_keeps_active_flows_and_candidate_assignment(
    client, make_user, app
):
    owner_id, token = make_user("pause-flow@example.com", role="recruiter")
    seeded = _seed_demand_with_flows(app, owner_id)

    response = client.post(
        f"/api/demands/{seeded['demand_id']}/close",
        headers=_auth(token),
        json={"status": "paused", "close_reason": "业务暂缓招聘"},
    )

    assert response.status_code == 200
    assert response.get_json()["status"] == "paused"
    with app.app_context():
        db.session.remove()
        demand = db.session.get(RecruitmentDemand, seeded["demand_id"])
        active_flow = db.session.get(
            CandidateDemandFlow, seeded["active_flow_id"]
        )
        candidate = db.session.get(Candidate, seeded["active_candidate_id"])

        assert demand.status == "paused"
        assert demand.closed_at is None
        assert demand.closed_by is None
        assert active_flow.status == "active"
        assert active_flow.ended_at is None
        assert candidate.current_demand_id == demand.id


def test_restoring_closed_demand_does_not_reactivate_completed_flows(
    client, make_user, app
):
    owner_id, token = make_user("restore-closed-flow@example.com", role="recruiter")
    seeded = _seed_demand_with_flows(app, owner_id)

    closed = client.post(
        f"/api/demands/{seeded['demand_id']}/close",
        headers=_auth(token),
        json={"status": "closed", "close_reason": "业务决定停止招聘"},
    )
    assert closed.status_code == 200

    restored = client.post(
        f"/api/demands/{seeded['demand_id']}/restore",
        headers=_auth(token),
        json={"note": "重新开放岗位，但不自动召回旧候选人"},
    )

    assert restored.status_code == 200
    assert restored.get_json()["status"] == "active"
    with app.app_context():
        db.session.remove()
        active_flow = db.session.get(
            CandidateDemandFlow, seeded["active_flow_id"]
        )
        candidate = db.session.get(Candidate, seeded["active_candidate_id"])

        assert active_flow.status == "completed"
        assert active_flow.ended_at is not None
        assert candidate.current_demand_id is None
