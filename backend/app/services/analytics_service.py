"""Truthful organization analytics built only from persisted recruiting facts."""

import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime

from ..models import Candidate, OfferRecord, RecruitmentDemand, UploadBatch, User
from ..time_utils import utc_now
from .bi_service import build_demand_operational_metrics


def _month_key(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if not isinstance(value, date):
        return None
    return f"{value.year:04d}-{value.month:02d}"


def _month_keys(now, months=7):
    year, month = now.year, now.month
    result = []
    for _ in range(months):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return list(reversed(result))


def _label_month(value):
    return f"{int(value.split('-')[1])}月"


def _demand_start_date(demand):
    if demand.accepted_at:
        return demand.accepted_at
    if demand.requested_at:
        return demand.requested_at
    return demand.created_at.date() if demand.created_at else None


def _offer_onboard_date(offer):
    if offer.onboard_date:
        return offer.onboard_date
    return offer.onboarded_at.date() if offer.onboarded_at else None


def _days_between(start, end):
    if start is None or end is None:
        return None
    return max(0, (end - start).days)


def build_analytics_overview(org_id):
    now = utc_now()
    today = now.date()
    demands = RecruitmentDemand.query.filter_by(org_id=org_id).order_by(RecruitmentDemand.id.asc()).all()
    active_demands = [item for item in demands if item.status == "active"]
    offers = OfferRecord.query.filter_by(org_id=org_id).all()
    candidates = Candidate.query.filter(
        Candidate.org_id == org_id,
        Candidate.deleted_at.is_(None),
    ).all()
    demand_by_id = {item.id: item for item in demands}
    candidate_by_id = {item.id: item for item in candidates}
    user_ids = {
        item.owner_hr_id for item in demands if item.owner_hr_id is not None
    } | {
        item.created_by for item in offers if item.created_by is not None
    }
    users_by_id = {
        item.id: item
        for item in User.query.filter(User.org_id == org_id, User.id.in_(user_ids)).all()
    } if user_ids else {}
    batch_ids = {item.upload_batch_id for item in candidates if item.upload_batch_id is not None}
    batches_by_id = {
        item.id: item
        for item in UploadBatch.query.filter(
            UploadBatch.org_id == org_id,
            UploadBatch.id.in_(batch_ids),
        ).all()
    } if batch_ids else {}
    metrics_by_demand = {item.id: build_demand_operational_metrics(item) for item in demands}
    offers_by_demand = defaultdict(list)
    for offer in offers:
        if offer.demand_id is not None:
            offers_by_demand[offer.demand_id].append(offer)

    monthly_key = f"{now.year:04d}-{now.month:02d}"
    quarter_start_month = ((now.month - 1) // 3) * 3 + 1
    quarter_end_month = quarter_start_month + 2
    excluded_offer_statuses = {"draft", "rejected", "declined", "withdrawn", "expired"}

    funnel = Counter()
    department_rows = defaultdict(lambda: {"headcount": 0, "onboarded": 0, "in_progress": 0})
    demand_rows = []
    for demand in active_demands:
        metrics = metrics_by_demand[demand.id]
        funnel_data = metrics["funnel"]
        demand_offers = offers_by_demand[demand.id]
        demand_onboarded_offers = [item for item in demand_offers if item.approval_status == "onboarded"]
        for stage in ("pending", "ai_screen", "business_review", "interview", "offer", "onboarded"):
            funnel[stage] += int(funnel_data.get(stage, 0))
        department = demand.department or demand.requester_department or "未填写部门"
        row = department_rows[department]
        row["headcount"] += int(metrics["hc"]["headcount"])
        row["onboarded"] += int(metrics["hc"]["onboarded_count"])
        row["in_progress"] += int(funnel_data.get("pipeline_total", 0))
        start_date = _demand_start_date(demand)
        days_open = _days_between(start_date, today) or 0
        remaining = int(metrics["hc"]["remaining"])
        over_headcount = int(metrics["hc"]["over_headcount"])
        risk_flags = []
        if over_headcount > 0:
            risk_flags.append("over_headcount")
        if demand.target_date and demand.target_date < today and remaining > 0:
            risk_flags.append("overdue")
        if days_open >= 30 and remaining > 0:
            risk_flags.append("open_too_long")
        if int(funnel_data.get("pipeline_total", 0)) == 0 and days_open >= 7 and remaining > 0:
            risk_flags.append("no_active_candidate")
        if int(metrics["outstanding_feedback"]["count"]) > 0:
            risk_flags.append("feedback_pending")
        demand_rows.append({
            "demand_id": demand.id,
            "request_no": demand.request_no,
            "title": metrics["demand"]["title"],
            "department": department,
            "headcount": int(metrics["hc"]["headcount"]),
            "onboarded": int(metrics["hc"]["onboarded_count"]),
            "in_progress": int(funnel_data.get("pipeline_total", 0)),
            "remaining": remaining,
            "over_headcount": over_headcount,
            "owner_hr_id": demand.owner_hr_id,
            "owner_name": metrics["current_responsibility"]["owner_name"] or "未分配",
            "start_date": start_date.isoformat() if start_date else None,
            "target_date": demand.target_date.isoformat() if demand.target_date else None,
            "days_open": days_open,
            "risk_flags": risk_flags,
            "outstanding_feedback": int(metrics["outstanding_feedback"]["count"]),
            "funnel": {
                stage: int(funnel_data.get(stage, 0))
                for stage in (
                    "pending", "ai_screen", "business_review", "interview", "offer",
                    "onboarded", "rejected", "transferred", "pipeline_total",
                    "archived_total", "funnel_total",
                )
            },
            "hires_month": sum(
                1 for item in demand_onboarded_offers
                if _month_key(item.onboarded_at) == monthly_key
            ),
            "hires_quarter": sum(
                1 for item in demand_onboarded_offers
                if item.onboarded_at
                and item.onboarded_at.year == now.year
                and quarter_start_month <= item.onboarded_at.month <= quarter_end_month
            ),
            "offers_issued": sum(
                1 for item in demand_offers
                if (item.approval_status or "draft") not in excluded_offer_statuses
            ),
            "offers_accepted": sum(
                1 for item in demand_offers
                if item.approval_status in {"accepted", "onboarded"}
            ),
        })

    month_keys = _month_keys(now)
    monthly = {key: {"month": _label_month(key), "hires": 0, "offers": 0} for key in month_keys}
    for offer in offers:
        sent_key = _month_key(offer.sent_at)
        if sent_key in monthly:
            monthly[sent_key]["offers"] += 1
        onboard_key = _month_key(offer.onboarded_at)
        if onboard_key in monthly:
            monthly[onboard_key]["hires"] += 1

    source_counts = Counter()
    for batch in UploadBatch.query.filter_by(org_id=org_id).all():
        source_counts[(batch.source_channel or "未填写来源").strip() or "未填写来源"] += 1

    hired_records = []
    cycle_samples = defaultdict(list)
    for offer in offers:
        if offer.approval_status != "onboarded" or offer.demand_id is None:
            continue
        demand = demand_by_id.get(offer.demand_id)
        candidate = candidate_by_id.get(offer.candidate_id)
        if demand is None or candidate is None:
            continue
        onboard_date = _offer_onboard_date(offer)
        recruitment_days = _days_between(_demand_start_date(demand), onboard_date)
        batch = batches_by_id.get(candidate.upload_batch_id)
        source_channel = (
            (batch.source_channel or "").strip() if batch else ""
        ) or "未记录来源"
        hired_records.append({
            "offer_id": offer.id,
            "candidate_id": candidate.id,
            "demand_id": demand.id,
            "candidate_name": candidate.name_masked or f"候选人 {candidate.id}",
            "position": demand.job_title_snapshot or (demand.job.title if demand.job else "未命名岗位"),
            "department": demand.department or demand.requester_department or "未填写部门",
            "source_channel": source_channel,
            "onboard_date": onboard_date.isoformat() if onboard_date else None,
            "recruitment_days": recruitment_days,
        })
        if recruitment_days is not None:
            cycle_samples[demand.id].append(recruitment_days)
    hired_records.sort(key=lambda item: (item["onboard_date"] or "", item["offer_id"]), reverse=True)

    cycle_rows = []
    for demand_id, samples in cycle_samples.items():
        demand = demand_by_id[demand_id]
        cycle_rows.append({
            "demand_id": demand_id,
            "position": demand.job_title_snapshot or (demand.job.title if demand.job else "未命名岗位"),
            "department": demand.department or demand.requester_department or "未填写部门",
            "average_days": round(sum(samples) / len(samples)),
            "fastest_days": min(samples),
            "slowest_days": max(samples),
            "hired_count": len(samples),
        })
    cycle_rows.sort(key=lambda item: (-item["average_days"], item["demand_id"]))

    attention_items = []
    for demand in demands:
        department = demand.department or demand.requester_department or "未填写部门"
        title = demand.job_title_snapshot or (demand.job.title if demand.job else "未命名岗位")
        owner = users_by_id.get(demand.owner_hr_id)
        applicant = owner.name if owner else demand.requester_name or "未记录"
        submitted = demand.submitted_at or demand.created_at
        if demand.approval_status == "pending":
            attention_items.append({
                "id": f"demand-{demand.id}",
                "type": "requisition",
                "title": title,
                "department": department,
                "applicant": applicant,
                "submitted_at": submitted.isoformat() if submitted else None,
                "urgency": "normal",
                "detail": f"{demand.request_no} · 招聘 {max(1, int(demand.headcount or 1))} 人",
                "days_remaining": None,
            })
        if demand.status != "active":
            continue
        metrics = metrics_by_demand[demand.id]
        if int(metrics["hc"]["remaining"]) <= 0:
            continue
        start_date = _demand_start_date(demand)
        days_open = _days_between(start_date, today) or 0
        days_remaining = (demand.target_date - today).days if demand.target_date else None
        if days_remaining is not None and days_remaining < 0:
            attention_items.append({
                "id": f"overdue-{demand.id}",
                "type": "overdue",
                "title": title,
                "department": department,
                "applicant": applicant,
                "submitted_at": submitted.isoformat() if submitted else None,
                "urgency": "urgent",
                "detail": f"已开放 {days_open} 天，仍有 {int(metrics['hc']['remaining'])} 个 HC 未完成",
                "days_remaining": days_remaining,
            })
        elif days_remaining is not None and days_remaining <= 7:
            attention_items.append({
                "id": f"expiring-{demand.id}",
                "type": "expiring",
                "title": title,
                "department": department,
                "applicant": applicant,
                "submitted_at": submitted.isoformat() if submitted else None,
                "urgency": "urgent" if days_remaining <= 3 else "normal",
                "detail": f"距离目标日期还有 {days_remaining} 天，仍有 {int(metrics['hc']['remaining'])} 个 HC 未完成",
                "days_remaining": days_remaining,
            })
        elif days_open >= 30:
            attention_items.append({
                "id": f"long-open-{demand.id}",
                "type": "overdue",
                "title": title,
                "department": department,
                "applicant": applicant,
                "submitted_at": submitted.isoformat() if submitted else None,
                "urgency": "normal",
                "detail": f"已开放 {days_open} 天，建议复核招聘策略",
                "days_remaining": days_remaining,
            })
    for offer in offers:
        if offer.approval_status != "pending" or offer.demand_id is None:
            continue
        demand = demand_by_id.get(offer.demand_id)
        candidate = candidate_by_id.get(offer.candidate_id)
        if demand is None:
            continue
        creator = users_by_id.get(offer.created_by)
        attention_items.append({
            "id": f"offer-{offer.id}",
            "type": "offer",
            "title": f"{candidate.name_masked if candidate else '候选人'} · {demand.job_title_snapshot or '未命名岗位'}",
            "department": demand.department or demand.requester_department or "未填写部门",
            "applicant": creator.name if creator else "未记录",
            "submitted_at": offer.submitted_at.isoformat() if offer.submitted_at else None,
            "urgency": "normal",
            "detail": offer.salary_range or "Offer 等待审批",
            "days_remaining": None,
        })
    urgency_order = {"urgent": 0, "normal": 1, "low": 2}
    attention_items.sort(key=lambda item: (urgency_order[item["urgency"]], item["submitted_at"] or ""))

    onboarded_offers = [item for item in offers if item.approval_status == "onboarded"]
    accepted_or_onboarded = [item for item in offers if item.approval_status in {"accepted", "onboarded"}]
    issued_offers = [
        item for item in offers
        if (item.approval_status or "draft") not in excluded_offer_statuses
    ]
    hires_month = sum(1 for item in onboarded_offers if _month_key(item.onboarded_at) == monthly_key)
    hires_quarter = sum(
        1
        for item in onboarded_offers
        if item.onboarded_at and item.onboarded_at.year == now.year and item.onboarded_at.month >= quarter_start_month
    )
    total_headcount = sum(int(metrics_by_demand[item.id]["hc"]["headcount"]) for item in active_demands)
    total_onboarded = sum(int(metrics_by_demand[item.id]["hc"]["onboarded_count"]) for item in active_demands)
    total_remaining = sum(int(metrics_by_demand[item.id]["hc"]["remaining"]) for item in active_demands)
    cycle_values = [item["recruitment_days"] for item in hired_records if item["recruitment_days"] is not None]
    return {
        "generated_at": now.isoformat(),
        "purpose": "招聘进度与资源协同，不用于个人绩效排名",
        "summary": {
            "hires_month": hires_month,
            "hires_quarter": hires_quarter,
            "open_demands": len(active_demands),
            "candidate_total": len(candidates),
            "headcount": total_headcount,
            "onboarded": total_onboarded,
            "remaining_headcount": total_remaining,
            "offer_accept_rate": round(
                len(accepted_or_onboarded) / len(issued_offers) * 100,
                1,
            ) if issued_offers else 0.0,
            "cost_available": False,
            "average_cycle_days": round(sum(cycle_values) / len(cycle_values)) if cycle_values else None,
            "fastest_cycle_days": min(cycle_values) if cycle_values else None,
            "slowest_cycle_days": max(cycle_values) if cycle_values else None,
            "attention_count": len(attention_items),
        },
        "funnel": {
            "resumes": len(candidates),
            "screened": max(0, len(candidates) - funnel["pending"]),
            "interviewed": funnel["interview"] + funnel["offer"] + funnel["onboarded"],
            "offered": len(issued_offers),
            "hired": len(onboarded_offers),
        },
        "monthly_trends": [monthly[key] for key in month_keys],
        "departments": [
            {"department": name, **values}
            for name, values in sorted(department_rows.items())
        ],
        "sources": [
            {"channel": name, "count": count}
            for name, count in source_counts.most_common()
        ],
        "demands": demand_rows,
        "hired_records": hired_records,
        "cycle_rows": cycle_rows,
        "attention_items": attention_items,
    }


def analytics_csv(payload):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["需求编号", "岗位", "部门", "HC", "已入职", "流程中", "剩余HC"])
    for item in payload["demands"]:
        writer.writerow([
            item["request_no"], item["title"], item["department"], item["headcount"],
            item["onboarded"], item["in_progress"], item["remaining"],
        ])
    return stream.getvalue()
