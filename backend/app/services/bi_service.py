"""Demand-scoped operational BI.

The service reads recruitment facts by ``demand_id`` only.  ``job_id`` is a
template projection and is never used to merge sibling Demand workflows.
"""

from collections import Counter

from .. import db
from ..models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    OfferRecord,
    PipelineStage,
    User,
)
from ..time_utils import utc_now
from .pipeline_service import latest_demand_stage_subquery, normalize_pipeline_stage


ACTIVE_STAGES = {"pending", "ai_screen", "business_review", "interview", "offer"}
TERMINAL_STAGES = {"onboarded", "rejected", "transferred"}
FUNNEL_STAGES = (
    "pending",
    "ai_screen",
    "business_review",
    "interview",
    "offer",
    "onboarded",
    "rejected",
    "transferred",
)
STAGE_LABELS = {
    "pending": "待筛选",
    "ai_screen": "AI 初筛",
    "business_review": "业务待反馈",
    "interview": "面试中",
    "offer": "Offer",
    "onboarded": "已入职",
    "rejected": "已淘汰",
    "transferred": "已转出",
}
PURPOSE_LABEL = "仅用于进度、卡点和当前责任协同，不用于绩效考核"


def _safe_rate(numerator, denominator):
    numerator = int(numerator or 0)
    denominator = int(denominator or 0)
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator * 100, 1)


def _age_days(value, now):
    if value is None:
        return 0
    return max(0, (now - value).days)


def _latest_stage_rows(demand):
    latest = latest_demand_stage_subquery(demand.id, demand.org_id)
    return (
        db.session.query(PipelineStage, Candidate, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(
            PipelineStage.org_id == demand.org_id,
            PipelineStage.demand_id == demand.id,
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
        )
        .order_by(PipelineStage.ts.asc(), PipelineStage.id.asc())
        .all()
    )


def _funnel_and_age(demand, now):
    rows = _latest_stage_rows(demand)
    funnel = {stage: 0 for stage in FUNNEL_STAGES}
    stage_age = []
    for stage, candidate, updater in rows:
        normalized = normalize_pipeline_stage(stage.stage)
        if normalized not in funnel:
            funnel[normalized] = 0
        funnel[normalized] += 1
        stage_age.append(
            {
                "candidate_id": candidate.id,
                "candidate_name": candidate.name_masked or f"候选人 {candidate.id}",
                "stage": normalized,
                "stage_label": STAGE_LABELS.get(normalized, normalized),
                "age_days": _age_days(stage.ts, now),
                "updated_at": stage.ts.isoformat() if stage.ts else None,
                "last_actor_id": stage.updated_by,
                "last_actor_name": updater.name if updater else None,
            }
        )

    pipeline_total = sum(funnel.get(stage, 0) for stage in ACTIVE_STAGES)
    archived_total = sum(funnel.get(stage, 0) for stage in TERMINAL_STAGES)
    funnel_total = pipeline_total + archived_total
    funnel.update(
        {
            "pipeline_total": pipeline_total,
            "archived_total": archived_total,
            "funnel_total": funnel_total,
            "conversion_rate": _safe_rate(funnel.get("onboarded", 0), funnel_total),
        }
    )
    stage_age.sort(key=lambda item: (-item["age_days"], item["candidate_id"]))
    return funnel, stage_age


def _outstanding_feedback(demand, now):
    assignments = (
        db.session.query(InterviewAssignment, Candidate, User)
        .join(Candidate, Candidate.id == InterviewAssignment.candidate_id)
        .outerjoin(User, User.id == InterviewAssignment.interviewer_id)
        .filter(
            InterviewAssignment.org_id == demand.org_id,
            InterviewAssignment.demand_id == demand.id,
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
            InterviewAssignment.scheduled_at.isnot(None),
            InterviewAssignment.scheduled_at <= now,
            ~InterviewAssignment.status.in_(["cancelled", "canceled"]),
        )
        .order_by(InterviewAssignment.scheduled_at.asc(), InterviewAssignment.id.asc())
        .all()
    )
    if not assignments:
        return {"count": 0, "items": []}

    feedback_rows = (
        InterviewFeedback.query.filter(
            InterviewFeedback.org_id == demand.org_id,
            InterviewFeedback.demand_id == demand.id,
        ).all()
    )
    feedback_assignment_ids = {
        feedback.assignment_id
        for feedback in feedback_rows
        if feedback.assignment_id is not None
    }
    legacy_feedback_keys = {
        (
            feedback.candidate_id,
            feedback.round,
            feedback.interviewer_id,
        )
        for feedback in feedback_rows
        if feedback.assignment_id is None
    }

    items = []
    for assignment, candidate, interviewer in assignments:
        legacy_key = (
            assignment.candidate_id,
            assignment.round,
            assignment.interviewer_id,
        )
        if (
            assignment.id in feedback_assignment_ids
            or legacy_key in legacy_feedback_keys
        ):
            continue
        items.append(
            {
                "assignment_id": assignment.id,
                "candidate_id": assignment.candidate_id,
                "candidate_name": candidate.name_masked
                or f"候选人 {assignment.candidate_id}",
                "round": assignment.round,
                "round_sequence": assignment.round_sequence,
                "is_primary": bool(assignment.is_primary),
                "interviewer_id": assignment.interviewer_id,
                "interviewer_name": interviewer.name if interviewer else None,
                "scheduled_at": assignment.scheduled_at.isoformat()
                if assignment.scheduled_at
                else None,
                "overdue_days": _age_days(assignment.scheduled_at, now),
            }
        )
    return {"count": len(items), "items": items}


def _offer_metrics(demand):
    offers = (
        OfferRecord.query.filter_by(org_id=demand.org_id, demand_id=demand.id)
        .order_by(OfferRecord.id.asc())
        .all()
    )
    by_status = Counter((offer.approval_status or "draft") for offer in offers)
    return {
        "total": len(offers),
        "by_status": dict(sorted(by_status.items())),
        "items": [
            {
                "id": offer.id,
                "candidate_id": offer.candidate_id,
                "approval_status": offer.approval_status or "draft",
                "onboard_date": offer.onboard_date.isoformat()
                if offer.onboard_date
                else None,
            }
            for offer in offers
        ],
    }


def build_demand_operational_metrics(demand):
    """Build one explainable Demand read model without sibling aggregation."""

    now = utc_now()
    funnel, stage_age = _funnel_and_age(demand, now)
    outstanding_feedback = _outstanding_feedback(demand, now)
    offers = _offer_metrics(demand)
    owner = db.session.get(User, demand.owner_hr_id) if demand.owner_hr_id else None
    headcount = max(1, int(demand.headcount or 1))
    onboarded_count = int(funnel.get("onboarded", 0))

    return {
        "scope": {
            "type": "demand",
            "demand_id": demand.id,
            "job_id": demand.job_id,
        },
        "purpose": "operational_collaboration",
        "purpose_label": PURPOSE_LABEL,
        "demand": {
            "id": demand.id,
            "job_id": demand.job_id,
            "title": demand.job_title_snapshot
            or (demand.job.title if demand.job else f"需求 {demand.id}"),
            "department": demand.department or demand.requester_department or "",
            "city": demand.city or "",
            "status": demand.status,
            "target_date": demand.target_date.isoformat()
            if demand.target_date
            else None,
        },
        "funnel": funnel,
        "stage_age": stage_age,
        "outstanding_feedback": outstanding_feedback,
        "offers": offers,
        "hc": {
            "headcount": headcount,
            "onboarded_count": onboarded_count,
            "remaining": max(0, headcount - onboarded_count),
            "completion_rate": _safe_rate(onboarded_count, headcount),
            "completion_suggested": onboarded_count >= headcount,
        },
        "current_responsibility": {
            "owner_hr_id": demand.owner_hr_id,
            "owner_name": owner.name if owner else None,
            "label": "当前协同责任人",
            "active_candidates": funnel["pipeline_total"],
            "outstanding_feedback": outstanding_feedback["count"],
            "note": PURPOSE_LABEL,
        },
    }
