import hashlib
import os
import uuid
import zipfile
from datetime import timedelta
from pathlib import Path, PurePosixPath

from flask import current_app, g, jsonify, request
from image_resume_parser import IMAGE_RESUME_EXTENSIONS, IMAGE_RESUME_MAX_FILE_SIZE, inspect_image_file
from runtime_paths import DEFAULT_UPLOAD_FOLDER

from ... import db
from ...middleware.events import record_event
from ...models import Candidate, Event, UploadBatch
from ...source_channels import normalize_resume_source_channel
from ...time_utils import utc_now
from ..demand_context_service import DemandContextError, can_manage_demand, resolve_demand_context
from ..resume_service import ResumeBatchService
from .file_service import (
    BLOCKED_RESUME_EXTS,
    IMAGE_FORMAT_BY_EXT,
    _allowed,
    _ext,
    _is_resume,
    _stored_resume_filename,
    _validate_upload_file,
)
from .parse_service import (
    _duplicate_upload_result,
    _process_resume,
    _record_duplicate_upload,
)


ZIP_MAX_ENTRIES = 100
ZIP_MAX_FILE_SIZE = 20 * 1024 * 1024
ZIP_MAX_TOTAL_SIZE = 200 * 1024 * 1024
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
                out_name = _stored_resume_filename(base)
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
                    if isinstance(ex, ValueError) and str(ex) == "解压大小超过限制":
                        reason = "解压失败：解压大小超过限制"
                    else:
                        current_app.logger.exception(
                            "压缩包 %s 内文件 %s 解压失败",
                            zip_display_name,
                            base,
                        )
                        reason = "解压失败，请检查压缩包内容"
                    results.append({
                        "file": f"{zip_display_name} → {base}",
                        "status": "error",
                        "reason": reason,
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
    except Exception:
        current_app.logger.exception("压缩包 %s 处理失败", zip_display_name)
        results.append({
            "file": zip_display_name,
            "status": "error",
            "reason": "压缩包处理失败，请检查文件后重试",
        })


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
                "reason": "不支持该格式，请上传 PDF、DOCX、JPG、PNG、WebP、GIF 或 ZIP",
            })
            continue
        invalid_reason = _validate_upload_file(f)
        if invalid_reason:
            results.append({"file": f.filename, "status": "skipped", "reason": invalid_reason})
            continue

        # 落盘（普通简历直接落盘并保留路径供 raw_file_path 使用）
        fname = _stored_resume_filename(f.filename)
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
