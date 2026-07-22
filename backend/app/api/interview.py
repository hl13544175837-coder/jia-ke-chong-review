from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import select
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..middleware.rate_limit import rate_limit
from ..services.interview_service import PreScreenService
from ..services.interview_workflow_service import (
    InterviewAssignmentWorkflowError,
    active_assignment_filter,
    assignment_is_cancelled,
    assignment_is_inactive,
    cancel_interview_assignment,
    can_manage_interview_context,
    can_read_interview_context,
    create_interview_assignment,
    feedback_assignment,
    load_assignment_for_update,
    normalize_assignment_datetime,
    respond_to_interview_assignment,
    resolve_interview_context,
    submit_interview_feedback,
)
from ..services.interview_notification_service import (
    InterviewAccessError,
    dispatch_interview_notification,
    interview_access_payload,
    serialize_interview_notification_delivery,
    validate_interview_access_token,
)
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
    visible_demand_query,
)
from .. import db
from ..models import Candidate, Interview, InterviewAssignment, Job
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
    from ..models import Candidate, InterviewFeedback, RecruitmentDemand, User

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
    feedback_submitted = feedback_query.first() is not None
    scheduled_at = normalize_assignment_datetime(item.scheduled_at)
    assignment_active = not assignment_is_inactive(item.status)
    is_overdue = bool(
        assignment_active
        and scheduled_at
        and scheduled_at < utc_now()
        and not feedback_submitted
    )
    return {
        "id": item.id,
        "candidate_id": item.candidate_id,
        "name_masked": candidate.name_masked if candidate else None,
        "job_id": item.job_id,
        "demand_id": item.demand_id,
        "demand_request_no": demand.request_no if demand else None,
        "job_title": job.title if job else None,
        "round": item.round,
        "round_sequence": item.round_sequence or 1,
        "is_primary": bool(item.is_primary),
        "interviewer_id": item.interviewer_id,
        "interviewer_name": interviewer.name if interviewer else None,
        "scheduled_at": item.scheduled_at.isoformat() if item.scheduled_at else None,
        "location": item.location or "",
        "note": item.note or "",
        "status": item.status or "scheduled",
        "response_status": item.response_status or "pending",
        "response_reason": item.response_reason,
        "responded_at": item.responded_at.isoformat() if item.responded_at else None,
        "notification_delivery": serialize_interview_notification_delivery(
            item.notification_delivery
        ),
        "feedback_submitted": feedback_submitted,
        "is_overdue": is_overdue,
        "created_by_name": creator.name if creator else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _context_error_response(exc):
    return jsonify(exc.as_payload()), exc.status_code


def _assignment_workflow_error_response(exc):
    return jsonify({
        "error": exc.message,
        "code": exc.code,
        **exc.details,
    }), exc.status_code


def _access_error_response(exc):
    return jsonify({"error": exc.message, "code": exc.code}), exc.status_code


def _feedback_submission_response(result):
    return {
        "id": result.feedback.id,
        "status": "ok",
        "deduplicated": result.deduplicated,
        "round_completed": result.round_completed,
        "next_action": result.next_action,
    }


def _json_payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _parse_feedback_score(value):
    if value is None:
        return None
    try:
        score = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("score must be an integer between 1 and 5") from exc
    if score < 1 or score > 5:
        raise ValueError("score must be between 1 and 5")
    return score


def _public_interview_context(data, *, lock=False):
    access = validate_interview_access_token(data.get("token"), lock=lock)
    assignment = access.assignment
    g.user_id = access.interviewer.id
    g.org_id = assignment.org_id
    g.role = "interviewer"
    g.audit_source = "interview_access_link"
    context = resolve_interview_context(
        org_id=assignment.org_id,
        candidate_id=assignment.candidate_id,
        demand_id=assignment.demand_id,
        job_id=assignment.job_id,
    )
    return access, context


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
    jd_text = context.demand.jd_text_snapshot or context.job.jd_text
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
def submit_interview():
    """候选人提交答案，AI 评估并生成报告"""
    data = request.get_json() or {}
    candidate_id = data.get("candidate_id")
    qa_pairs = data.get("qa_pairs", [])  # [{"q": "...", "a": "..."}, ...]
    if not candidate_id or not (data.get("demand_id") or data.get("job_id")) or not qa_pairs:
        return jsonify({"error": "candidate_id, demand_id, qa_pairs required",
                        "code": "demand_id_required"}), 400
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
    jd_text = context.demand.jd_text_snapshot or context.job.jd_text
    db.session.rollback()
    svc = PreScreenService()
    pairs = [(item["q"], item["a"]) for item in qa_pairs]
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


@bp.post("/interview/feedback")
@require_auth
def submit_feedback():
    data = _json_payload()
    if not data.get("candidate_id") or not data.get("round") or not (
        data.get("demand_id") or data.get("job_id")
    ):
        return jsonify({"error": "candidate_id, demand_id, round required",
                        "code": "demand_id_required"}), 400
    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=data["candidate_id"],
            demand_id=data.get("demand_id"),
            job_id=data.get("job_id"),
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    try:
        score = _parse_feedback_score(data.get("score"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    assignment = feedback_assignment(
        org_id=g.org_id,
        interviewer_id=g.user_id,
        assignment_id=data.get("assignment_id"),
        candidate_id=data["candidate_id"],
        demand_id=context.demand_id,
        job_id=context.job.id,
        round_name=data["round"],
        lock=True,
    )
    if assignment is None:
        return jsonify({"error": "面试任务不存在或不属于当前面试官",
                        "code": "assignment_not_found"}), 404
    if not can_read_interview_context(
        g.user_id, g.role, g.org_id, context, data["round"]
    ):
        return jsonify({"error": "Forbidden"}), 403
    try:
        result = submit_interview_feedback(
            context=context,
            assignment=assignment,
            interviewer_id=g.user_id,
            score=score,
            passed=data.get("passed"),
            strengths=data.get("strengths"),
            concerns=data.get("concerns"),
            reason_tags=_sanitize_reason_tags(data.get("reason_tags")),
            evaluation=_sanitize_evaluation(data.get("evaluation")),
            note=data.get("note"),
        )
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    return jsonify(_feedback_submission_response(result)), (
        200 if result.deduplicated else 201
    )


@bp.get("/interview/feedback")
@require_auth
def list_feedback():
    from ..models import InterviewFeedback, RecruitmentDemand, User
    cid = request.args.get("candidate_id", type=int)
    did = request.args.get("demand_id", type=int)
    jid = request.args.get("job_id", type=int)
    q = InterviewFeedback.query
    q = q.filter(InterviewFeedback.org_id == g.org_id)
    if g.role == "interviewer":
        q = q.filter_by(interviewer_id=g.user_id)
    elif g.role == "recruiter":
        visible_demand_ids = visible_demand_query(
            g.user_id, g.role, g.org_id
        ).with_entities(RecruitmentDemand.id)
        visible_legacy_candidate_ids = visible_candidate_query(
            g.user_id, g.role
        ).with_entities(Candidate.id)
        q = q.filter(
            db.or_(
                InterviewFeedback.demand_id.in_(visible_demand_ids),
                db.and_(
                    InterviewFeedback.demand_id.is_(None),
                    InterviewFeedback.candidate_id.in_(visible_legacy_candidate_ids),
                ),
            )
        )
    if cid: q = q.filter_by(candidate_id=cid)
    if did: q = q.filter_by(demand_id=did)
    if jid: q = q.filter_by(job_id=jid)
    rows = q.order_by(InterviewFeedback.id.desc()).all()
    out = []
    for f in rows:
        u = db.session.get(User, f.interviewer_id)
        demand = db.session.get(RecruitmentDemand, f.demand_id) if f.demand_id else None
        out.append({
            "id": f.id, "candidate_id": f.candidate_id, "job_id": f.job_id,
            "demand_id": f.demand_id, "assignment_id": f.assignment_id,
            "demand_request_no": demand.request_no if demand else None,
            "round": f.round, "interviewer_id": f.interviewer_id,
            "interviewer_name": u.name if u else None,
            "score": f.score, "passed": f.passed,
            "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
            "evaluation": f.evaluation_json or {},
            "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        })
    return jsonify(out)


@bp.get("/interviews")
@require_auth
def list_interviews():
    """面试记录列表：AI 面试 + 面试官反馈，按角色过滤。"""
    from ..models import (
        Candidate,
        Interview,
        InterviewFeedback,
        Job,
        RecruitmentDemand,
        User,
    )
    items = []
    ai_q = Interview.query
    fb_q = InterviewFeedback.query.filter(InterviewFeedback.org_id == g.org_id)
    ai_q = ai_q.filter(Interview.org_id == g.org_id)
    if g.role == "recruiter":
        visible_demand_ids = visible_demand_query(
            g.user_id, g.role, g.org_id
        ).with_entities(RecruitmentDemand.id)
        visible_legacy_candidate_ids = visible_candidate_query(
            g.user_id, g.role
        ).with_entities(Candidate.id)
        ai_q = ai_q.filter(
            db.or_(
                Interview.demand_id.in_(visible_demand_ids),
                db.and_(
                    Interview.demand_id.is_(None),
                    Interview.candidate_id.in_(visible_legacy_candidate_ids),
                ),
            )
        )
        fb_q = fb_q.filter(
            db.or_(
                InterviewFeedback.demand_id.in_(visible_demand_ids),
                db.and_(
                    InterviewFeedback.demand_id.is_(None),
                    InterviewFeedback.candidate_id.in_(visible_legacy_candidate_ids),
                ),
            )
        )
    elif g.role == "interviewer":
        ai_q = ai_q.filter(Interview.id < 0)  # 面试官不看 AI 预筛发起记录（永假条件）
        fb_q = fb_q.filter_by(interviewer_id=g.user_id)

    def cname(cid):
        c = db.session.get(Candidate, cid); return c.name_masked if c else None
    def jtitle(jid):
        j = db.session.get(Job, jid); return j.title if j else None
    def uname(uid):
        u = db.session.get(User, uid); return u.name if u else None
    def demand_request_no(did):
        demand = db.session.get(RecruitmentDemand, did) if did else None
        return demand.request_no if demand else None

    for iv in ai_q.order_by(Interview.id.desc()).all():
        items.append({"id": iv.id, "type": "ai", "candidate_id": iv.candidate_id,
                      "name_masked": cname(iv.candidate_id), "job_id": iv.job_id,
                      "demand_id": iv.demand_id,
                      "demand_request_no": demand_request_no(iv.demand_id),
                      "job_title": jtitle(iv.job_id), "score": iv.score,
                      "pass": iv.pass_recommended, "round": None,
                      "interviewer_id": None, "interviewer_name": None,
                      "evaluation": None,
                      "reason_tags": [],
                      "strengths": None, "concerns": None, "note": None,
                      "created_at": iv.created_at.isoformat() if iv.created_at else None})
    for f in fb_q.order_by(InterviewFeedback.id.desc()).all():
        items.append({"id": f.id, "type": "feedback", "candidate_id": f.candidate_id,
                      "name_masked": cname(f.candidate_id), "job_id": f.job_id,
                      "demand_id": f.demand_id, "assignment_id": f.assignment_id,
                      "demand_request_no": demand_request_no(f.demand_id),
                      "job_title": jtitle(f.job_id), "score": f.score,
                      "pass": f.passed, "round": f.round,
                      "interviewer_id": f.interviewer_id,
                      "interviewer_name": uname(f.interviewer_id),
                      "evaluation": f.evaluation_json or {},
                      "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
                      "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
                      "created_at": f.created_at.isoformat() if f.created_at else None})
    items.sort(key=lambda it: it["created_at"] or "", reverse=True)
    return jsonify(items)


@bp.get("/interview/interviewers")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_interviewers():
    from ..models import User

    users = (User.query
             .filter(User.org_id == g.org_id, User.is_active.is_(True), User.role.in_(["interviewer", "manager", "admin"]))
             .order_by(User.name.asc())
             .all())
    return jsonify([
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role}
        for u in users
    ])


@bp.get("/interview/assignments")
@require_auth
def list_assignments():
    from ..models import Candidate, RecruitmentDemand

    q = InterviewAssignment.query
    q = q.filter(InterviewAssignment.org_id == g.org_id)
    if g.role == "interviewer":
        q = q.filter_by(interviewer_id=g.user_id).filter(active_assignment_filter())
    elif g.role == "recruiter":
        q = q.outerjoin(
            RecruitmentDemand,
            InterviewAssignment.demand_id == RecruitmentDemand.id,
        ).filter(
            db.or_(
                RecruitmentDemand.owner_hr_id == g.user_id,
                db.and_(
                    InterviewAssignment.demand_id.is_(None),
                    InterviewAssignment.candidate_id.in_(
                        visible_candidate_query(g.user_id, g.role).with_entities(Candidate.id)
                    ),
                ),
            )
        )

    demand_id = request.args.get("demand_id", type=int)
    job_id = request.args.get("job_id", type=int)
    candidate_id = request.args.get("candidate_id", type=int)
    if demand_id:
        q = q.filter(InterviewAssignment.demand_id == demand_id)
    if job_id:
        q = q.filter(InterviewAssignment.job_id == job_id)
    if candidate_id:
        q = q.filter(InterviewAssignment.candidate_id == candidate_id)

    rows = q.order_by(InterviewAssignment.scheduled_at.asc(), InterviewAssignment.id.desc()).all()
    return jsonify([_assignment_payload(item) for item in rows])


@bp.post("/interview/assignments")
@require_auth
def create_assignment():
    from ..models import Candidate, User

    if g.role not in ("recruiter", "manager", "admin"):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    required = ("candidate_id", "round", "interviewer_id")
    if not all(data.get(k) for k in required) or not (data.get("demand_id") or data.get("job_id")):
        return jsonify({"error": "candidate_id, demand_id, round, interviewer_id required",
                        "code": "demand_id_required"}), 400
    if data["round"] not in INTERVIEW_ROUNDS:
        return jsonify({"error": "无效面试轮次"}), 400
    if "status" in data:
        return jsonify({
            "error": "面试任务状态由服务端管理，请使用取消任务接口",
            "code": "assignment_status_managed_by_server",
        }), 400
    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=data["candidate_id"],
            demand_id=data.get("demand_id"),
            job_id=data.get("job_id"),
            open_only=True,
            require_current=True,
            lock=True,
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    interviewer = db.session.execute(
        select(User)
        .where(User.id == data["interviewer_id"], User.org_id == g.org_id)
        .with_for_update()
    ).scalar_one_or_none()
    if (
        interviewer is None
        or not same_org(interviewer, g.org_id)
        or interviewer.role not in ("interviewer", "manager", "admin")
        or not interviewer.is_active
    ):
        return jsonify({"error": "面试官不存在、未启用或角色不正确"}), 400

    scheduled_at = _parse_datetime(data.get("scheduled_at"))
    round_sequence = data.get("round_sequence", 1)
    if (
        not isinstance(round_sequence, int)
        or isinstance(round_sequence, bool)
        or round_sequence < 1
    ):
        return jsonify({"error": "round_sequence 必须是正整数"}), 400
    is_primary = data.get("is_primary", True)
    if not isinstance(is_primary, bool):
        return jsonify({"error": "is_primary 必须是布尔值"}), 400
    try:
        assignment, deduplicated = create_interview_assignment(
            context=context,
            interviewer_id=data["interviewer_id"],
            round_name=data["round"],
            round_sequence=round_sequence,
            is_primary=is_primary,
            scheduled_at=scheduled_at,
            location=str(data.get("location") or ""),
            note=str(data.get("note") or ""),
            created_by=g.user_id,
        )
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    if not deduplicated:
        dispatch_interview_notification(assignment.id)
    payload = _assignment_payload(assignment)
    payload["deduplicated"] = deduplicated
    return jsonify(payload), 200 if deduplicated else 201


@bp.post("/interview/assignment/respond")
@require_auth
def respond_assignment():
    data = _json_payload()
    assignment_id = data.get("assignment_id")
    if not isinstance(assignment_id, int) or isinstance(assignment_id, bool):
        return jsonify({"error": "assignment_id required"}), 400
    assignment = load_assignment_for_update(
        org_id=g.org_id,
        assignment_id=assignment_id,
    )
    if assignment is None:
        return jsonify({
            "error": "面试任务不存在或不属于当前面试官",
            "code": "assignment_not_found",
        }), 404
    try:
        assignment, deduplicated = respond_to_interview_assignment(
            assignment=assignment,
            interviewer_id=g.user_id,
            decision=data.get("decision"),
            reason=data.get("reason"),
        )
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    payload = _assignment_payload(assignment)
    payload["deduplicated"] = deduplicated
    return jsonify(payload)


@bp.post("/interview/assignment/notification/retry")
@require_auth
@require_role("recruiter", "manager", "admin")
def retry_assignment_notification():
    data = _json_payload()
    assignment_id = data.get("assignment_id")
    if not isinstance(assignment_id, int) or isinstance(assignment_id, bool):
        return jsonify({"error": "assignment_id required"}), 400
    assignment = InterviewAssignment.query.filter_by(
        id=assignment_id,
        org_id=g.org_id,
    ).first()
    if assignment is None:
        return jsonify({
            "error": "面试任务不存在",
            "code": "assignment_not_found",
        }), 404
    try:
        context = resolve_interview_context(
            org_id=g.org_id,
            candidate_id=assignment.candidate_id,
            demand_id=assignment.demand_id,
            job_id=assignment.job_id,
        )
    except DemandContextError as exc:
        return _context_error_response(exc)
    if not can_manage_interview_context(g.user_id, g.role, g.org_id, context):
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
    if assignment_is_inactive(assignment.status):
        return jsonify({
            "error": "面试任务已结束，不能重新发送通知",
            "code": "assignment_inactive",
        }), 409
    dispatch_interview_notification(assignment.id)
    return jsonify(_assignment_payload(assignment))


@bp.post("/interview/access/get")
@rate_limit("interview.public_access")
def get_public_interview_access():
    data = _json_payload()
    try:
        access, _ = _public_interview_context(data)
    except InterviewAccessError as exc:
        return _access_error_response(exc)
    except DemandContextError as exc:
        return _context_error_response(exc)
    return jsonify(interview_access_payload(access))


@bp.post("/interview/access/respond")
@rate_limit("interview.public_access")
def respond_public_interview_access():
    data = _json_payload()
    try:
        access, _ = _public_interview_context(data, lock=True)
        assignment, deduplicated = respond_to_interview_assignment(
            assignment=access.assignment,
            interviewer_id=access.interviewer.id,
            decision=data.get("decision"),
            reason=data.get("reason"),
        )
    except InterviewAccessError as exc:
        return _access_error_response(exc)
    except DemandContextError as exc:
        return _context_error_response(exc)
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    payload = interview_access_payload(access)
    payload["deduplicated"] = deduplicated
    return jsonify(payload)


@bp.post("/interview/access/feedback")
@rate_limit("interview.public_access")
def submit_public_interview_feedback():
    data = _json_payload()
    try:
        score = _parse_feedback_score(data.get("score"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    try:
        access, context = _public_interview_context(data, lock=True)
        assignment = access.assignment
        result = submit_interview_feedback(
            context=context,
            assignment=assignment,
            interviewer_id=access.interviewer.id,
            score=score,
            passed=data.get("passed"),
            strengths=data.get("strengths"),
            concerns=data.get("concerns"),
            reason_tags=_sanitize_reason_tags(data.get("reason_tags")),
            evaluation=_sanitize_evaluation(data.get("evaluation")),
            note=data.get("note"),
        )
    except InterviewAccessError as exc:
        return _access_error_response(exc)
    except DemandContextError as exc:
        return _context_error_response(exc)
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    return jsonify(_feedback_submission_response(result)), (
        200 if result.deduplicated else 201
    )


@bp.patch("/interview/assignments/<int:assignment_id>/cancel")
@require_auth
def cancel_assignment(assignment_id):
    """Cancel an uncompleted assignment and release its primary round slot."""
    if g.role not in {"recruiter", "manager", "admin"}:
        return jsonify({"error": "Forbidden"}), 403
    reason = str((request.get_json(silent=True) or {}).get("reason") or "").strip()
    if not reason:
        return jsonify({
            "error": "取消面试任务需要填写原因",
            "code": "cancel_reason_required",
        }), 400

    # Read the immutable Demand reference without a row lock, then lock in the
    # same order as create (Demand -> assignment) to avoid MySQL deadlocks.
    assignment_reference = db.session.execute(
        select(
            InterviewAssignment.demand_id,
            InterviewAssignment.job_id,
            InterviewAssignment.candidate_id,
        ).where(
            InterviewAssignment.id == assignment_id,
            InterviewAssignment.org_id == g.org_id,
        )
    ).one_or_none()
    if assignment_reference is None:
        return jsonify({
            "error": "面试任务不存在",
            "code": "assignment_not_found",
        }), 404

    if assignment_reference.demand_id is not None:
        try:
            demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=assignment_reference.demand_id,
                job_id=assignment_reference.job_id,
                lock=True,
            )
        except DemandContextError as exc:
            db.session.rollback()
            return _context_error_response(exc)
        allowed = can_manage_demand(g.user_id, g.role, g.org_id, demand)
    assignment = load_assignment_for_update(
        org_id=g.org_id,
        assignment_id=assignment_id,
    )
    if assignment is None or assignment.demand_id != assignment_reference.demand_id:
        db.session.rollback()
        return jsonify({
            "error": "面试任务已变更，请刷新后重试",
            "code": "assignment_changed",
        }), 409

    if assignment.demand_id is None:
        candidate = db.session.get(Candidate, assignment.candidate_id)
        allowed = g.role in {"manager", "admin"} or (
            g.role == "recruiter"
            and candidate is not None
            and candidate.owner_hr_id in {g.user_id, None}
        )
    if not allowed:
        db.session.rollback()
        return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

    try:
        assignment, deduplicated = cancel_interview_assignment(
            assignment=assignment,
            reason=reason,
        )
    except InterviewAssignmentWorkflowError as exc:
        return _assignment_workflow_error_response(exc)
    payload = _assignment_payload(assignment)
    payload["deduplicated"] = deduplicated
    return jsonify(payload), 200
