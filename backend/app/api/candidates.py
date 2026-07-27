import csv
import io
import json
import re
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
    Event,
    Job,
    PipelineStage,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
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

bp = Blueprint("candidates", __name__)

COMMON_CITIES = [
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "成都",
    "武汉",
    "南京",
    "苏州",
    "西安",
    "长沙",
    "重庆",
    "天津",
    "厦门",
    "合肥",
    "郑州",
    "青岛",
    "宁波",
    "佛山",
    "东莞",
    "远程",
]
CITY_FIELD_KEYS = {
    "intent_city",
    "target_city",
    "expected_city",
    "preferred_city",
    "desired_city",
    "work_city",
    "city",
    "location",
    "意向城市",
    "目标城市",
    "期望城市",
    "求职城市",
    "工作城市",
    "所在城市",
    "城市",
}
CITY_LABEL_PATTERN = re.compile(
    rf"(?:意向城市|目标城市|期望城市|求职城市|工作城市|希望城市|投递城市|城市)"
    rf"\s*[：:：]?\s*({'|'.join(COMMON_CITIES)})市?"
)
POSITION_FIELD_KEYS = {
    "target_position",
    "desired_position",
    "target_role",
    "job_intention",
    "求职目标",
    "目标岗位",
    "意向岗位",
    "求职意向",
}


def _resume_info(candidate):
    return resume_info(candidate)


def _normalize_city_value(value):
    text = str(value or "").strip()
    if not text:
        return ""
    for city in COMMON_CITIES:
        if text == city or text == f"{city}市" or city in text:
            return city
    return ""


def _walk_resume_values(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield str(key), child
            yield from _walk_resume_values(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_resume_values(child)


def _candidate_search_blob(candidate):
    resume = candidate.resume_json if isinstance(candidate.resume_json, (dict, list)) else {}
    parts = [
        candidate.name_masked or "",
        candidate.email_masked or "",
        candidate.phone_masked or "",
        json.dumps(resume, ensure_ascii=False),
    ]
    parts.extend(tag.tag or "" for tag in candidate.tags)
    return "\n".join(parts).casefold()


def _candidate_intent_city(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return ""

    info = _resume_info(candidate)
    for key in CITY_FIELD_KEYS:
        city = _normalize_city_value(info.get(key))
        if city:
            return city

    for key, value in _walk_resume_values(info):
        if key in CITY_FIELD_KEYS:
            city = _normalize_city_value(value)
            if city:
                return city

    raw_text = json.dumps(resume, ensure_ascii=False)
    match = CITY_LABEL_PATTERN.search(raw_text)
    return _normalize_city_value(match.group(1)) if match else ""


def _candidate_desired_position(info):
    for key in POSITION_FIELD_KEYS:
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:120]
    for key, value in _walk_resume_values(info):
        if key in POSITION_FIELD_KEYS and isinstance(value, str) and value.strip():
            return value.strip()[:120]
    return ""


def _latest_experience(info):
    return latest_experience(info)


def _education_summary(info):
    return education_summary(info)


def _candidate_education_text(candidate):
    education = _resume_info(candidate).get("education") or []
    return json.dumps(education, ensure_ascii=False).casefold()


def _demand_summary(demand):
    if demand is None:
        return None
    return {
        "id": demand.id,
        "request_no": demand.request_no,
        "job_title": demand.job_title_snapshot
        or (demand.job.title if demand.job else ""),
    }


def _candidate_library_item(
    candidate,
    *,
    stage_context=None,
    favorite=False,
    demands_by_id=None,
):
    info = _resume_info(candidate)
    demands_by_id = demands_by_id or {}
    latest_demand_id = stage_context["demand_id"] if stage_context else None
    tags = sorted(
        [{"tag": t.tag, "score": t.score or 0} for t in candidate.tags if t.tag],
        key=lambda x: (-int(x["score"] or 0), x["tag"]),
    )
    return {
        "id": candidate.id,
        "name_masked": candidate.name_masked,
        "email_masked": candidate.email_masked,
        "phone_masked": candidate.phone_masked,
        "owner_hr_id": candidate.owner_hr_id,
        "current_demand_id": candidate.current_demand_id,
        "current_stage": stage_context["stage"] if stage_context else None,
        "latest_demand_id": latest_demand_id,
        "current_demand": _demand_summary(
            demands_by_id.get(candidate.current_demand_id)
        ),
        "latest_demand": _demand_summary(demands_by_id.get(latest_demand_id)),
        "is_favorite": favorite,
        "created_at": candidate.created_at.isoformat(),
        "parse_status": candidate.parse_status,
        "parse_error": candidate.parse_error,
        "tag_count": len(candidate.tags),
        "top_tags": tags[:6],
        "max_score": tags[0]["score"] if tags else 0,
        "intent_city": _candidate_intent_city(candidate),
        "desired_position": _candidate_desired_position(info),
        "latest_experience": _latest_experience(info),
        "education_summary": _education_summary(info),
        "source": _candidate_source_payload(candidate),
    }


def _candidate_stage_context_by_ids(candidate_ids, demand_id=None):
    candidate_ids = list(dict.fromkeys(candidate_ids))
    if not candidate_ids:
        return {}
    latest = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .filter(
            PipelineStage.org_id == g.org_id,
            PipelineStage.candidate_id.in_(candidate_ids),
        )
    )
    if demand_id is not None:
        latest = latest.filter(PipelineStage.demand_id == demand_id)
    latest = latest.group_by(PipelineStage.candidate_id).subquery()
    rows = (
        db.session.query(PipelineStage)
        .join(latest, PipelineStage.id == latest.c.max_id)
        .all()
    )
    return {
        row.candidate_id: {
            "stage": normalize_pipeline_stage(row.stage),
            "demand_id": row.demand_id,
        }
        for row in rows
    }


def _candidate_stage_context(candidates, demand_id=None):
    return _candidate_stage_context_by_ids(
        [candidate.id for candidate in candidates],
        demand_id=demand_id,
    )


def _candidate_favorite_ids(candidates):
    candidate_ids = [candidate.id for candidate in candidates]
    if not candidate_ids:
        return set()
    return {
        row[0]
        for row in db.session.query(CandidateFavorite.candidate_id).filter(
            CandidateFavorite.org_id == g.org_id,
            CandidateFavorite.user_id == g.user_id,
            CandidateFavorite.candidate_id.in_(candidate_ids),
        ).all()
    }


def _candidate_library_payload(candidates, demand_id=None):
    stages = _candidate_stage_context(candidates, demand_id=demand_id)
    favorites = _candidate_favorite_ids(candidates)
    demand_ids = {
        candidate.current_demand_id
        for candidate in candidates
        if candidate.current_demand_id is not None
    }
    demand_ids.update(
        context["demand_id"]
        for context in stages.values()
        if context.get("demand_id") is not None
    )
    demands_by_id = {
        demand.id: demand
        for demand in visible_demand_query(g.user_id, g.role, g.org_id)
        .filter(RecruitmentDemand.id.in_(demand_ids or [-1]))
        .all()
    }
    return [
        _candidate_library_item(
            candidate,
            stage_context=stages.get(candidate.id),
            favorite=candidate.id in favorites,
            demands_by_id=demands_by_id,
        )
        for candidate in candidates
    ]


def _export_count_for_actor(window=timedelta(minutes=10)):
    cutoff = utc_now() - window
    return Event.query.filter(
        Event.org_id == g.org_id,
        Event.actor_id == g.user_id,
        Event.action == "candidate.exported",
        Event.ts >= cutoff,
    ).count()


def _candidate_source_payload(candidate):
    if not candidate.upload_batch_id:
        return None
    batch = db.session.get(UploadBatch, candidate.upload_batch_id)
    if batch is None:
        return None
    target_job = db.session.get(Job, batch.target_job_id) if batch.target_job_id else None
    return {
        "batch_id": batch.id,
        "channel": normalize_resume_source_channel(batch.source_channel),
        "source_link": batch.source_link or "",
        "referrer": batch.referrer or "",
        "target_job_id": batch.target_job_id,
        "target_job_title": target_job.title if target_job else None,
        "target_job_city": target_job.city if target_job else "",
        "target_job_department": target_job.department if target_job else "",
        "note": batch.note or "",
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
    }


def _dedupe_non_empty(items, limit=5):
    result = []
    seen = set()
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        result.append(text)
        seen.add(text)
        if len(result) >= limit:
            break
    return result


def _decision_summary(timeline, ai_interviews, feedback, dispositions):
    scores = [float(item["score"]) for item in feedback if item.get("score") is not None]
    average_score = round(sum(scores) / len(scores), 1) if scores else None
    passed_count = sum(1 for item in feedback if item.get("passed") is True)
    failed_count = sum(1 for item in feedback if item.get("passed") is False)
    latest_stage = timeline[-1]["stage"] if timeline else None
    highlights = _dedupe_non_empty([item.get("strengths") for item in feedback])
    risks = _dedupe_non_empty(
        [item.get("concerns") for item in feedback] +
        [item.get("reason") for item in dispositions]
    )

    if latest_stage in ("offer", "onboarded"):
        recommendation = "建议发放 Offer" if latest_stage == "offer" else "已进入入职跟进"
    elif latest_stage == "rejected" or failed_count > 0:
        recommendation = "建议复核"
    elif average_score is not None and average_score >= 4 and failed_count == 0:
        recommendation = "建议推进"
    elif feedback:
        recommendation = "待补充判断"
    else:
        recommendation = "等待面试反馈"

    return {
        "current_stage": latest_stage,
        "feedback_count": len(feedback),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "average_score": average_score,
        "ai_interview_count": len(ai_interviews),
        "highlights": highlights,
        "risks": risks,
        "recommendation": recommendation,
    }


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
        return jsonify(_candidate_library_payload(query.all()))

    search = request.args.get("search", "").strip()
    stage = request.args.get("stage", "").strip()
    demand_id = request.args.get("demand_id", type=int)
    job_id = request.args.get("job_id", type=int)
    city = _normalize_city_value(request.args.get("city", "").strip())
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
        matching_ids = [c.id for c in query.all() if keyword in _candidate_search_blob(c)]
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

    if parse_status in {"pending", "processing", "ok", "failed"}:
        query = query.filter(Candidate.parse_status == parse_status)

    if pipeline_status in {"in_pipeline", "not_in_pipeline"}:
        active_flow_ids = select(CandidateDemandFlow.candidate_id).where(
            CandidateDemandFlow.org_id == g.org_id,
            CandidateDemandFlow.status == "active",
        )
        latest_by_demand = (
            db.session.query(
                PipelineStage.candidate_id.label("candidate_id"),
                PipelineStage.demand_id.label("demand_id"),
                func.max(PipelineStage.id).label("max_id"),
            )
            .filter(PipelineStage.org_id == g.org_id)
            .group_by(PipelineStage.candidate_id, PipelineStage.demand_id)
            .subquery()
        )
        legacy_active_ids = (
            select(PipelineStage.candidate_id)
            .join(latest_by_demand, PipelineStage.id == latest_by_demand.c.max_id)
            .where(PipelineStage.stage.notin_(("onboarded", "rejected", "transferred")))
        )
        active_condition = or_(
            Candidate.current_demand_id.isnot(None),
            Candidate.id.in_(active_flow_ids),
            Candidate.id.in_(legacy_active_ids),
        )
        if pipeline_status == "in_pipeline":
            query = query.filter(active_condition)
        else:
            latest_by_candidate = (
                db.session.query(
                    PipelineStage.candidate_id.label("candidate_id"),
                    func.max(PipelineStage.id).label("max_id"),
                )
                .filter(PipelineStage.org_id == g.org_id)
                .group_by(PipelineStage.candidate_id)
                .subquery()
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
            if education_term in _candidate_education_text(candidate)
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
        candidate_ids = [c.id for c in query.all() if _candidate_intent_city(c) == city]
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
        "candidates": _candidate_library_payload(
            candidates,
            demand_id=scope_demand.id if scope_demand is not None else None,
        ),
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    })


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
    demand_stages = _candidate_stage_context_by_ids(candidate_ids, demand_id=demand.id)
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
    if g.role == "interviewer":
        assigned = InterviewAssignment.query.filter_by(
            org_id=g.org_id,
            interviewer_id=g.user_id,
            candidate_id=candidate_id,
            demand_id=demand.id,
        ).filter(active_assignment_filter()).first()
        if assigned is None:
            return jsonify({"error": "Forbidden"}), 403
    elif not can_read_demand(g.user_id, g.role, g.org_id, demand):
        return jsonify({"error": "Forbidden"}), 403
    job = demand.job
    job_id = demand.job_id

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
        "id": f.id, "round": f.round, "score": f.score, "passed": f.passed,
        "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
        "reason_tags": f.reason_tags if isinstance(f.reason_tags, list) else [],
        "evaluation": f.evaluation_json or {},
        "interviewer_name": u.name if u else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    } for f, u in fb_rows]

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

    return jsonify({
        "candidate_id": candidate_id,
        "name_masked": cand.name_masked,
        "demand_id": demand.id,
        "job_id": job_id,
        "job_title": job.title if job else None,
        "timeline": timeline,
        "ai_interviews": ai_interviews,
        "feedback": feedback,
        "dispositions": dispositions,
        "decision_summary": _decision_summary(timeline, ai_interviews, feedback, dispositions),
    })


@bp.patch("/candidates/<int:candidate_id>/owner")
@require_auth
@require_role("manager", "admin")
def reassign_owner(candidate_id):
    data = request.get_json(silent=True) or {}
    new_owner = data.get("owner_hr_id")
    reason = str(data.get("reason") or "").strip()[:240]
    if not new_owner:
        return jsonify({"error": "owner_hr_id required"}), 400
    if not reason:
        return jsonify({"error": "转派原因必填"}), 400
    cand = db.session.get(Candidate, candidate_id)
    if cand is None or not same_org(cand, g.org_id) or cand.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    active_flow = CandidateDemandFlow.query.filter_by(
        org_id=g.org_id,
        candidate_id=candidate_id,
        status="active",
    ).order_by(CandidateDemandFlow.id.asc()).first()
    managed_demand_id = cand.current_demand_id or (
        active_flow.demand_id if active_flow is not None else None
    )
    if managed_demand_id is not None:
        return jsonify({
            "error": "进行中候选人的负责人跟随招聘需求，请在需求详情中转派",
            "code": "owner_managed_by_demand",
            "demand_id": managed_demand_id,
        }), 409
    target = db.session.get(User, new_owner)
    if target is None or not same_org(target, g.org_id):
        return jsonify({"error": "目标用户不存在"}), 404
    if target.role != "recruiter" or not target.is_active:
        return jsonify({"error": "候选人负责人必须是启用中的招聘专员"}), 400
    old_owner = cand.owner_hr_id
    cand.owner_hr_id = new_owner
    db.session.commit()
    record_event("candidate.reassigned", entity_id=candidate_id, entity_type="candidate",
                 payload={"from": old_owner, "to": new_owner, "reason": reason})
    return jsonify({"candidate_id": candidate_id, "owner_hr_id": new_owner, "reason": reason})


@bp.get("/candidates/<int:candidate_id>/export")
@require_auth
@require_role("recruiter", "manager", "admin")
def export_candidate(candidate_id):
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return jsonify({"error": "Forbidden"}), 403

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "candidate_id",
        "name",
        "email",
        "phone",
        "owner_hr_id",
        "created_at",
        "resume_json",
    ])
    writer.writerow([
        candidate.id,
        candidate.name_masked or "",
        candidate.email_masked or "",
        candidate.phone_masked or "",
        candidate.owner_hr_id or "",
        candidate.created_at.isoformat() if candidate.created_at else "",
        json.dumps(candidate.resume_json or {}, ensure_ascii=False),
    ])

    export_count_10m = _export_count_for_actor() + 1
    record_event(
        "candidate.exported",
        entity_id=candidate.id,
        entity_type="candidate",
        payload={"format": "csv", "export_count_10m": export_count_10m},
        severity="warning" if export_count_10m >= 6 else "info",
    )
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=candidate-{candidate.id}.csv"},
    )


@bp.delete("/candidates/<int:candidate_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def delete_candidate(candidate_id):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or "").strip()[:240]
    if not reason:
        return jsonify({"error": "删除原因必填"}), 400
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return jsonify({"error": "候选人不存在"}), 404
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return jsonify({"error": "Forbidden"}), 403

    raw_file_removed = False
    raw_path = candidate.raw_file_path
    if raw_path:
        try:
            path = resolve_stored_upload_path(
                raw_path,
                current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER,
            )
            if path.is_file():
                path.unlink()
                raw_file_removed = True
        except (OSError, RuntimePathError):
            raw_file_removed = False

    candidate.name_masked = "已删除候选人"
    candidate.email_masked = ""
    candidate.phone_masked = ""
    candidate.resume_json = {}
    candidate.raw_file_path = None
    candidate.parse_error = None
    candidate.deleted_at = utc_now()
    candidate.deleted_by = g.user_id
    candidate.anonymized_at = utc_now()
    for tag in candidate.tags:
        tag.tag = "已删除"
        tag.score = None
        tag.org_id = g.org_id
    db.session.commit()
    record_event(
        "candidate.deleted",
        entity_id=candidate_id,
        entity_type="candidate",
        payload={"reason": reason, "anonymized": True, "raw_file_removed": raw_file_removed},
    )
    return jsonify({"candidate_id": candidate_id, "deleted": True, "anonymized": True})
