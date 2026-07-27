#!/usr/bin/env python
"""Add a non-destructive, idempotent interview-management demo suite."""

import sys
from datetime import timedelta
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app, db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    CandidateTag,
    InterviewAssignment,
    InterviewFeedback,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from app.time_utils import utc_now


SCENARIOS = (
    ("面试演示-待安排", "unassigned"),
    ("面试演示-可改期", "scheduled_future"),
    ("面试演示-待确认", "scheduled_started"),
    ("面试演示-待反馈", "awaiting_feedback"),
    ("面试演示-已完成", "completed"),
)


def add_interview_demo_data():
    """Insert only missing demo candidates; never reset existing business data."""
    recruiter = User.query.filter_by(email="hr01@mvp.local").first()
    interviewer = User.query.filter_by(email="interviewer01@mvp.local").first()
    demand = RecruitmentDemand.query.filter_by(request_no="DEMO-2026-001").first()
    if not recruiter or not interviewer or not demand:
        raise RuntimeError("缺少 hr01、interviewer01 或 DEMO-2026-001，请先初始化演示数据")

    now = utc_now()
    created = []
    for index, (name, state) in enumerate(SCENARIOS, start=1):
        existing = Candidate.query.filter_by(
            org_id=demand.org_id,
            name_masked=name,
        ).first()
        if existing:
            continue

        candidate = Candidate(
            org_id=demand.org_id,
            owner_hr_id=recruiter.id,
            current_demand_id=demand.id,
            name_masked=name,
            email_masked=f"demo-interview-{index}@example.com",
            phone_masked=f"137****10{index:02d}",
            resume_json={
                "name": name,
                "education": [
                    {"school": "演示大学", "degree": "本科", "major": "软件工程", "year": 2020}
                ],
                "experience": [
                    {
                        "company": "演示科技公司",
                        "title": "Python后端工程师",
                        "years": 4,
                        "desc": "负责 Python、Flask、Redis 和 SQLAlchemy 项目开发",
                    }
                ],
                "skills": ["Python", "Flask", "SQLAlchemy", "Redis", "Docker"],
                "summary": f"面试管理功能演示数据：{name.removeprefix('面试演示-')}",
            },
            parse_status="ok",
            created_at=now - timedelta(days=1),
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add_all(
            CandidateTag(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                tag=tag,
                score=score,
            )
            for tag, score in (("Python", 5), ("Flask", 4), ("Redis", 4), ("Docker", 3))
        )
        db.session.add(CandidateDemandFlow(
            org_id=demand.org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=recruiter.id,
            status="active",
            started_at=now - timedelta(days=1),
            created_at=now - timedelta(days=1),
            updated_at=now,
        ))
        db.session.add_all([
            PipelineStage(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                job_id=demand.job_id,
                demand_id=demand.id,
                stage="pending",
                updated_by=recruiter.id,
                ts=now - timedelta(days=1),
            ),
            PipelineStage(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                job_id=demand.job_id,
                demand_id=demand.id,
                stage="interview",
                updated_by=recruiter.id,
                ts=now,
            ),
        ])

        if state == "unassigned":
            created.append(name)
            continue

        scheduled_at = (
            now + timedelta(days=2)
            if state == "scheduled_future"
            else now - timedelta(hours=2)
        )
        status = {
            "scheduled_future": "scheduled",
            "scheduled_started": "scheduled",
            "awaiting_feedback": "awaiting_feedback",
            "completed": "feedback_submitted",
        }[state]
        assignment = InterviewAssignment(
            org_id=demand.org_id,
            candidate_id=candidate.id,
            job_id=demand.job_id,
            demand_id=demand.id,
            round="round_1",
            round_sequence=1,
            is_primary=True,
            primary_slot=1,
            interviewer_id=interviewer.id,
            scheduled_at=scheduled_at,
            location=f"演示会议室 {index}",
            note=f"面试管理功能演示：{name.removeprefix('面试演示-')}",
            status=status,
            created_by=recruiter.id,
            created_at=now - timedelta(days=1),
        )
        db.session.add(assignment)
        db.session.flush()

        if state == "completed":
            db.session.add(InterviewFeedback(
                org_id=demand.org_id,
                candidate_id=candidate.id,
                job_id=demand.job_id,
                demand_id=demand.id,
                assignment_id=assignment.id,
                round="round_1",
                interviewer_id=interviewer.id,
                score=5,
                passed=True,
                strengths="技术基础扎实，沟通清楚",
                concerns="暂无明显风险",
                reason_tags=["专业匹配", "建议推进"],
                evaluation_json={"satisfaction": "satisfied"},
                note="面试演示反馈：建议进入下一轮",
                created_at=now - timedelta(hours=1),
                updated_by=interviewer.id,
                updated_at=now - timedelta(hours=1),
            ))
        created.append(name)

    db.session.commit()
    return created


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        inserted = add_interview_demo_data()
        if inserted:
            print(f"已新增 {len(inserted)} 条面试演示数据：{'、'.join(inserted)}")
        else:
            print("面试演示数据已齐全，无需重复新增")
