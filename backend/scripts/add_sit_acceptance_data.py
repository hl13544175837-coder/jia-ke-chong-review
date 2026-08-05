#!/usr/bin/env python
"""Preview or add a non-destructive acceptance suite to disposable RC/SIT."""

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import current_app

from app import create_app, db
from app.models import (
    BusinessReviewTask,
    Candidate,
    CandidateDemandFlow,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    OfferEvent,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from app.time_utils import utc_now


ACCEPTANCE_JOB_CODE = "ACCEPTANCE-TEST-JOB-001"
ACCEPTANCE_DEMAND_PREFIX = "ACCEPTANCE-TEST-DEMAND-"
ACCEPTANCE_CANDIDATE_PREFIX = "验收测试-"
ACCEPTANCE_MARKER = "acceptance-test-v1"
RECRUITER_EMAIL = "hr01@mvp.local"
INTERVIEWER_EMAIL = "100002@gateway.local"

DEMAND_SCENARIOS = (
    ("ACCEPTANCE-TEST-DEMAND-001", "pending", "pending"),
    ("ACCEPTANCE-TEST-DEMAND-002", "active", "approved"),
)

REVIEW_SCENARIOS = (
    ("待筛选", "pending", "business_review"),
    ("筛选已通过", "approved", "interview"),
)

INTERVIEW_SCENARIOS = (
    ("面试即将开始", "scheduled", 1),
    ("面试待评价", "awaiting_feedback", -2),
    ("面试已完成", "feedback_submitted", -24),
)

OFFER_SCENARIOS = (
    ("Offer草稿", "draft"),
    ("Offer审批中", "pending"),
    ("Offer待发送", "approved"),
    ("Offer待回复", "sent"),
    ("Offer待入职", "accepted"),
    ("Offer已入职", "onboarded"),
)


def ensure_sit_allowed():
    channel = os.environ.get("BUILD_CHANNEL", "").strip().upper()
    if channel != "RC" or not current_app.config.get(
        "ALLOW_INSECURE_SIT_STARTUP"
    ):
        raise RuntimeError("验收测试数据只允许写入 RC/SIT 环境")


def _one_or_none(rows, marker):
    if len(rows) > 1:
        raise RuntimeError(f"验收标记重复，停止写入：{marker}")
    return rows[0] if rows else None


def _marker_counts():
    return {
        "jobs": Job.query.filter_by(job_code=ACCEPTANCE_JOB_CODE).count(),
        "demands": RecruitmentDemand.query.filter(
            RecruitmentDemand.request_no.like(f"{ACCEPTANCE_DEMAND_PREFIX}%")
        ).count(),
        "candidates": Candidate.query.filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count(),
        "business_reviews": BusinessReviewTask.query.join(
            Candidate, Candidate.id == BusinessReviewTask.candidate_id
        ).filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count(),
        "interviews": InterviewAssignment.query.join(
            Candidate, Candidate.id == InterviewAssignment.candidate_id
        ).filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count(),
        "feedback": InterviewFeedback.query.join(
            Candidate, Candidate.id == InterviewFeedback.candidate_id
        ).filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count(),
        "offers": OfferRecord.query.join(
            Candidate, Candidate.id == OfferRecord.candidate_id
        ).filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count(),
    }


def inspect_acceptance_data():
    return {
        "existing": _marker_counts(),
        "planned": {
            "jobs": 1,
            "demands": len(DEMAND_SCENARIOS),
            "candidates": (
                len(REVIEW_SCENARIOS)
                + len(INTERVIEW_SCENARIOS)
                + len(OFFER_SCENARIOS)
            ),
            "business_reviews": len(REVIEW_SCENARIOS),
            "interviews": len(INTERVIEW_SCENARIOS),
            "feedback": 1,
            "offers": len(OFFER_SCENARIOS),
        },
    }


def _required_user(email, role):
    user = User.query.filter_by(org_id=1, email=email, is_active=True).first()
    if user is None or user.role != role:
        raise RuntimeError(f"缺少启用中的 {role} 测试账号：{email}")
    return user


def _upsert_job(recruiter, now, counters):
    rows = Job.query.filter_by(org_id=1, job_code=ACCEPTANCE_JOB_CODE).all()
    job = _one_or_none(rows, ACCEPTANCE_JOB_CODE)
    if job is None:
        job = Job(org_id=1, job_code=ACCEPTANCE_JOB_CODE)
        db.session.add(job)
        counters["created"] += 1
    else:
        counters["updated"] += 1
    job.title = "验收测试-海外履约产品经理"
    job.city = "新加坡"
    job.department = "验收测试海外业务部"
    job.jd_text = "负责海外履约产品设计、跨区域协同和交付质量。"
    job.jd_structured = {
        "must_have_skills": ["履约产品", "跨区域协同"],
        "responsibilities": ["海外履约方案设计", "跨团队交付"],
    }
    job.owner_hr_id = recruiter.id
    job.status = "active"
    job.created_at = job.created_at or now
    db.session.flush()
    return job


def _upsert_demands(job, recruiter, interviewer, now, counters):
    demands = {}
    for index, (request_no, status, approval_status) in enumerate(
        DEMAND_SCENARIOS, start=1
    ):
        rows = RecruitmentDemand.query.filter_by(
            org_id=1, request_no=request_no
        ).all()
        demand = _one_or_none(rows, request_no)
        if demand is None:
            demand = RecruitmentDemand(org_id=1, request_no=request_no)
            db.session.add(demand)
            counters["created"] += 1
        else:
            counters["updated"] += 1
        demand.job_id = job.id
        demand.owner_hr_id = recruiter.id
        demand.default_interviewer_id = interviewer.id
        demand.created_by = interviewer.id if index == 1 else recruiter.id
        demand.city = "新加坡" if index == 1 else "远程办公"
        demand.department = "验收测试海外业务部"
        demand.job_title_snapshot = job.title
        demand.jd_text_snapshot = job.jd_text
        demand.requester_name = "李四" if index == 1 else "验收测试业务负责人"
        demand.requester_department = demand.department
        demand.hiring_manager_name = demand.requester_name
        demand.requested_at = now.date()
        demand.target_date = (now + timedelta(days=45)).date()
        demand.priority = "A" if index == 1 else "B"
        demand.headcount = 10
        demand.status = status
        demand.approval_status = approval_status
        demand.submitted_at = now if approval_status == "pending" else None
        demand.reviewed_by = recruiter.id if approval_status == "approved" else None
        demand.reviewed_at = now if approval_status == "approved" else None
        demand.review_reason = ""
        demand.note = f"{ACCEPTANCE_MARKER}:{request_no}"
        demand.updated_at = now
        db.session.flush()
        demands[request_no] = demand
    return demands


def _upsert_candidate(name_suffix, recruiter, demand, stage, now, counters):
    name = f"{ACCEPTANCE_CANDIDATE_PREFIX}{name_suffix}"
    rows = Candidate.query.filter_by(org_id=1, name_masked=name).all()
    candidate = _one_or_none(rows, name)
    if candidate is None:
        candidate = Candidate(org_id=1, name_masked=name)
        db.session.add(candidate)
        counters["created"] += 1
    else:
        marker = (candidate.resume_json or {}).get("acceptance_marker")
        if marker != ACCEPTANCE_MARKER:
            raise RuntimeError(f"同名记录不属于验收数据，停止写入：{name}")
        counters["updated"] += 1
    key = name_suffix.replace(" ", "-")
    candidate.owner_hr_id = recruiter.id
    candidate.current_demand_id = demand.id
    candidate.email_masked = f"acceptance-{key}@example.com"
    candidate.phone_masked = "138****2026"
    candidate.resume_json = {
        "acceptance_marker": ACCEPTANCE_MARKER,
        "acceptance_key": key,
        "name": name,
        "summary": f"{name}，仅用于 Test/SIT 功能验收。",
        "education": [{"school": "验收测试大学", "degree": "本科"}],
        "experience": [{"company": "验收测试科技", "title": demand.job_title_snapshot, "years": 4}],
        "skills": ["跨区域协同", "项目管理", "数据分析"],
    }
    candidate.parse_status = "ok"
    candidate.created_at = candidate.created_at or now
    db.session.flush()

    flows = CandidateDemandFlow.query.filter_by(
        org_id=1, candidate_id=candidate.id, demand_id=demand.id
    ).all()
    flow = _one_or_none(flows, f"flow:{name}")
    if flow is None:
        flow = CandidateDemandFlow(
            org_id=1,
            candidate_id=candidate.id,
            demand_id=demand.id,
            created_at=now,
        )
        db.session.add(flow)
        counters["created"] += 1
    flow.owner_hr_id = recruiter.id
    flow.status = "active"
    flow.started_at = flow.started_at or now
    flow.ended_at = None
    flow.updated_at = now

    stage_note = f"{ACCEPTANCE_MARKER}:{key}"
    stages = PipelineStage.query.filter_by(
        org_id=1,
        candidate_id=candidate.id,
        demand_id=demand.id,
        note=stage_note,
    ).all()
    pipeline_stage = _one_or_none(stages, stage_note)
    if pipeline_stage is None:
        pipeline_stage = PipelineStage(
            org_id=1,
            candidate_id=candidate.id,
            demand_id=demand.id,
            note=stage_note,
        )
        db.session.add(pipeline_stage)
        counters["created"] += 1
    pipeline_stage.job_id = demand.job_id
    pipeline_stage.stage = stage
    pipeline_stage.updated_by = recruiter.id
    pipeline_stage.ts = now
    db.session.flush()
    return candidate


def _upsert_reviews(demand, recruiter, interviewer, now, counters):
    for suffix, status, stage in REVIEW_SCENARIOS:
        candidate = _upsert_candidate(
            suffix, recruiter, demand, stage, now, counters
        )
        rows = BusinessReviewTask.query.filter_by(
            org_id=1, demand_id=demand.id, candidate_id=candidate.id
        ).all()
        task = _one_or_none(rows, f"review:{suffix}")
        if task is None:
            task = BusinessReviewTask(
                org_id=1,
                demand_id=demand.id,
                candidate_id=candidate.id,
                created_by=recruiter.id,
                created_at=now,
            )
            db.session.add(task)
            counters["created"] += 1
        task.reviewer_id = interviewer.id
        task.status = status
        task.pending_slot = 1 if status == "pending" else None
        task.hr_note = f"{ACCEPTANCE_MARKER}:{suffix}"
        task.business_note = "验收测试：建议进入面试" if status == "approved" else ""
        task.due_at = now + timedelta(days=1)
        task.decided_by = interviewer.id if status != "pending" else None
        task.decided_at = now if status != "pending" else None
        task.updated_at = now


def _upsert_interviews(demand, recruiter, interviewer, now, counters):
    for sequence, (suffix, status, hour_offset) in enumerate(
        INTERVIEW_SCENARIOS, start=1
    ):
        candidate = _upsert_candidate(
            suffix, recruiter, demand, "interview", now, counters
        )
        rows = InterviewAssignment.query.filter_by(
            org_id=1,
            demand_id=demand.id,
            candidate_id=candidate.id,
            round_sequence=1,
        ).all()
        assignment = _one_or_none(rows, f"interview:{suffix}")
        if assignment is None:
            assignment = InterviewAssignment(
                org_id=1,
                demand_id=demand.id,
                candidate_id=candidate.id,
                round_sequence=1,
                round="round_1",
                is_primary=True,
                primary_slot=1,
                created_by=recruiter.id,
                created_at=now,
            )
            db.session.add(assignment)
            counters["created"] += 1
        assignment.job_id = demand.job_id
        assignment.interviewer_id = interviewer.id
        assignment.scheduled_at = now + timedelta(hours=hour_offset)
        assignment.location = f"验收测试会议室 {sequence}"
        assignment.note = f"{ACCEPTANCE_MARKER}:{suffix}"
        assignment.status = status
        db.session.flush()

        if status == "feedback_submitted":
            feedbacks = InterviewFeedback.query.filter_by(
                assignment_id=assignment.id
            ).all()
            feedback = _one_or_none(feedbacks, f"feedback:{suffix}")
            if feedback is None:
                feedback = InterviewFeedback(
                    org_id=1,
                    candidate_id=candidate.id,
                    demand_id=demand.id,
                    assignment_id=assignment.id,
                    round="round_1",
                    interviewer_id=interviewer.id,
                    created_at=now,
                )
                db.session.add(feedback)
                counters["created"] += 1
            feedback.job_id = demand.job_id
            feedback.score = 5
            feedback.passed = True
            feedback.strengths = "验收测试：跨区域协同清晰"
            feedback.concerns = "验收测试：暂无"
            feedback.reason_tags = ["建议推进"]
            feedback.evaluation_json = {"satisfaction": "satisfied"}
            feedback.note = ACCEPTANCE_MARKER
            feedback.updated_by = interviewer.id
            feedback.updated_at = now


def _offer_timestamps(offer, status, now):
    offer.submitted_at = now - timedelta(days=5) if status != "draft" else None
    offer.approved_at = now - timedelta(days=4) if status in {"approved", "sent", "accepted", "onboarded"} else None
    offer.sent_at = now - timedelta(days=3) if status in {"sent", "accepted", "onboarded"} else None
    offer.responded_at = now - timedelta(days=2) if status in {"accepted", "onboarded"} else None
    offer.onboarded_at = now - timedelta(days=1) if status == "onboarded" else None


def _upsert_offers(demand, recruiter, now, counters):
    for index, (suffix, status) in enumerate(OFFER_SCENARIOS, start=1):
        stage = "onboarded" if status == "onboarded" else "offer"
        candidate = _upsert_candidate(
            suffix, recruiter, demand, stage, now, counters
        )
        rows = OfferRecord.query.filter_by(
            org_id=1, demand_id=demand.id, candidate_id=candidate.id
        ).all()
        offer = _one_or_none(rows, f"offer:{suffix}")
        if offer is None:
            offer = OfferRecord(
                org_id=1,
                demand_id=demand.id,
                candidate_id=candidate.id,
                created_by=recruiter.id,
                created_at=now,
            )
            db.session.add(offer)
            counters["created"] += 1
        offer.job_id = demand.job_id
        offer.salary_range = f"{28 + index}-{32 + index}K × 14薪"
        offer.onboard_date = (now + timedelta(days=14)).date()
        offer.approval_status = status
        offer.note = f"{ACCEPTANCE_MARKER}:{suffix}"
        offer.updated_at = now
        _offer_timestamps(offer, status, now)
        db.session.flush()

        events = OfferEvent.query.filter_by(
            org_id=1, offer_id=offer.id, action="acceptance_seed"
        ).all()
        event = _one_or_none(events, f"offer-event:{suffix}")
        if event is None:
            db.session.add(OfferEvent(
                org_id=1,
                offer_id=offer.id,
                action="acceptance_seed",
                from_status=None,
                to_status=status,
                actor_id=recruiter.id,
                comment=ACCEPTANCE_MARKER,
                detail={"scenario": suffix},
                created_at=now,
            ))
            counters["created"] += 1
        else:
            event.to_status = status
            event.detail = {"scenario": suffix}


def apply_acceptance_data():
    ensure_sit_allowed()
    counters = {"created": 0, "updated": 0}
    try:
        recruiter = _required_user(RECRUITER_EMAIL, "recruiter")
        interviewer = _required_user(INTERVIEWER_EMAIL, "interviewer")
        now = utc_now()
        job = _upsert_job(recruiter, now, counters)
        demands = _upsert_demands(
            job, recruiter, interviewer, now, counters
        )
        active_demand = demands["ACCEPTANCE-TEST-DEMAND-002"]
        _upsert_reviews(
            active_demand, recruiter, interviewer, now, counters
        )
        _upsert_interviews(
            active_demand, recruiter, interviewer, now, counters
        )
        _upsert_offers(active_demand, recruiter, now, counters)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {**counters, "existing": _marker_counts()}


def _format_counts(counts):
    return "，".join(f"{key}={value}" for key, value in counts.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="实际写入；不传时只预览",
    )
    args = parser.parse_args()
    app = create_app()
    with app.app_context():
        preview = inspect_acceptance_data()
        print(f"当前验收数据：{_format_counts(preview['existing'])}")
        print(f"计划验收数据：{_format_counts(preview['planned'])}")
        if not args.apply:
            print("仅预览，数据库未写入。使用 --apply 才会新增或刷新验收数据。")
            return
        result = apply_acceptance_data()
        print(
            f"验收数据写入完成：新增={result['created']}，"
            f"刷新={result['updated']}，{_format_counts(result['existing'])}"
        )


if __name__ == "__main__":
    main()
