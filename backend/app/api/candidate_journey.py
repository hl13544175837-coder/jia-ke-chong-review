import csv
import io
import json
import re
import unicodedata
from datetime import timedelta
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, request, g
from sqlalchemy import func, or_, select
from runtime_paths import DEFAULT_UPLOAD_FOLDER, RuntimePathError, resolve_stored_upload_path
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import (
    Candidate,
    CandidateDemandFlow,
    CandidateFavorite,
    CandidateTag,
    CandidateDisposition,
    BusinessReviewTask,
    Event,
    Job,
    PipelineStage,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    OfferRecord,
    RecruitmentDemand,
    UploadBatch,
    User,
    VALID_STAGES,
)
from ..time_utils import utc_now
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    can_read_demand,
    resolve_demand_context,
    visible_demand_query,
)
from ..services.interview_workflow_service import active_assignment_filter
from ..services.candidate_library_service import (
    CandidateLibraryError,
    add_candidates_to_demand,
    education_summary,
    find_duplicate_groups,
    latest_experience,
    merge_candidates,
    resume_info,
    set_candidate_favorites,
)
from ..services.match_service import MatchService
from ..source_channels import normalize_resume_source_channel, resume_source_channel_filter_values
from .pipeline import LEGACY_INTERVIEW_STAGES, STAGE_ORDER, _latest_stage_subquery, normalize_pipeline_stage
from .access import (
    can_access_candidate,
    can_manage_job,
    can_read_job,
    same_org,
    visible_candidate_query,
    visible_job_query,
)


def register_candidate_journey_routes(bp):
    from .candidates import (
        _candidate_source_payload,
        _decision_summary,
        _demand_summary,
        _public_parse_error,
        _resume_info,
    )

    @bp.get("/candidates/<int:candidate_id>/pipelines")
    @require_auth
    def candidate_pipelines(candidate_id):
        cand = db.session.get(Candidate, candidate_id)
        if cand is None or not same_org(cand, g.org_id) or cand.deleted_at is not None:
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403
        latest = (
            db.session.query(
                PipelineStage.candidate_id.label("candidate_id"),
                PipelineStage.demand_id.label("demand_id"),
                func.max(PipelineStage.id).label("max_id"),
            )
            .filter(
                PipelineStage.org_id == g.org_id,
                PipelineStage.candidate_id == candidate_id,
                PipelineStage.demand_id.isnot(None),
            )
            .group_by(PipelineStage.candidate_id, PipelineStage.demand_id)
            .subquery()
        )
        rows = (
            db.session.query(PipelineStage, RecruitmentDemand, Job)
            .join(latest, PipelineStage.id == latest.c.max_id)
            .join(RecruitmentDemand, RecruitmentDemand.id == PipelineStage.demand_id)
            .join(Job, Job.id == PipelineStage.job_id)
            .filter(PipelineStage.candidate_id == candidate_id)
            .filter(
                RecruitmentDemand.id.in_(
                    visible_demand_query(g.user_id, g.role, g.org_id).with_entities(
                        RecruitmentDemand.id
                    )
                )
            )
            .all()
        )
        items = [{
            "demand_id": demand.id,
            "job_id": ps.job_id,
            "job_title": demand.job_title_snapshot or job.title,
            "department": demand.department or demand.requester_department or "",
            "city": demand.city or "",
            "demand_status": demand.status,
            "stage": normalize_pipeline_stage(ps.stage),
            "updated_at": ps.ts.isoformat() if ps.ts else None,
        } for ps, demand, job in rows]
        items.sort(key=lambda x: (
            STAGE_ORDER.index(x["stage"]) if x["stage"] in STAGE_ORDER else len(STAGE_ORDER)
        ))
        return jsonify({"candidate_id": candidate_id,
                        "name_masked": cand.name_masked, "pipelines": items})


    @bp.get("/candidates/<int:candidate_id>/journey")
    @require_auth
    def candidate_journey(candidate_id):
        cand = db.session.get(Candidate, candidate_id)
        if cand is None or not same_org(cand, g.org_id) or cand.deleted_at is not None:
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403
        demand_id = request.args.get("demand_id", type=int)
        job_id = request.args.get("job_id", type=int)
        try:
            demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=demand_id,
                job_id=job_id,
            )
        except DemandContextError as error:
            return jsonify(error.as_payload()), error.status_code
        viewer_assignment = None
        if g.role == "interviewer":
            assigned = InterviewAssignment.query.filter_by(
                org_id=g.org_id,
                interviewer_id=g.user_id,
                candidate_id=candidate_id,
                demand_id=demand.id,
            ).filter(active_assignment_filter()).order_by(
                InterviewAssignment.round_sequence.desc(),
                InterviewAssignment.id.desc(),
            ).first()
            business_review = BusinessReviewTask.query.filter_by(
                org_id=g.org_id,
                reviewer_id=g.user_id,
                candidate_id=candidate_id,
                demand_id=demand.id,
            ).first()
            if assigned is None and business_review is None:
                return jsonify({"error": "Forbidden"}), 403
            viewer_assignment = assigned
        elif not can_read_demand(g.user_id, g.role, g.org_id, demand):
            return jsonify({"error": "Forbidden"}), 403
        job = demand.job
        job_id = demand.job_id

        approval_events = (
            Event.query.filter(
                Event.org_id == g.org_id,
                Event.demand_id == demand.id,
                Event.action.in_(("demand.created", "demand.submitted", "demand.resubmitted", "demand.approved", "demand.rejected")),
            )
            .order_by(Event.id.asc())
            .all()
        )
        approval_actor_ids = {
            value for value in [demand.created_by, demand.reviewed_by, *(item.actor_id for item in approval_events)] if value
        }
        approval_actor_names = {
            user.id: user.name
            for user in User.query.filter(User.id.in_(approval_actor_ids)).all()
        } if approval_actor_ids else {}
        demand_approval = {
            "status": demand.approval_status,
            "submitted_by_name": approval_actor_names.get(demand.created_by),
            "submitted_at": demand.submitted_at.isoformat() if demand.submitted_at else None,
            "reviewed_by_name": approval_actor_names.get(demand.reviewed_by),
            "reviewed_at": demand.reviewed_at.isoformat() if demand.reviewed_at else None,
            "reason": demand.review_reason or "",
            "history": [{
                "action": item.action,
                "actor_name": approval_actor_names.get(item.actor_id),
                "at": item.ts.isoformat() if item.ts else None,
                "reason": str((item.payload or {}).get("reason") or ""),
            } for item in approval_events],
        }

        review_rows = (
            BusinessReviewTask.query.filter_by(
                org_id=g.org_id,
                candidate_id=candidate_id,
                demand_id=demand.id,
            )
            .order_by(BusinessReviewTask.id.asc())
            .all()
        )
        review_user_ids = {
            value
            for row in review_rows
            for value in (row.created_by, row.reviewer_id, row.decided_by)
            if value
        }
        review_user_names = {
            user.id: user.name
            for user in User.query.filter(User.id.in_(review_user_ids)).all()
        } if review_user_ids else {}
        business_reviews = [{
            "id": item.id,
            "status": item.status,
            "created_by_name": review_user_names.get(item.created_by),
            "reviewer_name": review_user_names.get(item.reviewer_id),
            "decided_by_name": review_user_names.get(item.decided_by),
            "hr_note": item.hr_note or "",
            "business_note": item.business_note or "",
            "due_at": item.due_at.isoformat() if item.due_at else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "decided_at": item.decided_at.isoformat() if item.decided_at else None,
        } for item in review_rows]

        # 阶段时间线（含操作人、备注）
        stage_rows = (
            db.session.query(PipelineStage, User)
            .outerjoin(User, User.id == PipelineStage.updated_by)
            .filter(PipelineStage.candidate_id == candidate_id,
                    PipelineStage.demand_id == demand.id)
            .order_by(PipelineStage.id.asc())
            .all()
        )
        timeline = [{
            "stage": ps.stage,
            "ts": ps.ts.isoformat() if ps.ts else None,
            "note": ps.note,
            "updated_by_name": u.name if u else None,
        } for ps, u in stage_rows]

        # AI 面试得分
        ai_rows = (Interview.query
                   .filter_by(candidate_id=candidate_id, demand_id=demand.id)
                   .order_by(Interview.id.desc()).all())
        ai_interviews = [{
            "id": iv.id, "score": iv.score, "pass": iv.pass_recommended,
            "created_at": iv.created_at.isoformat() if iv.created_at else None,
        } for iv in ai_rows]

        # 面试官评分
        fb_rows = (db.session.query(InterviewFeedback, User)
                   .outerjoin(User, User.id == InterviewFeedback.interviewer_id)
                   .filter(InterviewFeedback.candidate_id == candidate_id,
                           InterviewFeedback.demand_id == demand.id)
                   .order_by(InterviewFeedback.id.desc()).all())
        feedback = [{
            "id": f.id, "assignment_id": f.assignment_id, "round": f.round, "score": f.score, "passed": f.passed,
            "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
            "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
            "evaluation": f.evaluation_json or {},
            "interviewer_name": u.name if u else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        } for f, u in fb_rows]

        feedback_by_assignment = {item["assignment_id"]: item for item in feedback if item.get("assignment_id")}
        viewer_has_submitted_feedback = bool(
            viewer_assignment
            and feedback_by_assignment.get(viewer_assignment.id)
        )
        assignment_rows = (
            db.session.query(InterviewAssignment, User)
            .outerjoin(User, User.id == InterviewAssignment.interviewer_id)
            .filter(
                InterviewAssignment.org_id == g.org_id,
                InterviewAssignment.candidate_id == candidate_id,
                InterviewAssignment.demand_id == demand.id,
            )
            .order_by(InterviewAssignment.round_sequence.asc(), InterviewAssignment.id.asc())
            .all()
        )
        visible_assignment_rows = (
            [
                row
                for row in assignment_rows
                if row[0].round_sequence <= viewer_assignment.round_sequence
            ]
            if viewer_assignment is not None
            else []
            if g.role == "interviewer"
            else assignment_rows
        )
        visible_assignment_ids = {
            assignment.id for assignment, _ in visible_assignment_rows
        }
        locked_assignment_ids = {
            assignment.id
            for assignment, _ in visible_assignment_rows
            if (
                viewer_assignment is not None
                and not viewer_has_submitted_feedback
                and assignment.round_sequence < viewer_assignment.round_sequence
            )
        }
        interview_rounds = [{
            "assignment_id": assignment.id,
            "round": assignment.round,
            "round_sequence": assignment.round_sequence,
            "interviewer_name": interviewer.name if interviewer else None,
            "scheduled_at": assignment.scheduled_at.isoformat() if assignment.scheduled_at else None,
            "location": assignment.location or "",
            "status": assignment.status,
            "note": assignment.note or "",
            "feedback": (
                None
                if assignment.id in locked_assignment_ids
                else feedback_by_assignment.get(assignment.id)
            ),
            "feedback_locked": assignment.id in locked_assignment_ids,
        } for assignment, interviewer in visible_assignment_rows]
        visible_feedback = [
            item
            for item in feedback
            if (
                item.get("assignment_id") not in locked_assignment_ids
                and (
                    g.role != "interviewer"
                    or item.get("assignment_id") in visible_assignment_ids
                )
            )
        ]

        disposition_rows = (db.session.query(CandidateDisposition, User)
                            .outerjoin(User, User.id == CandidateDisposition.created_by)
                            .filter(CandidateDisposition.candidate_id == candidate_id,
                                    CandidateDisposition.demand_id == demand.id)
                            .order_by(CandidateDisposition.id.desc()).all())
        dispositions = [{
            "id": d.id,
            "reason": d.reason or "",
            "enter_talent_pool": d.enter_talent_pool,
            "next_contact_at": d.next_contact_at.isoformat() if d.next_contact_at else None,
            "tags": d.tags if isinstance(d.tags, list) else [],
            "note": d.note or "",
            "created_by_name": u.name if u else None,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        } for d, u in disposition_rows]

        offer_rows = (
            OfferRecord.query.filter_by(
                org_id=g.org_id,
                candidate_id=candidate_id,
                demand_id=demand.id,
            )
            .order_by(OfferRecord.id.asc())
            .all()
        )
        offers = [{
            "id": item.id,
            "status": item.approval_status,
            "salary_range": item.salary_range or "",
            "onboard_date": item.onboard_date.isoformat() if item.onboard_date else None,
            "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
            "approved_at": item.approved_at.isoformat() if item.approved_at else None,
            "sent_at": item.sent_at.isoformat() if item.sent_at else None,
            "responded_at": item.responded_at.isoformat() if item.responded_at else None,
            "onboarded_at": item.onboarded_at.isoformat() if item.onboarded_at else None,
            "rejection_reason": item.rejection_reason or "",
        } for item in offer_rows]

        interviewer_only = g.role == "interviewer"
        response_demand_approval = demand_approval
        response_business_reviews = business_reviews
        response_timeline = timeline
        response_ai_interviews = ai_interviews
        response_dispositions = dispositions
        response_offers = offers
        if interviewer_only:
            response_demand_approval = {
                "status": demand_approval["status"],
                "submitted_by_name": None,
                "submitted_at": None,
                "reviewed_by_name": None,
                "reviewed_at": None,
                "reason": "",
                "history": [],
            }
            response_business_reviews = []
            response_timeline = []
            response_ai_interviews = []
            response_dispositions = []
            response_offers = []

        return jsonify({
            "candidate_id": candidate_id,
            "name_masked": cand.name_masked,
            "demand_id": demand.id,
            "job_id": job_id,
            "job_title": job.title if job else None,
            "demand_approval": response_demand_approval,
            "business_reviews": response_business_reviews,
            "timeline": response_timeline,
            "ai_interviews": response_ai_interviews,
            "interview_rounds": interview_rounds,
            "feedback": visible_feedback,
            "dispositions": response_dispositions,
            "offers": response_offers,
            "decision_summary": _decision_summary(
                response_timeline,
                response_ai_interviews,
                visible_feedback,
                response_dispositions,
            ),
        })
