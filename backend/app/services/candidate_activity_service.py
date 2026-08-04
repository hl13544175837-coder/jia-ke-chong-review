"""Build stable, demand-scoped candidate activity records for detail pages."""

from .. import db
from ..models import (
    InterviewAssignment,
    InterviewFeedback,
    InterviewRescheduleRequest,
    PipelineStage,
    User,
)


STAGE_LABELS = {
    "pending": "待处理",
    "ai_screen": "AI 筛选",
    "business_review": "候选人筛选",
    "interview": "面试",
    "interview_first": "一面",
    "interview_second": "二面",
    "interview_final": "终面",
    "offer": "Offer",
    "onboarded": "已入职",
    "rejected": "不合适",
    "transferred": "已转需求",
}


def _iso(value):
    return value.isoformat() if value is not None else None


def _reason(value):
    normalized = str(value or "").strip()
    return normalized or "未填写原因"


def _actor_name(user_names, user_id):
    return user_names.get(user_id) or "系统记录"


def _round_label(sequence):
    return f"第 {sequence or 1} 轮"


def build_candidate_activity(
    *,
    org_id,
    candidate_id,
    demand_id,
    visible_assignment_ids=None,
    include_pipeline=True,
):
    """Return newest-first activity without crossing role or demand boundaries."""

    assignment_query = InterviewAssignment.query.filter_by(
        org_id=org_id,
        candidate_id=candidate_id,
        demand_id=demand_id,
    )
    if visible_assignment_ids is not None:
        if not visible_assignment_ids:
            assignments = []
        else:
            assignments = assignment_query.filter(
                InterviewAssignment.id.in_(visible_assignment_ids)
            ).all()
    else:
        assignments = assignment_query.all()
    assignment_ids = {item.id for item in assignments}

    feedback_query = InterviewFeedback.query.filter_by(
        org_id=org_id,
        candidate_id=candidate_id,
        demand_id=demand_id,
    )
    if visible_assignment_ids is not None:
        feedback_rows = (
            feedback_query.filter(InterviewFeedback.assignment_id.in_(assignment_ids)).all()
            if assignment_ids
            else []
        )
    else:
        feedback_rows = feedback_query.all()

    reschedule_query = InterviewRescheduleRequest.query.filter_by(
        org_id=org_id,
        candidate_id=candidate_id,
        demand_id=demand_id,
    )
    if visible_assignment_ids is not None:
        reschedule_rows = (
            reschedule_query.filter(
                InterviewRescheduleRequest.assignment_id.in_(assignment_ids)
            ).all()
            if assignment_ids
            else []
        )
    else:
        reschedule_rows = reschedule_query.all()

    stage_rows = (
        PipelineStage.query.filter_by(
            org_id=org_id,
            candidate_id=candidate_id,
            demand_id=demand_id,
        ).all()
        if include_pipeline
        else []
    )

    user_ids = {
        value
        for value in [
            *(item.created_by for item in assignments),
            *(item.interviewer_id for item in feedback_rows),
            *(item.updated_by for item in feedback_rows),
            *(item.requested_by for item in reschedule_rows),
            *(item.processed_by for item in reschedule_rows),
            *(item.updated_by for item in stage_rows),
        ]
        if value
    }
    user_names = {
        user.id: user.name
        for user in User.query.filter(
            User.org_id == org_id,
            User.id.in_(user_ids),
        ).all()
    } if user_ids else {}

    activity = []

    def append(*, key, occurred_at, actor_id, action, title, detail, round_sequence=None, reason=None):
        activity.append({
            "id": key,
            "occurred_at": _iso(occurred_at),
            "actor_name": _actor_name(user_names, actor_id),
            "action": action,
            "title": title,
            "detail": detail,
            "round_sequence": round_sequence,
            "reason": _reason(reason),
        })

    for item in assignments:
        label = _round_label(item.round_sequence)
        schedule = _iso(item.scheduled_at) or "时间待确认"
        location = item.location or "地点待确认"
        append(
            key=f"assignment:{item.id}:scheduled",
            occurred_at=item.created_at,
            actor_id=item.created_by,
            action="interview_scheduled",
            title=f"安排{label}面试",
            detail=f"{schedule} · {location}",
            round_sequence=item.round_sequence,
            reason=item.note,
        )

    for item in feedback_rows:
        assignment = next(
            (row for row in assignments if row.id == item.assignment_id), None
        )
        sequence = assignment.round_sequence if assignment else None
        result = "通过" if item.passed is True else "未通过" if item.passed is False else "已评价"
        append(
            key=f"feedback:{item.id}:submitted",
            occurred_at=item.created_at,
            actor_id=item.interviewer_id,
            action="feedback_submitted",
            title=f"提交{_round_label(sequence)}面试评价",
            detail=f"评价结果：{result}",
            round_sequence=sequence,
            reason=item.note,
        )
        if item.updated_by:
            append(
                key=f"feedback:{item.id}:updated",
                occurred_at=item.updated_at,
                actor_id=item.updated_by,
                action="feedback_updated",
                title=f"修改{_round_label(sequence)}面试评价",
                detail=f"评价结果：{result}",
                round_sequence=sequence,
                reason=item.note,
            )

    for item in reschedule_rows:
        label = _round_label(item.round_sequence)
        append(
            key=f"reschedule:{item.id}:requested",
            occurred_at=item.requested_at,
            actor_id=item.requested_by,
            action="reschedule_requested",
            title=f"申请调整{label}面试",
            detail="已提交新的面试时间建议",
            round_sequence=item.round_sequence,
            reason=item.reason,
        )
        if item.processed_at:
            status_label = {
                "approved": "同意改约",
                "rejected": "不同意改约",
                "waiting_reassignment": "取消并等待重新安排",
                "resolved": "已重新安排",
            }.get(item.status, "处理改约申请")
            append(
                key=f"reschedule:{item.id}:processed",
                occurred_at=item.processed_at,
                actor_id=item.processed_by,
                action="reschedule_confirmed",
                title=f"{status_label}（{label}）",
                detail="面试安排已更新" if item.status in {"approved", "resolved"} else "原安排状态已记录",
                round_sequence=item.round_sequence,
                reason=item.processor_note,
            )

    for item in stage_rows:
        stage_label = STAGE_LABELS.get(item.stage, item.stage or "未知阶段")
        append(
            key=f"stage:{item.id}:changed",
            occurred_at=item.ts,
            actor_id=item.updated_by,
            action="stage_changed",
            title=f"候选人阶段变更为{stage_label}",
            detail=f"当前阶段：{stage_label}",
            reason=item.note,
        )

    activity.sort(
        key=lambda item: (item["occurred_at"] or "", item["id"]),
        reverse=True,
    )
    return activity
