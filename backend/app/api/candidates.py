from datetime import date, datetime, time, timedelta

from flask import Blueprint, jsonify, request, g
from sqlalchemy import func, select
from ..middleware.auth import require_auth
from .. import db
from ..models import (
    Candidate,
    CandidateFavorite,
    CandidateTag,
    PipelineStage,
    UploadBatch,
    VALID_STAGES,
)
from ..services.demand_context_service import (
    DemandContextError,
    can_read_demand,
    resolve_demand_context,
)
from ..services.candidate_library_read_service import (
    active_candidate_condition,
    candidate_education_text,
    candidate_intent_city,
    candidate_library_payload,
    candidate_search_blob,
    latest_candidate_stage_subquery,
    normalize_city_value,
)
from ..source_channels import resume_source_channel_filter_values
from .pipeline import LEGACY_INTERVIEW_STAGES, _latest_stage_subquery
from .access import visible_candidate_query

bp = Blueprint("candidates", __name__)

TERMINAL_PIPELINE_STATES = {"rejected", "onboarded", "transferred"}


def _parse_candidate_date_arg(name):
    raw = request.args.get(name, "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise ValueError(f"{name} 必须使用 YYYY-MM-DD 格式") from error


@bp.get("/candidates")
@require_auth
def list_candidates():
    wants_paginated = any(
        key in request.args
        for key in (
            "search",
            "stage",
            "job_id",
            "demand_id",
            "city",
            "source_channel",
            "parse_status",
            "pipeline_status",
            "created_from",
            "created_to",
            "favorite",
            "education",
            "skill",
            "min_score",
            "sort_by",
            "sort_order",
            "page",
            "per_page",
        )
    )

    query = visible_candidate_query(g.user_id, g.role)

    if not wants_paginated:
        return jsonify(candidate_library_payload(query.all()))

    search = request.args.get("search", "").strip()
    stage = request.args.get("stage", "").strip()
    demand_id = request.args.get("demand_id", type=int)
    job_id = request.args.get("job_id", type=int)
    city = normalize_city_value(request.args.get("city", "").strip())
    source_channel = request.args.get("source_channel", "").strip()
    parse_status = request.args.get("parse_status", "").strip()
    pipeline_status = request.args.get("pipeline_status", "").strip()
    favorite = request.args.get("favorite", "").strip().lower()
    education = request.args.get("education", "").strip()
    skill = request.args.get("skill", "").strip()
    min_score = request.args.get("min_score", type=int)
    sort_by = request.args.get("sort_by", "created_at")
    sort_order = request.args.get("sort_order", "desc")
    page = max(1, request.args.get("page", 1, type=int) or 1)
    per_page = min(max(1, request.args.get("per_page", 20, type=int) or 20), 100)

    try:
        created_from = _parse_candidate_date_arg("created_from")
        created_to = _parse_candidate_date_arg("created_to")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    if created_from and created_to and created_from > created_to:
        return jsonify({"error": "入库开始日期不能晚于结束日期"}), 400
    if created_from:
        query = query.filter(
            Candidate.created_at >= datetime.combine(created_from, time.min)
        )
    if created_to:
        query = query.filter(
            Candidate.created_at
            < datetime.combine(created_to + timedelta(days=1), time.min)
        )

    scope_demand = None
    if demand_id or job_id:
        try:
            scope_demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=demand_id,
                job_id=job_id,
            )
        except DemandContextError as error:
            return jsonify(error.as_payload()), error.status_code
        if not can_read_demand(g.user_id, g.role, g.org_id, scope_demand):
            return jsonify({"error": "Forbidden", "code": "forbidden"}), 403
        demand_candidates = select(PipelineStage.candidate_id).where(
            PipelineStage.org_id == g.org_id,
            PipelineStage.demand_id == scope_demand.id,
        )
        query = query.filter(Candidate.id.in_(demand_candidates))

    if search:
        keyword = search.casefold()
        matching_ids = [c.id for c in query.all() if keyword in candidate_search_blob(c)]
        query = query.filter(Candidate.id.in_(matching_ids or [-1]))

    if stage and stage in VALID_STAGES:
        if scope_demand is not None:
            latest = (
                db.session.query(
                    PipelineStage.candidate_id.label("candidate_id"),
                    func.max(PipelineStage.id).label("max_id"),
                )
                .filter(
                    PipelineStage.org_id == g.org_id,
                    PipelineStage.demand_id == scope_demand.id,
                )
                .group_by(PipelineStage.candidate_id)
                .subquery()
            )
        else:
            latest = _latest_stage_subquery()
        matching_stages = [stage]
        if stage == "interview":
            matching_stages += list(LEGACY_INTERVIEW_STAGES)
        stage_subquery = (
            select(PipelineStage.candidate_id)
            .join(latest, PipelineStage.id == latest.c.max_id)
            .where(PipelineStage.stage.in_(matching_stages))
        )
        query = query.filter(Candidate.id.in_(stage_subquery))

    if source_channel:
        channel_values = resume_source_channel_filter_values(source_channel)
        query = (
            query.join(UploadBatch, Candidate.upload_batch_id == UploadBatch.id)
            .filter(UploadBatch.source_channel.in_(channel_values or [source_channel]))
        )

    if parse_status in {"pending", "processing", "ok", "failed", "original_confirmed"}:
        query = query.filter(Candidate.parse_status == parse_status)

    if pipeline_status in {
        "in_pipeline",
        "not_in_pipeline",
        "never_entered",
        "rejected",
        "onboarded",
        "transferred",
    }:
        active_condition = active_candidate_condition(
            demand_id=scope_demand.id if scope_demand is not None else None
        )
        if pipeline_status == "in_pipeline":
            query = query.filter(active_condition)
        elif pipeline_status == "never_entered":
            any_history = select(PipelineStage.candidate_id).where(
                PipelineStage.org_id == g.org_id
            )
            if scope_demand is not None:
                any_history = any_history.where(
                    PipelineStage.demand_id == scope_demand.id
                )
            query = query.filter(
                ~active_condition,
                ~Candidate.id.in_(any_history),
            )
        elif pipeline_status in TERMINAL_PIPELINE_STATES:
            latest_by_candidate = latest_candidate_stage_subquery(
                demand_id=scope_demand.id if scope_demand is not None else None
            )
            latest_stage_ids = (
                select(PipelineStage.candidate_id)
                .join(
                    latest_by_candidate,
                    PipelineStage.id == latest_by_candidate.c.max_id,
                )
            )
            query = query.filter(
                ~active_condition,
                Candidate.id.in_(
                    latest_stage_ids.where(
                        PipelineStage.stage == pipeline_status
                    )
                ),
            )
        else:
            latest_by_candidate = latest_candidate_stage_subquery(
                demand_id=scope_demand.id if scope_demand is not None else None
            )
            unavailable_talent_ids = (
                select(PipelineStage.candidate_id)
                .join(latest_by_candidate, PipelineStage.id == latest_by_candidate.c.max_id)
                .where(PipelineStage.stage.in_(("onboarded", "transferred")))
            )
            query = query.filter(
                ~active_condition,
                ~Candidate.id.in_(unavailable_talent_ids),
            )

    if favorite in {"true", "1"}:
        favorite_ids = select(CandidateFavorite.candidate_id).where(
            CandidateFavorite.org_id == g.org_id,
            CandidateFavorite.user_id == g.user_id,
        )
        query = query.filter(Candidate.id.in_(favorite_ids))

    if education:
        education_term = education.casefold()
        candidate_ids = [
            candidate.id
            for candidate in query.all()
            if education_term in candidate_education_text(candidate)
        ]
        query = query.filter(Candidate.id.in_(candidate_ids or [-1]))

    if skill:
        skill_term = skill.casefold()
        tagged_candidates = select(CandidateTag.candidate_id).where(
            func.lower(func.coalesce(CandidateTag.tag, "")).contains(
                skill_term,
                autoescape=True,
            )
        )
        query = query.filter(Candidate.id.in_(tagged_candidates))

    if min_score is not None and min_score > 0:
        scored_candidates = select(CandidateTag.candidate_id).where(
            CandidateTag.score >= min_score
        )
        query = query.filter(Candidate.id.in_(scored_candidates))

    if city:
        candidate_ids = [c.id for c in query.all() if candidate_intent_city(c) == city]
        query = query.filter(Candidate.id.in_(candidate_ids or [-1]))

    sort_column = Candidate.created_at
    if sort_by == "name_masked":
        sort_column = Candidate.name_masked
    if sort_order == "asc":
        query = query.order_by(sort_column.asc(), Candidate.id.asc())
    else:
        query = query.order_by(sort_column.desc(), Candidate.id.desc())

    total = query.count()
    candidates = query.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "candidates": candidate_library_payload(
            candidates,
            demand_id=scope_demand.id if scope_demand is not None else None,
        ),
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    })


from .candidate_admin import register_candidate_admin_routes
from .candidate_actions import register_candidate_action_routes
from .candidate_journey import register_candidate_journey_routes

register_candidate_admin_routes(bp)
register_candidate_action_routes(bp)
register_candidate_journey_routes(bp)
