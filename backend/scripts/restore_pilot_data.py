#!/usr/bin/env python3
"""Restore pilot database data and uploaded resume files from a backup snapshot.

Environment:
  DATABASE_URL   PostgreSQL URL or sqlite:/// file URL to restore into
  UPLOAD_FOLDER  Destination directory for uploaded resume files

Usage:
  python backend/scripts/restore_pilot_data.py --backup-path /var/backups/zhipin/20260623-010101 --confirm
"""

import argparse
import os
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
from pathlib import Path

from backup_pilot_data import _database_url, _postgres_env, _upload_folder
from upload_archive_validation import validated_upload_member_parts


ROOT = Path(__file__).resolve().parents[2]


def _is_postgres(database_url):
    return database_url.startswith(("postgresql://", "postgresql+psycopg://"))


def _sqlite_path(database_url):
    if not database_url.startswith("sqlite:///"):
        return None
    return Path(database_url[len("sqlite:///"):]).expanduser().resolve()


def _paths_overlap(first, second):
    return first == second or first in second.parents or second in first.parents


def _validate_restore_paths(backup_path, upload_folder, database_url):
    backup_path = backup_path.expanduser().resolve()
    upload_folder = upload_folder.expanduser().resolve()
    project_root = ROOT.resolve()
    if upload_folder == project_root or upload_folder in project_root.parents:
        raise SystemExit(f"Refusing unsafe restore path: uploads={upload_folder}")
    if _paths_overlap(upload_folder, backup_path):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: uploads={upload_folder} backup={backup_path}"
        )
    sqlite_target = _sqlite_path(database_url)
    if sqlite_target is not None and _paths_overlap(upload_folder, sqlite_target):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: uploads={upload_folder} database={sqlite_target}"
        )
    if sqlite_target is not None and _paths_overlap(backup_path, sqlite_target):
        raise SystemExit(
            f"Refusing unsafe restore path overlap: backup={backup_path} database={sqlite_target}"
        )


def _validate_sqlite_artifact(source):
    connection = None
    try:
        connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
        result = connection.execute("PRAGMA quick_check").fetchone()
    except sqlite3.DatabaseError as exc:
        raise SystemExit(f"Invalid SQLite backup artifact: {source}: {exc}") from exc
    finally:
        if connection is not None:
            connection.close()
    if result != ("ok",):
        raise SystemExit(f"Invalid SQLite backup artifact: {source}: {result}")


def _database_artifact(database_url, backup_path):
    if _is_postgres(database_url):
        dump_path = backup_path / "database.dump"
        if not dump_path.is_file():
            raise SystemExit(f"找不到 PostgreSQL 备份文件: {dump_path}")
        return dump_path

    target = _sqlite_path(database_url)
    if target is not None:
        canonical = backup_path / "database.sqlite"
        if canonical.is_file():
            _validate_sqlite_artifact(canonical)
            return canonical
        legacy_exact = backup_path / target.name
        if legacy_exact.is_file():
            _validate_sqlite_artifact(legacy_exact)
            return legacy_exact
        raise SystemExit(
            f"找不到 SQLite 备份文件: {canonical}"
            f" （兼容旧快照时仅接受精确文件名 {legacy_exact.name}）"
        )

    raise SystemExit("Unsupported DATABASE_URL. Use PostgreSQL or sqlite:/// path.")


def _restore_database(database_url, backup_path, dry_run=False):
    source = _database_artifact(database_url, backup_path)
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
    if target is not None:
        if dry_run:
            print(f"copy sqlite database {source} -> {target}")
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        handle, staged_name = tempfile.mkstemp(prefix=f".{target.name}.restore-", dir=target.parent)
        os.close(handle)
        staged = Path(staged_name)
        try:
            shutil.copy2(source, staged)
            os.replace(staged, target)
        finally:
            staged.unlink(missing_ok=True)
        return

    raise SystemExit("Unsupported DATABASE_URL. Use PostgreSQL or sqlite:/// path.")


def _validated_upload_members(tar_path, upload_folder):
    if not tar_path.is_file():
        raise SystemExit(f"找不到 uploads 备份文件: {tar_path}")

    upload_folder = upload_folder.expanduser().resolve()
    planned = []
    with tarfile.open(tar_path, "r:gz") as archive:
        for member in archive.getmembers():
            parts = validated_upload_member_parts(member)
            if not parts:
                target = upload_folder
            else:
                target = (upload_folder / Path(*parts)).resolve()
            if target != upload_folder and upload_folder not in target.parents:
                raise SystemExit(f"不安全的 uploads 备份路径: {member.name}")
            planned.append((member, target))
    return planned


def _stage_uploads(tar_path, upload_folder):
    upload_folder = upload_folder.expanduser().resolve()
    planned = _validated_upload_members(tar_path, upload_folder)
    upload_folder.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{upload_folder.name}.restore-", dir=upload_folder.parent))
    try:
        with tarfile.open(tar_path, "r:gz") as archive:
            for member, target in planned:
                relative = target.relative_to(upload_folder) if target != upload_folder else Path()
                staged_target = staging / relative
                if member.isdir():
                    staged_target.mkdir(parents=True, exist_ok=True)
                else:
                    staged_target.parent.mkdir(parents=True, exist_ok=True)
                    source = archive.extractfile(member)
                    if source is None:
                        raise SystemExit(f"无法读取 uploads 备份文件: {member.name}")
                    with source, open(staged_target, "wb") as destination:
                        shutil.copyfileobj(source, destination)
        return staging
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _replace_upload_directory(staging, upload_folder):
    upload_folder = upload_folder.expanduser().resolve()
    previous = None
    if upload_folder.exists():
        previous = Path(tempfile.mkdtemp(prefix=f".{upload_folder.name}.previous-", dir=upload_folder.parent))
        previous.rmdir()
        os.replace(upload_folder, previous)
    try:
        os.replace(staging, upload_folder)
    except BaseException:
        if previous is not None and previous.exists():
            os.replace(previous, upload_folder)
        raise
    if previous is not None:
        shutil.rmtree(previous, ignore_errors=True)


def _safe_extract_uploads(tar_path, upload_folder, dry_run=False):
    upload_folder = upload_folder.expanduser().resolve()
    _validated_upload_members(tar_path, upload_folder)
    if dry_run:
        print(f"extract uploads {tar_path} -> {upload_folder}")
        return

    staging = _stage_uploads(tar_path, upload_folder)
    _replace_upload_directory(staging, upload_folder)


def main():
    parser = argparse.ArgumentParser(description="Restore pilot database and uploads from a backup snapshot.")
    parser.add_argument("--backup-path", required=True, help="Backup snapshot directory created by backup_pilot_data.py.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without changing files.")
    parser.add_argument("--confirm", action="store_true", help="Required for destructive restore.")
    args = parser.parse_args()

    backup_path = Path(args.backup_path).expanduser().resolve()
    if not backup_path.is_dir():
        raise SystemExit(f"备份目录不存在: {backup_path}")
    if not args.dry_run and not args.confirm:
        raise SystemExit("恢复会覆盖当前数据库和 uploads。请确认备份无误后添加 --confirm。")

    database_url = _database_url()
    upload_folder = _upload_folder()
    uploads_archive = backup_path / "uploads.tar.gz"
    _validate_restore_paths(backup_path, upload_folder, database_url)
    _database_artifact(database_url, backup_path)

    if args.dry_run:
        _validated_upload_members(uploads_archive, upload_folder)
        _restore_database(database_url, backup_path, dry_run=True)
        print(f"extract uploads {uploads_archive} -> {upload_folder}")
    else:
        staged_uploads = _stage_uploads(uploads_archive, upload_folder)
        try:
            _restore_database(database_url, backup_path, dry_run=False)
            _replace_upload_directory(staged_uploads, upload_folder)
        finally:
            if staged_uploads.exists():
                shutil.rmtree(staged_uploads, ignore_errors=True)

    print("restore plan ok" if args.dry_run else f"restore complete: {backup_path}")


if __name__ == "__main__":
    main()
