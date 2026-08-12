"""KPI 风险开关与健康度：组织配置真实驱动 BI 告警、需求风险标记和健康度。"""

from copy import deepcopy
from datetime import UTC, date, datetime, timedelta

from app import db
from app.models import Candidate, Job, KpiStandard, PipelineStage, RecruitmentDemand
from app.services.demand_service import demand_payload
from app.services.kpi_standard_service import DEFAULT_KPI_CONFIG


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_demands(app, owner_id, manager_id):
    """三类型需求：暂停中、零填充但有卡点、正常开放低填充（开关全开）。"""
    with app.app_context():
        config = deepcopy(DEFAULT_KPI_CONFIG)
        config["risk_thresholds"].update(
            {
                "high_if_status_paused_or_closed": True,
                "high_if_zero_fill_and_blocked": True,
                "medium_if_blocked": True,
                "medium_fill_ratio_threshold": 0.5,
                "stale_stage_days": 1,
                "no_recommendation_days": 1,
                "open_too_long_days": 3,
                "deadline_warning_days": 30,
            }
        )
        config["health_thresholds"] = {
            "green_threshold": 70,
            "yellow_threshold": 40,
        }
        db.session.add(
            KpiStandard(
                org_id=1,
                config_json=config,
                version=1,
                updated_by=manager_id,
            )
        )
        job = Job(
            org_id=1,
            title="开关验证岗位",
            jd_text="x",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()

        paused = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="暂停需求",
            status="paused",
            target_date=date.today() + timedelta(days=10),
        )
        zero_fill = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="零填充需求",
            status="active",
            headcount=2,
            requested_at=date.today() - timedelta(days=5),
            accepted_at=date.today() - timedelta(days=5),
            target_date=date.today() + timedelta(days=30),
        )
        low_fill = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="低填充需求",
            status="active",
            headcount=4,
            requested_at=date.today() - timedelta(days=1),
            accepted_at=date.today() - timedelta(days=1),
            target_date=date.today() + timedelta(days=60),
        )
        db.session.add_all([paused, zero_fill, low_fill])
        db.session.flush()

        # 零填充需求放一个停留候选人在 pending → stale 告警 → 视为有卡点
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=zero_fill.id,
            name_masked="卡点候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            PipelineStage(
                org_id=1,
                candidate_id=candidate.id,
                demand_id=zero_fill.id,
                job_id=job.id,
                stage="pending",
                updated_by=owner_id,
                ts=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2),
            )
        )
        db.session.commit()
        return {
            "job_id": job.id,
            "paused_id": paused.id,
            "zero_fill_id": zero_fill.id,
            "low_fill_id": low_fill.id,
        }


def test_risk_switches_and_health_in_demand_payload(app, make_user):
    owner_id, _ = make_user(
        "switch-owner@example.com", role="recruiter", name="专员"
    )
    manager_id, _ = make_user(
        "switch-manager@example.com", role="manager", name="经理"
    )
    ids = _seed_demands(app, owner_id, manager_id)
    with app.app_context():
        paused = db.session.get(RecruitmentDemand, ids["paused_id"])
        paused_payload = demand_payload(paused)
        assert "paused_or_closed" in paused_payload["risk_flags"]
        # 暂停(20) + 零入职有卡点(15) + 填充率低(10) = 55 → yellow
        assert paused_payload["health"] == {"score": 55, "level": "yellow"}

        zero_fill = db.session.get(RecruitmentDemand, ids["zero_fill_id"])
        zero_payload = demand_payload(zero_fill)
        assert "open_too_long" in zero_payload["risk_flags"]
        assert "zero_fill_and_blocked" in zero_payload["risk_flags"]
        assert "blocked" in zero_payload["risk_flags"]
        # 开放过久(15) + 零入职有卡点(15) + 填充率低(10) = 60 → yellow
        assert zero_payload["health"] == {"score": 60, "level": "yellow"}

        low_fill = db.session.get(RecruitmentDemand, ids["low_fill_id"])
        low_payload = demand_payload(low_fill)
        assert "hr_no_recommendation" in low_payload["risk_flags"]
        assert "fill_ratio_low" in low_payload["risk_flags"]
        # 无推荐(10) + 零入职有卡点(15) + 填充率低(10) = 65 → yellow
        assert low_payload["health"] == {"score": 65, "level": "yellow"}


def test_risk_switches_drive_bi_alerts(client, make_user, app):
    owner_id, _ = make_user(
        "switch-bi-owner@example.com", role="recruiter", name="专员"
    )
    manager_id, manager_token = make_user(
        "switch-bi-manager@example.com", role="manager", name="经理"
    )
    ids = _seed_demands(app, owner_id, manager_id)
    response = client.get("/api/bi/overview", headers=_auth(manager_token))
    assert response.status_code == 200
    alerts = response.get_json()["alerts"]
    by_demand = {}
    for alert in alerts:
        by_demand.setdefault(alert["demand_id"], []).append(alert)
    by_kind = {alert["kind"]: alert["priority"] for alert in alerts}

    assert by_kind.get("demand_paused_or_closed") == "high"
    assert ids["paused_id"] in by_demand
    assert by_kind.get("zero_fill_and_blocked") == "high"
    assert by_kind.get("demand_blocked") == "medium"
    assert by_kind.get("fill_ratio_low") == "medium"
    assert any(
        alert["kind"] == "hr_no_recommendation"
        for alert in by_demand.get(ids["low_fill_id"], [])
    )


def test_switches_off_produce_no_extra_alerts(client, make_user, app):
    owner_id, _ = make_user(
        "switch-off-owner@example.com", role="recruiter", name="专员"
    )
    manager_id, manager_token = make_user(
        "switch-off-manager@example.com", role="manager", name="经理"
    )
    with app.app_context():
        job = Job(
            org_id=1,
            title="默认配置岗位",
            jd_text="x",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        paused = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="默认暂停需求",
            status="paused",
            target_date=date.today() - timedelta(days=1),
        )
        db.session.add(paused)
        db.session.commit()
        paused_id = paused.id

    response = client.get("/api/bi/overview", headers=_auth(manager_token))
    assert response.status_code == 200
    alerts = response.get_json()["alerts"]
    # 开关全关（默认配置）：paused 需求完全不出现在告警里
    assert all(alert["demand_id"] != paused_id for alert in alerts)
    assert all(
        alert["kind"] not in {
            "demand_paused_or_closed",
            "zero_fill_and_blocked",
            "demand_blocked",
        }
        for alert in alerts
    )
