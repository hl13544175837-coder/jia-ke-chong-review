from flask import current_app, g

from ... import db
from ...api.access import can_access_candidate
from ...middleware.events import record_event
from ...models import Candidate
from ..candidate_library_service import find_existing_candidate_by_identity
from ..pipeline_service import PipelineServiceError, move_candidate
from .file_service import _file_sha256, _remove_uploaded_file


RESUME_AI_DISABLED_MESSAGE = (
    "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。"
)



def _duplicate_upload_result(display_name, existing, match_basis):
    result = {
        "file": display_name,
        "status": "duplicate",
        "reason": "导入失败：系统中已存在重复简历",
        "match_basis": match_basis,
    }
    if can_access_candidate(g.user_id, g.role, existing.id):
        result.update({
            "existing_candidate_id": existing.id,
            "existing_candidate_name": existing.name_masked or "未命名候选人",
        })
    else:
        result["existing_candidate_name"] = "当前组织已有候选人"
    return result


def _record_duplicate_upload(
    existing,
    display_name,
    match_basis,
    target_demand_id,
    attempted_candidate_id=None,
):
    payload = {
        "file": display_name,
        "match_basis": match_basis,
    }
    if attempted_candidate_id is not None:
        payload["attempted_candidate_id"] = attempted_candidate_id
    record_event(
        "resume.upload.duplicate_blocked",
        entity_id=existing.id,
        entity_type="candidate",
        demand_id=target_demand_id,
        payload=payload,
        commit=False,
    )


def _add_to_target_pipeline(candidate, target_demand_id):
    if not target_demand_id:
        return False

    result = move_candidate(
        candidate_id=candidate.id,
        demand_id=target_demand_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        stage="pending",
        note="上传简历后进入待筛选",
    )
    return not result.get("deduplicated", False)


def _related_jobs_for_candidate(candidate):
    from ...models import Job, PipelineStage, UploadBatch

    job_ids = set()
    if candidate.upload_batch_id:
        batch = db.session.get(UploadBatch, candidate.upload_batch_id)
        if batch and batch.target_job_id:
            job_ids.add(batch.target_job_id)

    rows = (
        db.session.query(PipelineStage.job_id)
        .filter(PipelineStage.candidate_id == candidate.id)
        .distinct()
        .all()
    )
    for job_id, in rows:
        if job_id:
            job_ids.add(job_id)

    if not job_ids:
        return []

    return (
        db.session.query(Job)
        .filter(Job.org_id == (candidate.org_id or 1), Job.id.in_(job_ids), Job.status == "active")
        .order_by(Job.id.asc())
        .all()
    )


def _refresh_related_job_matches(candidate):
    from ..match_service import MatchService

    jobs = _related_jobs_for_candidate(candidate)
    if not jobs:
        return []

    svc = MatchService()
    refreshed = []
    for job in jobs:
        try:
            svc.rank_for_job(job.id)
        except Exception:
            current_app.logger.exception(
                "候选人档案保存后刷新岗位匹配失败: candidate_id=%s job_id=%s",
                candidate.id,
                job.id,
            )
            continue
        refreshed.append({"id": job.id, "title": job.title})
    return refreshed


def _process_resume(
    svc,
    fpath,
    display_name,
    results,
    upload_batch_id=None,
    target_demand_id=None,
    target_job_id=None,
):
    """解析单份简历并入库，把结果（成功/失败）追加到 results。
    display_name 为简历的展示名（通常即原文件名），用于结果展示。"""
    content_sha256 = _file_sha256(fpath)
    existing_by_file = Candidate.query.filter(
        Candidate.org_id == g.org_id,
        Candidate.resume_sha256 == content_sha256,
        Candidate.deleted_at.is_(None),
    ).order_by(Candidate.id.asc()).first()
    if existing_by_file is not None:
        _record_duplicate_upload(
            existing_by_file, display_name, "文件内容一致", target_demand_id
        )
        db.session.commit()
        _remove_uploaded_file(fpath)
        results.append(
            _duplicate_upload_result(
                display_name, existing_by_file, "文件内容一致"
            )
        )
        return

    if not current_app.config.get("RESUME_AI_ENABLED", True):
        candidate = svc.create_failed_candidate(
            fpath,
            owner_hr_id=g.user_id,
            display_name=display_name,
            error=RuntimeError(RESUME_AI_DISABLED_MESSAGE),
            upload_batch_id=upload_batch_id,
        )
        candidate.org_id = g.org_id
        candidate.resume_sha256 = content_sha256
        db.session.commit()
        record_event(
            "resume.parse_skipped",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=target_demand_id,
            payload={"file": display_name, "reason": "resume_ai_disabled"},
        )
        results.append({
            "file": display_name,
            "status": "needs_confirmation",
            "candidate_id": candidate.id,
            "reason": RESUME_AI_DISABLED_MESSAGE,
            "parse_error": RESUME_AI_DISABLED_MESSAGE,
        })
        return

    if current_app.config.get("RESUME_PARSE_ASYNC_ENABLED", True):
        candidate = svc.create_pending_candidate(
            fpath,
            owner_hr_id=g.user_id,
            display_name=display_name,
            upload_batch_id=upload_batch_id,
            org_id=g.org_id,
            resume_sha256=content_sha256,
        )
        record_event(
            "resume.parse_queued",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=target_demand_id,
            payload={"file": display_name},
        )
        results.append({
            "file": display_name,
            "status": "processing",
            "candidate_id": candidate.id,
            "reason": "文件已入库，AI 正在后台解析",
        })
        return

    try:
        candidate = svc.parse_and_save(
            fpath,
            owner_hr_id=g.user_id,
            upload_batch_id=upload_batch_id,
        )
    except Exception as e:
        db.session.rollback()
        candidate = svc.create_failed_candidate(
            fpath,
            owner_hr_id=g.user_id,
            display_name=display_name,
            error=e,
            upload_batch_id=upload_batch_id,
        )
        candidate.org_id = g.org_id
        candidate.resume_sha256 = content_sha256
        db.session.commit()
        record_event(
            "resume.parse_failed",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=target_demand_id,
            payload={"file": display_name, "reason": str(e)[:500]},
        )
        results.append({
            "file": display_name,
            "status": "needs_confirmation",
            "candidate_id": candidate.id,
            "reason": "AI 未能识别该简历，请确认原文件或重新上传",
            "parse_error": str(e)[:500],
        })
        return

    # Parsing succeeded. Audit/storage/pipeline failures are infrastructure
    # errors and must not create a second, falsely "parse failed" candidate.
    candidate.org_id = g.org_id
    candidate.resume_sha256 = content_sha256
    existing_by_identity, match_basis = find_existing_candidate_by_identity(candidate)
    if existing_by_identity is not None:
        attempted_candidate_id = candidate.id
        db.session.delete(candidate)
        _record_duplicate_upload(
            existing_by_identity,
            display_name,
            match_basis,
            target_demand_id,
            attempted_candidate_id=attempted_candidate_id,
        )
        db.session.commit()
        _remove_uploaded_file(fpath)
        results.append(
            _duplicate_upload_result(display_name, existing_by_identity, match_basis)
        )
        return

    from ...models import CandidateTag
    CandidateTag.query.filter_by(candidate_id=candidate.id).update({"org_id": g.org_id})
    db.session.commit()
    record_event(
        "resume.uploaded",
        entity_id=candidate.id,
        entity_type="candidate",
        demand_id=target_demand_id,
    )
    try:
        auto_joined = _add_to_target_pipeline(candidate, target_demand_id)
    except PipelineServiceError as error:
        results.append({
            "file": display_name,
            "status": "ok",
            "candidate_id": candidate.id,
            "target_demand_id": target_demand_id,
            "target_job_id": target_job_id,
            "pipeline_joined": False,
            "pipeline_error": error.message,
            "pipeline_error_code": error.code,
        })
        return
    result = {"file": display_name, "status": "ok", "candidate_id": candidate.id}
    if auto_joined:
        result.update({
            "target_demand_id": target_demand_id,
            "target_job_id": target_job_id,
            "pipeline_stage": "pending",
        })
    results.append(result)
