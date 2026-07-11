#!/usr/bin/env python3
"""Restore a validated pilot snapshot.

The complete snapshot is validated before either the database or uploads are
changed. Uploads are extracted into a sibling staging directory and installed
with a rollback rename. MySQL restore remains deliberately fail closed until a
tested import path is implemented; ``--dry-run`` still shows the manual plan.
"""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
from pathlib import Path

try:
    from scripts.backup_pilot_data import (
        _database_kind,
        _database_url,
        _postgres_env,
        _safe_database_label,
        _sqlite_path,
        _upload_folder,
    )
    from scripts.upload_archive_validation import (
        UploadArchiveError,
        extract_upload_archive,
        validate_upload_archive,
    )
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    from backup_pilot_data import (
        _database_kind,
        _database_url,
        _postgres_env,
        _safe_database_label,
        _sqlite_path,
        _upload_folder,
    )
    from upload_archive_validation import (
        UploadArchiveError,
        extract_upload_archive,
        validate_upload_archive,
    )


def _is_postgres(database_url):
    return database_url.startswith(("postgresql://", "postgresql+psycopg://"))


def _is_mysql(database_url):
    return database_url.startswith(("mysql://", "mysql+pymysql://"))


def _paths_overlap(first, second):
    first = Path(first).resolve()
    second = Path(second).resolve()
    return first == second or first in second.parents or second in first.parents


def _validate_restore_paths(backup_path, upload_folder, database_url):
    backup_path = Path(backup_path).expanduser().resolve()
    lexical_uploads = Path(upload_folder).expanduser().absolute()
    if lexical_uploads.is_symlink():
        raise SystemExit(f"Refusing unsafe restore path: uploads is a symbolic link: {lexical_uploads}")
    resolved_uploads = lexical_uploads.resolve()
    project_root = Path(__file__).resolve().parents[2]
    filesystem_root = Path(resolved_uploads.anchor)
    if resolved_uploads == filesystem_root or resolved_uploads == project_root or resolved_uploads in project_root.parents:
        raise SystemExit(f"Refusing unsafe restore path: uploads={resolved_uploads}")
    if _paths_overlap(backup_path, resolved_uploads):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: backup={backup_path} uploads={resolved_uploads}"
        )

    sqlite_target = _sqlite_path(database_url)
    if sqlite_target is not None and _paths_overlap(sqlite_target, resolved_uploads):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: database={sqlite_target} uploads={resolved_uploads}"
        )
    if sqlite_target is not None and _paths_overlap(sqlite_target, backup_path):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: database={sqlite_target} backup={backup_path}"
        )


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_artifact_path(backup_path, name):
    if not isinstance(name, str) or not name or Path(name).name != name or "\\" in name or ":" in name:
        raise SystemExit(f"备份 manifest 包含不安全的产物路径: {name!r}")
    return backup_path / name


def _load_and_validate_manifest(backup_path):
    manifest_path = backup_path / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"备份 manifest 无法读取: {exc}") from exc

    if manifest.get("format_version") != 1 or manifest.get("status") != "complete":
        raise SystemExit("备份 manifest 校验失败: 快照未标记为完整版本")
    for section in ("database", "uploads"):
        item = manifest.get(section)
        if not isinstance(item, dict):
            raise SystemExit(f"备份 manifest 校验失败: 缺少 {section}")
        artifact = _safe_artifact_path(backup_path, item.get("artifact"))
        if not artifact.is_file():
            raise SystemExit(f"备份 manifest 校验失败: 找不到 {artifact}")
        if artifact.stat().st_size != item.get("size") or _sha256(artifact) != item.get("sha256"):
            raise SystemExit(f"备份 manifest 校验失败: {artifact.name} 校验和不一致")
    return manifest


def _validate_sqlite_artifact(source):
    connection = None
    try:
        connection = sqlite3.connect(Path(source).resolve().as_uri() + "?mode=ro", uri=True)
        result = connection.execute("PRAGMA quick_check").fetchone()
    except sqlite3.DatabaseError as exc:
        raise SystemExit(f"SQLite 备份校验失败: {source}: {exc}") from exc
    finally:
        if connection is not None:
            connection.close()
    if result != ("ok",):
        raise SystemExit(f"SQLite 备份校验失败: {source}: {result}")


def _find_database_artifact(database_url, backup_path, manifest=None):
    kind = _database_kind(database_url)
    if manifest is not None:
        source_kind = manifest["database"].get("kind")
        if source_kind != kind:
            raise SystemExit(f"备份数据库类型 {source_kind!r} 与恢复目标 {kind!r} 不一致")
        source = _safe_artifact_path(backup_path, manifest["database"]["artifact"])
        if kind == "sqlite":
            _validate_sqlite_artifact(source)
        return source

    if kind == "postgresql":
        source = backup_path / "database.dump"
        if not source.is_file():
            raise SystemExit(f"找不到 PostgreSQL 备份文件: {source}")
        return source
    if kind == "mysql":
        source = backup_path / "database.sql"
        if not source.is_file():
            raise SystemExit(f"找不到 MySQL 备份文件: {source}")
        return source

    target = _sqlite_path(database_url)
    preferred = backup_path / target.name
    if preferred.is_file():
        _validate_sqlite_artifact(preferred)
        return preferred
    candidates = sorted(
        path
        for path in backup_path.iterdir()
        if path.is_file() and path.suffix.lower() in {".sqlite", ".sqlite3", ".db"}
    )
    if len(candidates) != 1:
        raise SystemExit(f"无法唯一确定 SQLite 备份文件: {backup_path}")
    _validate_sqlite_artifact(candidates[0])
    return candidates[0]


def _validate_snapshot(database_url, backup_path):
    manifest = _load_and_validate_manifest(backup_path)
    database_artifact = _find_database_artifact(database_url, backup_path, manifest=manifest)
    archive_path = backup_path / "uploads.tar.gz"
    if manifest is not None:
        archive_path = _safe_artifact_path(backup_path, manifest["uploads"]["artifact"])
    try:
        validate_upload_archive(archive_path)
    except UploadArchiveError as exc:
        raise SystemExit(f"不安全的 uploads 备份: {exc}") from exc
    return database_artifact, archive_path


def _remove_path(path):
    path = Path(path)
    if path.is_symlink() or path.is_file():
        path.unlink(missing_ok=True)
    elif path.exists():
        shutil.rmtree(path)


def _replace_file_atomically(source, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = target.parent / f".{target.name}.restore-{uuid.uuid4().hex}.tmp"
    rollback = target.parent / f".{target.name}.rollback-{uuid.uuid4().hex}"
    shutil.copy2(source, staged)

    staged_connection = sqlite3.connect(str(staged))
    try:
        integrity = staged_connection.execute("PRAGMA integrity_check").fetchone()
    finally:
        staged_connection.close()
    if integrity != ("ok",):
        staged.unlink(missing_ok=True)
        raise SystemExit(f"SQLite 备份完整性校验失败: {integrity}")

    had_target = target.exists() or target.is_symlink()
    if had_target:
        os.replace(target, rollback)
    try:
        os.replace(staged, target)
    except BaseException:
        if had_target and rollback.exists():
            os.replace(rollback, target)
        staged.unlink(missing_ok=True)
        raise
    else:
        _remove_path(rollback)


def _restore_database(database_url, backup_path, dry_run=False, database_artifact=None):
    backup_path = Path(backup_path)
    source = database_artifact or _find_database_artifact(database_url, backup_path)

    if _is_mysql(database_url):
        if dry_run:
            print(f"MySQL manual restore plan: {source} -> {_safe_database_label(database_url)}")
            return
        raise SystemExit("MySQL 自动恢复尚未实现；请在临时库由 DBA 导入 database.sql 并验收。")

    if _is_postgres(database_url):
        command = [
            "pg_restore",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--single-transaction",
            "--dbname",
            _postgres_env(database_url)["PGDATABASE"],
            str(source),
        ]
        if dry_run:
            print(" ".join(command))
            return
        subprocess.run(command, env=_postgres_env(database_url), check=True)
        return

    target = _sqlite_path(database_url)
    if target is None:
        raise SystemExit("Unsupported DATABASE_URL. Use MySQL, PostgreSQL, or sqlite:/// path.")
    if dry_run:
        print(f"atomic sqlite restore {source} -> {target}")
        return
    _replace_file_atomically(source, target)


def _swap_upload_directory(prepared, upload_folder):
    """Install prepared uploads and put the previous directory back on failure."""

    prepared = Path(prepared)
    upload_folder = Path(upload_folder)
    upload_folder.parent.mkdir(parents=True, exist_ok=True)
    rollback = upload_folder.parent / f".{upload_folder.name}.rollback-{uuid.uuid4().hex}"
    had_target = upload_folder.exists() or upload_folder.is_symlink()
    if had_target:
        os.replace(upload_folder, rollback)
    try:
        os.replace(prepared, upload_folder)
    except BaseException:
        if had_target and (rollback.exists() or rollback.is_symlink()):
            os.replace(rollback, upload_folder)
        raise
    else:
        _remove_path(rollback)


def _stage_uploads(tar_path, upload_folder):
    upload_folder = Path(upload_folder).expanduser().resolve()
    upload_folder.parent.mkdir(parents=True, exist_ok=True)
    prepared = Path(
        tempfile.mkdtemp(prefix=f".{upload_folder.name}.restore-", dir=str(upload_folder.parent))
    )
    try:
        extract_upload_archive(tar_path, prepared)
    except UploadArchiveError as exc:
        _remove_path(prepared)
        raise SystemExit(f"不安全的 uploads 备份: {exc}") from exc
    except BaseException:
        _remove_path(prepared)
        raise
    return prepared


def _safe_extract_uploads(tar_path, upload_folder, dry_run=False):
    tar_path = Path(tar_path)
    upload_folder = Path(upload_folder).expanduser().resolve()
    try:
        validate_upload_archive(tar_path)
    except UploadArchiveError as exc:
        raise SystemExit(f"不安全的 uploads 备份: {exc}") from exc
    if dry_run:
        print(f"validate and atomically restore uploads {tar_path} -> {upload_folder}")
        return

    prepared = _stage_uploads(tar_path, upload_folder)
    try:
        _swap_upload_directory(prepared, upload_folder)
    except BaseException:
        _remove_path(prepared)
        raise


def main():
    parser = argparse.ArgumentParser(description="Restore pilot database and uploads from a backup snapshot.")
    parser.add_argument("--backup-path", required=True, help="Backup snapshot directory created by backup_pilot_data.py.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print actions without changing files.")
    parser.add_argument("--confirm", action="store_true", help="Required for destructive restore.")
    args = parser.parse_args()

    backup_path = Path(args.backup_path).expanduser().resolve()
    if not backup_path.is_dir():
        raise SystemExit(f"备份目录不存在: {backup_path}")
    if not args.dry_run and not args.confirm:
        raise SystemExit("恢复会覆盖当前数据库和 uploads。请确认备份无误后添加 --confirm。")

    database_url = _database_url()
    upload_folder = _upload_folder()
    _validate_restore_paths(backup_path, upload_folder, database_url)
    database_artifact, archive_path = _validate_snapshot(database_url, backup_path)
    if args.dry_run:
        _restore_database(
            database_url,
            backup_path,
            dry_run=True,
            database_artifact=database_artifact,
        )
        _safe_extract_uploads(archive_path, upload_folder, dry_run=True)
    else:
        prepared_uploads = _stage_uploads(archive_path, upload_folder)
        try:
            _restore_database(
                database_url,
                backup_path,
                dry_run=False,
                database_artifact=database_artifact,
            )
            _swap_upload_directory(prepared_uploads, upload_folder)
        finally:
            _remove_path(prepared_uploads)

    print("restore plan ok" if args.dry_run else f"restore complete: {backup_path}")


if __name__ == "__main__":
    main()
