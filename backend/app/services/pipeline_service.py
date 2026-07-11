"""Demand-scoped recruitment pipeline domain service.

New workflow facts are owned by ``RecruitmentDemand``. ``job_id`` is retained
as a compatibility projection and is always derived from the selected demand.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select

from .. import db
from ..middleware.events import record_event
from ..models import (
    Candidate,
    CandidateDemandFlow,
    CandidateDisposition,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
    User,
    VALID_STAGES,
)
from ..time_utils import utc_now


STAGE_ORDER = ["pending", "ai_screen", "business_review", "interview", "offer", "onboarded"]
LEGACY_INTERVIEW_STAGES = {"interview_first", "interview_second", "interview_final"}
PIPELINE_STAGE_ORDER = STAGE_ORDER + ["rejected", "transferred"]
TERMINAL_STAGES = {"onboarded", "rejected", "transferred"}
WRITABLE_DEMAND_STATUSES = {"pending", "active"}


@dataclass
class PipelineServiceError(Exception):
    message: str
    status_code: int
    code: str

    def as_payload(self):
        return {"error": self.message, "code": self.code}


def normalize_pipeline_stage(stage):
    return "interview" if stage in LEGACY_INTERVIEW_STAGES else stage


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
    headcount = max(1, int(demand.headcount or 1))
    return {
        "onboarded_count": onboarded_count,
        "headcount": headcount,
        "completion_suggested": onboarded_count >= headcount,
        "demand_status": demand.status,
    }


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

    try:
        demand = _require_demand(demand_id, org_id)
        _require_writable_demand(demand)
        candidate = _require_candidate(candidate_id, org_id)
        previous = _latest_stage(candidate.id, demand.id)
        from_stage = normalize_pipeline_stage(previous.stage) if previous else None

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
        if commit:
            db.session.commit()
        else:
            db.session.flush()
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


def offer_payload(offer, *, demand, candidate_id):
    if offer is None:
        return {
            "candidate_id": candidate_id,
            "demand_id": demand.id,
            "job_id": demand.job_id,
            "salary_range": "",
            "onboard_date": None,
            "approval_status": "draft",
            "note": "",
        }
    return {
        "id": offer.id,
        "candidate_id": offer.candidate_id,
        "demand_id": offer.demand_id,
        "job_id": offer.job_id,
        "salary_range": offer.salary_range or "",
        "onboard_date": offer.onboard_date.isoformat() if offer.onboard_date else None,
        "approval_status": offer.approval_status or "draft",
        "note": offer.note or "",
        "updated_at": offer.updated_at.isoformat() if offer.updated_at else None,
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
        if offer is None:
            offer = OfferRecord(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=demand.job_id,
                created_by=actor_id,
            )
            db.session.add(offer)
        offer.job_id = demand.job_id
        offer.salary_range = str(data.get("salary_range") or "")[:120]
        offer.onboard_date = parse_date(data.get("onboard_date"))
        offer.approval_status = str(data.get("approval_status") or "draft")[:40]
        offer.note = str(data.get("note") or "")
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
    except Exception:
        if commit:
            db.session.rollback()
        raise
