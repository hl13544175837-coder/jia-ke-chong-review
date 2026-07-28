"""Truthful organization analytics built only from persisted recruiting facts."""

import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime

from ..models import Candidate, OfferRecord, RecruitmentDemand, UploadBatch
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


def build_analytics_overview(org_id):
    now = utc_now()
    demands = RecruitmentDemand.query.filter_by(org_id=org_id).order_by(RecruitmentDemand.id.asc()).all()
    active_demands = [item for item in demands if item.status == "active"]
    offers = OfferRecord.query.filter_by(org_id=org_id).all()
    candidates = Candidate.query.filter(
        Candidate.org_id == org_id,
        Candidate.deleted_at.is_(None),
    ).all()
    metrics_by_demand = {item.id: build_demand_operational_metrics(item) for item in demands}

    funnel = Counter()
    department_rows = defaultdict(lambda: {"headcount": 0, "onboarded": 0, "in_progress": 0})
    demand_rows = []
    for demand in active_demands:
        metrics = metrics_by_demand[demand.id]
        funnel_data = metrics["funnel"]
        for stage in ("pending", "ai_screen", "business_review", "interview", "offer", "onboarded"):
            funnel[stage] += int(funnel_data.get(stage, 0))
        department = demand.department or demand.requester_department or "未填写部门"
        row = department_rows[department]
        row["headcount"] += int(metrics["hc"]["headcount"])
        row["onboarded"] += int(metrics["hc"]["onboarded_count"])
        row["in_progress"] += int(funnel_data.get("pipeline_total", 0))
        demand_rows.append({
            "demand_id": demand.id,
            "request_no": demand.request_no,
            "title": metrics["demand"]["title"],
            "department": department,
            "headcount": int(metrics["hc"]["headcount"]),
            "onboarded": int(metrics["hc"]["onboarded_count"]),
            "in_progress": int(funnel_data.get("pipeline_total", 0)),
            "remaining": int(metrics["hc"]["remaining"]),
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

    onboarded_offers = [item for item in offers if item.approval_status == "onboarded"]
    accepted_or_onboarded = [item for item in offers if item.approval_status in {"accepted", "onboarded"}]
    monthly_key = f"{now.year:04d}-{now.month:02d}"
    quarter_start_month = ((now.month - 1) // 3) * 3 + 1
    hires_month = sum(1 for item in onboarded_offers if _month_key(item.onboarded_at) == monthly_key)
    hires_quarter = sum(
        1
        for item in onboarded_offers
        if item.onboarded_at and item.onboarded_at.year == now.year and item.onboarded_at.month >= quarter_start_month
    )
    total_headcount = sum(int(metrics_by_demand[item.id]["hc"]["headcount"]) for item in active_demands)
    total_onboarded = sum(int(metrics_by_demand[item.id]["hc"]["onboarded_count"]) for item in active_demands)
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
            "remaining_headcount": max(0, total_headcount - total_onboarded),
            "offer_accept_rate": round((len(accepted_or_onboarded) / len(offers) * 100), 1) if offers else 0.0,
            "cost_available": False,
        },
        "funnel": {
            "resumes": len(candidates),
            "screened": max(0, len(candidates) - funnel["pending"]),
            "interviewed": funnel["interview"] + funnel["offer"] + funnel["onboarded"],
            "offered": sum(1 for item in offers if item.approval_status not in {"draft", "rejected", "declined", "withdrawn", "expired"}),
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
