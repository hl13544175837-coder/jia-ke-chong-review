import hashlib
import mimetypes
import os, uuid, zipfile
from datetime import timedelta
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
from flask import current_app
from flask import Blueprint, request, jsonify, g, send_file
from werkzeug.utils import secure_filename
from runtime_paths import (
    DEFAULT_UPLOAD_FOLDER,
    RuntimePathError,
    resolve_stored_upload_path,
)
from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from ..middleware.events import record_event
from ..services.resume_service import ResumeBatchService
from ..services.candidate_library_service import find_existing_candidate_by_identity
from image_resume_parser import (
    IMAGE_RESUME_EXTENSIONS,
    IMAGE_RESUME_MAX_FILE_SIZE,
    inspect_image_file,
    inspect_image_stream,
)
from ..services.demand_context_service import (
    DemandContextError,
    can_manage_demand,
    resolve_demand_context,
)
from ..services.pipeline_service import PipelineServiceError, move_candidate
from ..source_channels import normalize_resume_source_channel
from .. import db
from ..models import Candidate, CandidateResumeVersion, Event, UploadBatch
from ..time_utils import utc_now
from .access import can_access_candidate, same_org

bp = Blueprint("resume", __name__)

# 旧版 .doc 是 OLE 容器且存在宏风险，保留为显式拒绝项才能给用户可操作的转换提示。
DOCUMENT_RESUME_EXTS = {"pdf", "docx"}
RESUME_EXTS = DOCUMENT_RESUME_EXTS | set(IMAGE_RESUME_EXTENSIONS)
BLOCKED_RESUME_EXTS = {"doc"}
ALLOWED = RESUME_EXTS | BLOCKED_RESUME_EXTS | {"zip"}
RESUME_MAX_FILE_SIZE = 20 * 1024 * 1024
FILE_SIGNATURES = {
    "pdf": (b"%PDF-",),
    "doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "docx": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "gif": (b"GIF87a", b"GIF89a"),
    "zip": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
}
IMAGE_FORMAT_BY_EXT = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "gif": "GIF",
}

# ---- zip 解压安全限制（防 zip 炸弹）----
ZIP_MAX_ENTRIES = 100              # zip 内最多处理的文件条目数
ZIP_MAX_FILE_SIZE = 20 * 1024 * 1024     # 单个解压文件上限 20MB
ZIP_MAX_TOTAL_SIZE = 200 * 1024 * 1024   # 解压总大小上限 200MB
UPLOAD_DEDUP_WINDOW = timedelta(minutes=10)
ORIGINAL_RESUME_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
RESUME_AI_DISABLED_MESSAGE = (
    "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。"
)


def _ext(filename):
    """取小写扩展名（不含点）；无扩展名返回空串"""
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def _allowed(filename):
    return _ext(filename) in ALLOWED


def _is_resume(filename):
    return _ext(filename) in RESUME_EXTS | BLOCKED_RESUME_EXTS


def _stream_size(file_storage):
    stream = file_storage.stream
    current = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(current)
    return size


def _content_matches_extension(file_storage, ext):
    if ext == "webp":
        stream = file_storage.stream
        current = stream.tell()
        head = stream.read(12)
        stream.seek(current)
        return (
            len(head) >= 12
            and head.startswith(b"RIFF")
            and head[8:12] == b"WEBP"
        )
    signatures = FILE_SIGNATURES.get(ext)
    if not signatures:
        return True
    stream = file_storage.stream
    current = stream.tell()
    head = stream.read(max(len(sig) for sig in signatures))
    stream.seek(current)
    return any(head.startswith(sig) for sig in signatures)


def _validate_upload_file(file_storage):
    ext = _ext(file_storage.filename)
    size = _stream_size(file_storage)
    if size <= 0:
        return "文件为空"
    if ext in BLOCKED_RESUME_EXTS:
        return "旧版 DOC 存在宏风险，请转换为 PDF 或 DOCX 后上传"
    max_file_size = (
        IMAGE_RESUME_MAX_FILE_SIZE
        if ext in IMAGE_RESUME_EXTENSIONS
        else RESUME_MAX_FILE_SIZE
    )
    if ext in RESUME_EXTS and size > max_file_size:
        return f"文件大小超过上限（{max_file_size // (1024 * 1024)}MB）"
    if not _content_matches_extension(file_storage, ext):
        return "文件内容与扩展名不匹配"
    if ext in IMAGE_RESUME_EXTENSIONS:
        try:
            image_format, _, _ = inspect_image_stream(file_storage.stream)
        except ValueError as error:
            return str(error)
        if image_format != IMAGE_FORMAT_BY_EXT[ext]:
            return "图片实际格式与扩展名不匹配"
    return None


def _original_resume_urls(candidate_id):
    base = f"/api/resume/{candidate_id}/original"
    return {
        "preview_url": f"{base}/preview",
        "download_url": f"{base}/download",
    }


def _resolve_original_resume(candidate):
    """Resolve a stored resume only when it remains inside UPLOAD_FOLDER.

    The return value deliberately separates an internal path from public
    metadata so callers never serialize the server filesystem location.
    """
    if not candidate.raw_file_path:
        return None, "missing_path"

    upload_root = current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER
    try:
        resolved = resolve_stored_upload_path(candidate.raw_file_path, upload_root)
    except RuntimePathError:
        return None, "out_of_root"
    if not resolved.is_file():
        return None, "missing_file"

    suffix = resolved.suffix.lower()
    mime_type = ORIGINAL_RESUME_MIME_TYPES.get(suffix)
    if mime_type is None:
        guessed, _ = mimetypes.guess_type(resolved.name)
        if guessed not in ORIGINAL_RESUME_MIME_TYPES.values():
            return None, "unsupported_type"
        mime_type = guessed
    return {
        "path": resolved,
        "filename": f"candidate-{candidate.id}-resume{suffix}",
        "mime_type": mime_type,
    }, None


def _original_resume_payload(candidate):
    resolved, _ = _resolve_original_resume(candidate)
    urls = _original_resume_urls(candidate.id)
    if resolved is None:
        return {
            "available": False,
            "filename": None,
            "mime_type": None,
            **urls,
        }
    return {
        "available": True,
        "filename": resolved["filename"],
        "mime_type": resolved["mime_type"],
        **urls,
    }


def _original_resume_candidate(candidate_id):
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None or not same_org(candidate, g.org_id) or candidate.deleted_at is not None:
        return None, (jsonify({"error": "候选人不存在"}), 404)
    if not can_access_candidate(g.user_id, g.role, candidate_id):
        return None, (jsonify({"error": "Forbidden"}), 403)
    return candidate, None


def _serve_original_resume(candidate_id, *, as_attachment):
    candidate, error_response = _original_resume_candidate(candidate_id)
    if error_response is not None:
        return error_response

    resolved, reason = _resolve_original_resume(candidate)
    if resolved is None:
        record_event(
            "resume.original.access_denied",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={"reason": reason},
            result="denied",
            failure_reason=reason,
            severity="warning",
        )
        return jsonify({
            "code": "original_resume_missing",
            "error": "原始简历文件不可用",
        }), 404

    action = "resume.original.downloaded" if as_attachment else "resume.original.previewed"
    record_event(
        action,
        entity_id=candidate.id,
        entity_type="candidate",
        payload={"mime_type": resolved["mime_type"]},
    )
    response = send_file(
        resolved["path"],
        mimetype=resolved["mime_type"],
        as_attachment=as_attachment,
        download_name=resolved["filename"],
        conditional=True,
        max_age=0,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


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


def _file_sha256(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _remove_uploaded_file(file_path):
    try:
        Path(file_path).unlink(missing_ok=True)
    except OSError:
        current_app.logger.warning("重复简历临时文件清理失败: %s", file_path)


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


def _resume_detail_payload(candidate):
    return {
        "id": candidate.id,
        "candidate_id": candidate.id,
        "name_masked": candidate.name_masked,
        "owner_hr_id": candidate.owner_hr_id,
        "resume_json": candidate.resume_json,
        "tags": [{"tag": tag.tag, "score": tag.score} for tag in candidate.tags],
        "parse_status": candidate.parse_status,
        "parse_error": candidate.parse_error,
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
    from ..models import Job, PipelineStage, UploadBatch

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
    from ..services.match_service import MatchService

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
    display_name 用于结果展示（zip 内文件会带 "xxx.zip → 文件名" 前缀）。"""
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

    from ..models import CandidateTag
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


def _process_zip(
    svc,
    zip_path,
    zip_display_name,
    folder,
    results,
    upload_batch_id=None,
    target_demand_id=None,
    target_job_id=None,
):
    """安全解压 zip，逐个解析其中的文档或图片简历。
    安全防护：
      - 防 zip 炸弹：限制条目数、单文件与总解压大小。
      - 防路径穿越（zip slip）：忽略含 `..`、绝对路径或跳出目标目录的条目，只取 basename。
      - 跳过目录、隐藏文件（__MACOSX/.DS_Store 等）和非简历格式。
    zip 整体损坏或超限时，给一条 error 结果。"""
    # 为本 zip 单独建一个临时子目录，避免文件名冲突
    extract_dir = Path(folder) / f"zip_{uuid.uuid4().hex}"
    extract_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = zf.infolist()

            # 防 zip 炸弹：声明的解压总大小（用 zipinfo.file_size，避免实际解压炸弹）
            declared_total = sum(i.file_size for i in infos if not i.is_dir())
            if declared_total > ZIP_MAX_TOTAL_SIZE:
                results.append({
                    "file": zip_display_name,
                    "status": "error",
                    "reason": f"压缩包解压后总大小超过上限（{ZIP_MAX_TOTAL_SIZE // (1024 * 1024)}MB）",
                })
                return

            processed = 0          # 已处理（解析）的简历份数
            extracted_total = 0    # 实际已解压字节数
            extract_root = extract_dir.resolve()

            for info in infos:
                if processed >= ZIP_MAX_ENTRIES:
                    results.append({
                        "file": zip_display_name,
                        "status": "error",
                        "reason": f"压缩包内文件数量超过上限（{ZIP_MAX_ENTRIES}），其余文件未处理",
                    })
                    break

                name = info.filename
                # 跳过目录
                if info.is_dir():
                    continue

                # 防路径穿越：含 .. 或绝对路径（含驱动器/盘符）的条目直接忽略
                posix = PurePosixPath(name)
                if posix.is_absolute() or ".." in posix.parts or (":" in name) or name.startswith("/") or name.startswith("\\"):
                    continue

                # 只取 basename，不保留 zip 内目录结构
                base = os.path.basename(name.replace("\\", "/"))
                if not base:
                    continue

                # 跳过隐藏文件 / mac 元数据 / 非简历格式
                if base.startswith(".") or "__MACOSX" in name:
                    continue
                if not _is_resume(base):
                    continue
                if _ext(base) in BLOCKED_RESUME_EXTS:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "skipped",
                        "reason": "旧版 DOC 存在宏风险，请转换为 PDF 或 DOCX 后上传",
                    })
                    continue

                # 图片通过 Base64 发送到视觉模型，必须采用更严格的文件体积上限。
                file_size_limit = (
                    IMAGE_RESUME_MAX_FILE_SIZE
                    if _ext(base) in IMAGE_RESUME_EXTENSIONS
                    else ZIP_MAX_FILE_SIZE
                )
                if info.file_size > file_size_limit:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "skipped",
                        "reason": f"单个文件超过上限（{file_size_limit // (1024 * 1024)}MB）",
                    })
                    continue

                # 解压目标路径，并再次校验最终路径仍在目标目录内（双保险防穿越）
                out_name = f"{uuid.uuid4().hex}_{secure_filename(base)}"
                out_path = (extract_dir / out_name).resolve()
                if extract_root not in out_path.parents and out_path != extract_root:
                    # 解压后路径跳出了目标目录，忽略
                    continue

                # 流式解压，边读边累计大小，超总量则中止
                try:
                    with zf.open(info) as src, open(out_path, "wb") as dst:
                        remaining = ZIP_MAX_TOTAL_SIZE - extracted_total
                        chunk_size = 1024 * 64
                        written = 0
                        while True:
                            chunk = src.read(chunk_size)
                            if not chunk:
                                break
                            written += len(chunk)
                            # 实际解压超过单文件或总量上限：中止该文件
                            if written > ZIP_MAX_FILE_SIZE or written > remaining:
                                dst.close()
                                out_path.unlink(missing_ok=True)
                                raise ValueError("解压大小超过限制")
                            dst.write(chunk)
                        extracted_total += written
                except Exception as ex:
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "error",
                        "reason": f"解压失败：{ex}",
                    })
                    continue

                if _ext(base) in IMAGE_RESUME_EXTENSIONS:
                    try:
                        image_format, _, _ = inspect_image_file(out_path)
                    except ValueError as error:
                        out_path.unlink(missing_ok=True)
                        results.append({
                            "file": f"{zip_display_name} → {base}",
                            "status": "skipped",
                            "reason": str(error),
                        })
                        continue
                    if image_format != IMAGE_FORMAT_BY_EXT[_ext(base)]:
                        out_path.unlink(missing_ok=True)
                        results.append({
                            "file": f"{zip_display_name} → {base}",
                            "status": "skipped",
                            "reason": "图片实际格式与扩展名不匹配",
                        })
                        continue

                # 解析入库，结果标明来源 zip
                _process_resume(
                    svc,
                    str(out_path),
                    f"{zip_display_name} → {base}",
                    results,
                    upload_batch_id=upload_batch_id,
                    target_demand_id=target_demand_id,
                    target_job_id=target_job_id,
                )
                processed += 1

            # zip 内没有任何可处理的简历
            if processed == 0 and not any(r["file"].startswith(f"{zip_display_name} →") for r in results):
                results.append({
                    "file": zip_display_name,
                    "status": "skipped",
                    "reason": "压缩包内未找到 PDF、Word 或图片简历",
                })

    except zipfile.BadZipFile:
        results.append({"file": zip_display_name, "status": "error", "reason": "压缩包已损坏或不是有效的 ZIP 文件"})
    except Exception as e:
        results.append({"file": zip_display_name, "status": "error", "reason": f"压缩包处理失败：{e}"})


@bp.post("/resume/upload")
@require_auth
@require_role("recruiter", "manager", "admin")
@rate_limit("resume.upload")
def upload():
    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files provided"}), 400

    from flask import current_app
    folder = current_app.config.get("UPLOAD_FOLDER") or str(DEFAULT_UPLOAD_FOLDER)
    Path(folder).mkdir(parents=True, exist_ok=True)

    from ..models import UploadBatch

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
                "reason": "不支持该格式，请上传 PDF、DOCX、JPG、PNG、WebP、GIF 或 ZIP",
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

        if _ext(f.filename) == "zip":
            # zip：解压后逐个解析其中的简历
            _process_zip(
                svc,
                fpath,
                f.filename,
                folder,
                results,
                upload_batch_id=batch.id,
                target_demand_id=target_demand_id,
                target_job_id=target_job_id,
            )
            # 原始 zip 不再需要，删除（解压出的简历文件已单独保留）
            try:
                os.remove(fpath)
            except OSError:
                pass
        else:
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

    # total 改为实际产生的简历结果条数（zip 会展开成多条）
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
        candidate.parse_error = None
        candidate.deleted_at = now
        candidate.deleted_by = g.user_id
        candidate.anonymized_at = now
        for tag in candidate.tags:
            tag.tag = "已撤回"
            tag.score = None
            tag.org_id = g.org_id

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
    new_path = str(Path(folder) / f"{uuid.uuid4()}_{secure_filename(file_storage.filename)}")
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


def _candidate_source_payload(candidate):
    from ..models import Job, RecruitmentDemand, UploadBatch

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
