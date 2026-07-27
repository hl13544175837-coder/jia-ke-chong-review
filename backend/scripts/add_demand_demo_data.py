#!/usr/bin/env python
"""Add a guarded, idempotent recruitment-demand demo suite."""

import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app, db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from app.time_utils import utc_now


SCENARIOS = (
    ("DEMO-DEMAND-PENDING", "演示需求-待审核", "pending", "pending"),
    ("DEMO-DEMAND-ACTIVE", "演示需求-招聘中", "active", "approved"),
    ("DEMO-DEMAND-FILLED", "演示需求-已完成", "filled", "approved"),
    ("DEMO-DEMAND-PAUSED", "演示需求-已暂停", "paused", "approved"),
    ("DEMO-DEMAND-CLOSED", "演示需求-已关闭", "closed", "approved"),
)

CANDIDATE_SCENARIOS = {
    "DEMO-DEMAND-ACTIVE": ("需求演示-招聘中候选人", "business_review"),
    "DEMO-DEMAND-FILLED": ("需求演示-已完成候选人", "onboarded"),
    "DEMO-DEMAND-CLOSED": ("需求演示-已关闭候选人", "interview"),
}

SCENARIO_NOTES = {
    "DEMO-DEMAND-PENDING": "演示招聘需求审核：可执行通过或不通过。",
    "DEMO-DEMAND-ACTIVE": "演示招聘中需求：可选候选人并查看招聘阶段。",
    "DEMO-DEMAND-FILLED": "演示已完成需求：可查看候选人与完成状态。",
    "DEMO-DEMAND-PAUSED": "演示暂停需求：可恢复招聘。",
    "DEMO-DEMAND-CLOSED": "演示关闭需求：可查看候选人或恢复招聘。",
}


def require_local_sqlite(database_url: str) -> Path:
    """Reject every database target except a local, file-backed SQLite DB."""
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        raise RuntimeError("演示需求脚本只允许写入本地 SQLite 数据库")
    if not url.database or url.database == ":memory:":
        raise RuntimeError("演示需求脚本需要本地 SQLite 文件")
    path = Path(url.database)
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


def _upsert_demand(base, recruiter, interviewer, scenario, now):
    request_no, title, status, approval_status = scenario
    demand = RecruitmentDemand.query.filter_by(
        org_id=base.org_id,
        request_no=request_no,
    ).first()
    if demand is None:
        demand = RecruitmentDemand(org_id=base.org_id, request_no=request_no)
        db.session.add(demand)

    is_pending = request_no == "DEMO-DEMAND-PENDING"
    is_closed = status == "closed"
    demand.job_id = base.job_id
    demand.owner_hr_id = recruiter.id
    demand.default_interviewer_id = base.default_interviewer_id or interviewer.id
    demand.created_by = interviewer.id if is_pending else recruiter.id
    demand.city = base.city
    demand.department = base.department
    demand.job_title_snapshot = title
    demand.jd_text_snapshot = base.jd_text_snapshot or base.job.jd_text
    demand.requester_name = interviewer.name
    demand.requester_department = base.department
    demand.hiring_manager_name = interviewer.name
    demand.requested_at = now.date()
    demand.accepted_at = None if is_pending else now.date()
    demand.target_date = (now + timedelta(days=30)).date()
    demand.priority = "B"
    demand.headcount = 1 if status == "filled" else 2
    demand.status = status
    demand.approval_status = approval_status
    demand.submitted_at = now if is_pending else None
    demand.reviewed_by = None if is_pending else recruiter.id
    demand.reviewed_at = None if is_pending else now
    demand.review_reason = None
    demand.close_reason = "演示需求已暂停" if status == "paused" else (
        "演示需求已关闭" if status == "closed" else None
    )
    demand.closed_at = now if is_closed else None
    demand.closed_by = recruiter.id if is_closed else None
    demand.note = SCENARIO_NOTES[request_no]
    demand.updated_at = now
    db.session.flush()
    return demand


def _find_demo_candidate(org_id, demo_key):
    matches = [
        candidate
        for candidate in Candidate.query.filter_by(org_id=org_id).all()
        if isinstance(candidate.resume_json, dict)
        and candidate.resume_json.get("demo_key") == demo_key
    ]
    if len(matches) > 1:
        raise RuntimeError(f"招聘需求演示候选人标识重复：{demo_key}")
    return matches[0] if matches else None


def _upsert_candidate_flow(demand, recruiter, candidate_name, stage_name, now):
    candidate = _find_demo_candidate(demand.org_id, demand.request_no)
    if candidate is None:
        candidate = Candidate(
            org_id=demand.org_id,
            owner_hr_id=recruiter.id,
            current_demand_id=demand.id,
            name_masked=candidate_name,
            email_masked=f"demand-demo-{demand.request_no.lower()}@example.com",
            phone_masked="136****2026",
            resume_json={
                "demo_key": demand.request_no,
                "name": candidate_name,
                "education": [
                    {"school": "演示大学", "degree": "本科", "major": "计算机科学"}
                ],
                "experience": [
                    {
                        "company": "演示科技公司",
                        "title": demand.job_title_snapshot,
                        "years": 4,
                        "desc": "用于演示招聘需求与候选人完整流转。",
                    }
                ],
                "skills": ["Python", "Flask", "SQLAlchemy"],
                "summary": f"{demand.job_title_snapshot}的招聘流程演示候选人",
            },
            parse_status="ok",
            created_at=now,
        )
        db.session.add(candidate)
        db.session.flush()
    candidate.owner_hr_id = recruiter.id
    candidate.name_masked = candidate_name

    is_active = demand.request_no == "DEMO-DEMAND-ACTIVE"
    candidate.current_demand_id = demand.id if is_active else None

    flows = CandidateDemandFlow.query.filter_by(
        org_id=demand.org_id,
        candidate_id=candidate.id,
        demand_id=demand.id,
    ).order_by(CandidateDemandFlow.id.asc()).all()
    if flows:
        flow = flows[0]
        for duplicate in flows[1:]:
            db.session.delete(duplicate)
    else:
        flow = CandidateDemandFlow(
            org_id=demand.org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            started_at=now,
            created_at=now,
        )
        db.session.add(flow)
    flow.owner_hr_id = recruiter.id
    flow.status = "active" if is_active else "completed"
    flow.ended_at = None if is_active else now
    flow.updated_at = now

    stages = PipelineStage.query.filter_by(
        org_id=demand.org_id,
        candidate_id=candidate.id,
        demand_id=demand.id,
        note=SCENARIO_NOTES[demand.request_no],
    ).order_by(PipelineStage.id.asc()).all()
    if stages:
        stage = stages[0]
        for duplicate in stages[1:]:
            db.session.delete(duplicate)
    else:
        stage = PipelineStage(
            org_id=demand.org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
        )
        db.session.add(stage)
    stage.job_id = demand.job_id
    stage.stage = stage_name
    stage.updated_by = recruiter.id
    stage.note = SCENARIO_NOTES[demand.request_no]
    stage.ts = now


def add_demand_demo_data():
    """Create or refresh the five fixed demand scenarios."""
    base = RecruitmentDemand.query.filter_by(
        org_id=1,
        request_no="DEMO-2026-001",
    ).first()
    recruiter = User.query.filter_by(org_id=1, email="hr01@mvp.local").first()
    interviewer = User.query.filter_by(
        org_id=1,
        email="interviewer01@mvp.local",
    ).first()
    if not recruiter or not interviewer or not base:
        raise RuntimeError("缺少 hr01、interviewer01 或 DEMO-2026-001，请先初始化演示数据")

    now = utc_now()
    for scenario in SCENARIOS:
        demand = _upsert_demand(base, recruiter, interviewer, scenario, now)
        candidate_scenario = CANDIDATE_SCENARIOS.get(demand.request_no)
        if candidate_scenario:
            _upsert_candidate_flow(demand, recruiter, *candidate_scenario, now)

    db.session.commit()
    return [scenario[1] for scenario in SCENARIOS]


def main():
    app = create_app()
    with app.app_context():
        configured_path = require_local_sqlite(
            app.config["SQLALCHEMY_DATABASE_URI"]
        )
        engine_path = require_local_sqlite(str(db.engine.url))
        if configured_path != engine_path:
            raise RuntimeError("应用配置与数据库实际连接地址不一致")
        scenario_names = add_demand_demo_data()
    print(f"已写入 {len(scenario_names)} 条招聘需求演示数据：{'、'.join(scenario_names)}")


if __name__ == "__main__":
    main()
