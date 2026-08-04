"""Offer lifecycle service; candidate stage transitions remain in pipeline_service."""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import db
from ..models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    OfferEvent,
    OfferRecord,
    PipelineStage,
    RecruitmentDemand,
    UploadBatch,
    User,
)
from ..time_utils import utc_now
from . import pipeline_service
from .pipeline_service import (
    PipelineServiceError,
    _completion_state,
    _is_offer_unique_violation,
    _latest_stage,
    _move_candidate_in_demand,
    _require_candidate,
    _require_demand,
    _require_writable_demand,
    parse_date,
    parse_datetime,
)


def record_event(*args, **kwargs):
    """Keep the existing audit failure injection point after the service split."""

    return pipeline_service.record_event(*args, **kwargs)

OFFER_STATUSES = {
    "draft",
    "pending",
    "approved",
    "rejected",
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
    "reject": ({"pending"}, "rejected"),
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

OA_STATUSES = {"not_started", "pending", "approved", "rejected", "completed"}


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
            "id": None,
            "candidate_id": candidate_id,
            "demand_id": demand.id,
            "job_id": demand.job_id,
            "candidate_name": candidate.name_masked or "候选人",
            "position": demand.job_title_snapshot or (demand.job.title if demand.job else ""),
            "department": demand.department or (demand.job.department if demand.job else ""),
            "request_no": demand.request_no,
            "salary_range": "",
            "onboard_date": None,
            "source_channel": "未记录来源",
            "recruitment_days": None,
            "approval_status": "draft",
            "status": "draft",
            "note": "",
            "oa_instance_no": "",
            "oa_status": "not_started",
            "oa_note": "",
            "oa_updated_at": None,
            "history": [],
        }
    candidate = Candidate.query.filter_by(
        id=offer.candidate_id,
        org_id=offer.org_id,
        deleted_at=None,
    ).first()
    batch = db.session.get(UploadBatch, candidate.upload_batch_id) if candidate and candidate.upload_batch_id else None
    job = db.session.get(Job, offer.job_id)
    creator = db.session.get(User, offer.created_by) if offer.created_by else None
    approver = db.session.get(User, offer.approver_id) if offer.approver_id else None
    status = offer.approval_status or "draft"
    start_date = demand.accepted_at or demand.requested_at or (
        demand.created_at.date() if demand.created_at else None
    )
    actual_onboard_date = offer.onboard_date or (
        offer.onboarded_at.date() if offer.onboarded_at else None
    )
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
        "source_channel": ((batch.source_channel or "").strip() if batch else "") or "未记录来源",
        "recruitment_days": (
            max(0, (actual_onboard_date - start_date).days)
            if actual_onboard_date and start_date else None
        ),
        "approval_status": status,
        "status": status,
        "note": offer.note or "",
        "oa_instance_no": offer.oa_instance_no or "",
        "oa_status": offer.oa_status or "not_started",
        "oa_note": offer.oa_note or "",
        "oa_updated_at": _iso(offer.oa_updated_at),
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


def _completed_interview_rounds(*, org_id, candidate_id, demand_id):
    return (
        db.session.query(func.count(func.distinct(InterviewAssignment.round_sequence)))
        .join(
            InterviewFeedback,
            InterviewFeedback.assignment_id == InterviewAssignment.id,
        )
        .filter(
            InterviewAssignment.org_id == org_id,
            InterviewAssignment.candidate_id == candidate_id,
            InterviewAssignment.demand_id == demand_id,
            InterviewAssignment.is_primary.is_(True),
        )
        .scalar()
        or 0
    )


def list_offer_workbench(*, org_id, user_id, role, search=None):
    existing_query = OfferRecord.query.filter(
        OfferRecord.org_id == org_id,
        OfferRecord.demand_id.isnot(None),
    )
    if role == "recruiter":
        existing_query = existing_query.join(
            RecruitmentDemand,
            RecruitmentDemand.id == OfferRecord.demand_id,
        ).filter(RecruitmentDemand.owner_hr_id == user_id)
    existing = existing_query.order_by(
        OfferRecord.updated_at.desc(), OfferRecord.id.desc()
    ).all()
    items_by_key = {}
    for offer in existing:
        demand = _require_demand(offer.demand_id, org_id)
        payload = offer_payload(
            offer,
            demand=demand,
            candidate_id=offer.candidate_id,
            include_history=False,
        )
        payload["completed_interview_rounds"] = _completed_interview_rounds(
            org_id=org_id,
            candidate_id=offer.candidate_id,
            demand_id=offer.demand_id,
        )
        items_by_key[(offer.candidate_id, offer.demand_id)] = payload

    latest = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            PipelineStage.demand_id.label("demand_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .filter(
            PipelineStage.org_id == org_id,
            PipelineStage.demand_id.isnot(None),
        )
        .group_by(PipelineStage.candidate_id, PipelineStage.demand_id)
        .subquery()
    )
    stage_query = (
        db.session.query(PipelineStage, RecruitmentDemand, Candidate)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .join(RecruitmentDemand, RecruitmentDemand.id == PipelineStage.demand_id)
        .join(Candidate, Candidate.id == PipelineStage.candidate_id)
        .filter(
            PipelineStage.org_id == org_id,
            PipelineStage.stage.in_(("offer", "onboarded")),
            Candidate.org_id == org_id,
            Candidate.deleted_at.is_(None),
        )
    )
    if role == "recruiter":
        stage_query = stage_query.filter(RecruitmentDemand.owner_hr_id == user_id)
    for stage, demand, candidate in stage_query.all():
        key = (candidate.id, demand.id)
        if key in items_by_key:
            continue
        payload = offer_payload(
            None,
            demand=demand,
            candidate_id=candidate.id,
            include_history=False,
        )
        payload["created_at"] = _iso(stage.ts)
        payload["updated_at"] = _iso(stage.ts)
        payload["completed_interview_rounds"] = _completed_interview_rounds(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
        )
        items_by_key[key] = payload

    term = str(search or "").strip().lower()
    items = list(items_by_key.values())
    if term:
        items = [
            item for item in items
            if term in " ".join(
                str(item.get(key) or "").lower()
                for key in ("candidate_name", "position", "department", "request_no", "oa_instance_no")
            )
        ]
    items.sort(
        key=lambda item: (item.get("oa_updated_at") or item.get("updated_at") or "", item.get("id") or 0),
        reverse=True,
    )
    return {"items": items, "total": len(items), "unmapped_total": 0}


def register_oa_result(*, demand_id, candidate_id, org_id, actor_id, data):
    oa_status = str(data.get("oa_status") or "").strip()
    instance_no = str(data.get("oa_instance_no") or "").strip()
    note = str(data.get("note") or "").strip()
    if oa_status not in OA_STATUSES:
        raise PipelineServiceError("请选择正确的 OA 状态", 400, "oa_status_invalid")
    if not instance_no:
        raise PipelineServiceError("请填写 OA 编号", 400, "oa_instance_no_required")
    if len(instance_no) > 120:
        raise PipelineServiceError("OA 编号不能超过 120 个字符", 400, "oa_instance_no_too_long")
    if len(note) > 1000:
        raise PipelineServiceError("OA 备注不能超过 1000 个字符", 400, "oa_note_too_long")

    try:
        demand = _require_demand(demand_id, org_id)
        candidate = _require_candidate(candidate_id, org_id)
        latest_stage = _latest_stage(candidate.id, demand.id)
        if latest_stage is None or latest_stage.stage not in {"offer", "onboarded"}:
            raise PipelineServiceError(
                "候选人还没有进入 Offer 阶段",
                409,
                "candidate_not_in_offer_stage",
            )
        offer = db.session.execute(
            select(OfferRecord)
            .where(
                OfferRecord.org_id == org_id,
                OfferRecord.candidate_id == candidate.id,
                OfferRecord.demand_id == demand.id,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if offer is None:
            offer = OfferRecord(
                org_id=org_id,
                candidate_id=candidate.id,
                demand_id=demand.id,
                job_id=demand.job_id,
                approval_status="draft",
                created_by=actor_id,
            )
            db.session.add(offer)
            db.session.flush()
        previous_oa_status = offer.oa_status or "not_started"
        now = utc_now()
        offer.oa_instance_no = instance_no
        offer.oa_status = oa_status
        offer.oa_note = note
        offer.oa_updated_at = now
        _append_offer_event(
            offer,
            action="oa_registered",
            actor_id=actor_id,
            from_status=offer.approval_status or "draft",
            to_status=offer.approval_status or "draft",
            comment=note,
            detail={
                "from_oa_status": previous_oa_status,
                "to_oa_status": oa_status,
                "oa_instance_no": instance_no,
            },
        )
        record_event(
            "offer.oa_registered",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=demand.id,
            payload={
                "offer_id": offer.id,
                "oa_instance_no": instance_no,
                "from_oa_status": previous_oa_status,
                "to_oa_status": oa_status,
            },
            commit=False,
        )
        db.session.commit()
        payload = offer_payload(offer, demand=demand, candidate_id=candidate.id)
        payload["completed_interview_rounds"] = _completed_interview_rounds(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
        )
        return payload
    except Exception:
        db.session.rollback()
        raise


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
        elif (offer.approval_status or "draft") not in {"draft", "rejected"}:
            raise PipelineServiceError(
                "Offer 已提交审批，不能直接修改",
                409,
                "offer_not_editable",
            )
        previous_status = offer.approval_status or "draft"
        offer.job_id = demand.job_id
        offer.salary_range = str(data.get("salary_range") or "")[:120]
        offer.onboard_date = parse_date(data.get("onboard_date"))
        offer.approval_status = "draft"
        if previous_status == "rejected":
            offer.approver_id = None
            offer.rejection_reason = ""
        offer.note = str(data.get("note") or "")
        salary_breakdown = data.get("salary_breakdown")
        if isinstance(salary_breakdown, list):
            offer.salary_breakdown = salary_breakdown[:20]
        offer.version = 1 if is_new else max(int(offer.version or 0), 0) + 1
        _append_offer_event(
            offer,
            action="saved",
            actor_id=actor_id,
            from_status=previous_status,
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
