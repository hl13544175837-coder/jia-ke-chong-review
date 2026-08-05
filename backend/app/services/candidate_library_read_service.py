"""Candidate-library read models shared by candidate API route groups."""

import json
import re
import unicodedata
from datetime import timedelta

from flask import current_app, g
from sqlalchemy import func, or_, select

from .. import db
from ..models import (
    Candidate,
    CandidateDemandFlow,
    CandidateFavorite,
    Event,
    Job,
    PipelineStage,
    RecruitmentDemand,
    UploadBatch,
)
from ..source_channels import normalize_resume_source_channel
from ..time_utils import utc_now
from .candidate_library_service import education_summary, latest_experience, resume_info
from .demand_context_service import visible_demand_query
from .pipeline_service import normalize_pipeline_stage


TERMINAL_PIPELINE_STATES = {"rejected", "onboarded", "transferred"}


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


def normalize_city_value(value):
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


def candidate_search_blob(candidate):
    resume = candidate.resume_json if isinstance(candidate.resume_json, (dict, list)) else {}
    parts = [
        candidate.name_masked or "",
        candidate.email_masked or "",
        candidate.phone_masked or "",
        json.dumps(resume, ensure_ascii=False),
    ]
    parts.extend(tag.tag or "" for tag in candidate.tags)
    return "\n".join(parts).casefold()


def candidate_intent_city(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return ""

    info = _resume_info(candidate)
    for key in CITY_FIELD_KEYS:
        city = normalize_city_value(info.get(key))
        if city:
            return city

    for key, value in _walk_resume_values(info):
        if key in CITY_FIELD_KEYS:
            city = normalize_city_value(value)
            if city:
                return city

    raw_text = json.dumps(resume, ensure_ascii=False)
    match = CITY_LABEL_PATTERN.search(raw_text)
    return normalize_city_value(match.group(1)) if match else ""


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


def candidate_education_text(candidate):
    education = _resume_info(candidate).get("education") or []
    return json.dumps(education, ensure_ascii=False).casefold()


def demand_summary(demand):
    if demand is None:
        return None
    return {
        "id": demand.id,
        "request_no": demand.request_no,
        "job_title": demand.job_title_snapshot
        or (demand.job.title if demand.job else ""),
    }


def public_parse_error(candidate):
    error = str(candidate.parse_error or "")
    if candidate.parse_status in {"pending", "processing"} and error.startswith(
        ("queued:", "worker:")
    ):
        return None
    return candidate.parse_error


def _candidate_library_item(
    candidate,
    *,
    stage_context=None,
    pipeline_fact=None,
    favorite=False,
    demands_by_id=None,
    data_hygiene=None,
):
    info = _resume_info(candidate)
    demands_by_id = demands_by_id or {}
    data_hygiene = data_hygiene or {
        "identical_resume_count": 0,
        "same_name_count": 0,
        "is_local_demo_record": False,
    }
    latest_demand_id = stage_context["demand_id"] if stage_context else None
    pipeline_fact = pipeline_fact or {
        "pipeline_state": "never_entered",
        "has_rejected_history": False,
    }
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
        "pipeline_state": pipeline_fact["pipeline_state"],
        "has_rejected_history": pipeline_fact["has_rejected_history"],
        "latest_demand_id": latest_demand_id,
        "current_demand": demand_summary(
            demands_by_id.get(candidate.current_demand_id)
        ),
        "latest_demand": demand_summary(demands_by_id.get(latest_demand_id)),
        "is_favorite": favorite,
        "created_at": candidate.created_at.isoformat(),
        "parse_status": candidate.parse_status,
        "parse_error": public_parse_error(candidate),
        "tag_count": len(candidate.tags),
        "top_tags": tags[:6],
        "max_score": tags[0]["score"] if tags else 0,
        "intent_city": candidate_intent_city(candidate),
        "desired_position": _candidate_desired_position(info),
        "latest_experience": _latest_experience(info),
        "education_summary": _education_summary(info),
        "source": candidate_source_payload(candidate),
        **data_hygiene,
    }


def candidate_stage_context_by_ids(candidate_ids, demand_id=None):
    candidate_ids = list(dict.fromkeys(candidate_ids))
    if not candidate_ids:
        return {}
    stage_query = db.session.query(PipelineStage).filter(
        PipelineStage.org_id == g.org_id,
        PipelineStage.candidate_id.in_(candidate_ids),
    )
    if demand_id is not None:
        stage_query = stage_query.filter(PipelineStage.demand_id == demand_id)
    rows = stage_query.order_by(PipelineStage.id.desc()).all()

    if demand_id is not None:
        contexts = {}
        for row in rows:
            contexts.setdefault(row.candidate_id, {
                "stage": normalize_pipeline_stage(row.stage),
                "demand_id": row.demand_id,
            })
        return contexts

    target_demand_by_candidate = {
        candidate_id: current_demand_id
        for candidate_id, current_demand_id in (
            db.session.query(Candidate.id, Candidate.current_demand_id)
            .filter(Candidate.id.in_(candidate_ids))
            .all()
        )
        if current_demand_id is not None
    }
    active_flow_rows = (
        db.session.query(
            CandidateDemandFlow.candidate_id,
            CandidateDemandFlow.demand_id,
        )
        .filter(
            CandidateDemandFlow.org_id == g.org_id,
            CandidateDemandFlow.candidate_id.in_(candidate_ids),
            CandidateDemandFlow.status == "active",
        )
        .order_by(CandidateDemandFlow.updated_at.desc(), CandidateDemandFlow.id.desc())
        .all()
    )
    for candidate_id, active_demand_id in active_flow_rows:
        target_demand_by_candidate.setdefault(candidate_id, active_demand_id)

    latest_context = {}
    active_context = {}
    for row in rows:
        context = {
            "stage": normalize_pipeline_stage(row.stage),
            "demand_id": row.demand_id,
        }
        latest_context.setdefault(row.candidate_id, context)
        if (
            row.candidate_id not in active_context
            and row.demand_id == target_demand_by_candidate.get(row.candidate_id)
        ):
            active_context[row.candidate_id] = context

    return {
        candidate_id: active_context.get(candidate_id, latest_context[candidate_id])
        for candidate_id in latest_context
    }


def _candidate_stage_context(candidates, demand_id=None):
    return candidate_stage_context_by_ids(
        [candidate.id for candidate in candidates],
        demand_id=demand_id,
    )


def active_candidate_condition(demand_id=None):
    active_flows = select(CandidateDemandFlow.candidate_id).where(
        CandidateDemandFlow.org_id == g.org_id,
        CandidateDemandFlow.status == "active",
    )
    if demand_id is not None:
        active_flows = active_flows.where(CandidateDemandFlow.demand_id == demand_id)

    latest_by_demand = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            PipelineStage.demand_id.label("demand_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .filter(PipelineStage.org_id == g.org_id)
    )
    if demand_id is not None:
        latest_by_demand = latest_by_demand.filter(
            PipelineStage.demand_id == demand_id
        )
    latest_by_demand = latest_by_demand.group_by(
        PipelineStage.candidate_id,
        PipelineStage.demand_id,
    ).subquery()
    legacy_active_ids = (
        select(PipelineStage.candidate_id)
        .join(latest_by_demand, PipelineStage.id == latest_by_demand.c.max_id)
        .where(PipelineStage.stage.notin_(TERMINAL_PIPELINE_STATES))
    )
    current_demand_condition = (
        Candidate.current_demand_id == demand_id
        if demand_id is not None
        else Candidate.current_demand_id.isnot(None)
    )
    return or_(
        current_demand_condition,
        Candidate.id.in_(active_flows),
        Candidate.id.in_(legacy_active_ids),
    )


def latest_candidate_stage_subquery(demand_id=None):
    latest = (
        db.session.query(
            PipelineStage.candidate_id.label("candidate_id"),
            func.max(PipelineStage.id).label("max_id"),
        )
        .filter(PipelineStage.org_id == g.org_id)
    )
    if demand_id is not None:
        latest = latest.filter(PipelineStage.demand_id == demand_id)
    return latest.group_by(PipelineStage.candidate_id).subquery()


def _candidate_pipeline_facts(candidates, stages, demand_id=None):
    candidate_ids = [candidate.id for candidate in candidates]
    if not candidate_ids:
        return {}
    active_ids = {
        row[0]
        for row in (
            db.session.query(Candidate.id)
            .filter(
                Candidate.id.in_(candidate_ids),
                active_candidate_condition(demand_id=demand_id),
            )
            .all()
        )
    }
    rejected_query = db.session.query(PipelineStage.candidate_id).filter(
        PipelineStage.org_id == g.org_id,
        PipelineStage.candidate_id.in_(candidate_ids),
        PipelineStage.stage == "rejected",
    )
    if demand_id is not None:
        rejected_query = rejected_query.filter(PipelineStage.demand_id == demand_id)
    rejected_ids = {row[0] for row in rejected_query.distinct().all()}

    facts = {}
    for candidate_id in candidate_ids:
        latest_stage = (stages.get(candidate_id) or {}).get("stage")
        if candidate_id in active_ids:
            pipeline_state = "in_pipeline"
        elif latest_stage in TERMINAL_PIPELINE_STATES:
            pipeline_state = latest_stage
        else:
            pipeline_state = "never_entered"
        facts[candidate_id] = {
            "pipeline_state": pipeline_state,
            "has_rejected_history": candidate_id in rejected_ids,
        }
    return facts


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


LOCAL_DEMO_NAME_PREFIXES = (
    "验收候选人-",
    "面试演示-",
    "需求演示-",
    "Offer演示-",
)


def _normalized_candidate_name(value):
    text = unicodedata.normalize("NFKC", str(value or ""))
    return re.sub(r"\s+", "", text).casefold()


def _is_local_demo_candidate_name(value):
    if not current_app.config.get("LOCAL_SCHEMA_COMPAT", False):
        return False
    text = str(value or "").strip()
    return bool(re.fullmatch(r"候选人[0-9]{3}", text)) or text.startswith(
        LOCAL_DEMO_NAME_PREFIXES
    )


def _candidate_data_hygiene_by_id():
    rows = (
        db.session.query(
            Candidate.id,
            Candidate.name_masked,
            Candidate.resume_sha256,
        )
        .filter(
            Candidate.org_id == g.org_id,
            Candidate.deleted_at.is_(None),
        )
        .all()
    )
    resume_counts = {}
    name_counts = {}
    normalized_rows = []
    for candidate_id, name_masked, resume_sha256 in rows:
        resume_key = str(resume_sha256 or "").strip()
        name_key = _normalized_candidate_name(name_masked)
        normalized_rows.append((candidate_id, name_masked, resume_key, name_key))
        if resume_key:
            resume_counts[resume_key] = resume_counts.get(resume_key, 0) + 1
        if name_key:
            name_counts[name_key] = name_counts.get(name_key, 0) + 1

    return {
        candidate_id: {
            "identical_resume_count": resume_counts.get(resume_key, 0) if resume_key else 0,
            "same_name_count": name_counts.get(name_key, 0) if name_key else 0,
            "is_local_demo_record": _is_local_demo_candidate_name(name_masked),
        }
        for candidate_id, name_masked, resume_key, name_key in normalized_rows
    }


def candidate_library_payload(candidates, demand_id=None):
    stages = _candidate_stage_context(candidates, demand_id=demand_id)
    pipeline_facts = _candidate_pipeline_facts(
        candidates,
        stages,
        demand_id=demand_id,
    )
    favorites = _candidate_favorite_ids(candidates)
    data_hygiene_by_id = _candidate_data_hygiene_by_id()
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
            pipeline_fact=pipeline_facts.get(candidate.id),
            favorite=candidate.id in favorites,
            demands_by_id=demands_by_id,
            data_hygiene=data_hygiene_by_id.get(candidate.id),
        )
        for candidate in candidates
    ]


def export_count_for_actor(*, org_id, user_id, window=timedelta(minutes=10)):
    cutoff = utc_now() - window
    return Event.query.filter(
        Event.org_id == org_id,
        Event.actor_id == user_id,
        Event.action == "candidate.exported",
        Event.ts >= cutoff,
    ).count()


def candidate_source_payload(candidate):
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


def decision_summary(timeline, ai_interviews, feedback, dispositions):
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

