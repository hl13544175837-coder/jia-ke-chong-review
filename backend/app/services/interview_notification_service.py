"""面试外部通知与一次性协同链接的唯一实现入口。"""

from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlsplit

import jwt
import requests
from flask import current_app
from sqlalchemy import select

from .. import db
from ..middleware.events import record_event
from ..models import (
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    InterviewNotificationDelivery,
    Job,
    RecruitmentDemand,
    User,
)
from ..time_utils import utc_now


ACCESS_SCOPE = "interview_assignment_access"
CANCELLED_STATUSES = {"cancelled", "canceled"}


class InterviewAccessError(Exception):
    def __init__(self, message, *, code, status_code=400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class InterviewAccessContext:
    assignment: InterviewAssignment
    interviewer: User


def _integer_claim(payload, name):
    value = payload.get(name)
    if isinstance(value, bool):
        raise InterviewAccessError("面试协同链接无效", code="invalid_access_token", status_code=401)
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise InterviewAccessError(
            "面试协同链接无效",
            code="invalid_access_token",
            status_code=401,
        ) from exc
    if parsed < 1:
        raise InterviewAccessError("面试协同链接无效", code="invalid_access_token", status_code=401)
    return parsed


def create_interview_access_token(assignment):
    expires_at = utc_now() + timedelta(
        hours=current_app.config["INTERVIEW_ACCESS_TOKEN_TTL_HOURS"]
    )
    return jwt.encode(
        {
            "scope": ACCESS_SCOPE,
            "assignment_id": assignment.id,
            "org_id": assignment.org_id,
            "interviewer_id": assignment.interviewer_id,
            "access_token_version": assignment.access_token_version or 0,
            "exp": expires_at,
        },
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )


def validate_interview_access_token(token, *, lock=False):
    if not isinstance(token, str) or not token.strip():
        raise InterviewAccessError("缺少面试协同链接", code="missing_access_token", status_code=401)
    try:
        payload = jwt.decode(
            token.strip(),
            current_app.config["JWT_SECRET"],
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError as exc:
        raise InterviewAccessError(
            "面试协同链接已过期，请联系 HR 重新发送",
            code="access_token_expired",
            status_code=401,
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise InterviewAccessError(
            "面试协同链接无效",
            code="invalid_access_token",
            status_code=401,
        ) from exc

    if payload.get("scope") != ACCESS_SCOPE:
        raise InterviewAccessError("面试协同链接无效", code="invalid_access_token", status_code=401)

    assignment_id = _integer_claim(payload, "assignment_id")
    org_id = _integer_claim(payload, "org_id")
    interviewer_id = _integer_claim(payload, "interviewer_id")
    statement = select(InterviewAssignment).where(
        InterviewAssignment.id == assignment_id,
        InterviewAssignment.org_id == org_id,
        InterviewAssignment.interviewer_id == interviewer_id,
    )
    if lock:
        statement = statement.with_for_update()
    assignment = db.session.execute(statement).scalar_one_or_none()
    if assignment is None:
        raise InterviewAccessError("面试任务不存在", code="assignment_not_found", status_code=404)

    try:
        token_version = int(payload.get("access_token_version", 0) or 0)
    except (TypeError, ValueError) as exc:
        raise InterviewAccessError(
            "面试协同链接无效",
            code="invalid_access_token",
            status_code=401,
        ) from exc
    if token_version != (assignment.access_token_version or 0):
        raise InterviewAccessError(
            "面试协同链接已失效，请联系 HR 重新发送",
            code="access_token_revoked",
            status_code=401,
        )
    if str(assignment.status or "scheduled").strip().lower() in CANCELLED_STATUSES:
        raise InterviewAccessError("面试任务已取消", code="assignment_cancelled", status_code=410)

    interviewer = db.session.get(User, interviewer_id)
    if (
        interviewer is None
        or interviewer.org_id != org_id
        or not interviewer.is_active
    ):
        raise InterviewAccessError("面试官账号不可用", code="interviewer_unavailable", status_code=410)
    return InterviewAccessContext(assignment=assignment, interviewer=interviewer)


def _public_app_base_url():
    value = str(current_app.config.get("PUBLIC_APP_BASE_URL") or "").strip().rstrip("/")
    if not value:
        raise InterviewAccessError(
            "未配置面试协同页面地址",
            code="public_app_base_url_missing",
            status_code=503,
        )
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise InterviewAccessError(
            "面试协同页面地址配置无效",
            code="public_app_base_url_invalid",
            status_code=503,
        )
    return value


def create_interview_access_url(assignment):
    token = create_interview_access_token(assignment)
    return f"{_public_app_base_url()}/interview-access#token={token}"


def ensure_interview_notification_delivery(assignment):
    delivery = assignment.notification_delivery
    if delivery is not None:
        return delivery
    delivery = InterviewNotificationDelivery(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
        recipient_user_id=assignment.interviewer_id,
        channel="wecom_webhook",
        status="pending",
    )
    db.session.add(delivery)
    db.session.flush()
    return delivery


def serialize_interview_notification_delivery(delivery):
    if delivery is None:
        return None
    return {
        "status": delivery.status,
        "channel": delivery.channel,
        "attempts": delivery.attempts or 0,
        "last_error": delivery.last_error,
        "response_code": delivery.response_code,
        "sent_at": delivery.sent_at.isoformat() if delivery.sent_at else None,
    }


def _notification_context(assignment):
    candidate = db.session.get(Candidate, assignment.candidate_id)
    job = db.session.get(Job, assignment.job_id)
    demand = db.session.get(RecruitmentDemand, assignment.demand_id)
    interviewer = db.session.get(User, assignment.interviewer_id)
    if candidate is None or job is None or demand is None or interviewer is None:
        raise InterviewAccessError(
            "面试通知缺少必要业务数据",
            code="notification_context_incomplete",
            status_code=409,
        )
    return candidate, job, demand, interviewer


def _generic_payload(assignment, access_url):
    candidate, job, demand, interviewer = _notification_context(assignment)
    return {
        "event": "interview.assignment.created",
        "idempotency_key": (
            f"interview-assignment-{assignment.id}-v{assignment.access_token_version or 0}"
        ),
        "recipient": {
            "user_id": interviewer.id,
            "name": interviewer.name,
            "email": interviewer.email,
        },
        "interview": {
            "assignment_id": assignment.id,
            "demand_request_no": demand.request_no,
            "job_title": job.title,
            "candidate_name": candidate.name_masked or "候选人",
            "round": assignment.round,
            "round_sequence": assignment.round_sequence or 1,
            "is_primary": bool(assignment.is_primary),
            "scheduled_at": (
                assignment.scheduled_at.isoformat() if assignment.scheduled_at else None
            ),
            "location": assignment.location or "",
            "note": assignment.note or "",
        },
        "access_url": access_url,
    }


def _plain_markdown(value):
    return (
        str(value or "")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("[", "【")
        .replace("]", "】")
        .replace("(", "（")
        .replace(")", "）")
    )


def _wecom_payload(assignment, access_url):
    candidate, job, demand, interviewer = _notification_context(assignment)
    scheduled = assignment.scheduled_at.isoformat(sep=" ", timespec="minutes") if assignment.scheduled_at else "待确认"
    content = "\n".join(
        (
            "## 新的面试任务",
            f"> 面试官：{_plain_markdown(interviewer.name)}",
            f"> 招聘需求：{_plain_markdown(demand.request_no)} · {_plain_markdown(job.title)}",
            f"> 候选人：{_plain_markdown(candidate.name_masked or '候选人')}",
            f"> 轮次：第 {assignment.round_sequence or 1} 轮",
            f"> 时间：{_plain_markdown(scheduled)}",
            f"> 地点/会议：{_plain_markdown(assignment.location or '待确认')}",
            f"[接单并填写反馈]({access_url})",
        )
    )
    return {"msgtype": "markdown", "markdown": {"content": content}}


def dispatch_interview_notification(assignment_id):
    assignment = db.session.get(InterviewAssignment, assignment_id)
    if assignment is None:
        raise InterviewAccessError("面试任务不存在", code="assignment_not_found", status_code=404)
    delivery = ensure_interview_notification_delivery(assignment)
    delivery.attempts = (delivery.attempts or 0) + 1
    delivery.response_code = None
    delivery.last_error = None

    webhook_url = str(
        current_app.config.get("INTERVIEW_NOTIFICATION_WEBHOOK_URL") or ""
    ).strip()
    if not webhook_url:
        delivery.status = "not_configured"
        delivery.last_error = "未配置企业微信通知地址"
        record_event(
            "interview.notification_skipped",
            entity_id=assignment.candidate_id,
            entity_type="candidate",
            demand_id=assignment.demand_id,
            payload={"assignment_id": assignment.id},
            source="system",
            commit=False,
        )
        db.session.commit()
        return delivery

    try:
        access_url = create_interview_access_url(assignment)
        mode = str(
            current_app.config.get("INTERVIEW_NOTIFICATION_WEBHOOK_MODE") or "generic"
        ).strip().lower()
        if mode == "wecom":
            payload = _wecom_payload(assignment, access_url)
        elif mode == "generic":
            payload = _generic_payload(assignment, access_url)
        else:
            raise InterviewAccessError(
                "企业微信通知模式配置无效",
                code="notification_mode_invalid",
                status_code=503,
            )
        response = requests.post(
            webhook_url,
            json=payload,
            headers={
                "Idempotency-Key": (
                    f"interview-assignment-{assignment.id}-v"
                    f"{assignment.access_token_version or 0}"
                )
            },
            timeout=current_app.config["INTERVIEW_NOTIFICATION_TIMEOUT_SECONDS"],
        )
        delivery.response_code = response.status_code
        response.raise_for_status()
        if mode == "wecom":
            response_payload = response.json()
            if (
                not isinstance(response_payload, dict)
                or response_payload.get("errcode") not in {None, 0}
            ):
                raise InterviewAccessError(
                    "企业微信拒绝了面试通知",
                    code="wecom_delivery_rejected",
                    status_code=502,
                )
    except (requests.RequestException, ValueError, InterviewAccessError) as exc:
        delivery.status = "failed"
        delivery.last_error = str(exc)[:240] or "面试通知发送失败"
        record_event(
            "interview.notification_failed",
            entity_id=assignment.candidate_id,
            entity_type="candidate",
            demand_id=assignment.demand_id,
            payload={"assignment_id": assignment.id, "attempt": delivery.attempts},
            result="failure",
            failure_reason=delivery.last_error,
            source="system",
            severity="warning",
            commit=False,
        )
        db.session.commit()
        return delivery

    delivery.status = "sent"
    delivery.sent_at = utc_now()
    record_event(
        "interview.notification_sent",
        entity_id=assignment.candidate_id,
        entity_type="candidate",
        demand_id=assignment.demand_id,
        payload={"assignment_id": assignment.id, "attempt": delivery.attempts},
        source="system",
        commit=False,
    )
    db.session.commit()
    return delivery


def interview_access_payload(context):
    assignment = context.assignment
    candidate, job, demand, _ = _notification_context(assignment)
    feedback = InterviewFeedback.query.filter_by(
        org_id=assignment.org_id,
        assignment_id=assignment.id,
    ).first()
    response_status = assignment.response_status or "pending"
    assignment_status = str(assignment.status or "scheduled").strip().lower()
    active = assignment_status not in CANCELLED_STATUSES | {"declined"}
    return {
        "assignment_id": assignment.id,
        "candidate_name": candidate.name_masked or "候选人",
        "job_title": job.title,
        "demand_request_no": demand.request_no,
        "round": assignment.round,
        "round_sequence": assignment.round_sequence or 1,
        "is_primary": bool(assignment.is_primary),
        "scheduled_at": assignment.scheduled_at.isoformat() if assignment.scheduled_at else None,
        "location": assignment.location or "",
        "note": assignment.note or "",
        "response_status": response_status,
        "response_reason": assignment.response_reason,
        "feedback_submitted": feedback is not None,
        "can_respond": active and feedback is None and response_status != "declined",
        "can_submit_feedback": active and feedback is None and response_status in {"pending", "accepted"},
    }
