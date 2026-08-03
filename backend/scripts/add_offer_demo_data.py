#!/usr/bin/env python
"""Add a non-destructive, idempotent Offer-workbench demo suite."""

import sys
from datetime import timedelta
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app, db
from app.models import Candidate, CandidateDemandFlow, OfferRecord, PipelineStage, RecruitmentDemand, User
from app.services.offer_service import save_offer_record, transition_offer
from app.time_utils import utc_now


SCENARIOS = (
    ("Offer演示-草稿", "draft", "28K × 14薪"),
    ("Offer演示-待确认", "pending", "30K × 14薪"),
    ("Offer演示-待发放", "approved", "32K × 14薪"),
    ("Offer演示-待回复", "sent", "35K × 14薪"),
    ("Offer演示-待入职", "accepted", "38K × 14薪"),
)

NEXT_ACTION = {
    "draft": ("submit", {}),
    "pending": ("approve", {}),
    "approved": ("send", {"channel": "offline"}),
    "sent": ("accept", {"comment": "候选人已线下确认接受"}),
}


def _ensure_candidate(demand, recruiter, name, index, now):
    candidate = Candidate.query.filter_by(org_id=demand.org_id, name_masked=name).first()
    if candidate is not None:
        return candidate

    candidate = Candidate(
        org_id=demand.org_id,
        owner_hr_id=recruiter.id,
        current_demand_id=demand.id,
        name_masked=name,
        email_masked=f"offer-demo-{index}@example.com",
        phone_masked=f"136****20{index:02d}",
        resume_json={
            "extracted_info": {
                "name": name,
                "summary": f"Offer 工作台功能演示：{name.removeprefix('Offer演示-')}",
                "education": [{"school": "演示大学", "degree": "本科", "major": "计算机科学"}],
                "experience": [{"company": "演示科技", "title": "高级 Python 工程师", "years": 5}],
            },
            "skills": ["Python", "Flask", "SQLAlchemy", "Redis"],
        },
        parse_status="ok",
        created_at=now - timedelta(days=2),
    )
    db.session.add(candidate)
    db.session.flush()
    db.session.add(CandidateDemandFlow(
        org_id=demand.org_id,
        candidate_id=candidate.id,
        demand_id=demand.id,
        owner_hr_id=recruiter.id,
        status="active",
        started_at=now - timedelta(days=2),
        created_at=now - timedelta(days=2),
        updated_at=now,
    ))
    db.session.add(PipelineStage(
        org_id=demand.org_id,
        candidate_id=candidate.id,
        job_id=demand.job_id,
        demand_id=demand.id,
        stage="offer",
        updated_by=recruiter.id,
        ts=now - timedelta(days=2),
    ))
    db.session.commit()
    return candidate


def _advance_to(offer, target_status, demand, recruiter):
    while (offer.approval_status or "draft") != target_status:
        current = offer.approval_status or "draft"
        if current not in NEXT_ACTION:
            raise RuntimeError(f"{offer.id} 无法从 {current} 前进到 {target_status}")
        action, extra = NEXT_ACTION[current]
        transition_offer(
            offer_id=offer.id,
            org_id=demand.org_id,
            actor_id=recruiter.id,
            action=action,
            data={"comment": "Offer 工作台演示流程", **extra},
        )
        offer = db.session.get(OfferRecord, offer.id)
    return offer


def add_offer_demo_data():
    recruiter = User.query.filter_by(email="hr01@mvp.local").first()
    demand = RecruitmentDemand.query.filter_by(request_no="DEMO-2026-001").first()
    if not recruiter or not demand:
        raise RuntimeError("缺少 hr01 或 DEMO-2026-001，请先初始化演示数据")

    now = utc_now()
    result = []
    for index, (name, target_status, salary) in enumerate(SCENARIOS, start=1):
        candidate = _ensure_candidate(demand, recruiter, name, index, now)
        offer = OfferRecord.query.filter_by(
            org_id=demand.org_id,
            demand_id=demand.id,
            candidate_id=candidate.id,
        ).first()
        if offer is None:
            save_offer_record(
                demand_id=demand.id,
                candidate_id=candidate.id,
                org_id=demand.org_id,
                actor_id=recruiter.id,
                data={
                    "salary_range": salary,
                    "onboard_date": (now.date() + timedelta(days=14)).isoformat(),
                    "note": "Offer 工作台验收数据",
                },
            )
            offer = OfferRecord.query.filter_by(
                org_id=demand.org_id,
                demand_id=demand.id,
                candidate_id=candidate.id,
            ).one()
        offer = _advance_to(offer, target_status, demand, recruiter)

        if target_status == "pending":
            offer.submitted_at = now - timedelta(days=2)
        elif target_status == "approved":
            offer.approved_at = now - timedelta(days=1)
        elif target_status == "sent":
            offer.sent_at = now - timedelta(days=4)
            offer.expires_at = now + timedelta(days=2)
        elif target_status == "accepted":
            offer.responded_at = now - timedelta(days=1)
            offer.onboard_date = now.date() + timedelta(days=2)
        offer.updated_at = now
        db.session.commit()
        result.append((name, offer.approval_status))
    return result


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        for demo_name, demo_status in add_offer_demo_data():
            print(f"{demo_name}: {demo_status}")
