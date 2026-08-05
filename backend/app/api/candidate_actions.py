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
from ..services.candidate_library_read_service import candidate_stage_context_by_ids
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


def register_candidate_action_routes(bp):
    def _candidate_ids_from_payload(data, *, limit=100):
        raw_ids = data.get("candidate_ids")
        if not isinstance(raw_ids, list):
            return None, (jsonify({"error": "candidate_ids required", "code": "candidate_ids_required"}), 400)
        candidate_ids = []
        seen = set()
        for raw_id in raw_ids:
            try:
                candidate_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if candidate_id > 0 and candidate_id not in seen:
                candidate_ids.append(candidate_id)
                seen.add(candidate_id)
        if not candidate_ids:
            return None, (jsonify({"error": "candidate_ids required", "code": "candidate_ids_required"}), 400)
        if len(candidate_ids) > limit:
            return None, (jsonify({"error": f"单次最多处理 {limit} 位候选人", "code": "candidate_batch_too_large"}), 400)
        return candidate_ids, None


    @bp.post("/candidates/favorites/set")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def set_favorites():
        data = request.get_json(silent=True) or {}
        candidate_ids, error = _candidate_ids_from_payload(data)
        if error:
            return error
        favorite = data.get("favorite")
        if not isinstance(favorite, bool):
            return jsonify({"error": "favorite must be boolean", "code": "invalid_favorite_value"}), 400

        visible_ids = {
            row[0]
            for row in visible_candidate_query(g.user_id, g.role)
            .with_entities(Candidate.id)
            .filter(Candidate.id.in_(candidate_ids))
            .all()
        }
        if visible_ids != set(candidate_ids):
            return jsonify({"error": "候选人不存在或无权操作", "code": "candidate_not_found"}), 404

        changed = set_candidate_favorites(
            org_id=g.org_id,
            user_id=g.user_id,
            candidate_ids=candidate_ids,
            favorite=favorite,
        )
        record_event(
            "candidate.favorite.updated",
            entity_type="candidate",
            payload={"candidate_ids": candidate_ids, "favorite": favorite, "changed": changed},
        )
        return jsonify({
            "candidate_ids": candidate_ids,
            "favorite": favorite,
            "changed": changed,
        })


    @bp.get("/candidates/duplicates/get")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def candidate_duplicates():
        candidates = visible_candidate_query(g.user_id, g.role).order_by(Candidate.created_at.asc()).all()
        groups = find_duplicate_groups(candidates, g.role)
        return jsonify({"groups": groups, "total_groups": len(groups)})


    @bp.post("/candidates/duplicates/merge")
    @require_auth
    @require_role("manager", "admin")
    def merge_duplicate_candidates():
        data = request.get_json(silent=True) or {}
        try:
            primary_candidate_id = int(data.get("primary_candidate_id") or 0)
        except (TypeError, ValueError):
            primary_candidate_id = 0
        duplicate_candidate_ids, error = _candidate_ids_from_payload(
            {"candidate_ids": data.get("duplicate_candidate_ids")},
            limit=20,
        )
        if error:
            return error
        if primary_candidate_id <= 0 or primary_candidate_id in duplicate_candidate_ids:
            return jsonify({"error": "主档候选人无效", "code": "invalid_primary_candidate"}), 400
        try:
            result = merge_candidates(
                org_id=g.org_id,
                actor_id=g.user_id,
                primary_candidate_id=primary_candidate_id,
                duplicate_candidate_ids=duplicate_candidate_ids,
                reason=data.get("reason"),
            )
        except CandidateLibraryError as error:
            return jsonify({"error": error.message, "code": error.code}), error.status_code
        record_event(
            "candidate.duplicates.merged",
            entity_id=primary_candidate_id,
            entity_type="candidate",
            payload=result,
            severity="warning",
        )
        return jsonify(result)


    @bp.post("/candidates/pipeline/add")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def add_candidates_to_pipeline():
        data = request.get_json(silent=True) or {}
        candidate_ids, error = _candidate_ids_from_payload(data)
        if error:
            return error
        try:
            demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=data.get("demand_id"),
                open_only=True,
            )
        except DemandContextError as error:
            return jsonify(error.as_payload()), error.status_code
        if not can_manage_demand(g.user_id, g.role, g.org_id, demand):
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

        visible_ids = {
            row[0]
            for row in visible_candidate_query(g.user_id, g.role)
            .with_entities(Candidate.id)
            .filter(Candidate.id.in_(candidate_ids))
            .all()
        }
        try:
            result = add_candidates_to_demand(
                demand=demand,
                candidate_ids=candidate_ids,
                visible_candidate_ids=visible_ids,
                org_id=g.org_id,
                actor_id=g.user_id,
                reactivate_rejected=data.get("reactivate_rejected") is True,
                reason=data.get("reason"),
            )
        except CandidateLibraryError as error:
            return jsonify({"error": error.message, "code": error.code}), error.status_code
        record_event(
            "pipeline.batch_add",
            entity_id=demand.id,
            entity_type="recruitment_demand",
            demand_id=demand.id,
            payload=result,
        )
        return jsonify(result)


    @bp.post("/candidates/match/preview")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def preview_candidate_matches():
        data = request.get_json(silent=True) or {}
        candidate_ids, error = _candidate_ids_from_payload(data)
        if error:
            return error
        try:
            demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=data.get("demand_id"),
                open_only=True,
            )
        except DemandContextError as error:
            return jsonify(error.as_payload()), error.status_code
        if not can_read_demand(g.user_id, g.role, g.org_id, demand):
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403

        candidate_query = visible_candidate_query(g.user_id, g.role).filter(
            Candidate.id.in_(candidate_ids)
        )
        visible_count = candidate_query.count()
        if visible_count != len(candidate_ids):
            return jsonify({"error": "候选人不存在或无权查看", "code": "candidate_not_found"}), 404
        match_service = MatchService()
        configuration = match_service.configuration_for_job(demand.job_id)
        results = match_service.rank_for_job_readonly(
            demand.job_id,
            top_n=len(candidate_ids),
            candidate_query=candidate_query,
        )
        demand_stages = candidate_stage_context_by_ids(candidate_ids, demand_id=demand.id)
        for item in results:
            context = demand_stages.get(item["candidate_id"])
            item["latest_stage"] = context["stage"] if context else None
        return jsonify({
            "demand_id": demand.id,
            "job_id": demand.job_id,
            **configuration,
            "results": results,
        })


    @bp.get("/candidates/owner-options")
    @require_auth
    @require_role("recruiter", "manager", "admin", "interviewer")
    def candidate_owner_options():
        query = (
            User.query
            .filter(User.org_id == g.org_id, User.role == "recruiter", User.is_active.is_(True))
        )
        if g.role == "recruiter":
            query = query.filter(User.id == g.user_id)
        recruiters = query.order_by(User.name.asc(), User.id.asc()).all()
        return jsonify([
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
            }
            for user in recruiters
        ])
