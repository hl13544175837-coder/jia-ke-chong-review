"""RecruitmentDemand aggregate helpers.

This module owns demand validation, snapshots and demand-scoped metrics. API
handlers should not reconstruct these business rules independently.
"""

from datetime import date, datetime, time
from math import ceil
from uuid import uuid4

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import aliased

from .. import db
from ..models import Candidate, Job, PipelineStage, RecruitmentDemand, User
from ..time_utils import utc_now
from .demand_context_service import validate_recruiter_owner
from .headcount_service import build_headcount_state
from .job_profile_service import extract_jd_structured


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
DEFAULT_INTERVIEWER_ROLES = {"interviewer", "manager", "admin"}


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


class DemandRequestNoConflict(Exception):
    def __init__(self):
        super().__init__("需求编号已存在")

    def as_payload(self):
        return {
            "error": "需求编号已存在",
            "code": "request_no_conflict",
            "fields": {"request_no": "需求编号已存在"},
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


def normalize_request_no(value):
    return str(value or "").strip().upper()[:80]


def generate_request_no():
    return f"REQ-{date.today():%Y%m%d}-{uuid4().hex[:16].upper()}"


def resolve_default_interviewer(value, *, org_id):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    try:
        interviewer_id = int(value)
    except (TypeError, ValueError):
        return None
    if interviewer_id <= 0:
        return None
    return User.query.filter(
        User.id == interviewer_id,
        User.org_id == org_id,
        User.is_active.is_(True),
        User.role.in_(DEFAULT_INTERVIEWER_ROLES),
    ).first()


def validate_create_input(data, *, org_id, actor_id, actor_role, job=None):
    fields = {}
    is_business_submission = actor_role == "interviewer"
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
    raw_default_interviewer_id = data.get("default_interviewer_id")
    if is_business_submission and raw_default_interviewer_id in (None, ""):
        raw_default_interviewer_id = actor_id
    default_interviewer = resolve_default_interviewer(
        raw_default_interviewer_id,
        org_id=org_id,
    )

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
    if (
        raw_default_interviewer_id not in (None, "")
        and default_interviewer is None
    ):
        fields["default_interviewer_id"] = (
            "请选择当前组织内已启用的面试官、经理或管理员"
        )

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

    raw_status = "pending" if is_business_submission else clean_text(
        data.get("status") or "active", 20
    )
    if not is_business_submission:
        if raw_status not in OPEN_STATUSES:
            fields["status"] = "新建需求状态只能是待确认、招聘中或暂停"
        if raw_status == "paused" and not clean_text(data.get("close_reason"), 1000):
            fields["close_reason"] = "暂停原因必填"

    request_no = normalize_request_no(data.get("request_no")) or generate_request_no()
    duplicate = RecruitmentDemand.query.filter_by(
        org_id=org_id,
        request_no=request_no,
    ).first()
    if duplicate is not None:
        fields["request_no"] = "需求编号已存在"

    if fields:
        if set(fields) == {"request_no"} and duplicate is not None:
            raise DemandRequestNoConflict()
        raise DemandValidationError(fields)

    return {
        "owner": owner,
        "default_interviewer": default_interviewer,
        "city": city,
        "department": department,
        "hiring_manager_name": hiring_manager_name,
        "requested_at": requested_at,
        "target_date": target_date,
        "headcount": headcount,
        "job_title_snapshot": title,
        "jd_text_snapshot": jd_text,
        "status": raw_status,
        "approval_status": "pending" if is_business_submission else "approved",
        "submitted_at": utc_now() if is_business_submission else None,
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
        job = Job(
            org_id=org_id,
            title=values["job_title_snapshot"],
            city=values["city"],
            department=values["department"],
            job_code=clean_text(data.get("job_code"), 80),
            jd_text=values["jd_text_snapshot"],
            jd_structured=extract_jd_structured(None, values["jd_text_snapshot"]),
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
        default_interviewer_id=(
            values["default_interviewer"].id
            if values["default_interviewer"] is not None
            else None
        ),
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
        approval_status=values["approval_status"],
        submitted_at=values["submitted_at"],
        close_reason=clean_text(data.get("close_reason"), 1000),
        note=clean_text(data.get("note"), 2000),
    )
    if demand.priority not in PRIORITIES:
        demand.priority = "B"
    db.session.add(demand)
    db.session.flush()
    return demand, created_job


def apply_editable_fields(demand, data, *, org_id):
    """Apply the shared demand edit contract without committing the transaction."""

    fields = {}
    if "request_no" in data:
        request_no = normalize_request_no(data.get("request_no"))
        if not request_no:
            fields["request_no"] = "需求编号不能为空"
        else:
            duplicate = RecruitmentDemand.query.filter(
                RecruitmentDemand.org_id == org_id,
                RecruitmentDemand.request_no == request_no,
                RecruitmentDemand.id != demand.id,
            ).first()
            if duplicate:
                raise DemandRequestNoConflict()
            demand.request_no = request_no
    if "default_interviewer_id" in data:
        raw_interviewer_id = data.get("default_interviewer_id")
        if raw_interviewer_id in (None, ""):
            demand.default_interviewer_id = None
        else:
            default_interviewer = resolve_default_interviewer(
                raw_interviewer_id,
                org_id=org_id,
            )
            if default_interviewer is None:
                fields["default_interviewer_id"] = (
                    "请选择当前组织内已启用的面试官、经理或管理员"
                )
            else:
                demand.default_interviewer_id = default_interviewer.id
    if "requester_name" in data:
        demand.requester_name = clean_text(data.get("requester_name"), 120)
    if "requester_department" in data or "department" in data:
        department = clean_text(
            data.get("requester_department") or data.get("department"), 120
        )
        if not department:
            fields["requester_department"] = "用人部门必填"
        else:
            demand.requester_department = department
            demand.department = department
    if "city" in data or "job_city" in data:
        city = clean_text(data.get("city") or data.get("job_city"), 80)
        if not city:
            fields["city"] = "招聘城市必填"
        else:
            demand.city = city
    if "hiring_manager_name" in data:
        manager = clean_text(data.get("hiring_manager_name"), 120)
        if not manager:
            fields["hiring_manager_name"] = "用人负责人必填"
        else:
            demand.hiring_manager_name = manager
    if "requested_at" in data:
        value = parse_date(data.get("requested_at"))
        if value is None:
            fields["requested_at"] = "提需求日期无效"
        else:
            demand.requested_at = value
    if "accepted_at" in data:
        demand.accepted_at = parse_date(data.get("accepted_at"))
    if "target_date" in data:
        value = parse_date(data.get("target_date"))
        if value is None:
            fields["target_date"] = "期望完成日期无效"
        else:
            demand.target_date = value
    if (
        ("requested_at" in data or "target_date" in data)
        and demand.requested_at
        and demand.target_date
        and demand.target_date < demand.requested_at
    ):
        fields["target_date"] = "期望完成日期不能早于提需求日期"
    if "headcount" in data:
        value = _positive_int(data.get("headcount"))
        if value is None:
            fields["headcount"] = "HC 必须是大于 0 的整数"
        else:
            demand.headcount = value
    if "jd_text" in data:
        jd_text = str(data.get("jd_text") or "").strip()
        if not jd_text:
            fields["jd_text"] = "完整 JD 不能为空"
        else:
            demand.jd_text_snapshot = jd_text
    if "note" in data:
        demand.note = clean_text(data.get("note"), 2000)
    return fields


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
    base = (
        PipelineStage.query.join(
            Candidate,
            Candidate.id == PipelineStage.candidate_id,
        ).filter(
            PipelineStage.org_id == demand.org_id,
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
            scope,
        )
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

    headcount_state = build_headcount_state(
        demand,
        onboarded_count=current_counts.get("onboarded", 0),
    )
    return {
        "recommended_count": recommended_count,
        "business_review_count": current_counts.get("business_review", 0),
        "interview_count": current_counts.get("interview", 0),
        "offer_count": current_counts.get("offer", 0),
        "transferred_count": current_counts.get("transferred", 0),
        "current_stage_counts": current_counts,
        **headcount_state,
    }


def risk_flags(demand, metrics, config=None):
    if config is None:
        from .kpi_standard_service import get_effective_kpi_config

        config = get_effective_kpi_config(demand.org_id)
    thresholds = config["risk_thresholds"]
    flags = []
    today = date.today()
    if demand.target_date and demand.target_date < today and demand.status in OPEN_STATUSES:
        flags.append("overdue")
    if metrics["business_review_count"] > 0:
        flags.append("business_feedback_pending")
    if metrics["recommended_count"] >= thresholds["low_interview_candidate_threshold"]:
        historical_interviews = (
            PipelineStage.query.join(
                Candidate,
                Candidate.id == PipelineStage.candidate_id,
            ).filter(
                PipelineStage.org_id == demand.org_id,
                Candidate.org_id == demand.org_id,
                Candidate.deleted_at.is_(None),
                _stage_scope_condition(demand),
                PipelineStage.stage.in_(INTERVIEW_PROGRESS_STAGES),
            )
            .with_entities(func.count(func.distinct(PipelineStage.candidate_id)))
            .scalar()
            or 0
        )
        if historical_interviews == 0:
            flags.append("low_interview_conversion")
    if demand.requested_at and demand.status in OPEN_STATUSES:
        age_days = (today - demand.requested_at).days
        if age_days >= thresholds["open_too_long_days"]:
            flags.append("open_too_long")
    if metrics["recommended_count"] == 0 and demand.status in OPEN_STATUSES:
        start_date = demand.accepted_at or demand.requested_at
        if start_date and (
            today - start_date
        ).days >= thresholds["no_recommendation_days"]:
            flags.append("hr_no_recommendation")
    return flags


def demand_payload(demand, *, include_jd=False, config=None):
    from .kpi_standard_service import get_effective_kpi_config

    if config is None:
        config = get_effective_kpi_config(demand.org_id)
    job = demand.job
    owner = db.session.get(User, demand.owner_hr_id) if demand.owner_hr_id else None
    default_interviewer = None
    if demand.default_interviewer_id:
        default_interviewer = User.query.filter_by(
            id=demand.default_interviewer_id,
            org_id=demand.org_id,
        ).first()
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
        "default_interviewer_id": (
            default_interviewer.id if default_interviewer else None
        ),
        "default_interviewer_name": (
            default_interviewer.name if default_interviewer else None
        ),
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
        "approval_status": demand.approval_status or "approved",
        "submitted_at": (
            demand.submitted_at.isoformat() if demand.submitted_at else None
        ),
        "reviewed_by": demand.reviewed_by,
        "reviewed_at": demand.reviewed_at.isoformat() if demand.reviewed_at else None,
        "review_reason": demand.review_reason or "",
        "created_by": demand.created_by,
        "close_reason": demand.close_reason or "",
        "downgrade_reason": demand.downgrade_reason or "",
        "note": demand.note or "",
        "metrics": metrics,
        "completion_suggested": (
            metrics["onboarded_count"] >= max(1, int(demand.headcount or 1))
        ),
        "risk_flags": risk_flags(
            demand,
            metrics,
            config=config,
        ),
        "created_at": demand.created_at.isoformat() if demand.created_at else None,
        "updated_at": demand.updated_at.isoformat() if demand.updated_at else None,
    }
    if include_jd:
        payload["jd_text"] = demand.jd_text_snapshot or (job.jd_text if job else "")
    return payload


def _list_stage_scope_condition(stage):
    sibling = aliased(RecruitmentDemand)
    sibling_exists = (
        db.session.query(sibling.id)
        .filter(
            sibling.org_id == RecruitmentDemand.org_id,
            sibling.id != RecruitmentDemand.id,
            sibling.job_id == RecruitmentDemand.job_id,
        )
        .correlate(RecruitmentDemand)
        .exists()
    )
    return or_(
        stage.demand_id == RecruitmentDemand.id,
        and_(
            stage.demand_id.is_(None),
            stage.job_id == RecruitmentDemand.job_id,
            ~sibling_exists,
        ),
    )


def _latest_list_stage_query():
    stage = aliased(PipelineStage)
    latest_stage = aliased(PipelineStage)
    candidate = aliased(Candidate)
    latest_id = (
        db.session.query(func.max(latest_stage.id))
        .filter(
            latest_stage.org_id == RecruitmentDemand.org_id,
            latest_stage.candidate_id == stage.candidate_id,
            _list_stage_scope_condition(latest_stage),
        )
        .correlate(RecruitmentDemand, stage)
        .scalar_subquery()
    )
    query = (
        db.session.query(stage.id)
        .select_from(stage)
        .join(candidate, candidate.id == stage.candidate_id)
        .filter(
            stage.org_id == RecruitmentDemand.org_id,
            candidate.org_id == RecruitmentDemand.org_id,
            candidate.deleted_at.is_(None),
            _list_stage_scope_condition(stage),
            stage.id == latest_id,
        )
        .correlate(RecruitmentDemand)
    )
    return query, stage


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

    job_title = clean_text(args.get("job_title"), 200)
    if job_title:
        query = query.outerjoin(
            Job,
            and_(
                Job.id == RecruitmentDemand.job_id,
                Job.org_id == RecruitmentDemand.org_id,
            ),
        ).filter(
            func.coalesce(
                func.nullif(RecruitmentDemand.job_title_snapshot, ""),
                Job.title,
            )
            == job_title
        )

    request_no = clean_text(args.get("request_no"), 80)
    if request_no:
        query = query.filter(RecruitmentDemand.request_no == request_no)

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

    target_date = parse_date(args.get("target_date"))
    if target_date:
        query = query.filter(RecruitmentDemand.target_date == target_date)

    pipeline_stage = clean_text(args.get("pipeline_stage"), 50).lower()
    if pipeline_stage and pipeline_stage != "all":
        latest_stage_query, latest_stage = _latest_list_stage_query()
        if pipeline_stage != "any":
            if pipeline_stage in INTERVIEW_PROGRESS_STAGES - OFFER_STAGES:
                latest_stage_query = latest_stage_query.filter(
                    latest_stage.stage.in_(INTERVIEW_PROGRESS_STAGES - OFFER_STAGES)
                )
            else:
                latest_stage_query = latest_stage_query.filter(
                    latest_stage.stage == pipeline_stage
                )
        query = query.filter(latest_stage_query.exists())

    hc_status = clean_text(args.get("hc_status"), 20).lower()
    if hc_status in {"complete", "incomplete"}:
        latest_stage_query, latest_stage = _latest_list_stage_query()
        onboarded_count = (
            latest_stage_query.filter(latest_stage.stage == "onboarded")
            .with_entities(func.count(latest_stage.id))
            .scalar_subquery()
        )
        target_headcount = case(
            (RecruitmentDemand.headcount > 0, RecruitmentDemand.headcount),
            else_=1,
        )
        if hc_status == "complete":
            query = query.filter(onboarded_count >= target_headcount)
        else:
            query = query.filter(onboarded_count < target_headcount)
    return query


def paginate_demands(query, args):
    from .kpi_standard_service import get_effective_kpi_config

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
    config = get_effective_kpi_config(items[0].org_id) if items else None
    return {
        "items": [demand_payload(item, config=config) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if total else 0,
    }
