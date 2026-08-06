import hashlib
import uuid
from datetime import timedelta
from pathlib import Path

from flask import current_app, g, jsonify, request
from runtime_paths import DEFAULT_UPLOAD_FOLDER
from werkzeug.utils import secure_filename

from ... import db
from ...middleware.events import record_event
from ...models import Candidate, Event, UploadBatch
from ...source_channels import normalize_resume_source_channel
from ...time_utils import utc_now
from ..demand_context_service import DemandContextError, can_manage_demand, resolve_demand_context
from ..resume_service import ResumeBatchService
from .file_service import (
    _allowed,
    _validate_upload_file,
)
from .parse_service import (
    _duplicate_upload_result,
    _process_resume,
    _record_duplicate_upload,
)


UPLOAD_DEDUP_WINDOW = timedelta(minutes=10)



def _file_fingerprints(files):
    fingerprints = []
    for file_storage in files:
        if not file_storage.filename:
            continue
        stream = file_storage.stream
        current = stream.tell()
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
        stream.seek(current)
        fingerprints.append({
            "filename": file_storage.filename,
            "size": size,
            "sha256": digest.hexdigest(),
        })
    return sorted(fingerprints, key=lambda item: (item["filename"], item["sha256"]))


def _upload_dedup_key(files, target_demand_id, target_job_id):
    source_channel = normalize_resume_source_channel(request.form.get("source_channel"))
    source_link = (request.form.get("source_link") or "").strip()
    referrer = (request.form.get("referrer") or "").strip()[:120]
    note = (request.form.get("source_note") or request.form.get("note") or "").strip()
    raw = {
        "org_id": g.org_id,
        "actor_id": g.user_id,
        "target_demand_id": target_demand_id,
        "target_job_id": target_job_id,
        "source_channel": source_channel,
        "source_link": source_link,
        "referrer": referrer,
        "note": note,
        "files": _file_fingerprints(files),
    }
    digest = hashlib.sha256(repr(raw).encode("utf-8")).hexdigest()
    return digest


def _recent_completed_upload(upload_key):
    cutoff = utc_now() - UPLOAD_DEDUP_WINDOW
    events = (
        Event.query
        .filter(
            Event.org_id == g.org_id,
            Event.actor_id == g.user_id,
            Event.action == "resume.upload.completed",
            Event.ts >= cutoff,
        )
        .order_by(Event.id.desc())
        .limit(20)
        .all()
    )
    for event in events:
        payload = event.payload if isinstance(event.payload, dict) else {}
        if payload.get("upload_fingerprint") == upload_key:
            return payload
    return None


def handle_resume_upload():
    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    from flask import current_app
    folder = current_app.config.get("UPLOAD_FOLDER") or str(DEFAULT_UPLOAD_FOLDER)
    Path(folder).mkdir(parents=True, exist_ok=True)

    from ...models import UploadBatch

    target_demand_id = request.form.get("target_demand_id", type=int)
    target_job_id = request.form.get("target_job_id", type=int)
    target_demand = None
    if target_demand_id or target_job_id:
        try:
            target_demand = resolve_demand_context(
                org_id=g.org_id,
                demand_id=target_demand_id,
                job_id=target_job_id,
                open_only=True,
            )
        except DemandContextError as error:
            return jsonify(error.as_payload()), error.status_code
        if not can_manage_demand(g.user_id, g.role, g.org_id, target_demand):
            return jsonify({"error": "Forbidden"}), 403
        target_demand_id = target_demand.id
        target_job_id = target_demand.job_id

    upload_key = _upload_dedup_key(files, target_demand_id, target_job_id)
    previous_upload = _recent_completed_upload(upload_key)
    if previous_upload is not None:
        repeated_results = []
        for stored_result in previous_upload.get("results", []):
            candidate_id = stored_result.get("candidate_id")
            existing = db.session.get(Candidate, candidate_id) if candidate_id else None
            if (
                stored_result.get("status") == "ok"
                and existing is not None
                and existing.org_id == g.org_id
                and existing.deleted_at is None
            ):
                display_name = stored_result.get("file") or "简历"
                _record_duplicate_upload(
                    existing,
                    display_name,
                    "文件内容一致",
                    target_demand_id,
                )
                repeated_results.append(
                    _duplicate_upload_result(
                        display_name,
                        existing,
                        "文件内容一致",
                    )
                )
            else:
                repeated_results.append(stored_result)
        db.session.commit()
        return jsonify({
            "batch_id": previous_upload.get("batch_id"),
            "total": previous_upload.get("total", 0),
            "results": repeated_results,
            "deduplicated": True,
        }), 200

    batch = UploadBatch(
        org_id=g.org_id,
        owner_hr_id=g.user_id,
        source_channel=normalize_resume_source_channel(request.form.get("source_channel")),
        source_link=(request.form.get("source_link") or "").strip(),
        referrer=(request.form.get("referrer") or "").strip()[:120],
        target_job_id=target_job_id,
        demand_id=target_demand_id,
        note=(request.form.get("source_note") or request.form.get("note") or "").strip(),
    )
    db.session.add(batch)
    db.session.commit()
    record_event(
        "resume.upload_batch.created",
        entity_id=batch.id,
        entity_type="upload_batch",
        demand_id=target_demand_id,
        payload={"demand_id": target_demand_id, "job_id": target_job_id},
    )

    svc = ResumeBatchService()
    results = []
    for f in files:
        if not f.filename:
            continue
        if not _allowed(f.filename):
            results.append({
                "file": f.filename,
                "status": "skipped",
                "reason": "不支持该格式，请上传 PDF、DOCX、JPG、PNG、WebP 或 GIF",
            })
            continue
        invalid_reason = _validate_upload_file(f)
        if invalid_reason:
            results.append({"file": f.filename, "status": "skipped", "reason": invalid_reason})
            continue

        # 落盘（普通简历直接落盘并保留路径供 raw_file_path 使用）
        fname = f"{uuid.uuid4()}_{secure_filename(f.filename)}"
        fpath = str(Path(folder) / fname)
        f.save(fpath)

        # 普通简历文件，逐个解析
        _process_resume(
            svc,
            fpath,
            f.filename,
            results,
            upload_batch_id=batch.id,
            target_demand_id=target_demand_id,
            target_job_id=target_job_id,
        )

    # total 为实际产生的简历结果条数
    record_event(
        "resume.upload.completed",
        entity_id=batch.id,
        entity_type="upload_batch",
        demand_id=target_demand_id,
        payload={
            "upload_fingerprint": upload_key,
            "batch_id": batch.id,
            "demand_id": target_demand_id,
            "total": len(results),
            "results": results,
        },
    )
    return jsonify({"batch_id": batch.id, "total": len(results), "results": results}), 202
