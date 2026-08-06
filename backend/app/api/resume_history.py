import mimetypes
from pathlib import Path

from flask import current_app, g, jsonify, request, send_file

from runtime_paths import (
    DEFAULT_UPLOAD_FOLDER,
    RuntimePathError,
    resolve_stored_upload_path,
)

from .. import db
from ..middleware.auth import require_auth
from ..middleware.rate_limit import rate_limit
from ..middleware.events import record_event
from ..models import Candidate, CandidateResumeVersion
from ..services.candidate_library_service import find_existing_candidate_by_identity
from ..services.resume_service import ResumeBatchService
from .access import can_access_candidate, same_org


def register_resume_history_routes(bp):
    from ..services.resumes.file_service import (
        BLOCKED_RESUME_EXTS,
        ORIGINAL_RESUME_MIME_TYPES,
        _ext,
        _file_sha256,
        _is_resume,
        _original_resume_candidate,
        _remove_uploaded_file,
        _resolve_original_resume,
        _serve_original_resume,
        _stored_resume_filename,
        _validate_upload_file,
    )
    from ..services.resumes.parse_service import (
        RESUME_AI_DISABLED_MESSAGE,
        _duplicate_upload_result,
        _refresh_related_job_matches,
    )
    from ..services.resumes.version_service import (
        _actionable_parse_failure_message,
        _archive_current_resume,
        _candidate_like_parse_result,
        _editable_resume_candidate,
        _resume_detail_payload,
        _resume_version_payload,
    )

    @bp.get("/resume/<int:candidate_id>")
    @require_auth
    def get_resume(candidate_id):
        c = db.get_or_404(Candidate, candidate_id)
        if not same_org(c, g.org_id) or c.deleted_at is not None:
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403
        record_event(
            "candidate.viewed",
            entity_id=c.id,
            entity_type="candidate",
            payload={"view": "resume_detail"},
        )
        return jsonify(_resume_detail_payload(c))


    @bp.get("/resume/<int:candidate_id>/original/preview")
    @require_auth
    def preview_original_resume(candidate_id):
        return _serve_original_resume(candidate_id, as_attachment=False)


    @bp.get("/resume/<int:candidate_id>/original/download")
    @require_auth
    def download_original_resume(candidate_id):
        return _serve_original_resume(candidate_id, as_attachment=True)


    @bp.get("/resume/<int:candidate_id>/versions")
    @require_auth
    def resume_versions(candidate_id):
        candidate, error_response = _original_resume_candidate(candidate_id)
        if error_response is not None:
            return error_response
        versions = (
            CandidateResumeVersion.query
            .filter_by(org_id=g.org_id, candidate_id=candidate.id)
            .order_by(CandidateResumeVersion.version_no.desc())
            .all()
        )
        return jsonify({
            "candidate_id": candidate.id,
            "versions": [_resume_version_payload(version) for version in versions],
        })


    @bp.get("/resume/<int:candidate_id>/versions/<int:version_id>/download")
    @require_auth
    def download_resume_version(candidate_id, version_id):
        candidate, error_response = _original_resume_candidate(candidate_id)
        if error_response is not None:
            return error_response
        version = CandidateResumeVersion.query.filter_by(
            id=version_id,
            org_id=g.org_id,
            candidate_id=candidate.id,
        ).first()
        if version is None:
            return jsonify({"error": "历史简历版本不存在"}), 404
        if not version.raw_file_path:
            return jsonify({"error": "历史简历原件不可用"}), 404

        upload_root = current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER
        try:
            resolved = resolve_stored_upload_path(version.raw_file_path, upload_root)
        except RuntimePathError:
            return jsonify({"error": "历史简历原件不可用"}), 404
        if not resolved.is_file():
            return jsonify({"error": "历史简历原件不可用"}), 404

        suffix = resolved.suffix.lower()
        mime_type = ORIGINAL_RESUME_MIME_TYPES.get(suffix)
        if mime_type is None:
            guessed, _ = mimetypes.guess_type(resolved.name)
            if guessed not in ORIGINAL_RESUME_MIME_TYPES.values():
                return jsonify({"error": "该历史简历格式暂不支持下载"}), 400
            mime_type = guessed

        record_event(
            "resume.version.downloaded",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={"version_id": version.id, "version_no": version.version_no},
        )
        response = send_file(
            resolved,
            mimetype=mime_type,
            as_attachment=True,
            download_name=f"candidate-{candidate.id}-resume-v{version.version_no}{suffix}",
            conditional=True,
            max_age=0,
        )
        response.headers["Cache-Control"] = "private, no-store"
        return response


    @bp.post("/resume/<int:candidate_id>/confirm-original")
    @require_auth
    def confirm_original_resume(candidate_id):
        candidate, error_response = _editable_resume_candidate(candidate_id)
        if error_response is not None:
            return error_response
        if candidate.parse_status == "original_confirmed":
            return jsonify({
                **_resume_detail_payload(candidate),
                "status_label": "原件有效，结构化信息待补全",
            })
        if candidate.parse_status != "failed":
            return jsonify({"error": "只有待确认的简历才能确认原件"}), 400

        resolved, _reason = _resolve_original_resume(candidate)
        if resolved is None:
            return jsonify({"error": "原始简历文件不可用，请重新上传"}), 409

        candidate.parse_status = "original_confirmed"
        db.session.commit()
        record_event(
            "resume.original_confirmed",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={"parse_error": candidate.parse_error or ""},
        )
        return jsonify({
            **_resume_detail_payload(candidate),
            "status_label": "原件有效，结构化信息待补全",
        })


    @bp.post("/resume/<int:candidate_id>/replace")
    @require_auth
    @rate_limit("resume.upload")
    def replace_resume(candidate_id):
        candidate, error_response = _editable_resume_candidate(candidate_id)
        if error_response is not None:
            return error_response

        file_storage = request.files.get("file")
        if file_storage is None or not file_storage.filename:
            return jsonify({"error": "请选择一份新简历"}), 400
        if not _is_resume(file_storage.filename) or _ext(file_storage.filename) in BLOCKED_RESUME_EXTS:
            return jsonify({"error": "请上传 PDF、DOCX、JPG、PNG、WebP 或 GIF 简历"}), 400
        invalid_reason = _validate_upload_file(file_storage)
        if invalid_reason:
            return jsonify({"error": invalid_reason}), 400

        folder = current_app.config.get("UPLOAD_FOLDER") or str(DEFAULT_UPLOAD_FOLDER)
        Path(folder).mkdir(parents=True, exist_ok=True)
        new_path = str(Path(folder) / _stored_resume_filename(file_storage.filename))
        file_storage.save(new_path)
        content_sha256 = _file_sha256(new_path)

        existing_by_file = Candidate.query.filter(
            Candidate.org_id == g.org_id,
            Candidate.id != candidate.id,
            Candidate.resume_sha256 == content_sha256,
            Candidate.deleted_at.is_(None),
        ).order_by(Candidate.id.asc()).first()
        if existing_by_file is not None:
            _remove_uploaded_file(new_path)
            return jsonify({
                "error": "这份简历已属于其他候选人，未覆盖当前档案",
                **_duplicate_upload_result(file_storage.filename, existing_by_file, "文件内容一致"),
            }), 409

        service = ResumeBatchService()
        try:
            parse_result = service.parse_file(new_path)
        except Exception as error:
            archived = _archive_current_resume(candidate, reason="manual_replace")
            candidate = service.mark_replacement_parse_failed(
                candidate,
                file_path=new_path,
                content_sha256=content_sha256,
                display_name=file_storage.filename,
                error=error,
            )
            record_event(
                "resume.replaced_parse_failed",
                entity_id=candidate.id,
                entity_type="candidate",
                payload={
                    "file": file_storage.filename,
                    "reason": str(error)[:500],
                    "archived_version_id": archived.id,
                },
            )
            return jsonify({
                **_resume_detail_payload(candidate),
                "status": "needs_confirmation",
                "reason": "新原件已覆盖，但 AI 未能识别，请确认原件或手动补录",
                "replaced": True,
                "archived_version_id": archived.id,
            }), 202

        existing_by_identity, match_basis = find_existing_candidate_by_identity(
            _candidate_like_parse_result(candidate, parse_result)
        )
        if existing_by_identity is not None:
            _remove_uploaded_file(new_path)
            return jsonify({
                "error": "新简历与其他候选人的身份信息重复，未覆盖当前档案",
                **_duplicate_upload_result(file_storage.filename, existing_by_identity, match_basis),
            }), 409

        archived = _archive_current_resume(candidate, reason="manual_replace")
        candidate = service.replace_candidate_resume(
            candidate,
            file_path=new_path,
            content_sha256=content_sha256,
            parse_result=parse_result,
        )
        rematched_jobs = _refresh_related_job_matches(candidate)
        record_event(
            "resume.replaced",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={
                "file": file_storage.filename,
                "rematched_job_ids": [job["id"] for job in rematched_jobs],
                "archived_version_id": archived.id,
            },
        )
        return jsonify({
            **_resume_detail_payload(candidate),
            "replaced": True,
            "rematched_jobs": rematched_jobs,
            "archived_version_id": archived.id,
        })


    @bp.patch("/resume/<int:candidate_id>/profile")
    @require_auth
    def update_resume_profile(candidate_id):
        from ..models import Candidate

        candidate = db.get_or_404(Candidate, candidate_id)
        if g.role == "interviewer":
            return jsonify({"error": "Forbidden"}), 403
        if not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403

        data = request.get_json(silent=True) or {}
        profile = data.get("profile")
        if not isinstance(profile, dict):
            return jsonify({"error": "profile required"}), 400
        skills = data.get("skills") if "skills" in data else None
        if skills is not None and not isinstance(skills, list):
            return jsonify({"error": "skills must be a list"}), 400

        svc = ResumeBatchService()
        candidate = svc.update_candidate_profile(candidate, profile, skills)
        rematched_jobs = _refresh_related_job_matches(candidate)
        record_event(
            "resume.profile_updated",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={
                "actor_id": g.user_id,
                "fields": sorted(profile.keys()),
                "rematched_job_ids": [job["id"] for job in rematched_jobs],
            },
        )
        return jsonify({
            **_resume_detail_payload(candidate),
            "rematched_jobs": rematched_jobs,
        })


    @bp.post("/resume/<int:candidate_id>/retry-parse")
    @require_auth
    def retry_parse(candidate_id):
        from ..models import Candidate

        candidate = db.get_or_404(Candidate, candidate_id)
        if g.role == "interviewer":
            return jsonify({"error": "Forbidden"}), 403
        if not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403
        if candidate.parse_status != "failed":
            return jsonify({"error": "只有解析失败的简历才能重试"}), 400
        if not current_app.config.get("RESUME_AI_ENABLED", True):
            return jsonify({
                **_resume_detail_payload(candidate),
                "error": RESUME_AI_DISABLED_MESSAGE,
                "code": "resume_ai_disabled",
            }), 409

        if current_app.config.get("RESUME_PARSE_ASYNC_ENABLED", True):
            svc = ResumeBatchService()
            candidate = svc.queue_candidate(candidate)
            record_event(
                "resume.retry_parse_queued",
                entity_id=candidate.id,
                entity_type="candidate",
            )
            return jsonify(_resume_detail_payload(candidate)), 202

        svc = ResumeBatchService()
        try:
            candidate = svc.reparse_candidate(candidate)
        except Exception as e:
            failed_candidate = db.session.get(Candidate, candidate_id)
            return jsonify({
                **_resume_detail_payload(failed_candidate),
                "error": _actionable_parse_failure_message(e),
                "code": "resume_parse_unavailable",
            }), 422

        record_event(
            "resume.retry_parse",
            entity_id=candidate.id,
            entity_type="candidate",
        )
        return jsonify(_resume_detail_payload(candidate))
