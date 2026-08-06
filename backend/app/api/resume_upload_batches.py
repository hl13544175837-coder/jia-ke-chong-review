from flask import current_app, g, jsonify, request

from runtime_paths import (
    DEFAULT_UPLOAD_FOLDER,
    RuntimePathError,
    resolve_stored_upload_path,
)

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import Candidate, CandidateResumeVersion, UploadBatch
from ..time_utils import utc_now
from .access import same_org


def register_resume_batch_routes(bp):
    @bp.post("/resume/batches/<int:batch_id>/rollback")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def rollback_upload_batch(batch_id):
        data = request.get_json(silent=True) or {}
        reason = str(data.get("reason") or "").strip()[:240]
        if not reason:
            return jsonify({"error": "撤回原因必填"}), 400

        batch = db.session.get(UploadBatch, batch_id)
        if batch is None or not same_org(batch, g.org_id):
            return jsonify({"error": "上传批次不存在"}), 404
        if g.role == "recruiter" and batch.owner_hr_id != g.user_id:
            return jsonify({"error": "Forbidden"}), 403

        candidates = (
            Candidate.query
            .filter_by(org_id=g.org_id, upload_batch_id=batch.id)
            .filter(Candidate.deleted_at.is_(None))
            .all()
        )
        removed_files = 0
        now = utc_now()
        for candidate in candidates:
            raw_path = candidate.raw_file_path
            if raw_path:
                try:
                    path = resolve_stored_upload_path(
                        raw_path,
                        current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER,
                    )
                    if path.is_file():
                        path.unlink()
                        removed_files += 1
                except (OSError, RuntimePathError):
                    pass

            candidate.name_masked = "已撤回导入候选人"
            candidate.email_masked = ""
            candidate.phone_masked = ""
            candidate.resume_json = {}
            candidate.raw_file_path = None
            candidate.raw_file_name = None
            candidate.raw_file_data = None
            candidate.parse_error = None
            candidate.deleted_at = now
            candidate.deleted_by = g.user_id
            candidate.anonymized_at = now
            for tag in candidate.tags:
                tag.tag = "已撤回"
                tag.score = None
                tag.org_id = g.org_id
            for version in CandidateResumeVersion.query.filter_by(
                org_id=g.org_id,
                candidate_id=candidate.id,
            ).all():
                version.raw_file_path = None
                version.raw_file_name = None
                version.raw_file_data = None

        db.session.commit()
        record_event(
            "resume.upload_batch.rolled_back",
            entity_id=batch.id,
            entity_type="upload_batch",
            payload={
                "reason": reason,
                "rolled_back_candidates": len(candidates),
                "raw_files_removed": removed_files,
            },
            severity="warning",
        )
        return jsonify({
            "batch_id": batch.id,
            "rolled_back_candidates": len(candidates),
            "raw_files_removed": removed_files,
        })
