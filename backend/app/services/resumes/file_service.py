import hashlib
import mimetypes
import os
from pathlib import Path

from flask import current_app, g, jsonify, send_file
from image_resume_parser import (
    IMAGE_RESUME_EXTENSIONS,
    IMAGE_RESUME_MAX_FILE_SIZE,
    inspect_image_stream,
)
from runtime_paths import (
    DEFAULT_UPLOAD_FOLDER,
    RuntimePathError,
    resolve_stored_upload_path,
)

from ... import db
from ...api.access import can_access_candidate, same_org
from ...middleware.events import record_event
from ...models import Candidate


DOCUMENT_RESUME_EXTS = {"pdf", "docx"}
RESUME_EXTS = DOCUMENT_RESUME_EXTS | set(IMAGE_RESUME_EXTENSIONS)
BLOCKED_RESUME_EXTS = {"doc"}
ALLOWED = RESUME_EXTS | BLOCKED_RESUME_EXTS
RESUME_MAX_FILE_SIZE = 20 * 1024 * 1024
FILE_SIGNATURES = {
    "pdf": (b"%PDF-",),
    "doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    "docx": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "gif": (b"GIF87a", b"GIF89a"),
}
IMAGE_FORMAT_BY_EXT = {
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "gif": "GIF",
}
ORIGINAL_RESUME_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}



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
