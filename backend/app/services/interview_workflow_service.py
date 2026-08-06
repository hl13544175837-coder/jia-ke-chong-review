"""Demand-scoped interview context and round-task rules."""

from dataclasses import dataclass
from datetime import timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .. import db
from ..middleware.events import record_event
from ..models import (
    Candidate,
    CandidateDemandFlow,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    Notification,
    PipelineStage,
    RecruitmentDemand,
)
from ..time_utils import utc_now
from .demand_context_service import (
    DemandContextError,
    can_manage_demand,
    can_read_demand,
    resolve_demand_context,
)
from .pipeline_service import can_enter_interview


CANCELLED_ASSIGNMENT_STATUSES = {"cancelled", "canceled"}
INTERVIEW_SLOT_DURATION = timedelta(hours=1)
SATISFACTION_VALUES = {"satisfied", "pending", "unsatisfied"}
JOB_MATCH_VALUES = {"high", "medium", "low"}
RECOMMENDATION_VALUES = {"next_round", "offer", "hold", "reject"}
STRUCTURED_FEEDBACK_FIELDS = {
    "job_match",
    "recommendation",
    "strengths",
    "concerns",
}


class FeedbackValidationError(Exception):
    def __init__(self, fields):
        super().__init__("请检查面试评价")
        self.fields = fields

    def as_payload(self):
        return {
            "error": "请检查面试评价",
            "code": "validation_error",
            "fields": self.fields,
        }


class InterviewFeedbackEditError(Exception):
    def __init__(self, message, *, code, status_code):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code

    def as_payload(self):
        return {"error": self.message, "code": self.code}


class InterviewAssignmentWorkflowError(Exception):
    def __init__(self, message, *, code, status_code=409, details=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


def normalize_simple_feedback(data):
    satisfaction = str(data.get("satisfaction") or "").strip()
    job_match = str(data.get("job_match") or "").strip()
    recommendation = str(data.get("recommendation") or "").strip()
    strengths = str(data.get("strengths") or "").strip()
    concerns = str(data.get("concerns") or "").strip()
    note = str(data.get("note") or "").strip()
    fields = {}
    if satisfaction not in SATISFACTION_VALUES:
        fields["satisfaction"] = "请选择满意、待定或不满意"
    structured = any(key in data for key in STRUCTURED_FEEDBACK_FIELDS)
    if structured:
        if job_match not in JOB_MATCH_VALUES:
            fields["job_match"] = "请选择岗位匹配程度"
        if recommendation not in RECOMMENDATION_VALUES:
            fields["recommendation"] = "请选择建议结论"
        if satisfaction == "satisfied" and not strengths:
            fields["strengths"] = "满意时请填写候选人优势"
        if satisfaction == "unsatisfied" and not concerns:
            fields["concerns"] = "不满意时请填写主要顾虑"
        if satisfaction == "pending" and not note:
            fields["note"] = "待定时请填写需要继续确认的内容"
    for key, value, label in (
        ("strengths", strengths, "优势"),
        ("concerns", concerns, "顾虑"),
        ("note", note, "补充备注"),
    ):
        if len(value) > 1000:
            fields[key] = f"{label}不能超过 1000 字"
    if fields:
        raise FeedbackValidationError(fields)
    return {
        "satisfaction": satisfaction,
        "job_match": job_match,
        "recommendation": recommendation,
        "strengths": strengths,
        "concerns": concerns,
        "note": note,
    }


def feedback_satisfaction(feedback):
    evaluation = feedback.evaluation_json
    if not isinstance(evaluation, dict):
        return None
    satisfaction = evaluation.get("satisfaction")
    return satisfaction if satisfaction in SATISFACTION_VALUES else None


def update_interview_feedback(*, org_id, feedback_id, actor_id, actor_role, data):
    """Lock and update only the editable simple-feedback fields."""

    normalized = normalize_simple_feedback(data)
    structured = any(key in data for key in STRUCTURED_FEEDBACK_FIELDS)
    feedback = db.session.execute(
        select(InterviewFeedback)
        .where(
            InterviewFeedback.id == feedback_id,
            InterviewFeedback.org_id == org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if feedback is None:
        db.session.rollback()
        raise InterviewFeedbackEditError(
            "面试反馈不存在",
            code="feedback_not_found",
            status_code=404,
        )
    can_edit = actor_role in {"manager", "admin"} or (
        actor_role == "interviewer" and feedback.interviewer_id == actor_id
    )
    if not can_edit:
        db.session.rollback()
        raise InterviewFeedbackEditError(
            "Forbidden",
            code="forbidden",
            status_code=403,
        )

    evaluation = (
        dict(feedback.evaluation_json)
        if isinstance(feedback.evaluation_json, dict)
        else {}
    )
    before = {
        "satisfaction": feedback_satisfaction(feedback),
        "job_match": str(evaluation.get("job_match") or ""),
        "recommendation": str(evaluation.get("recommendation") or ""),
        "strengths": feedback.strengths or "",
        "concerns": feedback.concerns or "",
        "note": feedback.note or "",
    }
    evaluation["satisfaction"] = normalized["satisfaction"]
    if structured:
        evaluation["job_match"] = normalized["job_match"]
        evaluation["recommendation"] = normalized["recommendation"]
        feedback.strengths = normalized["strengths"]
        feedback.concerns = normalized["concerns"]
    feedback.evaluation_json = evaluation
    feedback.note = normalized["note"]
    feedback.updated_by = actor_id
    feedback.updated_at = utc_now()
    after = {
        "satisfaction": feedback_satisfaction(feedback),
        "job_match": str(evaluation.get("job_match") or ""),
        "recommendation": str(evaluation.get("recommendation") or ""),
        "strengths": feedback.strengths or "",
        "concerns": feedback.concerns or "",
        "note": feedback.note or "",
    }

    try:
        record_event(
            "interview.feedback_updated",
            entity_id=feedback.id,
            entity_type="interview_feedback",
            demand_id=feedback.demand_id,
            payload={
                "assignment_id": feedback.assignment_id,
                "candidate_id": feedback.candidate_id,
                "before": before,
                "after": after,
            },
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return feedback


def normalize_assignment_status(status):
    return str(status or "scheduled").strip().lower()


def assignment_is_cancelled(status):
    return normalize_assignment_status(status) in CANCELLED_ASSIGNMENT_STATUSES


def active_assignment_filter():
    normalized = func.lower(
        func.trim(func.coalesce(InterviewAssignment.status, "scheduled"))
    )
    return ~normalized.in_(tuple(CANCELLED_ASSIGNMENT_STATUSES))


def normalize_assignment_datetime(value):
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def ensure_interview_time_is_future(scheduled_at):
    normalized = normalize_assignment_datetime(scheduled_at)
    if normalized is not None and normalized <= utc_now():
        raise InterviewAssignmentWorkflowError(
            "面试时间必须晚于当前时间",
            code="interview_time_in_past",
            status_code=400,
        )
    return normalized


def ensure_interview_has_started(assignment):
    scheduled_at = normalize_assignment_datetime(assignment.scheduled_at)
    if scheduled_at is not None and scheduled_at > utc_now():
        raise InterviewAssignmentWorkflowError(
            "面试尚未开始，暂时不能确认或评价",
            code="interview_not_started",
        )


def interview_times_overlap(first, second):
    first_time = normalize_assignment_datetime(first)
    second_time = normalize_assignment_datetime(second)
    if first_time is None or second_time is None:
        return False
    return abs(first_time - second_time) < INTERVIEW_SLOT_DURATION


@dataclass
class InterviewContext:
    candidate: Candidate
    job: Job
    demand: RecruitmentDemand

    @property
    def demand_id(self):
        return self.demand.id


def resolve_interview_context(
    *,
    org_id,
    candidate_id,
    demand_id=None,
    job_id=None,
    open_only=False,
    require_current=False,
    lock=False,
):
    if demand_id is not None:
        demand = resolve_demand_context(
            org_id=org_id,
            demand_id=demand_id,
            job_id=job_id,
            open_only=open_only,
            lock=lock,
        )
        job = demand.job
    elif job_id is not None:
        demand = resolve_demand_context(
            org_id=org_id,
            job_id=job_id,
            open_only=open_only,
            lock=lock,
        )
        job = demand.job
    else:
        raise DemandContextError("demand_id required", 400, "demand_id_required")

    if job is None or job.org_id != org_id:
        raise DemandContextError("职位模板不存在", 404, "job_not_found")

    candidate_statement = select(Candidate).where(Candidate.id == candidate_id)
    if lock:
        candidate_statement = candidate_statement.with_for_update()
    candidate = db.session.execute(candidate_statement).scalar_one_or_none()
    if (
        candidate is None
        or candidate.org_id != org_id
        or candidate.deleted_at is not None
    ):
        raise DemandContextError("候选人不存在", 404, "candidate_not_found")
    if require_current:
        flow_statement = select(CandidateDemandFlow).where(
            CandidateDemandFlow.org_id == org_id,
            CandidateDemandFlow.candidate_id == candidate.id,
            CandidateDemandFlow.demand_id == demand.id,
            CandidateDemandFlow.status == "active",
        )
        if lock:
            flow_statement = flow_statement.with_for_update()
        flow = db.session.execute(flow_statement).scalar_one_or_none()
        if candidate.current_demand_id != demand.id or flow is None:
            raise DemandContextError(
                "候选人当前不在该招聘需求流程中",
                409,
                "candidate_not_in_demand",
            )
    return InterviewContext(candidate=candidate, job=job, demand=demand)


def can_manage_interview_context(user_id, role, org_id, context):
    return can_manage_demand(user_id, role, org_id, context.demand)


def can_read_interview_context(user_id, role, org_id, context, round_name=None):
    if role in {"manager", "admin"}:
        return True
    if role == "recruiter":
        return can_read_demand(user_id, role, org_id, context.demand)
    if role != "interviewer":
        return False
    query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        candidate_id=context.candidate.id,
        interviewer_id=user_id,
    ).filter(active_assignment_filter())
    query = query.filter_by(demand_id=context.demand.id)
    if round_name:
        query = query.filter_by(round=round_name)
    return query.first() is not None


def active_primary_assignment(*, org_id, demand_id, candidate_id, round_sequence):
    return (
        InterviewAssignment.query.filter_by(
            org_id=org_id,
            demand_id=demand_id,
            candidate_id=candidate_id,
            round_sequence=round_sequence,
            is_primary=True,
        )
        .filter(active_assignment_filter())
        .first()
    )


def load_assignment_for_update(*, org_id, assignment_id):
    return db.session.execute(
        select(InterviewAssignment)
        .where(
            InterviewAssignment.id == assignment_id,
            InterviewAssignment.org_id == org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()


def create_interview_assignment(
    *,
    context,
    interviewer_id,
    round_name,
    round_sequence,
    is_primary,
    scheduled_at,
    location,
    note,
    created_by,
    commit=True,
):
    """Create or deduplicate an active assignment in one service transaction."""

    primary_slot = round_sequence if is_primary else None
    if primary_slot is not None:
        existing_primary = active_primary_assignment(
            org_id=context.demand.org_id,
            demand_id=context.demand_id,
            candidate_id=context.candidate.id,
            round_sequence=round_sequence,
        )
        if existing_primary and existing_primary.interviewer_id != interviewer_id:
            raise InterviewAssignmentWorkflowError(
                "该轮次已有主面试官，如需更换请先取消原任务",
                code="primary_interviewer_exists",
                details={"assignment_id": existing_primary.id},
            )

    existing = (
        InterviewAssignment.query.filter_by(
            org_id=context.demand.org_id,
            candidate_id=context.candidate.id,
            demand_id=context.demand_id,
            job_id=context.job.id,
            round=round_name,
            round_sequence=round_sequence,
            interviewer_id=interviewer_id,
        )
        .filter(active_assignment_filter())
        .all()
    )
    normalized_scheduled_at = ensure_interview_time_is_future(scheduled_at)
    for item in existing:
        if normalize_assignment_datetime(item.scheduled_at) == normalized_scheduled_at:
            return item, True

    if normalized_scheduled_at is not None:
        interviewer_assignments = (
            InterviewAssignment.query.filter_by(
                org_id=context.demand.org_id,
                interviewer_id=interviewer_id,
            )
            .filter(active_assignment_filter())
            .all()
        )
        for item in interviewer_assignments:
            if interview_times_overlap(item.scheduled_at, normalized_scheduled_at):
                raise InterviewAssignmentWorkflowError(
                    "面试官该时间已有面试安排，请改期或更换面试官",
                    code="interviewer_schedule_conflict",
                    details={"conflict_assignment_id": item.id},
                )

    latest_stage = (
        PipelineStage.query.filter_by(
            org_id=context.demand.org_id,
            candidate_id=context.candidate.id,
            demand_id=context.demand_id,
        )
        .order_by(PipelineStage.id.desc())
        .first()
    )
    if not can_enter_interview(latest_stage.stage if latest_stage else None):
        raise InterviewAssignmentWorkflowError(
            "候选人已进入后续流程，不能退回面试阶段",
            code="interview_stage_conflict",
            details={"current_stage": latest_stage.stage},
        )

    assignment = InterviewAssignment(
        org_id=context.demand.org_id,
        candidate_id=context.candidate.id,
        job_id=context.job.id,
        demand_id=context.demand_id,
        round=round_name,
        round_sequence=round_sequence,
        is_primary=is_primary,
        primary_slot=primary_slot,
        interviewer_id=interviewer_id,
        scheduled_at=scheduled_at,
        location=location[:240],
        note=note,
        status="scheduled",
        created_by=created_by,
    )
    db.session.add(assignment)
    if latest_stage is None or latest_stage.stage != "interview":
        db.session.add(
            PipelineStage(
                org_id=context.demand.org_id,
                candidate_id=context.candidate.id,
                job_id=context.job.id,
                demand_id=context.demand_id,
                stage="interview",
                updated_by=created_by,
                note="招聘专员已安排面试",
            )
        )
    schedule_label = (
        normalized_scheduled_at.strftime("%m-%d %H:%M")
        if normalized_scheduled_at is not None
        else "时间待确认"
    )
    location_label = location[:240] or "地点待确认"
    try:
        db.session.flush()
        db.session.add(Notification(
            org_id=context.demand.org_id,
            user_id=interviewer_id,
            demand_id=context.demand_id,
            type="interview_assignment",
            title="新的面试安排",
            body=(
                f"{context.candidate.name_masked or '候选人'} · "
                f"第 {round_sequence} 轮 · {schedule_label} · {location_label}"
                f"{' · 主面试官' if is_primary else ' · 辅助面试官'}"
            ),
            link=(
                f"/interviewer/interviews?demand={context.demand_id}"
                f"&candidate={context.candidate.id}"
                f"&assignment={assignment.id}"
            ),
        ))
        record_event(
            "interview.assigned",
            entity_id=assignment.candidate_id,
            entity_type="candidate",
            demand_id=context.demand_id,
            payload={
                "assignment_id": assignment.id,
                "job_id": assignment.job_id,
                "demand_id": context.demand_id,
                "round": assignment.round,
                "round_sequence": round_sequence,
                "is_primary": is_primary,
                "interviewer_id": interviewer_id,
            },
            commit=False,
        )
        if commit:
            db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if primary_slot is not None:
            existing_primary = active_primary_assignment(
                org_id=context.demand.org_id,
                demand_id=context.demand_id,
                candidate_id=context.candidate.id,
                round_sequence=round_sequence,
            )
            if existing_primary is not None:
                raise InterviewAssignmentWorkflowError(
                    "该轮次已有主面试官，如需更换请先取消原任务",
                    code="primary_interviewer_exists",
                    details={"assignment_id": existing_primary.id},
                )
        raise InterviewAssignmentWorkflowError(
            "面试任务写入冲突，请刷新后重试",
            code="interview_assignment_conflict",
        )
    except Exception:
        db.session.rollback()
        raise
    return assignment, False


def round_name_for_sequence(round_sequence):
    """按轮次序号生成轮次名：第 1-3 轮固定 round_N，之后统一归入 additional。

    与前端「安排下一轮」的命名保持一致（features/interviews/useRecruiterInterviewWorkbench）。
    """
    return f"round_{round_sequence}" if round_sequence <= 3 else "additional"


def auto_create_next_round(*, context, assignment, created_by):
    """主面试官评价推荐 next_round 后，自动创建下一轮主面试任务。

    - 独立事务执行：与反馈提交事务完全解耦，任何失败只回滚本次创建，
      不影响已提交的反馈结果，并保留原「待 HR 确认下一步」通知；
    - 下一轮已有活跃主面试任务时静默跳过，避免重复创建；
    - 创建成功会同步给需求 owner_hr 追加「已自动创建第 N+1 轮待安排」通知，
      并沿用 create_interview_assignment 的面试官「新的面试安排」通知。

    返回新建的 InterviewAssignment；跳过或失败返回 None（静默降级）。
    """
    from flask import current_app

    next_sequence = assignment.round_sequence + 1
    if active_primary_assignment(
        org_id=context.demand.org_id,
        demand_id=context.demand_id,
        candidate_id=context.candidate.id,
        round_sequence=next_sequence,
    ) is not None:
        return None
    try:
        next_assignment, _ = create_interview_assignment(
            context=context,
            interviewer_id=assignment.interviewer_id,
            round_name=round_name_for_sequence(next_sequence),
            round_sequence=next_sequence,
            is_primary=True,
            scheduled_at=None,
            location="",  # 待安排：地点由 HR 确认排期时填写
            note=f"由第 {assignment.round_sequence} 轮评价自动创建，待安排",
            created_by=created_by,
            commit=False,
        )
        owner_id = context.demand.owner_hr_id
        if owner_id:
            db.session.add(Notification(
                org_id=context.demand.org_id,
                user_id=owner_id,
                demand_id=context.demand_id,
                type="interview_feedback_ready",
                title=(
                    f"第 {assignment.round_sequence} 轮评价完成，"
                    f"已自动创建第 {next_sequence} 轮待安排"
                ),
                body=(
                    f"{context.candidate.name_masked or '候选人'}的第 "
                    f"{assignment.round_sequence} 轮主面试反馈已完成，已自动创建"
                    f"第 {next_sequence} 轮待安排，请尽快确认面试官和时间。"
                ),
                link=(
                    f"/interviews?demand={context.demand_id}"
                    f"&candidate={context.candidate.id}"
                    f"&assignment={next_assignment.id}"
                ),
            ))
        db.session.commit()
        return next_assignment
    except Exception as exc:  # noqa: BLE001 - 自动创建失败必须静默降级，不影响反馈提交结果
        db.session.rollback()
        current_app.logger.warning(
            "自动创建第 %s 轮主面试任务失败，已保留原「待 HR 确认下一步」通知: "
            "assignment_id=%s demand_id=%s error=%s",
            next_sequence,
            assignment.id,
            context.demand_id,
            exc,
        )
        return None


def cancel_interview_assignment(*, assignment, reason):
    """Cancel an unfinished assignment and atomically release its slot."""

    if assignment_is_cancelled(assignment.status):
        needs_repair = assignment.status != "cancelled" or assignment.primary_slot is not None
        if needs_repair:
            assignment.status = "cancelled"
            assignment.primary_slot = None
            record_event(
                "interview.assignment_cancelled",
                entity_id=assignment.candidate_id,
                entity_type="candidate",
                demand_id=assignment.demand_id,
                payload={
                    "assignment_id": assignment.id,
                    "job_id": assignment.job_id,
                    "round": assignment.round,
                    "reason": reason,
                    "repaired_legacy_state": True,
                },
                commit=False,
            )
            db.session.commit()
        else:
            db.session.rollback()
        return assignment, True

    has_feedback = InterviewFeedback.query.filter_by(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
    ).first() is not None
    if has_feedback or normalize_assignment_status(assignment.status) in {
        "completed",
        "feedback_submitted",
    }:
        db.session.rollback()
        raise InterviewAssignmentWorkflowError(
            "面试任务已有反馈，不能取消",
            code="assignment_already_completed",
        )

    assignment.status = "cancelled"
    assignment.primary_slot = None
    db.session.add(Notification(
        org_id=assignment.org_id,
        user_id=assignment.interviewer_id,
        demand_id=assignment.demand_id,
        type="interview_assignment_cancelled",
        title="面试任务已取消",
        body=reason[:500],
        link=(
            f"/interviewer/interviews?demand={assignment.demand_id}"
            f"&candidate={assignment.candidate_id}"
            f"&assignment={assignment.id}"
        ),
    ))
    record_event(
        "interview.assignment_cancelled",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={
            "assignment_id": assignment.id,
            "job_id": assignment.job_id,
            "round": assignment.round,
            "reason": reason,
        },
        commit=False,
    )
    db.session.commit()
    return assignment, False


def feedback_assignment(
    *,
    org_id,
    interviewer_id,
    assignment_id=None,
    candidate_id=None,
    demand_id=None,
    job_id=None,
    round_name=None,
    lock=False,
):
    if assignment_id:
        statement = select(InterviewAssignment).where(
            InterviewAssignment.id == assignment_id
        )
        if lock:
            statement = statement.with_for_update()
        assignment = db.session.execute(statement).scalar_one_or_none()
        if assignment is None or assignment.org_id != org_id:
            return None
        if assignment.interviewer_id != interviewer_id:
            return None
        if candidate_id and assignment.candidate_id != candidate_id:
            return None
        if demand_id and assignment.demand_id != demand_id:
            return None
        if job_id and assignment.job_id != job_id:
            return None
        if round_name and assignment.round != round_name:
            return None
        if assignment_is_cancelled(assignment.status):
            return None
        return assignment

    query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        interviewer_id=interviewer_id,
        candidate_id=candidate_id,
        round=round_name,
    )
    if demand_id is not None:
        query = query.filter_by(demand_id=demand_id)
    elif job_id is not None:
        query = query.filter_by(job_id=job_id)
    if lock:
        query = query.with_for_update()
    return (
        query.filter(active_assignment_filter())
        .order_by(InterviewAssignment.id.desc())
        .first()
    )
