"""Demand-scoped recruitment pipeline domain service.

New workflow facts are owned by ``RecruitmentDemand``. ``job_id`` is retained
as a compatibility projection and is always derived from the selected demand.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import db
from ..middleware.events import record_event
from ..models import (
    Candidate,
    CandidateDemandFlow,
    CandidateDisposition,
    Job,
    OfferEvent,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
    User,
    VALID_STAGES,
)
from ..time_utils import utc_now
from .headcount_service import build_headcount_state


STAGE_ORDER = ["pending", "ai_screen", "business_review", "interview", "offer", "onboarded"]
LEGACY_INTERVIEW_STAGES = {"interview_first", "interview_second", "interview_final"}
PIPELINE_STAGE_ORDER = STAGE_ORDER + ["rejected", "transferred"]
TERMINAL_STAGES = {"onboarded", "rejected", "transferred"}
BUSINESS_REVIEW_ENTRY_STAGES = frozenset({"pending", "ai_screen", "business_review"})
INTERVIEW_ENTRY_STAGES = frozenset({"pending", "ai_screen", "business_review", "interview"})
WRITABLE_DEMAND_STATUSES = {"pending", "active"}
OFFER_UNIQUE_CONSTRAINT = "uq_offer_records_org_demand_candidate"
SQLITE_OFFER_UNIQUE_COLUMNS = (
    "offer_records.org_id",
    "offer_records.demand_id",
    "offer_records.candidate_id",
)


@dataclass
class PipelineServiceError(Exception):
    message: str
    status_code: int
    code: str

    def as_payload(self):
        return {"error": self.message, "code": self.code}


def _is_offer_unique_violation(error):
    original = getattr(error, "orig", None)
    constraint_name = getattr(
        getattr(original, "diag", None),
        "constraint_name",
        None,
    )
    if constraint_name == OFFER_UNIQUE_CONSTRAINT:
        return True

    message = str(original or error).lower().replace("`", "").replace('"', "")
    if OFFER_UNIQUE_CONSTRAINT.lower() in message:
        return True
    return (
        "unique constraint failed" in message
        and all(column in message for column in SQLITE_OFFER_UNIQUE_COLUMNS)
    )


def normalize_pipeline_stage(stage):
    return "interview" if stage in LEGACY_INTERVIEW_STAGES else stage


def can_enter_business_review(stage):
    """Return whether a demand flow may enter or remain in business review."""

    return stage is None or normalize_pipeline_stage(stage) in BUSINESS_REVIEW_ENTRY_STAGES


def can_enter_interview(stage):
    """Return whether a demand flow may enter or remain in interview."""

    return stage is None or normalize_pipeline_stage(stage) in INTERVIEW_ENTRY_STAGES


def stage_sort_index(stage):
    normalized = normalize_pipeline_stage(stage)
    return STAGE_ORDER.index(normalized) if normalized in STAGE_ORDER else len(STAGE_ORDER)


def parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def latest_demand_stage_subquery(demand_id, org_id=None):
    query = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .filter(PipelineStage.demand_id == demand_id)
    )
    if org_id is not None:
        query = query.filter(PipelineStage.org_id == org_id)
    return query.group_by(PipelineStage.candidate_id).subquery()


def _locked_candidate(candidate_id, org_id):
    statement = (
        select(Candidate)
        .where(
            Candidate.id == candidate_id,
            Candidate.org_id == org_id,
            Candidate.deleted_at.is_(None),
        )
        .with_for_update()
    )
    return db.session.execute(statement).scalar_one_or_none()


def _locked_demand(demand_id, org_id):
    statement = (
        select(RecruitmentDemand)
        .where(
            RecruitmentDemand.id == demand_id,
            RecruitmentDemand.org_id == org_id,
        )
        .with_for_update()
    )
    return db.session.execute(statement).scalar_one_or_none()


def _locked_flow(candidate_id, demand_id, org_id):
    statement = (
        select(CandidateDemandFlow)
        .where(
            CandidateDemandFlow.org_id == org_id,
            CandidateDemandFlow.candidate_id == candidate_id,
            CandidateDemandFlow.demand_id == demand_id,
        )
        .with_for_update()
    )
    return db.session.execute(statement).scalar_one_or_none()


def _other_active_flow(candidate_id, demand_id, org_id):
    statement = (
        select(CandidateDemandFlow)
        .where(
            CandidateDemandFlow.org_id == org_id,
            CandidateDemandFlow.candidate_id == candidate_id,
            CandidateDemandFlow.status == "active",
            CandidateDemandFlow.demand_id != demand_id,
        )
        .with_for_update()
    )
    return db.session.execute(statement).scalars().first()


def _latest_stage(candidate_id, demand_id):
    return (
        PipelineStage.query.filter_by(candidate_id=candidate_id, demand_id=demand_id)
        .order_by(PipelineStage.id.desc())
        .first()
    )


def _require_demand(demand_id, org_id):
    demand = _locked_demand(demand_id, org_id)
    if demand is None:
        raise PipelineServiceError("需求不存在", 404, "demand_not_found")
    return demand


def _require_writable_demand(demand):
    if demand.status not in WRITABLE_DEMAND_STATUSES:
        raise PipelineServiceError("需求当前不可推进", 409, "demand_not_open")


def _require_candidate(candidate_id, org_id):
    candidate = _locked_candidate(candidate_id, org_id)
    if candidate is None:
        raise PipelineServiceError("候选人不存在", 404, "candidate_not_found")
    return candidate


def _completion_state(demand):
    latest = latest_demand_stage_subquery(demand.id, demand.org_id)
    onboarded_count = (
        db.session.query(func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
            PipelineStage.stage == "onboarded",
        )
        .scalar()
        or 0
    )
    state = build_headcount_state(demand, onboarded_count=onboarded_count)
    return {
        **state,
        "completion_suggested": onboarded_count >= state["headcount"],
        "demand_status": demand.status,
    }


def demand_completion_state(demand):
    """Return the shared HC state for callers that open a new candidate flow."""

    return _completion_state(demand)


def _require_recruiting_capacity(demand):
    if _completion_state(demand)["remaining_headcount"] <= 0:
        raise PipelineServiceError(
            "该需求 HC 已满，请先确认完成需求或调整 HC",
            409,
            "demand_headcount_reached",
        )


def _upsert_active_flow(candidate, demand, *, transfer_from_demand_id=None, transfer_reason=None):
    flow = _locked_flow(candidate.id, demand.id, demand.org_id)
    if flow is None:
        flow = CandidateDemandFlow(
            org_id=demand.org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
        )
        db.session.add(flow)
    elif flow.status != "active":
        flow.started_at = utc_now()
    flow.owner_hr_id = demand.owner_hr_id
    flow.status = "active"
    flow.ended_at = None
    if transfer_from_demand_id is not None:
        flow.transfer_from_demand_id = transfer_from_demand_id
    if transfer_reason is not None:
        flow.transfer_reason = transfer_reason
    candidate.current_demand_id = demand.id
    candidate.owner_hr_id = demand.owner_hr_id
    return flow


def _create_disposition(*, candidate, demand, actor_id, data):
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = [item.strip() for item in tags.split(",") if item.strip()]
    elif not isinstance(tags, list):
        tags = []
    disposition = CandidateDisposition(
        org_id=demand.org_id,
        candidate_id=candidate.id,
        demand_id=demand.id,
        job_id=demand.job_id,
        reason=str(data.get("reason") or "")[:240],
        enter_talent_pool=bool(data.get("enter_talent_pool", True)),
        next_contact_at=parse_date(data.get("next_contact_at")),
        tags=[str(item).strip()[:60] for item in tags if str(item).strip()][:12],
        note=str(data.get("note") or ""),
        created_by=actor_id,
    )
    db.session.add(disposition)
    return disposition


def _move_candidate_in_demand(
    *,
    candidate_id,
    demand_id,
    org_id,
    actor_id,
    to_stage,
    note=None,
    disposition_data=None,
):
    """在业务命令完成授权后写入规范化阶段，供受控流程复用。"""

    demand = _require_demand(demand_id, org_id)
    _require_writable_demand(demand)
    candidate = _require_candidate(candidate_id, org_id)
    previous = _latest_stage(candidate.id, demand.id)
    from_stage = normalize_pipeline_stage(previous.stage) if previous else None

    if to_stage == "pending" and (previous is None or from_stage in TERMINAL_STAGES):
        _require_recruiting_capacity(demand)

    if candidate.current_demand_id not in (None, demand.id):
        raise PipelineServiceError(
            "候选人已有其他进行中需求，请使用转需求操作",
            409,
            "candidate_active_demand_conflict",
        )
    if _other_active_flow(candidate.id, demand.id, org_id) is not None:
        raise PipelineServiceError(
            "候选人已有其他进行中需求，请使用转需求操作",
            409,
            "candidate_active_demand_conflict",
        )

    normalized_note = str(note or "")
    if (
        previous is not None
        and from_stage == to_stage
        and previous.updated_by == actor_id
        and (previous.note or "") == normalized_note
    ):
        return {
            "status": "ok",
            "stage": to_stage,
            "from": from_stage,
            "candidate_id": candidate.id,
            "name_masked": candidate.name_masked,
            "demand_id": demand.id,
            "job_id": demand.job_id,
            "deduplicated": True,
            **_completion_state(demand),
        }

    flow = _upsert_active_flow(candidate, demand)
    db.session.add(
        PipelineStage(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            job_id=demand.job_id,
            stage=to_stage,
            updated_by=actor_id,
            note=note,
        )
    )

    if to_stage == "onboarded":
        flow.status = "completed"
        flow.ended_at = utc_now()
        candidate.current_demand_id = None
    elif to_stage == "rejected":
        flow.status = "rejected"
        flow.ended_at = utc_now()
        candidate.current_demand_id = None
        if isinstance(disposition_data, dict):
            _create_disposition(
                candidate=candidate,
                demand=demand,
                actor_id=actor_id,
                data=disposition_data,
            )

    record_event(
        "pipeline.moved",
        entity_id=candidate.id,
        entity_type="candidate",
        demand_id=demand.id,
        payload={
            "demand_id": demand.id,
            "job_id": demand.job_id,
            "from": from_stage,
            "to": to_stage,
            "note": note,
        },
        commit=False,
    )
    if to_stage == "onboarded":
        record_event(
            "candidate.onboarded",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=demand.id,
            payload={"demand_id": demand.id, "job_id": demand.job_id},
            commit=False,
        )
    if to_stage == "rejected" and isinstance(disposition_data, dict):
        record_event(
            "candidate.disposition",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=demand.id,
            payload={
                "demand_id": demand.id,
                "job_id": demand.job_id,
                "reason": str(disposition_data.get("reason") or "")[:240],
            },
            commit=False,
        )
    return {
        "status": "ok",
        "stage": to_stage,
        "from": from_stage,
        "candidate_id": candidate.id,
        "name_masked": candidate.name_masked,
        "demand_id": demand.id,
        "job_id": demand.job_id,
        "deduplicated": False,
        **_completion_state(demand),
    }


def move_candidate(
    *,
    candidate_id,
    demand_id,
    org_id,
    actor_id,
    stage,
    note=None,
    disposition_data=None,
    commit=True,
):
    """Join or move one candidate inside exactly one current Demand.

    ``commit=False`` is reserved for callers that own a wider transaction. Such
    callers must commit or roll back the session themselves.
    """

    if stage not in VALID_STAGES:
        raise PipelineServiceError(
            f"Invalid stage. Valid: {sorted(PIPELINE_STAGE_ORDER)}",
            400,
            "invalid_stage",
        )
    to_stage = normalize_pipeline_stage(stage)
    if to_stage == "transferred":
        raise PipelineServiceError(
            "请使用转需求操作，不能直接设置已转出",
            400,
            "transfer_action_required",
        )
    if to_stage == "onboarded":
        raise PipelineServiceError(
            "确认入职必须通过已接受 Offer 的确认入职操作完成，请前往 Offer 管理处理",
            409,
            "offer_onboard_action_required",
        )

    try:
        result = _move_candidate_in_demand(
            candidate_id=candidate_id,
            demand_id=demand_id,
            org_id=org_id,
            actor_id=actor_id,
            to_stage=to_stage,
            note=note,
            disposition_data=disposition_data,
        )
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        return result
    except Exception:
        if commit:
            db.session.rollback()
        raise


def transfer_candidate(
    *,
    candidate_id,
    from_demand_id,
    to_demand_id,
    org_id,
    actor_id,
    reason,
    commit=True,
):
    """Atomically transfer a candidate between two Demand aggregates."""

    reason = str(reason or "").strip()
    if not reason:
        raise PipelineServiceError("转入其他招聘需求需要填写原因", 400, "transfer_reason_required")
    if from_demand_id == to_demand_id:
        raise PipelineServiceError("目标招聘需求不能和当前需求相同", 400, "same_demand")

    try:
        locked = []
        for demand_id in sorted((from_demand_id, to_demand_id)):
            locked.append(_require_demand(demand_id, org_id))
        by_id = {demand.id: demand for demand in locked}
        source = by_id[from_demand_id]
        target = by_id[to_demand_id]
        _require_writable_demand(target)
        _require_recruiting_capacity(target)
        candidate = _require_candidate(candidate_id, org_id)

        if candidate.current_demand_id != source.id:
            raise PipelineServiceError(
                "候选人当前进行中需求与转出来源不一致",
                409,
                "source_demand_mismatch",
            )
        source_flow = _locked_flow(candidate.id, source.id, org_id)
        if source_flow is None or source_flow.status != "active":
            raise PipelineServiceError(
                "候选人不在当前招聘需求流程中",
                409,
                "source_flow_not_active",
            )
        source_latest = _latest_stage(candidate.id, source.id)
        if source_latest is None:
            raise PipelineServiceError(
                "候选人不在当前招聘需求流程中",
                409,
                "source_flow_not_active",
            )
        from_stage = normalize_pipeline_stage(source_latest.stage)
        if from_stage in TERMINAL_STAGES:
            raise PipelineServiceError(
                "候选人当前流程已结束，无法转入其他招聘需求",
                409,
                "source_flow_terminal",
            )

        target_latest = _latest_stage(candidate.id, target.id)
        if target_latest is not None and normalize_pipeline_stage(target_latest.stage) not in TERMINAL_STAGES:
            raise PipelineServiceError(
                "候选人已在目标招聘需求流程中",
                409,
                "target_flow_active",
            )

        transfer_reason = reason[:240]
        source_title = source.job_title_snapshot or (source.job.title if source.job else f"需求 {source.id}")
        target_title = target.job_title_snapshot or (target.job.title if target.job else f"需求 {target.id}")
        db.session.add_all(
            [
                PipelineStage(
                    org_id=org_id,
                    candidate_id=candidate.id,
                    demand_id=source.id,
                    job_id=source.job_id,
                    stage="transferred",
                    updated_by=actor_id,
                    note=f"转入其他招聘需求：{target_title}；原因：{transfer_reason}",
                ),
                PipelineStage(
                    org_id=org_id,
                    candidate_id=candidate.id,
                    demand_id=target.id,
                    job_id=target.job_id,
                    stage="pending",
                    updated_by=actor_id,
                    note=f"从 {source_title} 转入；原因：{transfer_reason}",
                ),
            ]
        )
        source_flow.status = "transferred"
        source_flow.ended_at = utc_now()
        _upsert_active_flow(
            candidate,
            target,
            transfer_from_demand_id=source.id,
            transfer_reason=transfer_reason,
        )
        result = {
            "status": "ok",
            "candidate_id": candidate.id,
            "name_masked": candidate.name_masked,
            "from_demand_id": source.id,
            "to_demand_id": target.id,
            "from_job_id": source.job_id,
            "to_job_id": target.job_id,
            "from_stage": from_stage,
            "source_terminal_stage": "transferred",
            "to_stage": "pending",
        }
        record_event(
            "pipeline.transferred",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=target.id,
            payload={**result, "reason": transfer_reason},
            commit=False,
        )
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        return result
    except Exception:
        if commit:
            db.session.rollback()
        raise


def pipeline_counts(demand, *, candidate_ids=None):
    latest = latest_demand_stage_subquery(demand.id, demand.org_id)
    rows = (
        db.session.query(PipelineStage.stage, func.count(PipelineStage.id))
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
        )
    )
    if candidate_ids is not None:
        rows = rows.filter(Candidate.id.in_(candidate_ids))
    rows = rows.group_by(PipelineStage.stage).all()
    counts = {}
    for stage, count in rows:
        normalized = normalize_pipeline_stage(stage)
        counts[normalized] = counts.get(normalized, 0) + count
    return counts


def pipeline_board(demand, *, candidate_ids=None):
    latest = latest_demand_stage_subquery(demand.id, demand.org_id)
    rows = (
        db.session.query(PipelineStage, Candidate, User)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(
            Candidate.org_id == demand.org_id,
            Candidate.deleted_at.is_(None),
        )
    )
    if candidate_ids is not None:
        rows = rows.filter(Candidate.id.in_(candidate_ids))
    rows = rows.all()
    candidates = [
        {
            "candidate_id": stage.candidate_id,
            "name_masked": candidate.name_masked or f"候选人 {stage.candidate_id}",
            "stage": normalize_pipeline_stage(stage.stage),
            "note": stage.note,
            "updated_at": stage.ts.isoformat() if stage.ts else None,
            "updated_by_name": user.name if user else None,
        }
        for stage, candidate, user in rows
    ]
    candidates.sort(key=lambda item: item["updated_at"] or "", reverse=True)
    candidates.sort(key=lambda item: stage_sort_index(item["stage"]))
    return {
        "demand_id": demand.id,
        "job_id": demand.job_id,
        "job_title": demand.job_title_snapshot or (demand.job.title if demand.job else ""),
        "stage_order": PIPELINE_STAGE_ORDER,
        "candidates": candidates,
    }


def pipeline_history(demand, candidate_id):
    rows = (
        db.session.query(PipelineStage, User)
        .outerjoin(User, User.id == PipelineStage.updated_by)
        .filter(
            PipelineStage.org_id == demand.org_id,
            PipelineStage.demand_id == demand.id,
            PipelineStage.candidate_id == candidate_id,
        )
        .order_by(PipelineStage.id.asc())
        .all()
    )
    return {
        "demand_id": demand.id,
        "job_id": demand.job_id,
        "candidate_id": candidate_id,
        "timeline": [
            {
                "stage": normalize_pipeline_stage(stage.stage),
                "ts": stage.ts.isoformat() if stage.ts else None,
                "updated_by_name": user.name if user else None,
                "note": stage.note,
            }
            for stage, user in rows
        ],
    }


OFFER_STATUSES = {
    "draft",
    "pending",
    "approved",
    "sent",
    "accepted",
    "declined",
    "withdrawn",
    "expired",
    "onboarded",
}

OFFER_TRANSITIONS = {
    "submit": ({"draft"}, "pending"),
    "approve": ({"pending"}, "approved"),
    "reject": ({"pending"}, "declined"),
    "send": ({"approved"}, "sent"),
    "accept": ({"sent"}, "accepted"),
    "decline": ({"sent"}, "declined"),
    "withdraw": ({"pending", "approved", "sent", "accepted"}, "withdrawn"),
    "expire": ({"sent"}, "expired"),
    "onboard": ({"accepted"}, "onboarded"),
}

OFFER_NON_TRANSITION_ACTIONS = {
    "resend": {"sent"},
    "follow_up": {"sent", "accepted"},
}


def _iso(value):
    return value.isoformat() if value else None


def _offer_history_payload(offer):
    actor_ids = {item.actor_id for item in offer.history if item.actor_id}
    actors = {
        user.id: user.name
        for user in User.query.filter(User.id.in_(actor_ids)).all()
    } if actor_ids else {}
    return [
        {
            "id": item.id,
            "action": item.action,
            "from_status": item.from_status,
            "to_status": item.to_status,
            "actor_id": item.actor_id,
            "actor_name": actors.get(item.actor_id),
            "comment": item.comment or "",
            "detail": item.detail or {},
            "created_at": _iso(item.created_at),
        }
        for item in offer.history
    ]


def offer_payload(offer, *, demand, candidate_id, include_history=True):
    if offer is None:
        candidate = _require_candidate(candidate_id, demand.org_id)
        return {
            "candidate_id": candidate_id,
            "demand_id": demand.id,
            "job_id": demand.job_id,
            "candidate_name": candidate.name_masked or "候选人",
            "position": demand.job_title_snapshot or (demand.job.title if demand.job else ""),
            "department": demand.department or (demand.job.department if demand.job else ""),
            "request_no": demand.request_no,
            "salary_range": "",
            "onboard_date": None,
            "approval_status": "draft",
            "status": "draft",
            "note": "",
            "history": [],
        }
    candidate = Candidate.query.filter_by(
        id=offer.candidate_id,
        org_id=offer.org_id,
        deleted_at=None,
    ).first()
    job = db.session.get(Job, offer.job_id)
    creator = db.session.get(User, offer.created_by) if offer.created_by else None
    approver = db.session.get(User, offer.approver_id) if offer.approver_id else None
    status = offer.approval_status or "draft"
    return {
        "id": offer.id,
        "candidate_id": offer.candidate_id,
        "demand_id": offer.demand_id,
        "job_id": offer.job_id,
        "candidate_name": candidate.name_masked if candidate else "候选人",
        "position": demand.job_title_snapshot or (job.title if job else ""),
        "department": demand.department or (job.department if job else ""),
        "request_no": demand.request_no,
        "salary_range": offer.salary_range or "",
        "onboard_date": offer.onboard_date.isoformat() if offer.onboard_date else None,
        "approval_status": status,
        "status": status,
        "note": offer.note or "",
        "approver_id": offer.approver_id,
        "approver_name": approver.name if approver else None,
        "created_by": offer.created_by,
        "created_by_name": creator.name if creator else None,
        "submitted_at": _iso(offer.submitted_at),
        "approved_at": _iso(offer.approved_at),
        "sent_at": _iso(offer.sent_at),
        "responded_at": _iso(offer.responded_at),
        "withdrawn_at": _iso(offer.withdrawn_at),
        "expires_at": _iso(offer.expires_at),
        "onboarded_at": _iso(offer.onboarded_at),
        "rejection_reason": offer.rejection_reason or "",
        "candidate_reply": offer.candidate_reply,
        "salary_breakdown": offer.salary_breakdown or [],
        "version": offer.version or 1,
        "created_at": _iso(offer.created_at),
        "updated_at": _iso(offer.updated_at),
        "history": _offer_history_payload(offer) if include_history else [],
    }


def get_offer_record(demand, candidate_id):
    offer = (
        OfferRecord.query.filter_by(
            org_id=demand.org_id,
            candidate_id=candidate_id,
            demand_id=demand.id,
        )
        .order_by(OfferRecord.id.desc())
        .first()
    )
    return offer_payload(offer, demand=demand, candidate_id=candidate_id)


def get_offer_by_id(*, offer_id, org_id):
    offer = OfferRecord.query.filter_by(id=offer_id, org_id=org_id).first()
    if offer is None:
        raise PipelineServiceError("Offer 不存在", 404, "offer_not_found")
    demand = _require_demand(offer.demand_id, org_id)
    return offer, demand


def list_offer_records(*, org_id, user_id, role, search=None, statuses=None):
    base_query = OfferRecord.query.filter_by(org_id=org_id)
    unmapped_total = (
        base_query.filter(OfferRecord.demand_id.is_(None)).count()
        if role in {"manager", "admin"}
        else 0
    )
    query = base_query.filter(OfferRecord.demand_id.isnot(None))
    if role == "recruiter":
        query = query.join(
            RecruitmentDemand,
            RecruitmentDemand.id == OfferRecord.demand_id,
        ).filter(RecruitmentDemand.owner_hr_id == user_id)
    rows = query.order_by(OfferRecord.updated_at.desc(), OfferRecord.id.desc()).all()
    normalized_statuses = {
        str(item).strip()
        for item in (statuses or [])
        if str(item).strip() in OFFER_STATUSES
    }
    term = str(search or "").strip().lower()
    items = []
    for offer in rows:
        demand = _require_demand(offer.demand_id, org_id)
        payload = offer_payload(
            offer,
            demand=demand,
            candidate_id=offer.candidate_id,
            include_history=False,
        )
        if normalized_statuses and payload["status"] not in normalized_statuses:
            continue
        if term and term not in " ".join(
            str(payload.get(key) or "").lower()
            for key in ("candidate_name", "position", "department", "request_no")
        ):
            continue
        items.append(payload)
    return {
        "items": items,
        "total": len(items),
        "unmapped_total": unmapped_total,
    }


def _append_offer_event(
    offer,
    *,
    action,
    actor_id,
    from_status,
    to_status,
    comment="",
    detail=None,
):
    db.session.add(
        OfferEvent(
            org_id=offer.org_id,
            offer_id=offer.id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            actor_id=actor_id,
            comment=str(comment or ""),
            detail=detail or {},
        )
    )


def transition_offer(*, offer_id, org_id, actor_id, action, data, commit=True):
    action = str(action or "").strip().lower()
    try:
        statement = (
            select(OfferRecord)
            .where(OfferRecord.id == offer_id, OfferRecord.org_id == org_id)
            .with_for_update()
        )
        offer = db.session.execute(statement).scalar_one_or_none()
        if offer is None:
            raise PipelineServiceError("Offer 不存在", 404, "offer_not_found")
        demand = _require_demand(offer.demand_id, org_id)
        _require_writable_demand(demand)
        current_status = offer.approval_status or "draft"

        if action in OFFER_NON_TRANSITION_ACTIONS:
            if current_status not in OFFER_NON_TRANSITION_ACTIONS[action]:
                raise PipelineServiceError(
                    "当前状态不能执行该操作",
                    409,
                    "invalid_offer_transition",
                )
            _append_offer_event(
                offer,
                action=action,
                actor_id=actor_id,
                from_status=current_status,
                to_status=current_status,
                comment=data.get("comment"),
                detail={"channel": str(data.get("channel") or "email")[:40]},
            )
            record_event(
                f"offer.{action}",
                entity_id=offer.id,
                entity_type="offer",
                demand_id=demand.id,
                payload={"status": current_status, "candidate_id": offer.candidate_id},
                commit=False,
            )
            db.session.commit() if commit else db.session.flush()
            return offer_payload(offer, demand=demand, candidate_id=offer.candidate_id)

        transition = OFFER_TRANSITIONS.get(action)
        if transition is None:
            raise PipelineServiceError("未知 Offer 操作", 400, "invalid_offer_action")
        allowed_from, next_status = transition
        if current_status not in allowed_from:
            raise PipelineServiceError(
                "当前状态不能执行该操作",
                409,
                "invalid_offer_transition",
            )

        send_channel = str(data.get("channel") or "").strip()[:40]
        if action == "send" and not send_channel:
            raise PipelineServiceError(
                "请填写实际发送渠道",
                400,
                "offer_send_channel_required",
            )

        now = utc_now()
        if action == "accept":
            capacity = _completion_state(demand)
            if capacity["remaining_headcount"] <= 0:
                raise PipelineServiceError(
                    "该需求名额已被已接受 Offer 或已入职人员占满，请先释放名额或调整 HC",
                    409,
                    "demand_headcount_locked",
                )
        offer.approval_status = next_status
        comment = str(data.get("comment") or "")
        detail = {}
        if action == "submit":
            approver = (
                User.query.filter_by(org_id=org_id, role="manager", is_active=True)
                .order_by(User.id.asc())
                .first()
                or User.query.filter_by(org_id=org_id, role="admin", is_active=True)
                .order_by(User.id.asc())
                .first()
            )
            offer.approver_id = approver.id if approver else None
            offer.submitted_at = now
        elif action == "approve":
            offer.approver_id = actor_id
            offer.approved_at = now
        elif action == "reject":
            offer.approver_id = actor_id
            offer.responded_at = now
            offer.rejection_reason = comment or "审批未通过"
        elif action == "send":
            offer.sent_at = now
            offer.expires_at = parse_datetime(data.get("expires_at")) or now + timedelta(days=14)
            detail["channel"] = send_channel
        elif action in {"accept", "decline"}:
            offer.responded_at = now
            answer = "accepted" if action == "accept" else "declined"
            offer.candidate_reply = {
                "answer": answer,
                "note": comment,
                "replied_at": now.isoformat(),
            }
            if action == "decline":
                offer.rejection_reason = comment or "候选人拒绝"
        elif action == "withdraw":
            offer.withdrawn_at = now
            offer.rejection_reason = comment or "手动撤回"
        elif action == "expire":
            offer.expires_at = offer.expires_at or now
        elif action == "onboard":
            onboard_date = parse_date(data.get("onboard_date"))
            if onboard_date is None:
                raise PipelineServiceError("请填写实际入职日期", 400, "onboard_date_required")
            offer.onboard_date = onboard_date
            offer.onboarded_at = now
            _move_candidate_in_demand(
                candidate_id=offer.candidate_id,
                demand_id=demand.id,
                org_id=org_id,
                actor_id=actor_id,
                to_stage="onboarded",
                note=comment or f"Offer 入职：{onboard_date.isoformat()}",
            )
            detail["onboard_date"] = onboard_date.isoformat()

        _append_offer_event(
            offer,
            action={
                "submit": "submitted",
                "approve": "approved",
                "reject": "rejected",
                "send": "sent",
                "accept": "accepted",
                "decline": "declined",
                "withdraw": "withdrawn",
                "expire": "expired",
                "onboard": "onboarded",
            }[action],
            actor_id=actor_id,
            from_status=current_status,
            to_status=next_status,
            comment=comment,
            detail=detail,
        )
        audit_action = {
            "submit": "submitted",
            "approve": "approved",
            "reject": "rejected",
            "send": "sent",
            "accept": "accepted",
            "decline": "declined",
            "withdraw": "withdrawn",
            "expire": "expired",
            "onboard": "onboarded",
        }[action]
        record_event(
            f"offer.{audit_action}",
            entity_id=offer.id,
            entity_type="offer",
            demand_id=demand.id,
            payload={
                "from": current_status,
                "to": next_status,
                "candidate_id": offer.candidate_id,
            },
            commit=False,
        )
        db.session.commit() if commit else db.session.flush()
        return offer_payload(offer, demand=demand, candidate_id=offer.candidate_id)
    except Exception:
        if commit:
            db.session.rollback()
        raise


def join_candidate(*, candidate_id, demand_id, org_id, actor_id, note=None):
    return move_candidate(
        candidate_id=candidate_id,
        demand_id=demand_id,
        org_id=org_id,
        actor_id=actor_id,
        stage="pending",
        note=note,
    )


def save_offer_record(*, demand_id, candidate_id, org_id, actor_id, data, commit=True):
    try:
        demand = _require_demand(demand_id, org_id)
        _require_writable_demand(demand)
        candidate = _require_candidate(candidate_id, org_id)
        if _latest_stage(candidate.id, demand.id) is None:
            raise PipelineServiceError(
                "候选人不在该招聘需求流程中",
                409,
                "candidate_not_in_demand",
            )
        statement = (
            select(OfferRecord)
            .where(
                OfferRecord.org_id == org_id,
                OfferRecord.candidate_id == candidate.id,
                OfferRecord.demand_id == demand.id,
            )
            .order_by(OfferRecord.id.desc())
            .limit(1)
            .with_for_update()
        )
        offer = db.session.execute(statement).scalar_one_or_none()
        is_new = offer is None
        if is_new:
            offer = OfferRecord(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=demand.job_id,
                created_by=actor_id,
            )
            db.session.add(offer)
            db.session.flush()
        elif (offer.approval_status or "draft") != "draft":
            raise PipelineServiceError(
                "Offer 已提交审批，不能直接修改",
                409,
                "offer_not_editable",
            )
        offer.job_id = demand.job_id
        offer.salary_range = str(data.get("salary_range") or "")[:120]
        offer.onboard_date = parse_date(data.get("onboard_date"))
        offer.approval_status = "draft"
        offer.note = str(data.get("note") or "")
        salary_breakdown = data.get("salary_breakdown")
        if isinstance(salary_breakdown, list):
            offer.salary_breakdown = salary_breakdown[:20]
        offer.version = 1 if is_new else max(int(offer.version or 0), 0) + 1
        _append_offer_event(
            offer,
            action="saved",
            actor_id=actor_id,
            from_status="draft",
            to_status="draft",
            comment=offer.note,
            detail={"version": offer.version},
        )
        record_event(
            "offer.saved",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=demand.id,
            payload={
                "demand_id": demand.id,
                "job_id": demand.job_id,
                "approval_status": offer.approval_status,
            },
            commit=False,
        )
        if commit:
            db.session.commit()
        else:
            db.session.flush()
        return offer_payload(offer, demand=demand, candidate_id=candidate.id)
    except IntegrityError as error:
        if commit:
            db.session.rollback()
            if _is_offer_unique_violation(error):
                existing = OfferRecord.query.filter_by(
                    org_id=org_id,
                    demand_id=demand_id,
                    candidate_id=candidate_id,
                ).first()
                if existing is not None:
                    raise PipelineServiceError(
                        "Offer 已被其他请求创建，请刷新后继续编辑",
                        409,
                        "offer_already_exists",
                    ) from error
        raise
    except Exception:
        if commit:
            db.session.rollback()
        raise
