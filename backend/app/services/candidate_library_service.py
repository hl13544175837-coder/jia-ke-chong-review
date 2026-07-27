import copy
import json
import re

from .. import db
from ..models import (
    BusinessReviewTask,
    Candidate,
    CandidateDemandFlow,
    CandidateDisposition,
    CandidateFavorite,
    CandidateMerge,
    CandidateTag,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    Match,
    OfferRecord,
    PipelineStage,
)
from ..time_utils import utc_now
from .pipeline_service import PipelineServiceError, demand_completion_state, move_candidate


PROFILE_SCALAR_FIELDS = (
    "name",
    "email",
    "phone",
    "summary",
    "intent_city",
    "target_position",
    "desired_position",
    "target_role",
    "job_intention",
    "additional_info",
)
PROFILE_LIST_FIELDS = (
    "education",
    "experience",
    "projects",
    "certifications",
    "languages",
)


class CandidateLibraryError(Exception):
    def __init__(self, message, status_code=400, code="candidate_library_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def resume_info(candidate):
    resume = candidate.resume_json or {}
    if not isinstance(resume, dict):
        return {}

    info = {
        key: copy.deepcopy(resume[key])
        for key in (*PROFILE_SCALAR_FIELDS, *PROFILE_LIST_FIELDS)
        if key in resume and resume[key] not in (None, "", [])
    }
    extracted = resume.get("extracted_info")
    if isinstance(extracted, dict):
        for key, value in extracted.items():
            if value not in (None, "", []):
                info[key] = copy.deepcopy(value)
    return info


def education_summary(info):
    education = info.get("education") or []
    if not isinstance(education, list) or not education:
        return ""
    raw = education[0]
    if not isinstance(raw, dict):
        return str(raw or "").strip()[:240]
    parts = [
        raw.get("school") or raw.get("school_name") or raw.get("institution") or raw.get("院校"),
        raw.get("degree") or raw.get("education") or raw.get("学历"),
        raw.get("major") or raw.get("专业"),
    ]
    return " · ".join(str(item).strip() for item in parts if str(item or "").strip())[:240]


def latest_experience(info):
    experiences = info.get("experience") or []
    if not isinstance(experiences, list) or not experiences:
        return None
    raw = experiences[0]
    if not isinstance(raw, dict):
        return None
    return {
        "company": str(raw.get("company") or raw.get("公司") or "")[:120],
        "position": str(raw.get("position") or raw.get("title") or raw.get("职位") or "")[:120],
        "duration": str(raw.get("duration") or raw.get("years") or raw.get("时间") or "")[:80],
    }


def candidate_identity_keys(candidate):
    info = resume_info(candidate)
    email_values = {candidate.email_masked, info.get("email")}
    phone_values = {candidate.phone_masked, info.get("phone")}
    keys = set()
    for raw in email_values:
        value = str(raw or "").strip().casefold()
        if "@" in value and "*" not in value:
            keys.add(("email", value))
    for raw in phone_values:
        text = str(raw or "").strip()
        if "*" in text:
            continue
        value = re.sub(r"\D", "", text)
        if len(value) >= 7:
            keys.add(("phone", value))
    return keys


BUSINESS_HISTORY_MODELS = (
    BusinessReviewTask,
    CandidateDemandFlow,
    PipelineStage,
    Interview,
    CandidateDisposition,
    OfferRecord,
    InterviewAssignment,
    InterviewFeedback,
)


def candidate_ids_with_business_history(candidate_ids):
    normalized_ids = {int(candidate_id) for candidate_id in candidate_ids}
    if not normalized_ids:
        return set()
    result = set()
    for model in BUSINESS_HISTORY_MODELS:
        result.update(
            row[0]
            for row in db.session.query(model.candidate_id)
            .filter(model.candidate_id.in_(normalized_ids))
            .distinct()
            .all()
        )
    return result


def find_duplicate_groups(candidates, actor_role):
    by_id = {candidate.id: candidate for candidate in candidates}
    candidate_ids_by_key = {}
    for candidate in candidates:
        for key in candidate_identity_keys(candidate):
            candidate_ids_by_key.setdefault(key, set()).add(candidate.id)

    bases_by_members = {}
    for (kind, _value), member_ids in candidate_ids_by_key.items():
        if len(member_ids) < 2:
            continue
        bases_by_members.setdefault(frozenset(member_ids), set()).add(kind)

    history_candidate_ids = candidate_ids_with_business_history(by_id)
    history_flags = {
        candidate_id: candidate_id in history_candidate_ids
        for candidate_id in by_id
    }

    groups = []
    for member_ids, shared_types in bases_by_members.items():
        ordered = sorted(member_ids, key=lambda item: (by_id[item].created_at, item))
        groups.append({
            "key": "-".join(str(candidate_id) for candidate_id in ordered),
            "match_basis": [
                label
                for key, label in (("phone", "手机号一致"), ("email", "邮箱一致"))
                if key in shared_types
            ],
            "can_merge": actor_role in {"manager", "admin"}
            and sum(1 for candidate_id in member_ids if history_flags[candidate_id]) <= 1,
            "candidates": [
                {
                    "id": candidate_id,
                    "name_masked": by_id[candidate_id].name_masked or "未命名候选人",
                    "email_masked": by_id[candidate_id].email_masked or "",
                    "phone_masked": by_id[candidate_id].phone_masked or "",
                    "education_summary": education_summary(resume_info(by_id[candidate_id])),
                    "created_at": by_id[candidate_id].created_at.isoformat(),
                    "has_business_history": history_flags[candidate_id],
                }
                for candidate_id in ordered
            ],
        })
    return sorted(groups, key=lambda group: group["key"])


def set_candidate_favorites(*, org_id, user_id, candidate_ids, favorite):
    existing = {
        row.candidate_id: row
        for row in CandidateFavorite.query.filter(
            CandidateFavorite.org_id == org_id,
            CandidateFavorite.user_id == user_id,
            CandidateFavorite.candidate_id.in_(candidate_ids),
        ).all()
    }
    changed = 0
    for candidate_id in candidate_ids:
        row = existing.get(candidate_id)
        if favorite and row is None:
            db.session.add(CandidateFavorite(
                org_id=org_id,
                user_id=user_id,
                candidate_id=candidate_id,
            ))
            changed += 1
        elif not favorite and row is not None:
            db.session.delete(row)
            changed += 1
    db.session.flush()
    return changed


def _merge_profile(primary, duplicate):
    primary_info = resume_info(primary)
    duplicate_info = resume_info(duplicate)
    merged_info = copy.deepcopy(primary_info)
    for field in PROFILE_SCALAR_FIELDS:
        if not merged_info.get(field) and duplicate_info.get(field):
            merged_info[field] = copy.deepcopy(duplicate_info[field])
    for field in PROFILE_LIST_FIELDS:
        current = merged_info.get(field)
        current_items = copy.deepcopy(current) if isinstance(current, list) else []
        seen = {json.dumps(item, ensure_ascii=False, sort_keys=True) for item in current_items}
        duplicate_items = duplicate_info.get(field)
        if isinstance(duplicate_items, list):
            for item in duplicate_items:
                fingerprint = json.dumps(item, ensure_ascii=False, sort_keys=True)
                if fingerprint not in seen:
                    current_items.append(copy.deepcopy(item))
                    seen.add(fingerprint)
        if current_items:
            merged_info[field] = current_items

    primary_resume = copy.deepcopy(primary.resume_json) if isinstance(primary.resume_json, dict) else {}
    primary_resume["extracted_info"] = merged_info
    duplicate_resume = duplicate.resume_json if isinstance(duplicate.resume_json, dict) else {}
    if not primary_resume.get("skills") and duplicate_resume.get("skills"):
        primary_resume["skills"] = copy.deepcopy(duplicate_resume["skills"])
    primary.resume_json = primary_resume


def _merge_tags(primary, duplicate):
    primary_tags = {tag.tag.casefold(): tag for tag in primary.tags if tag.tag}
    for duplicate_tag in list(duplicate.tags):
        key = duplicate_tag.tag.casefold()
        current = primary_tags.get(key)
        if current is None:
            current = CandidateTag(
                org_id=primary.org_id,
                candidate_id=primary.id,
                tag=duplicate_tag.tag,
                score=duplicate_tag.score,
            )
            db.session.add(current)
            primary_tags[key] = current
        else:
            current.score = max(current.score or 0, duplicate_tag.score or 0)
        db.session.delete(duplicate_tag)


def _merge_matches(primary, duplicate):
    primary_matches = {
        match.job_id: match
        for match in Match.query.filter_by(candidate_id=primary.id).all()
    }
    for duplicate_match in Match.query.filter_by(candidate_id=duplicate.id).all():
        current = primary_matches.get(duplicate_match.job_id)
        if current is None:
            duplicate_match.candidate_id = primary.id
            primary_matches[duplicate_match.job_id] = duplicate_match
        else:
            if duplicate_match.score > current.score:
                current.score = duplicate_match.score
                current.reason = duplicate_match.reason
            db.session.delete(duplicate_match)


def _merge_favorites(primary, duplicate):
    primary_users = {
        row.user_id
        for row in CandidateFavorite.query.filter_by(candidate_id=primary.id).all()
    }
    for favorite in CandidateFavorite.query.filter_by(candidate_id=duplicate.id).all():
        if favorite.user_id in primary_users:
            db.session.delete(favorite)
        else:
            favorite.candidate_id = primary.id
            primary_users.add(favorite.user_id)


def merge_candidates(*, org_id, actor_id, primary_candidate_id, duplicate_candidate_ids, reason):
    reason = str(reason or "").strip()[:240]
    if not reason:
        raise CandidateLibraryError("合并原因必填", 400, "merge_reason_required")

    candidate_ids = [primary_candidate_id, *duplicate_candidate_ids]
    candidates = (
        Candidate.query.filter(
            Candidate.org_id == org_id,
            Candidate.id.in_(candidate_ids),
            Candidate.deleted_at.is_(None),
        )
        .with_for_update()
        .all()
    )
    by_id = {candidate.id: candidate for candidate in candidates}
    primary = by_id.get(primary_candidate_id)
    if primary is None or len(by_id) != len(set(candidate_ids)):
        raise CandidateLibraryError("候选人不存在或已被合并", 404, "candidate_not_found")

    primary_keys = candidate_identity_keys(primary)
    duplicates = []
    history_candidate_ids = candidate_ids_with_business_history(duplicate_candidate_ids)
    for candidate_id in duplicate_candidate_ids:
        duplicate = by_id.get(candidate_id)
        if duplicate is None or duplicate.id == primary.id:
            raise CandidateLibraryError("待合并候选人无效", 400, "invalid_duplicate_candidate")
        if not primary_keys.intersection(candidate_identity_keys(duplicate)):
            raise CandidateLibraryError(
                f"{duplicate.name_masked or '待合并候选人'} 与主档没有一致的手机号或邮箱",
                409,
                "candidate_identity_mismatch",
            )
        if duplicate.id in history_candidate_ids:
            raise CandidateLibraryError(
                f"{duplicate.name_masked or '待合并候选人'} 已有招聘流程、面试或 Offer 历史，不能自动合并",
                409,
                "candidate_merge_has_business_history",
            )
        duplicates.append(duplicate)

    try:
        for duplicate in duplicates:
            for field in ("name_masked", "email_masked", "phone_masked"):
                if not getattr(primary, field) and getattr(duplicate, field):
                    setattr(primary, field, getattr(duplicate, field))
            _merge_profile(primary, duplicate)
            _merge_tags(primary, duplicate)
            _merge_matches(primary, duplicate)
            _merge_favorites(primary, duplicate)
            if not primary.raw_file_path and duplicate.raw_file_path:
                primary.raw_file_path = duplicate.raw_file_path
                duplicate.raw_file_path = None
            if primary.upload_batch_id is None:
                primary.upload_batch_id = duplicate.upload_batch_id
            if primary.parse_status != "ok" and duplicate.parse_status == "ok":
                primary.parse_status = "ok"
                primary.parse_error = None

            duplicate.deleted_at = utc_now()
            duplicate.deleted_by = actor_id
            duplicate.current_demand_id = None
            db.session.add(CandidateMerge(
                org_id=org_id,
                primary_candidate_id=primary.id,
                duplicate_candidate_id=duplicate.id,
                merged_by=actor_id,
                reason=reason,
            ))
        db.session.flush()
    except Exception:
        db.session.rollback()
        raise

    return {
        "primary_candidate_id": primary.id,
        "primary_candidate_name": primary.name_masked or "未命名候选人",
        "merged_candidate_ids": [candidate.id for candidate in duplicates],
        "merged_count": len(duplicates),
        "reason": reason,
    }


def add_candidates_to_demand(
    *,
    demand,
    candidate_ids,
    visible_candidate_ids,
    org_id,
    actor_id,
    reactivate_rejected=False,
    reason="",
):
    reason = str(reason or "").strip()[:240]
    if demand_completion_state(demand)["remaining_headcount"] <= 0:
        raise CandidateLibraryError(
            "该需求 HC 已满，请先确认完成需求或调整 HC",
            409,
            "demand_headcount_reached",
        )
    result = {
        "demand_id": demand.id,
        "job_id": demand.job_id,
        "added": 0,
        "reactivated": 0,
        "skipped_existing": 0,
        "skipped_missing": 0,
        "skipped_conflict": 0,
        "failures": [],
    }
    try:
        for candidate_id in candidate_ids:
            if candidate_id not in visible_candidate_ids:
                result["skipped_missing"] += 1
                continue
            latest = (
                PipelineStage.query.filter_by(
                    org_id=org_id,
                    candidate_id=candidate_id,
                    demand_id=demand.id,
                )
                .order_by(PipelineStage.id.desc())
                .first()
            )
            if latest is not None:
                if latest.stage == "rejected" and reactivate_rejected:
                    if not reason:
                        result["skipped_conflict"] += 1
                        result["failures"].append({
                            "candidate_id": candidate_id,
                            "code": "reactivation_reason_required",
                            "error": "重新启用已淘汰候选人需要填写原因",
                        })
                        continue
                    note = f"人才库重新启用：{reason}"
                    counter = "reactivated"
                else:
                    result["skipped_existing"] += 1
                    continue
            else:
                note = "从公司人才库加入招聘需求"
                counter = "added"
            try:
                move_candidate(
                    candidate_id=candidate_id,
                    demand_id=demand.id,
                    org_id=org_id,
                    actor_id=actor_id,
                    stage="pending",
                    note=note,
                    commit=False,
                )
                result[counter] += 1
            except PipelineServiceError as error:
                result["skipped_conflict"] += 1
                result["failures"].append({
                    "candidate_id": candidate_id,
                    "code": error.code,
                    "error": error.message,
                })
        db.session.flush()
    except Exception:
        db.session.rollback()
        raise
    return result
