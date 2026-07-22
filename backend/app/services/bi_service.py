"""Demand-scoped operational BI.

The service reads recruitment facts by ``demand_id`` only.  ``job_id`` is a
template projection and is never used to merge sibling Demand workflows.
"""

from collections import Counter
from datetime import date

from .. import db
from ..models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now
from .demand_context_service import OPEN_DEMAND_STATUSES
from .interview_workflow_service import active_assignment_filter
from .kpi_standard_service import get_effective_kpi_config
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
            active_assignment_filter(),
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


def _operational_funnel(metrics):
    funnel = metrics["funnel"]
    return {
        stage: int(funnel.get(stage, 0))
        for stage in (*FUNNEL_STAGES, "pipeline_total", "archived_total", "funnel_total")
    }


def _demand_summary(metrics):
    demand = metrics["demand"]
    responsibility = metrics["current_responsibility"]
    return {
        "demand_id": demand["id"],
        "job_id": demand["job_id"],
        "title": demand["title"],
        "department": demand["department"],
        "city": demand["city"],
        "status": demand["status"],
        "target_date": demand["target_date"],
        "owner_hr_id": responsibility["owner_hr_id"],
        "owner_name": responsibility["owner_name"],
        "funnel": _operational_funnel(metrics),
        "outstanding_feedback": metrics["outstanding_feedback"]["count"],
        "hc": metrics["hc"],
    }


def _block_category(alert, config):
    text = f"{alert.get('title') or ''} {alert.get('detail') or ''}".lower()
    fallback = None
    for category in config["block_categories"]:
        if category["id"] == "other":
            fallback = category
        if any(keyword.lower() in text for keyword in category["keywords"]):
            return {"id": category["id"], "name": category["name"]}
    category = fallback or config["block_categories"][-1]
    return {"id": category["id"], "name": category["name"]}


def _demand_alerts(demand_record, metrics, *, config):
    thresholds = config["risk_thresholds"]
    stale_days = thresholds["stale_stage_days"]
    demand = metrics["demand"]
    demand_id = demand["id"]
    job_id = demand["job_id"]
    title = demand["title"]
    alerts = []

    for item in metrics["stage_age"]:
        if item["stage"] not in ACTIVE_STAGES:
            continue
        if item["stage"] == "business_review":
            kind = (
                "business_feedback_overdue"
                if item["age_days"] >= stale_days
                else "business_feedback_pending"
            )
        elif item["age_days"] >= stale_days:
            kind = "stale_pipeline"
        else:
            continue
        alerts.append(
            {
                "kind": kind,
                "priority": "high" if item["age_days"] >= 14 else "medium",
                "title": (
                    f"{item['candidate_name']}业务反馈待补"
                    if item["stage"] == "business_review"
                    else f"{item['candidate_name']}停留过久"
                ),
                "detail": f"{title} · {item['stage_label']} 已 {item['age_days']} 天未推进",
                "demand_id": demand_id,
                "job_id": job_id,
                "candidate_id": item["candidate_id"],
                "candidate_name": item["candidate_name"],
                "stage": item["stage"],
                "stage_label": item["stage_label"],
                "age_days": item["age_days"],
                "action_path": f"/kanban?demand={demand_id}&candidate={item['candidate_id']}",
            }
        )

    for item in metrics["outstanding_feedback"]["items"]:
        alerts.append(
            {
                "kind": "pending_interview_feedback",
                "priority": "high",
                "title": f"{item['candidate_name']}面试反馈待补",
                "detail": f"{title} · 第 {item['round_sequence']} 轮面试已超时 {item['overdue_days']} 天",
                "demand_id": demand_id,
                "job_id": job_id,
                "candidate_id": item["candidate_id"],
                "candidate_name": item["candidate_name"],
                "assignment_id": item["assignment_id"],
                "interviewer_id": item["interviewer_id"],
                "interviewer_name": item["interviewer_name"],
                "stage": "interview",
                "stage_label": STAGE_LABELS["interview"],
                "age_days": item["overdue_days"],
                "action_path": f"/kanban?demand={demand_id}&candidate={item['candidate_id']}",
            }
        )

    today = date.today()
    if demand_record.target_date and demand_record.target_date < today:
        overdue_days = (today - demand_record.target_date).days
        alerts.append(
            {
                "kind": "demand_overdue",
                "priority": "high",
                "title": f"{title}已超过目标日期",
                "detail": f"目标日期已超期 {overdue_days} 天，请协调当前责任人",
                "demand_id": demand_id,
                "job_id": job_id,
                "candidate_id": None,
                "stage": None,
                "age_days": overdue_days,
                "action_path": f"/kanban?demand={demand_id}",
            }
        )
    elif demand_record.target_date:
        remaining_days = (demand_record.target_date - today).days
        if remaining_days <= thresholds["deadline_warning_days"]:
            alerts.append(
                {
                    "kind": "demand_deadline_warning",
                    "priority": "medium",
                    "title": f"{title}即将到达目标日期",
                    "detail": f"距离目标日期还有 {remaining_days} 天，请确认当前推进计划",
                    "demand_id": demand_id,
                    "job_id": job_id,
                    "candidate_id": None,
                    "stage": None,
                    "age_days": remaining_days,
                    "action_path": f"/kanban?demand={demand_id}",
                }
            )

    start_date = demand_record.accepted_at or demand_record.requested_at
    if (
        metrics["funnel"]["pipeline_total"] == 0
        and not metrics["hc"]["completion_suggested"]
        and start_date
        and (today - start_date).days >= thresholds["no_recommendation_days"]
    ):
        waiting_days = (today - start_date).days
        has_history = metrics["funnel"]["funnel_total"] > 0
        alerts.append(
            {
                "kind": "no_active_candidates" if has_history else "hr_no_recommendation",
                "priority": "medium",
                "title": (
                    f"{title}当前无在流程候选人"
                    if has_history
                    else f"{title}尚未推荐候选人"
                ),
                "detail": (
                    f"需求已接收 {waiting_days} 天，当前没有候选人在流程中，"
                    "请继续推荐或复盘历史结果"
                    if has_history
                    else f"需求已接收 {waiting_days} 天，尚无候选人进入流程"
                ),
                "demand_id": demand_id,
                "job_id": job_id,
                "candidate_id": None,
                "stage": None,
                "age_days": waiting_days,
                "action_path": f"/kanban?demand={demand_id}",
            }
        )

    if metrics["hc"]["completion_suggested"]:
        alerts.append(
            {
                "kind": "hc_completion_suggested",
                "priority": "low",
                "title": f"{title} HC 已满足",
                "detail": "已入职人数达到 HC，建议人工确认是否关闭需求",
                "demand_id": demand_id,
                "job_id": job_id,
                "candidate_id": None,
                "stage": "onboarded",
                "age_days": 0,
                "action_path": f"/kanban?demand={demand_id}",
            }
        )

    responsibility = metrics["current_responsibility"]
    for alert in alerts:
        alert["owner_hr_id"] = responsibility["owner_hr_id"]
        alert["owner_name"] = responsibility["owner_name"]
        alert["block_category"] = _block_category(alert, config)

    return alerts


def _aggregate_funnel(metrics_rows):
    funnel = {
        stage: 0
        for stage in (*FUNNEL_STAGES, "pipeline_total", "archived_total", "funnel_total")
    }
    for metrics in metrics_rows:
        demand_funnel = _operational_funnel(metrics)
        for key in funnel:
            funnel[key] += demand_funnel[key]
    return funnel


def build_team_operational_overview(org_id):
    """Build the manager/admin collaboration view from Demand-owned facts."""

    config = get_effective_kpi_config(org_id)
    demands = (
        RecruitmentDemand.query.filter(RecruitmentDemand.org_id == org_id)
        .order_by(RecruitmentDemand.created_at.desc(), RecruitmentDemand.id.desc())
        .all()
    )
    metrics_rows = [build_demand_operational_metrics(demand) for demand in demands]
    active_metrics_rows = [
        metrics
        for metrics in metrics_rows
        if metrics["demand"]["status"] in OPEN_DEMAND_STATUSES
    ]
    alerts = []
    for demand, metrics in zip(demands, metrics_rows):
        if metrics["demand"]["status"] in OPEN_DEMAND_STATUSES:
            alerts.extend(_demand_alerts(demand, metrics, config=config))
    priority_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(
        key=lambda item: (
            priority_order.get(item["priority"], 9),
            -int(item.get("age_days") or 0),
            item["demand_id"],
            item.get("candidate_id") or 0,
        )
    )
    return {
        "purpose": "operational_collaboration",
        "purpose_label": PURPOSE_LABEL,
        "funnel": _aggregate_funnel(active_metrics_rows),
        "alerts": alerts,
        "demands": [_demand_summary(metrics) for metrics in metrics_rows],
    }


def build_staff_operational_workload(org_id, hr_id):
    """Build one recruiter's current work queue without performance scoring."""

    user = User.query.filter_by(id=hr_id, org_id=org_id).first()
    demands = (
        RecruitmentDemand.query.filter(
            RecruitmentDemand.org_id == org_id,
            RecruitmentDemand.owner_hr_id == hr_id,
            RecruitmentDemand.status.in_(OPEN_DEMAND_STATUSES),
        )
        .order_by(RecruitmentDemand.created_at.desc(), RecruitmentDemand.id.desc())
        .all()
    )
    metrics_rows = [build_demand_operational_metrics(demand) for demand in demands]
    funnel = _aggregate_funnel(metrics_rows)
    return {
        "purpose": "operational_collaboration",
        "purpose_label": PURPOSE_LABEL,
        "hr_id": hr_id,
        "name": user.name if user else None,
        "workload": {
            "active_demands": len(demands),
            "active_candidates": funnel["pipeline_total"],
            "business_review": funnel["business_review"],
            "interview": funnel["interview"],
            "offer": funnel["offer"],
            "outstanding_feedback": sum(
                metrics["outstanding_feedback"]["count"]
                for metrics in metrics_rows
            ),
        },
        "demands": [_demand_summary(metrics) for metrics in metrics_rows],
    }
