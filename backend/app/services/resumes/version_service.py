from types import SimpleNamespace

from flask import current_app, g, jsonify
from runtime_paths import DEFAULT_UPLOAD_FOLDER, RuntimePathError, resolve_stored_upload_path

from ... import db
from ..access_policy import can_access_candidate, same_org
from ...models import Candidate, CandidateResumeVersion
from ...source_channels import normalize_resume_source_channel
from .file_service import _original_resume_payload



def _resume_detail_payload(candidate):
    return {
        "id": candidate.id,
        "candidate_id": candidate.id,
        "name_masked": candidate.name_masked,
        "owner_hr_id": candidate.owner_hr_id,
        "resume_json": candidate.resume_json,
        "tags": [{"tag": tag.tag, "score": tag.score} for tag in candidate.tags],
        "parse_status": candidate.parse_status,
        "parse_error": _public_parse_error(candidate),
        "original_resume": _original_resume_payload(candidate),
        "source": _candidate_source_payload(candidate),
        "created_at": candidate.created_at.isoformat(),
        "resume_versions": [
            _resume_version_payload(version)
            for version in CandidateResumeVersion.query.filter_by(
                org_id=candidate.org_id or 1,
                candidate_id=candidate.id,
            ).order_by(CandidateResumeVersion.version_no.desc()).all()
        ],
    }


def _public_parse_error(candidate):
    error = str(candidate.parse_error or "")
    if candidate.parse_status in {"pending", "processing"} and error.startswith(
        ("queued:", "worker:")
    ):
        return None
    return candidate.parse_error


def _actionable_parse_failure_message(error):
    raw = str(error or "")
    lowered = raw.casefold()
    if any(marker in lowered for marker in (
        "403",
        "forbidden",
        "model",
        "模型",
        "百炼",
        "dashscope",
    )):
        return "模型暂时不可用，可先手动补录；原始文件已保留。"
    return "重新解析仍未成功，可先手动补录；原始文件已保留。"


def _resume_version_payload(version):
    available = False
    if version.raw_file_path:
        upload_root = current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER
        try:
            available = resolve_stored_upload_path(
                version.raw_file_path,
                upload_root,
            ).is_file()
        except RuntimePathError:
            available = False
    return {
        "id": version.id,
        "version_no": version.version_no,
        "name_masked": version.name_masked or "未命名候选人",
        "parse_status": version.parse_status,
        "reason": version.reason,
        "created_at": version.created_at.isoformat(),
        "available": available,
        "is_current": False,
        "download_url": (
            f"/api/resume/{version.candidate_id}/versions/{version.id}/download"
            if available
            else None
        ),
    }


def _archive_current_resume(candidate, *, reason):
    latest = (
        CandidateResumeVersion.query
        .filter_by(org_id=candidate.org_id or 1, candidate_id=candidate.id)
        .order_by(CandidateResumeVersion.version_no.desc())
        .first()
    )
    version = CandidateResumeVersion(
        org_id=candidate.org_id or 1,
        candidate_id=candidate.id,
        version_no=(latest.version_no if latest else 0) + 1,
        name_masked=candidate.name_masked,
        email_masked=candidate.email_masked,
        phone_masked=candidate.phone_masked,
        resume_json=(dict(candidate.resume_json) if isinstance(candidate.resume_json, dict) else {}),
        raw_file_path=candidate.raw_file_path,
        resume_sha256=candidate.resume_sha256,
        parse_status=candidate.parse_status or "ok",
        parse_error=candidate.parse_error,
        reason=reason,
        created_by=g.user_id,
    )
    db.session.add(version)
    db.session.flush()
    return version


def _editable_resume_candidate(candidate_id):
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return None, (jsonify({"error": "候选人不存在"}), 404)
    if g.role == "interviewer" or not can_access_candidate(g.user_id, g.role, candidate_id):
        return None, (jsonify({"error": "Forbidden"}), 403)
    return candidate, None


def _candidate_like_parse_result(candidate, parse_result):
    info = parse_result.get("extracted_info", {}) if isinstance(parse_result, dict) else {}
    return SimpleNamespace(
        id=candidate.id,
        org_id=candidate.org_id,
        email_masked=str(info.get("email") or "")[:100],
        phone_masked=str(info.get("phone") or "")[:30],
        resume_json=parse_result if isinstance(parse_result, dict) else {},
    )


def _candidate_source_payload(candidate):
    from ...models import Job, RecruitmentDemand, UploadBatch

    if not candidate.upload_batch_id:
        return None
    batch = db.session.get(UploadBatch, candidate.upload_batch_id)
    if batch is None:
        return None
    target_job = db.session.get(Job, batch.target_job_id) if batch.target_job_id else None
    target_demand = db.session.get(RecruitmentDemand, batch.demand_id) if batch.demand_id else None
    return {
        "batch_id": batch.id,
        "channel": normalize_resume_source_channel(batch.source_channel),
        "source_link": batch.source_link or "",
        "referrer": batch.referrer or "",
        "target_job_id": batch.target_job_id,
        "target_demand_id": batch.demand_id,
        "target_demand_request_no": target_demand.request_no if target_demand else None,
        "target_job_title": target_job.title if target_job else None,
        "target_job_city": target_job.city if target_job else "",
        "target_job_department": target_job.department if target_job else "",
        "note": batch.note or "",
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
    }
