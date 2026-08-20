from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..services.interview_service import PreScreenService
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


def register_interview_query_routes(bp):
    from .interview import (
        INTERVIEW_ROUNDS,
        _assignment_payload,
        _context_error_response,
        _resume_info,
        _simple_feedback_fields,
        _top_candidate_tags,
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
            updated_by = getattr(f, "updated_by", None)
            updated_user = db.session.get(User, updated_by) if updated_by else None
            out.append({
                "id": f.id, "candidate_id": f.candidate_id, "job_id": f.job_id,
                "demand_id": f.demand_id, "assignment_id": f.assignment_id,
                "round": f.round, "interviewer_id": f.interviewer_id,
                "interviewer_name": u.name if u else None,
                "score": f.score, "passed": f.passed,
                "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
                "evaluation": f.evaluation_json or {},
                "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
                "satisfaction": feedback_satisfaction(f),
                "updated_by": updated_by,
                "updated_by_name": updated_user.name if updated_user else None,
                "updated_at": (
                    getattr(f, "updated_at", None).isoformat()
                    if getattr(f, "updated_at", None)
                    else None
                ),
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

        for iv in ai_q.order_by(Interview.id.desc()).all():
            items.append({"id": iv.id, "type": "ai", "candidate_id": iv.candidate_id,
                          "name_masked": cname(iv.candidate_id), "job_id": iv.job_id,
                          "demand_id": iv.demand_id,
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
                          "job_title": jtitle(f.job_id), "score": f.score,
                          "pass": f.passed, "round": f.round,
                          "interviewer_id": f.interviewer_id,
                          "interviewer_name": uname(f.interviewer_id),
                          "evaluation": f.evaluation_json or {},
                          "satisfaction": feedback_satisfaction(f),
                          "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
                          "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
                          "updated_by": getattr(f, "updated_by", None),
                          "updated_at": (
                              getattr(f, "updated_at", None).isoformat()
                              if getattr(f, "updated_at", None)
                              else None
                          ),
                          "created_at": f.created_at.isoformat() if f.created_at else None})
        items.sort(key=lambda it: it["created_at"] or "", reverse=True)
        return jsonify(items)


    @bp.get("/interview/interviewers")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def list_interviewers():
        from ..models import User
        from ..services.account_display_service import (
            SIT_GATEWAY_ACCOUNT_EMAILS,
            account_display_name,
        )

        users = (User.query
                 .filter(User.org_id == g.org_id, User.is_active.is_(True), User.role.in_(["interviewer", "manager", "admin"]))
                 )
        if getattr(g, "gateway_auth", False):
            users = users.filter(User.email.in_(SIT_GATEWAY_ACCOUNT_EMAILS))
        users = users.order_by(User.name.asc()).all()
        return jsonify([
            {
                "id": u.id,
                "name": account_display_name(u),
                "email": u.email,
                "role": u.role,
            }
            for u in users
        ])


    @bp.get("/interview/management-rows")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def list_interview_management_rows():
        return jsonify(
            interview_management_rows(
                user_id=g.user_id,
                role=g.role,
                org_id=g.org_id,
            )
        )


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
