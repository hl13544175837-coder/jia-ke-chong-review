from datetime import datetime
from flask import Blueprint, request, jsonify, g, current_app
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..middleware.rate_limit import rate_limit
from ..services.interview_service import PreScreenService
from ..services.account_display_service import account_display_name
from ..services.interview_workflow_service import (
    FeedbackValidationError,
    InterviewAssignmentWorkflowError,
    InterviewFeedbackEditError,
    active_assignment_filter,
    assignment_is_cancelled,
    cancel_interview_assignment,
    can_manage_interview_context,
    can_read_interview_context,
    create_interview_assignment,
    ensure_interview_has_started,
    feedback_assignment,
    feedback_satisfaction,
    load_assignment_for_update,
    normalize_assignment_datetime,
    normalize_assignment_status,
    normalize_simple_feedback,
    resolve_interview_context,
    update_interview_feedback,
)
from ..services.interview_management_service import (
    interview_management_rows,
    mark_interview_conducted,
    remind_interview_feedback,
    update_interview_assignment,
)
from ..services.interview_reschedule_service import (
    InterviewRescheduleError,
    adjust_assignment_directly,
    create_replacement_assignment,
    create_reschedule_request,
    history_for_assignment,
    load_request_for_update,
    pending_request_for_assignment,
    resolve_reschedule_request,
    serialize_reschedule_request,
)
from ..services.pipeline_service import normalize_pipeline_stage
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
    visible_demand_query,
)
from .. import db
from ..models import (
    Candidate,
    Interview,
    InterviewAssignment,
    InterviewRescheduleRequest,
    Job,
    Notification,
    User,
)
from ..time_utils import utc_now
from .access import (
    same_org,
    visible_candidate_query,
)

bp = Blueprint("interview", __name__)


INTERVIEW_ROUNDS = {
    "round_1",
    "round_2",
    "round_3",
    "additional",
    "hr",
    "business",
    "technical",
    # 兼容历史数据，不再作为管道主阶段使用。
    "interview_first",
    "interview_second",
    "interview_final",
}

FEEDBACK_REASON_TAGS = {
    "专业能力不匹配",
    "项目经验不足",
    "行业经验不匹配",
    "沟通表达不符合预期",
    "稳定性存疑",
    "薪资期望不匹配",
    "到岗时间不匹配",
    "候选人意愿不强",
    "候选人主动放弃",
    "候选人已接受其他机会",
    "工作地点不匹配",
    "面试时间无法协调",
    "简历信息存疑",
    "背景匹配度不足",
    "岗位要求变化",
    "部门内部意见不一致",
    "面试标准变化",
    "HC暂缓或冻结",
    "岗位暂停招聘",
    "组织架构或汇报关系变化",
    "优先级下降",
    "薪资预算变化",
    "需要加面确认",
    "需要补充作品或案例",
    "面试官暂未形成结论",
    "其他",
}


def _validated_qa_pairs(value):
    max_pairs = int(current_app.config.get("INTERVIEW_QA_MAX_PAIRS", 20))
    max_question = int(
        current_app.config.get("INTERVIEW_QA_MAX_QUESTION_LENGTH", 1000)
    )
    max_answer = int(
        current_app.config.get("INTERVIEW_QA_MAX_ANSWER_LENGTH", 5000)
    )
    max_total = int(
        current_app.config.get("INTERVIEW_QA_MAX_TOTAL_LENGTH", 30000)
    )
    if not isinstance(value, list) or not value or len(value) > max_pairs:
        raise ValueError("invalid_qa_pairs")

    result = []
    total = 0
    for item in value:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("q"), str)
            or not isinstance(item.get("a"), str)
        ):
            raise ValueError("invalid_qa_pairs")
        question = item["q"].strip()
        answer = item["a"].strip()
        if (
            not question
            or not answer
            or len(question) > max_question
            or len(answer) > max_answer
        ):
            raise ValueError("invalid_qa_pairs")
        total += len(question) + len(answer)
        if total > max_total:
            raise ValueError("invalid_qa_pairs")
        result.append((question, answer))
    return result


def _parse_datetime(value):
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _sanitize_evaluation(value):
    if not isinstance(value, dict):
        return {}
    evaluation = {}
    for key, raw_score in value.items():
        name = str(key or "").strip()[:40]
        if not name:
            continue
        try:
            score = int(raw_score)
        except (TypeError, ValueError):
            continue
        evaluation[name] = min(5, max(1, score))
    return evaluation


def _sanitize_reason_tags(value):
    if not isinstance(value, list):
        return []
    tags = []
    seen = set()
    for item in value:
        tag = str(item or "").strip()[:40]
        if not tag or tag not in FEEDBACK_REASON_TAGS or tag in seen:
            continue
        tags.append(tag)
        seen.add(tag)
        if len(tags) >= 8:
            break
    return tags


def _simple_feedback_fields(feedback):
    updated_at = getattr(feedback, "updated_at", None)
    updated_by = getattr(feedback, "updated_by", None)
    updated_user = db.session.get(User, updated_by) if updated_by else None
    evaluation = (
        feedback.evaluation_json
        if isinstance(feedback.evaluation_json, dict)
        else {}
    )
    return {
        "satisfaction": feedback_satisfaction(feedback),
        "job_match": str(evaluation.get("job_match") or ""),
        "recommendation": str(evaluation.get("recommendation") or ""),
        "strengths": feedback.strengths or "",
        "concerns": feedback.concerns or "",
        "note": feedback.note or "",
        "updated_by": updated_by,
        "updated_by_name": account_display_name(updated_user) if updated_user else None,
        "updated_at": updated_at.isoformat() if updated_at else None,
    }


def _feedback_write_payload(feedback, *, deduplicated, round_completed):
    return {
        "id": feedback.id,
        "status": "ok",
        "deduplicated": deduplicated,
        "round_completed": round_completed,
        "next_action": (
            "awaiting_hr_decision"
            if round_completed
            else "awaiting_primary_feedback"
        ),
        **_simple_feedback_fields(feedback),
    }


def _resume_info(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return {}
    info = resume.get("extracted_info") or {}
    return info if isinstance(info, dict) else {}


def _top_candidate_tags(candidate, limit=5):
    tags = sorted(
        [tag for tag in candidate.tags if tag.tag],
        key=lambda tag: (-(tag.score or 0), tag.tag),
    )
    return [tag.tag for tag in tags[:limit]]


def _build_interview_guide(candidate, job, round_name, demand_id=None):
    info = _resume_info(candidate)
    skills = _top_candidate_tags(candidate)
    summary = str(info.get("summary") or "").strip()
    jd_text = f"{job.title} {job.jd_text or ''}"
    focus = []
    if round_name in {"round_3", "interview_final"}:
        focus.extend(["最终匹配度", "入职动机", "团队协作与稳定性"])
    elif round_name in {"round_2", "interview_second", "technical"}:
        focus.extend(["岗位深度能力", "项目复盘", "跨团队推动"])
    elif round_name == "hr":
        focus.extend(["入职动机", "薪资预期", "稳定性"])
    elif round_name == "business":
        focus.extend(["业务理解", "岗位匹配", "协作方式"])
    elif round_name == "additional":
        focus.extend(["补充疑点", "关键风险", "决策分歧"])
    else:
        focus.extend(["岗位基础匹配", "核心技能验证", "项目真实性"])
    focus.extend(skills[:3])
    focus = list(dict.fromkeys([item for item in focus if item]))[:6]

    questions = []
    for skill in skills[:4]:
        questions.append(f"请结合过往项目说明你如何使用或验证「{skill}」能力？")
    if "用户研究" in jd_text and "用户研究" not in skills:
        questions.append("请举例说明你如何从用户研究中提炼产品机会，并推动落地？")
    if "数据" in jd_text and not any("数据" in skill for skill in skills):
        questions.append("请讲一个你用数据分析影响产品决策的案例。")
    if summary:
        questions.append(f"简历提到「{summary[:32]}」，请展开讲最能代表你能力的项目。")
    questions.extend([
        "最近一个完整项目中，你负责的关键决策是什么，结果如何衡量？",
        "如果入职该岗位，前三个月你会优先验证哪些问题？",
    ])
    questions = list(dict.fromkeys(questions))[:8]

    return {
        "candidate_id": candidate.id,
        "job_id": job.id,
        "demand_id": demand_id,
        "round": round_name,
        "focus": focus,
        "questions": questions,
        "risks": [
            "确认简历核心项目是否为本人主导",
            "追问岗位关键能力与实际产出的对应关系",
            "对评分分歧点做事实澄清",
        ],
        "required_checks": ["面试结论", "是否推进下一轮", "关键优势与顾虑"],
    }


def _assignment_payload(item):
    from ..models import (
        Candidate,
        InterviewFeedback,
        PipelineStage,
        RecruitmentDemand,
        User,
    )

    candidate = db.session.get(Candidate, item.candidate_id)
    job = db.session.get(Job, item.job_id)
    demand = (
        db.session.get(RecruitmentDemand, item.demand_id)
        if item.demand_id is not None
        else None
    )
    interviewer = db.session.get(User, item.interviewer_id)
    creator = db.session.get(User, item.created_by) if item.created_by else None
    feedback_query = InterviewFeedback.query.filter_by(
        org_id=item.org_id or 1,
        candidate_id=item.candidate_id,
        interviewer_id=item.interviewer_id,
    )
    if item.id:
        feedback_query = feedback_query.filter(
            db.or_(
                InterviewFeedback.assignment_id == item.id,
                db.and_(
                    InterviewFeedback.assignment_id.is_(None),
                    InterviewFeedback.demand_id == item.demand_id,
                    InterviewFeedback.round == item.round,
                ),
            )
        )
    feedback = feedback_query.order_by(InterviewFeedback.id.desc()).first()
    feedback_submitted = feedback is not None
    scheduled_at = normalize_assignment_datetime(item.scheduled_at)
    assignment_active = not assignment_is_cancelled(item.status)
    stage = None
    if item.demand_id is not None:
        stage = (
            PipelineStage.query.filter_by(
                org_id=item.org_id or 1,
                candidate_id=item.candidate_id,
                demand_id=item.demand_id,
            )
            .order_by(PipelineStage.id.desc())
            .first()
        )
    is_overdue = bool(
        assignment_active
        and normalize_assignment_status(item.status) == "awaiting_feedback"
        and scheduled_at
        and scheduled_at < utc_now()
        and not feedback_submitted
    )
    payload = {
        "id": item.id,
        "candidate_id": item.candidate_id,
        "name_masked": candidate.name_masked if candidate else None,
        "job_id": item.job_id,
        "demand_id": item.demand_id,
        "job_title": (
            (demand.job_title_snapshot or job.title)
            if demand and job
            else (job.title if job else None)
        ),
        "job_city": (
            (demand.city or job.city or "")
            if demand and job
            else (job.city if job else "")
        ),
        "job_department": (
            (demand.department or job.department or "")
            if demand and job
            else (job.department if job else "")
        ),
        "pipeline_stage": normalize_pipeline_stage(stage.stage) if stage else None,
        "round": item.round,
        "round_sequence": item.round_sequence or 1,
        "is_primary": bool(item.is_primary),
        "interviewer_id": item.interviewer_id,
        "interviewer_name": interviewer.name if interviewer else None,
        "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None,
        "location": item.location or "",
        "note": item.note or "",
        "status": item.status or "scheduled",
        "feedback_submitted": feedback_submitted,
        "feedback_id": feedback.id if feedback else None,
        "feedback_satisfaction": (
            feedback_satisfaction(feedback) if feedback else None
        ),
        "feedback_note": feedback.note or "" if feedback else "",
        "feedback_updated_by": (
            getattr(feedback, "updated_by", None) if feedback else None
        ),
        "feedback_updated_at": (
            getattr(feedback, "updated_at", None).isoformat()
            if feedback and getattr(feedback, "updated_at", None)
            else None
        ),
        "is_overdue": is_overdue,
        "created_by_name": creator.name if creator else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }
    history = history_for_assignment(item)
    if history:
        payload["reschedule_history"] = [
            serialize_reschedule_request(record) for record in history
        ]
    pending = pending_request_for_assignment(item)
    if pending is not None:
        payload["pending_reschedule"] = serialize_reschedule_request(pending)
    return payload


def _context_error_response(exc):
    return jsonify(exc.as_payload()), exc.status_code


def _assignment_workflow_error_response(exc):
    return jsonify({
        "error": exc.message,
        "code": exc.code,
        **exc.details,
    }), exc.status_code


def _reschedule_error_response(exc):
    if isinstance(exc, InterviewRescheduleError):
        return jsonify(exc.as_payload()), exc.status_code
    return _assignment_workflow_error_response(exc)


def _load_managed_assignment(assignment_id):
    """Lock a Demand-owned assignment after checking organization and role scope."""

    reference = db.session.execute(
        select(
            InterviewAssignment.demand_id,
            InterviewAssignment.job_id,
        ).where(
            InterviewAssignment.id == assignment_id,
            InterviewAssignment.org_id == g.org_id,
        )
    ).one_or_none()
    if reference is None or reference.demand_id is None:
        return None, (
            jsonify({"error": "面试任务不存在", "code": "assignment_not_found"}),
            404,
        )
    try:
        demand = resolve_demand_context(
            org_id=g.org_id,
            demand_id=reference.demand_id,
            job_id=reference.job_id,
            lock=True,
        )
    except DemandContextError as exc:
        db.session.rollback()
        return None, _context_error_response(exc)
    if not can_manage_demand(g.user_id, g.role, g.org_id, demand):
        db.session.rollback()
        return None, (jsonify({"error": "Forbidden", "code": "forbidden"}), 403)
    assignment = load_assignment_for_update(
        org_id=g.org_id,
        assignment_id=assignment_id,
    )
    if assignment is None or assignment.demand_id != reference.demand_id:
        db.session.rollback()
        return None, (
            jsonify({
                "error": "面试任务已变更，请刷新后重试",
                "code": "assignment_changed",
            }),
            409,
        )
    return assignment, None


@bp.post("/interview/start")
@require_auth
def start_interview():
    """HR 对候选人发起 AI 预筛，生成面试题"""
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    if not candidate_id or not (data.get("demand_id") or data.get("job_id")):
        return jsonify({"error": "candidate_id and demand_id required", "code": "demand_id_required"}), 400
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=candidate_id,
            demand_id=data.get("demand_id"),
            job_id=data.get("job_id"),
            open_only=True,
            require_current=True,
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    resolved_demand_id = context.demand_id
    resolved_job_id = context.job.id
    jd_text = context.demand.jd_text_snapshot if context.demand.jd_override else (context.job.jd_text or context.demand.jd_text_snapshot)
    # Do not hold an idle transaction across the external LLM call. The
    # Demand/Flow is locked and revalidated immediately before audit/write.
    db.session.rollback()
    svc = PreScreenService()
    questions = svc.generate_questions(
        jd_text,
        count=data.get("count", 5),
    )
    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=candidate_id,
            demand_id=resolved_demand_id,
            job_id=resolved_job_id,
            open_only=True,
            require_current=True,
            lock=True,
        )
    except DemandContextError as exc:
        db.session.rollback()
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        db.session.rollback()
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    record_event("interview.started", entity_id=candidate_id, entity_type="candidate",
                 demand_id=context.demand_id,
                 payload={"job_id": context.job.id, "demand_id": context.demand_id, "actor_id": g.user_id})
    return jsonify({"candidate_id": candidate_id, "job_id": context.job.id,
                    "demand_id": context.demand_id, "questions": questions})


@bp.post("/interview/submit")
@require_auth
@rate_limit("interview.submit")
def submit_interview():
    """候选人提交答案，AI 评估并生成报告"""
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    if not candidate_id or not (data.get("demand_id") or data.get("job_id")):
        return jsonify({"error": "candidate_id, demand_id, qa_pairs required",
                        "code": "demand_id_required"}), 400
    try:
        pairs = _validated_qa_pairs(data.get("qa_pairs"))
    except ValueError:
        return jsonify({
            "error": "面试问答格式或长度不符合要求",
            "code": "invalid_qa_pairs",
        }), 400
    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=candidate_id,
            demand_id=data.get("demand_id"),
            job_id=data.get("job_id"),
            open_only=True,
            require_current=True,
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    resolved_demand_id = context.demand_id
    resolved_job_id = context.job.id
    jd_text = context.demand.jd_text_snapshot if context.demand.jd_override else (context.job.jd_text or context.demand.jd_text_snapshot)
    db.session.rollback()
    svc = PreScreenService()
    report = svc.build_report(pairs, jd_text)
    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=candidate_id,
            demand_id=resolved_demand_id,
            job_id=resolved_job_id,
            open_only=True,
            require_current=True,
            lock=True,
        )
    except DemandContextError as exc:
        db.session.rollback()
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        db.session.rollback()
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    iv = Interview(
        org_id=g.org_id,
        candidate_id=candidate_id,
        job_id=context.job.id,
        demand_id=context.demand_id,
        qa_json=[{"q": q, "a": a} for q, a in pairs],
        ai_report=report,
        score=report["avg_score"],
        pass_recommended=report["pass_recommended"],
    )
    db.session.add(iv)
    record_event("interview.scored", entity_id=candidate_id, entity_type="candidate",
                 demand_id=context.demand_id,
                 payload={"job_id": context.job.id, "demand_id": context.demand_id,
                          "score": report["avg_score"],
                          "pass": report["pass_recommended"]})
    # AI 只保存建议。推进、淘汰、Offer 与转派必须由 HR 明确确认。
    return jsonify({"interview_id": iv.id, "demand_id": context.demand_id,
                    "report": report, "decision_required": True,
                    "pipeline_changed": False})


@bp.get("/interview/<int:interview_id>")
@require_auth
def get_report(interview_id):
    iv = db.get_or_404(Interview, interview_id)
    if not same_org(iv, g.org_id):
        return jsonify({"error": "面试记录不存在"}), 404
    if iv.demand_id is None:
        # Read-only compatibility for pre-Demand AI reports. New writes can no
        # longer create NULL demand facts, but list/detail must stay coherent
        # until backfill/Strict cutover removes the legacy rows.
        allowed = g.role in {"manager", "admin"}
        if g.role == "recruiter":
            allowed = (
                visible_candidate_query(g.user_id, g.role)
                .filter(Candidate.id == iv.candidate_id)
                .first()
                is not None
            )
        if not allowed:
            return jsonify({"error": "Forbidden"}), 403
    else:
        try:
            context = resolve_interview_context(
                org_id=g.org_id,
                candidate_id=iv.candidate_id,
                demand_id=iv.demand_id,
                job_id=iv.job_id,
            )
        except DemandContextError as exc:
            return _context_error_response(exc)
        if not can_read_interview_context(g.user_id, g.role, g.org_id, context):
            return jsonify({"error": "Forbidden"}), 403
    return jsonify({
        "id": iv.id,
        "candidate_id": iv.candidate_id,
        "job_id": iv.job_id,
        "demand_id": iv.demand_id,
        "score": iv.score,
        "pass_recommended": iv.pass_recommended,
        "ai_report": iv.ai_report,
        "created_at": iv.created_at.isoformat(),
    })


@bp.get("/interview/guide")
@require_auth
def interview_guide():
    candidate_id = request.args.get("candidate_id", type=int)
    demand_id = request.args.get("demand_id", type=int)
    job_id = request.args.get("job_id", type=int)
    round_name = request.args.get("round") or "round_1"
    if not candidate_id or not (demand_id or job_id):
        return jsonify({"error": "candidate_id and demand_id required",
                        "code": "demand_id_required"}), 400
    if round_name not in INTERVIEW_ROUNDS:
        return jsonify({"error": "无效面试轮次"}), 400

    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=candidate_id,
            demand_id=demand_id,
            job_id=job_id,
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    if not can_read_interview_context(g.user_id, g.role, g.org_id, context, round_name):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify(_build_interview_guide(
        context.candidate, context.job, round_name, context.demand_id
    ))


def _managed_feedback_assignment(user_id, role, assignment_id):
    """专员/经理代填面试反馈:按任务 ID 解析,校验其需求可管理后才允许。

    返回可代填的 assignment,否则 None(由调用方决定 404 提示)。
    """
    if role not in {"recruiter", "manager", "admin"} or not assignment_id:
        return None
    assignment = db.session.execute(
        select(InterviewAssignment)
        .where(
            InterviewAssignment.id == assignment_id,
            InterviewAssignment.org_id == g.org_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if assignment is None or assignment.demand_id is None:
        return None
    try:
        demand = resolve_demand_context(
            org_id=g.org_id,
            demand_id=assignment.demand_id,
            job_id=assignment.job_id,
        )
    except DemandContextError:
        return None
    if not can_manage_demand(user_id, role, g.org_id, demand):
        return None
    return assignment


@bp.post("/interview/feedback")
@require_auth
def submit_feedback():
    from ..models import InterviewFeedback

    data = request.get_json() or {}
    simple_feedback = None
    if "satisfaction" in data:
        try:
            simple_feedback = normalize_simple_feedback(data)
        except FeedbackValidationError as exc:
            return jsonify(exc.as_payload()), 400

    has_legacy_context = bool(
        data.get("candidate_id")
        and data.get("round")
        and (data.get("demand_id") or data.get("job_id"))
    )
    if not has_legacy_context and not data.get("assignment_id"):
        return jsonify({
            "error": "candidate_id, demand_id, round required",
            "code": "demand_id_required",
        }), 400

    assignment = None
    if has_legacy_context:
        candidate_id = data["candidate_id"]
        round_name = data["round"]
        try:
            context = resolve_interview_context(
                org_id=g.org_id,
                candidate_id=candidate_id,
                demand_id=data.get("demand_id"),
                job_id=data.get("job_id"),
            )
        except DemandContextError as exc:
            return _context_error_response(exc)
    else:
        assignment = feedback_assignment(
            org_id=g.org_id,
            interviewer_id=g.user_id,
            assignment_id=data.get("assignment_id"),
            candidate_id=data.get("candidate_id"),
            demand_id=data.get("demand_id"),
            job_id=data.get("job_id"),
            round_name=data.get("round"),
            lock=True,
        )
        if assignment is not None:
            candidate_id = assignment.candidate_id
            round_name = assignment.round
            try:
                context = resolve_interview_context(
                    org_id=g.org_id,
                    candidate_id=candidate_id,
                    demand_id=assignment.demand_id,
                    job_id=assignment.job_id,
                )
            except DemandContextError as exc:
                return _context_error_response(exc)

    score = data.get("score")
    if score is not None:
        try:
            score = int(score)
        except (TypeError, ValueError):
            return jsonify({"error": "score must be an integer between 1 and 5"}), 400
        if score < 1 or score > 5:
            return jsonify({"error": "score must be between 1 and 5"}), 400

    if has_legacy_context:
        assignment = feedback_assignment(
            org_id=g.org_id,
            interviewer_id=g.user_id,
            assignment_id=data.get("assignment_id"),
            candidate_id=candidate_id,
            demand_id=context.demand_id,
            job_id=context.job.id,
            round_name=round_name,
            lock=True,
        )
    if assignment is None:
        # 面试官本人没有对应任务时,允许需求负责人(专员/经理/管理员)代填。
        assignment = _managed_feedback_assignment(
            g.user_id,
            g.role,
            data.get("assignment_id"),
        )
        if assignment is not None:
            candidate_id = assignment.candidate_id
            round_name = assignment.round
            try:
                context = resolve_interview_context(
                    org_id=g.org_id,
                    candidate_id=candidate_id,
                    demand_id=assignment.demand_id,
                    job_id=assignment.job_id,
                )
            except DemandContextError as exc:
                return _context_error_response(exc)
    if assignment is None:
        return jsonify({
            "error": "面试任务不存在或不属于当前面试官",
            "code": "assignment_not_found",
        }), 404
    if not can_read_interview_context(
        g.user_id, g.role, g.org_id, context, round_name
    ):
        return jsonify({"error": "Forbidden"}), 403
    existing = InterviewFeedback.query.filter_by(
        org_id=g.org_id,
        assignment_id=assignment.id,
    ).first()
    if existing is not None:
        completed = bool(assignment.is_primary)
        return jsonify(_feedback_write_payload(
            existing,
            deduplicated=True,
            round_completed=completed,
        )), 200

    if (
        simple_feedback is not None
        and normalize_assignment_status(assignment.status) != "awaiting_feedback"
    ):
        return jsonify({
            "error": "请等待招聘专员确认面试已完成后再提交评价",
            "code": "interview_not_confirmed",
        }), 409
    try:
        ensure_interview_has_started(assignment)
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)

    evaluation = _sanitize_evaluation(data.get("evaluation"))
    note = data.get("note")
    strengths = data.get("strengths")
    concerns = data.get("concerns")
    if simple_feedback is not None:
        note = simple_feedback["note"]
        strengths = simple_feedback["strengths"]
        concerns = simple_feedback["concerns"]
        evaluation["satisfaction"] = simple_feedback["satisfaction"]
        if any(
            key in data
            for key in ("job_match", "recommendation", "strengths", "concerns")
        ):
            evaluation["job_match"] = simple_feedback["job_match"]
            evaluation["recommendation"] = simple_feedback["recommendation"]
    fb = InterviewFeedback(
        candidate_id=candidate_id, job_id=context.job.id,
        demand_id=context.demand_id,
        assignment_id=assignment.id,
        org_id=g.org_id,
        round=round_name, interviewer_id=assignment.interviewer_id,
        score=score, passed=data.get("passed"),
        strengths=strengths, concerns=concerns,
        reason_tags=_sanitize_reason_tags(data.get("reason_tags")),
        evaluation_json=evaluation,
        note=note)
    # 代填场景(专员/经理替面试官提交):保留真实面试官归属,用
    # updated_by 记录代填人,前端据此展示"由谁代填/最后修改"。
    if assignment.interviewer_id != g.user_id:
        fb.updated_by = g.user_id
        fb.updated_at = utc_now()
    db.session.add(fb)
    round_completed = bool(assignment.is_primary)
    assignment.status = "completed" if round_completed else "feedback_submitted"
    if round_completed:
        owner_id = context.demand.owner_hr_id
        if owner_id and owner_id != g.user_id:
            db.session.add(Notification(
                org_id=g.org_id,
                user_id=owner_id,
                demand_id=context.demand_id,
                type="interview_feedback_ready",
                title="主面试官已反馈，待 HR 确认下一步",
                body=(
                    f"{context.candidate.name_masked or '候选人'}的"
                    f"第 {assignment.round_sequence} 轮主面试反馈已完成。"
                ),
                link=(
                    f"/interviews?demand={context.demand_id}"
                    f"&candidate={context.candidate.id}"
                    f"&assignment={assignment.id}"
                ),
            ))
    assignment_id = assignment.id
    try:
        record_event(
            "interview.feedback",
            entity_id=candidate_id,
            entity_type="candidate",
            demand_id=context.demand_id,
            payload={
                "job_id": context.job.id,
                "demand_id": context.demand_id,
                "assignment_id": assignment.id,
                "round": round_name,
                "score": data.get("score"),
                "passed": data.get("passed"),
                "satisfaction": (
                    simple_feedback["satisfaction"]
                    if simple_feedback is not None
                    else None
                ),
            },
            commit=False,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if assignment_id is not None:
            existing = InterviewFeedback.query.filter_by(
                org_id=g.org_id,
                assignment_id=assignment_id,
            ).first()
            if existing is not None:
                return jsonify(_feedback_write_payload(
                    existing,
                    deduplicated=True,
                    round_completed=round_completed,
                )), 200
        return jsonify({
            "error": "反馈写入冲突，请刷新后重试",
            "code": "feedback_conflict",
        }), 409
    except Exception:
        db.session.rollback()
        raise
    return jsonify(_feedback_write_payload(
        fb,
        deduplicated=False,
        round_completed=round_completed,
    )), 201


@bp.patch("/interview/feedback/<int:feedback_id>")
@require_auth
def edit_feedback(feedback_id):
    data = request.get_json() or {}
    try:
        feedback = update_interview_feedback(
            org_id=g.org_id,
            feedback_id=feedback_id,
            actor_id=g.user_id,
            actor_role=g.role,
            data=data,
        )
    except FeedbackValidationError as exc:
        return jsonify(exc.as_payload()), 400
    except InterviewFeedbackEditError as exc:
        return jsonify(exc.as_payload()), exc.status_code
    return jsonify({"id": feedback.id, **_simple_feedback_fields(feedback)}), 200


from .interview_assignments import register_interview_assignment_routes
from .interview_queries import register_interview_query_routes
from .interview_reschedules import register_interview_reschedule_routes

register_interview_query_routes(bp)
register_interview_reschedule_routes(bp)
register_interview_assignment_routes(bp)
