"""RecruitmentDemand aggregate helpers.

This module owns demand validation, snapshots and demand-scoped metrics. API
handlers should not reconstruct these business rules independently.
"""

from datetime import date, datetime, time
from math import ceil
from uuid import uuid4

from sqlalchemy import and_, func, or_

from .. import db
from ..models import Job, PipelineStage, RecruitmentDemand, User
from .demand_context_service import validate_recruiter_owner


PRIORITIES = {"A", "B", "C"}
OPEN_STATUSES = {"pending", "active", "paused"}
ALL_STATUSES = OPEN_STATUSES | {"filled", "cancelled", "closed"}
INTERVIEW_PROGRESS_STAGES = {
    "interview",
    "interview_first",
    "interview_second",
    "interview_final",
    "offer",
    "onboarded",
}
OFFER_STAGES = {"offer", "onboarded"}


class DemandValidationError(Exception):
    def __init__(self, fields, message="请补全招聘需求必填信息"):
        super().__init__(message)
        self.message = message
        self.fields = fields

    def as_payload(self):
        return {
            "error": self.message,
            "code": "validation_error",
            "fields": self.fields,
        }


def clean_text(value, limit):
    return str(value or "").strip()[:limit]


def parse_date(value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _generated_request_no():
    return f"REQ-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"


def validate_create_input(data, *, org_id, actor_id, actor_role, job=None):
    fields = {}
    city = clean_text(data.get("city") or data.get("job_city"), 80)
    department = clean_text(
        data.get("requester_department") or data.get("department") or data.get("job_department"),
        120,
    )
    hiring_manager_name = clean_text(data.get("hiring_manager_name"), 120)
    requested_at = parse_date(data.get("requested_at"))
    target_date = parse_date(data.get("target_date"))
    headcount = _positive_int(data.get("headcount"))
    owner = validate_recruiter_owner(data.get("owner_hr_id"), org_id)

    if not city:
        fields["city"] = "请选择招聘城市"
    if not department:
        fields["requester_department"] = "请填写用人部门"
    if headcount is None:
        fields["headcount"] = "HC 必须是大于 0 的整数"
    if requested_at is None:
        fields["requested_at"] = "请选择提需求日期"
    if not hiring_manager_name:
        fields["hiring_manager_name"] = "请填写用人负责人"
    if owner is None:
        fields["owner_hr_id"] = "请选择当前组织内启用的招聘专员"
    elif actor_role == "recruiter" and owner.id != actor_id:
        fields["owner_hr_id"] = "招聘专员只能为自己创建需求，转派请由经理操作"
    if target_date is None:
        fields["target_date"] = "请选择期望完成日期"
    elif requested_at and target_date < requested_at:
        fields["target_date"] = "期望完成日期不能早于提需求日期"

    title = clean_text(data.get("job_title") or data.get("title"), 200)
    jd_text = str(data.get("jd_text") or data.get("job_description") or "").strip()
    if job is None:
        if not title:
            fields["job_title"] = "请填写职位名称"
        if not jd_text:
            fields["jd_text"] = "请填写 JD"
    else:
        title = job.title or ""
        jd_text = job.jd_text or ""
        if not title or not jd_text:
            fields["job_id"] = "关联职位模板缺少职位名称或 JD"

    raw_status = clean_text(data.get("status") or "active", 20)
    if raw_status not in OPEN_STATUSES:
        fields["status"] = "新建需求状态只能是待确认、招聘中或暂停"
    if raw_status == "paused" and not clean_text(data.get("close_reason"), 1000):
        fields["close_reason"] = "暂停原因必填"

    request_no = clean_text(data.get("request_no"), 80) or _generated_request_no()
    duplicate = RecruitmentDemand.query.filter_by(
        org_id=org_id,
        request_no=request_no,
    ).first()
    if duplicate is not None:
        fields["request_no"] = "需求编号已存在"

    if fields:
        raise DemandValidationError(fields)

    return {
        "owner": owner,
        "city": city,
        "department": department,
        "hiring_manager_name": hiring_manager_name,
        "requested_at": requested_at,
        "target_date": target_date,
        "headcount": headcount,
        "job_title_snapshot": title,
        "jd_text_snapshot": jd_text,
        "status": raw_status,
        "request_no": request_no,
    }


def create_demand_from_input(data, *, org_id, actor_id, actor_role, job=None):
    values = validate_create_input(
        data,
        org_id=org_id,
        actor_id=actor_id,
        actor_role=actor_role,
        job=job,
    )
    created_job = False
    if job is None:
        from ..api.jobs import _extract_jd_structured

        job = Job(
            org_id=org_id,
            title=values["job_title_snapshot"],
            city=values["city"],
            department=values["department"],
            job_code=clean_text(data.get("job_code"), 80),
            jd_text=values["jd_text_snapshot"],
            jd_structured=_extract_jd_structured(None, values["jd_text_snapshot"]),
            owner_hr_id=values["owner"].id,
            status="active",
        )
        db.session.add(job)
        db.session.flush()
        created_job = True

    demand = RecruitmentDemand(
        org_id=org_id,
        job_id=job.id,
        owner_hr_id=values["owner"].id,
        created_by=actor_id,
        city=values["city"],
        department=values["department"],
        job_title_snapshot=values["job_title_snapshot"],
        jd_text_snapshot=values["jd_text_snapshot"],
        request_no=values["request_no"],
        requester_name=clean_text(data.get("requester_name"), 120),
        requester_department=values["department"],
        hiring_manager_name=values["hiring_manager_name"],
        requested_at=values["requested_at"],
        accepted_at=parse_date(data.get("accepted_at")),
        target_date=values["target_date"],
        priority=(clean_text(data.get("priority") or "B", 1).upper()),
        headcount=values["headcount"],
        status=values["status"],
        close_reason=clean_text(data.get("close_reason"), 1000),
        note=clean_text(data.get("note"), 2000),
    )
    if demand.priority not in PRIORITIES:
        demand.priority = "B"
    db.session.add(demand)
    db.session.flush()
    return demand, created_job


def _include_legacy_job_rows(demand):
    return (
        RecruitmentDemand.query.filter_by(
            org_id=demand.org_id,
            job_id=demand.job_id,
        ).count()
        == 1
    )


def _stage_scope_condition(demand):
    exact = PipelineStage.demand_id == demand.id
    if not _include_legacy_job_rows(demand):
        return exact
    return or_(
        exact,
        and_(
            PipelineStage.demand_id.is_(None),
            PipelineStage.job_id == demand.job_id,
        ),
    )


def demand_metrics(demand):
    scope = _stage_scope_condition(demand)
    base = PipelineStage.query.filter(
        PipelineStage.org_id == demand.org_id,
        scope,
    )
    recommended_count = (
        base.with_entities(func.count(func.distinct(PipelineStage.candidate_id))).scalar()
        or 0
    )
    latest = (
        base.with_entities(
            PipelineStage.candidate_id.label("candidate_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .group_by(PipelineStage.candidate_id)
        .subquery()
    )
    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .group_by(PipelineStage.stage)
        .all()
    )
    current_counts = {}
    for stage, count in rows:
        normalized = (
            "interview"
            if stage in INTERVIEW_PROGRESS_STAGES and stage not in OFFER_STAGES
            else stage
        )
        current_counts[normalized] = current_counts.get(normalized, 0) + count

    def distinct_ever(stages):
        return (
            base.filter(PipelineStage.stage.in_(stages))
            .with_entities(func.count(func.distinct(PipelineStage.candidate_id)))
            .scalar()
            or 0
        )

    return {
        "recommended_count": recommended_count,
        "business_review_count": current_counts.get("business_review", 0),
        "interview_count": distinct_ever(INTERVIEW_PROGRESS_STAGES),
        "offer_count": distinct_ever(OFFER_STAGES),
        "onboarded_count": distinct_ever({"onboarded"}),
        "transferred_count": distinct_ever({"transferred"}),
        "current_stage_counts": current_counts,
    }


def risk_flags(demand, metrics):
    flags = []
    today = date.today()
    if demand.target_date and demand.target_date < today and demand.status in OPEN_STATUSES:
        flags.append("overdue")
    if metrics["business_review_count"] > 0:
        flags.append("business_feedback_pending")
    if metrics["recommended_count"] >= 20 and metrics["interview_count"] == 0:
        flags.append("low_interview_conversion")
    if demand.requested_at and demand.status in OPEN_STATUSES:
        age_days = (today - demand.requested_at).days
        if age_days >= 60:
            flags.append("open_too_long")
    if metrics["recommended_count"] == 0 and demand.status in OPEN_STATUSES:
        start_date = demand.accepted_at or demand.requested_at
        if start_date and (today - start_date).days >= 7:
            flags.append("hr_no_recommendation")
    return flags


def demand_payload(demand, *, include_jd=False):
    job = demand.job
    owner = db.session.get(User, demand.owner_hr_id) if demand.owner_hr_id else None
    metrics = demand_metrics(demand)
    payload = {
        "id": demand.id,
        "job_id": demand.job_id,
        "job_title": demand.job_title_snapshot or (job.title if job else ""),
        "job_city": demand.city or (job.city if job else ""),
        "job_department": demand.department or (job.department if job else ""),
        "job_code": job.job_code if job else "",
        "owner_hr_id": demand.owner_hr_id,
        "owner_hr_name": owner.name if owner else "",
        "request_no": demand.request_no or "",
        "requester_name": demand.requester_name or "",
        "requester_department": demand.requester_department or demand.department or "",
        "hiring_manager_name": demand.hiring_manager_name or "",
        "requested_at": demand.requested_at.isoformat() if demand.requested_at else None,
        "accepted_at": demand.accepted_at.isoformat() if demand.accepted_at else None,
        "target_date": demand.target_date.isoformat() if demand.target_date else None,
        "priority": demand.priority or "B",
        "headcount": demand.headcount or 1,
        "status": demand.status or "active",
        "close_reason": demand.close_reason or "",
        "downgrade_reason": demand.downgrade_reason or "",
        "note": demand.note or "",
        "metrics": metrics,
        "completion_suggested": (
            metrics["onboarded_count"] >= max(1, int(demand.headcount or 1))
        ),
        "risk_flags": risk_flags(demand, metrics),
        "created_at": demand.created_at.isoformat() if demand.created_at else None,
        "updated_at": demand.updated_at.isoformat() if demand.updated_at else None,
    }
    if include_jd:
        payload["jd_text"] = demand.jd_text_snapshot or (job.jd_text if job else "")
    return payload


def apply_list_filters(query, args):
    status = clean_text(args.get("status"), 40)
    if status and status != "all":
        statuses = [item.strip() for item in status.split(",") if item.strip()]
        query = query.filter(RecruitmentDemand.status.in_(statuses))

    keyword = clean_text(args.get("q"), 120)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.filter(
            or_(
                RecruitmentDemand.request_no.ilike(pattern),
                RecruitmentDemand.job_title_snapshot.ilike(pattern),
                RecruitmentDemand.requester_name.ilike(pattern),
                RecruitmentDemand.hiring_manager_name.ilike(pattern),
            )
        )

    department = clean_text(args.get("department"), 120)
    if department:
        query = query.filter(RecruitmentDemand.department == department)
    city = clean_text(args.get("city"), 80)
    if city:
        query = query.filter(RecruitmentDemand.city == city)

    owner_hr_id = args.get("owner_hr_id", type=int)
    if owner_hr_id is not None:
        query = query.filter(RecruitmentDemand.owner_hr_id == owner_hr_id)

    created_from = parse_date(args.get("created_from"))
    if created_from:
        query = query.filter(
            RecruitmentDemand.created_at >= datetime.combine(created_from, time.min)
        )
    created_to = parse_date(args.get("created_to"))
    if created_to:
        query = query.filter(
            RecruitmentDemand.created_at <= datetime.combine(created_to, time.max)
        )
    return query


def paginate_demands(query, args):
    page = max(1, args.get("page", default=1, type=int) or 1)
    page_size = args.get("page_size", default=20, type=int) or 20
    page_size = min(100, max(1, page_size))
    sort = clean_text(args.get("sort") or "created_at_desc", 40)
    if sort == "created_at_asc":
        query = query.order_by(RecruitmentDemand.created_at.asc(), RecruitmentDemand.id.asc())
    else:
        query = query.order_by(RecruitmentDemand.created_at.desc(), RecruitmentDemand.id.desc())
    total = query.order_by(None).count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [demand_payload(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }
