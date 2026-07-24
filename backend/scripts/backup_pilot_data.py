#!/usr/bin/env python3
"""Back up the pilot database and uploaded resume files safely.

Every completed snapshot contains a database artifact, ``uploads.tar.gz`` and
``manifest.json``. SQLite uses its online backup API so committed WAL data is
included. Snapshot names are reserved exclusively and never reused.
"""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from runtime_paths import (
    RuntimePathError,
    requires_persistent_uploads,
    resolve_upload_folder,
)

try:
    from scripts.upload_archive_validation import validate_upload_archive
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    from upload_archive_validation import validate_upload_archive


ROOT = BACKEND_DIR.parent
load_dotenv(ROOT / "backend" / ".env")


def _env_path(name, default):
    return Path(os.environ.get(name, default)).expanduser().resolve()


def _database_url():
    return os.environ.get("DATABASE_URL", "sqlite:///" + str(ROOT / "backend" / "hireinsight.db"))


def _backup_dir():
    return _env_path("BACKUP_DIR", str(ROOT / "backups"))


def _upload_folder():
    try:
        return resolve_upload_folder(
            os.environ.get("UPLOAD_FOLDER"),
            project_root=ROOT,
            require_persistent=requires_persistent_uploads(
                os.environ.get("FLASK_DEBUG")
            ),
        )
    except RuntimePathError as exc:
        raise SystemExit(str(exc)) from None


def _timestamp():
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _database_kind(database_url):
    if database_url.startswith(("mysql://", "mysql+pymysql://")):
        return "mysql"
    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        return "postgresql"
    if database_url.startswith("sqlite:///"):
        return "sqlite"
    raise SystemExit("Unsupported DATABASE_URL. Use MySQL, PostgreSQL, or sqlite:/// path.")


def _sqlite_path(database_url):
    if not database_url.startswith("sqlite:///"):
        return None
    raw_path = database_url[len("sqlite:///"):].split("?", 1)[0].split("#", 1)[0]
    return Path(unquote(raw_path)).expanduser().resolve()


def _safe_database_label(database_url):
    """Return dialect/host/database only, never credentials or query values."""

    kind = _database_kind(database_url)
    if kind == "sqlite":
        path = _sqlite_path(database_url)
        return f"sqlite:///{path.name if path else 'database'}"

    parsed = urlparse(database_url)
    hostname = parsed.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    host = hostname + (f":{parsed.port}" if parsed.port else "")
    database = unquote(parsed.path.lstrip("/"))
    return f"{parsed.scheme}://{host}/{database}"


def _paths_overlap(first, second):
    first = Path(first).resolve()
    second = Path(second).resolve()
    return first == second or first in second.parents or second in first.parents


def _validate_backup_paths(database_url, backup_root, upload_folder):
    backup_root = Path(backup_root).expanduser().resolve()
    upload_folder = Path(upload_folder).expanduser().absolute()
    resolved_uploads = upload_folder.resolve()
    project_root = ROOT.resolve()
    filesystem_root = Path(backup_root.anchor)

    if backup_root in {filesystem_root, project_root} or backup_root in project_root.parents:
        raise SystemExit(f"Refusing unsafe backup path: backups={backup_root}")
    if resolved_uploads == filesystem_root or resolved_uploads == project_root or resolved_uploads in project_root.parents:
        raise SystemExit(f"Refusing unsafe backup path: uploads={resolved_uploads}")
    if _paths_overlap(backup_root, resolved_uploads):
        raise SystemExit(
            f"Refusing unsafe backup path overlap: backups={backup_root} uploads={resolved_uploads}"
        )

    sqlite_path = _sqlite_path(database_url)
    if sqlite_path is not None and _paths_overlap(backup_root, sqlite_path):
        raise SystemExit(
            f"Refusing unsafe backup path overlap: backups={backup_root} database={sqlite_path}"
        )


def _postgres_env(database_url):
    normalized = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlparse(normalized)
    env = os.environ.copy()
    env.update(
        {
            "PGHOST": parsed.hostname or "",
            "PGPORT": str(parsed.port or 5432),
            "PGDATABASE": unquote(parsed.path.lstrip("/")),
            "PGUSER": unquote(parsed.username or ""),
        }
    )
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    return env


def _mysql_env(database_url):
    normalized = database_url.replace("mysql+pymysql://", "mysql://", 1)
    parsed = urlparse(normalized)
    env = os.environ.copy()
    if parsed.password:
        env["MYSQL_PWD"] = unquote(parsed.password)
    return parsed, env


def _reserve_snapshot_dir(backup_root, basename):
    """Create an exclusive snapshot directory, adding a numeric suffix on collision."""

    backup_root = Path(backup_root).expanduser().resolve()
    backup_root.mkdir(parents=True, exist_ok=True)
    for sequence in range(10_000):
        suffix = "" if sequence == 0 else f"-{sequence:02d}"
        candidate = backup_root / f"{basename}{suffix}"
        try:
            candidate.mkdir(mode=0o700)
            candidate.chmod(0o700)
            return candidate
        except FileExistsError:
            continue
    raise SystemExit(f"无法为备份分配唯一目录: {backup_root / basename}")


def _preview_snapshot_dir(backup_root, basename):
    backup_root = Path(backup_root).expanduser().resolve()
    candidate = backup_root / basename
    sequence = 0
    while candidate.exists():
        sequence += 1
        candidate = backup_root / f"{basename}-{sequence:02d}"
    return candidate


def _backup_database(database_url, target_dir, dry_run=False):
    target_dir = Path(target_dir)
    kind = _database_kind(database_url)
    if kind == "mysql":
        dump_path = target_dir / "database.sql"
        parsed, env = _mysql_env(database_url)
        database = unquote(parsed.path.lstrip("/"))
        mysqldump = shutil.which("mysqldump")
        if not mysqldump:
            raise SystemExit("mysqldump client was not found; backup aborted.")
        command = [
            mysqldump,
            "--protocol=TCP",
            "-h",
            parsed.hostname or "",
            "-P",
            str(parsed.port or 3306),
            "-u",
            unquote(parsed.username or ""),
            "--single-transaction",
            "--routines",
            "--triggers",
            database,
        ]
        if dry_run:
            print(
                "mysqldump --protocol=TCP --single-transaction --routines "
                f"--triggers --result-file {dump_path} (MYSQL_DATABASE={database})"
            )
            return dump_path
        try:
            with dump_path.open("wb") as output:
                dump_path.chmod(0o600)
                subprocess.run(command, env=env, stdout=output, check=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            dump_path.unlink(missing_ok=True)
            exit_code = getattr(exc, "returncode", "unavailable")
            raise SystemExit(
                "mysqldump failed for "
                f"{_safe_database_label(database_url)}; backup aborted (exit={exit_code})"
            ) from None
        return dump_path

    if kind == "postgresql":
        dump_path = target_dir / "database.dump"
        command = ["pg_dump", "--format=custom", "--file", str(dump_path)]
        if dry_run:
            env = _postgres_env(database_url)
            print(
                "pg_dump --format=custom --file "
                f"{dump_path} (PGHOST={env.get('PGHOST')} PGDATABASE={env.get('PGDATABASE')})"
            )
            return dump_path
        try:
            subprocess.run(command, env=_postgres_env(database_url), check=True)
            dump_path.chmod(0o600)
        except (OSError, subprocess.CalledProcessError) as exc:
            dump_path.unlink(missing_ok=True)
            exit_code = getattr(exc, "returncode", "unavailable")
            raise SystemExit(
                f"pg_dump failed for {_safe_database_label(database_url)} (exit={exit_code})"
            ) from None
        return dump_path

    source = _sqlite_path(database_url)
    if source is None or not source.is_file():
        raise SystemExit(f"找不到 SQLite 数据库文件: {source}")
    target = target_dir / source.name
    if dry_run:
        print(f"sqlite online backup {source} -> {target}")
        return target

    source_connection = sqlite3.connect(str(source))
    target_connection = sqlite3.connect(str(target))
    try:
        source_connection.backup(target_connection)
        target_connection.commit()
        integrity = target_connection.execute("PRAGMA integrity_check").fetchone()
        if integrity != ("ok",):
            raise SystemExit(f"SQLite 备份完整性检查失败: {integrity}")
    finally:
        target_connection.close()
        source_connection.close()
    target.chmod(0o600)
    return target


def _portable_name(name):
    if not name or name in {".", ".."} or "\\" in name or ":" in name or "\x00" in name:
        raise SystemExit(f"uploads 中包含不可移植的文件名: {name!r}")


def _iter_upload_entries(upload_folder):
    if not upload_folder.exists():
        return
    if upload_folder.is_symlink():
        raise SystemExit(f"uploads 备份拒绝符号链接目录: {upload_folder}")
    if not upload_folder.is_dir():
        raise SystemExit(f"uploads 路径不是安全目录: {upload_folder}")

    def walk(directory, relative):
        with os.scandir(directory) as entries:
            for entry in sorted(entries, key=lambda item: item.name):
                _portable_name(entry.name)
                entry_path = Path(entry.path)
                entry_relative = relative / entry.name
                if entry.is_symlink():
                    raise SystemExit(f"uploads 备份拒绝符号链接: {entry_path}")
                if entry.is_dir(follow_symlinks=False):
                    yield entry_path, entry_relative, True
                    yield from walk(entry_path, entry_relative)
                elif entry.is_file(follow_symlinks=False):
                    yield entry_path, entry_relative, False
                else:
                    raise SystemExit(f"uploads 备份拒绝特殊文件: {entry_path}")

    yield from walk(upload_folder, Path())


def _backup_uploads(upload_folder, target_dir, dry_run=False):
    upload_folder = Path(upload_folder).expanduser().absolute()
    target = Path(target_dir) / "uploads.tar.gz"
    entries = list(_iter_upload_entries(upload_folder)) if upload_folder.exists() else []
    if dry_run:
        print(f"tar validated uploads {upload_folder} -> {target}")
        return target

    with tarfile.open(target, "w:gz") as archive:
        root = tarfile.TarInfo("uploads")
        root.type = tarfile.DIRTYPE
        root.mode = 0o750
        root.mtime = int(datetime.now(UTC).timestamp())
        archive.addfile(root)
        for source, relative, is_directory in entries:
            arcname = "uploads/" + relative.as_posix()
            info = archive.gettarinfo(str(source), arcname=arcname)
            info.uid = 0
            info.gid = 0
            info.uname = ""
            info.gname = ""
            if is_directory:
                archive.addfile(info)
            else:
                with source.open("rb") as stream:
                    archive.addfile(info, stream)
    target.chmod(0o600)

    try:
        validate_upload_archive(target)
    except ValueError as exc:
        raise SystemExit(f"uploads 备份校验失败: {exc}") from exc
    return target


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_manifest(path):
    path = Path(path)
    return {"artifact": path.name, "size": path.stat().st_size, "sha256": _sha256(path)}


def _write_manifest(
    target_dir,
    database_url,
    database_artifact,
    uploads_artifact,
    upload_folder,
    metadata=None,
):
    manifest = {
        "format_version": 1,
        "status": "complete",
        "created_at": datetime.now(UTC).isoformat(),
        "database": {"kind": _database_kind(database_url), **_artifact_manifest(database_artifact)},
        "uploads": {
            **_artifact_manifest(uploads_artifact),
            "source_root": str(Path(upload_folder).resolve()),
        },
    }
    if metadata:
        manifest["metadata"] = dict(metadata)
    temporary = Path(target_dir) / ".manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    os.replace(temporary, Path(target_dir) / "manifest.json")
    return manifest


def create_backup_snapshot(database_url, upload_folder, backup_root, *, label=None, metadata=None):
    _validate_backup_paths(database_url, backup_root, upload_folder)
    basename = _timestamp() + (f"-{label}" if label else "")
    target_dir = _reserve_snapshot_dir(backup_root, basename)
    try:
        database_artifact = _backup_database(database_url, target_dir, dry_run=False)
        uploads_artifact = _backup_uploads(upload_folder, target_dir, dry_run=False)
        _write_manifest(
            target_dir,
            database_url,
            database_artifact,
            uploads_artifact,
            upload_folder,
            metadata=metadata,
        )
    except BaseException:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise
    return target_dir


def main():
    parser = argparse.ArgumentParser(description="Back up pilot database and uploads.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without writing files.")
    args = parser.parse_args()

    database_url = _database_url()
    backup_root = _backup_dir()
    upload_folder = _upload_folder()
    _validate_backup_paths(database_url, backup_root, upload_folder)
    basename = _timestamp()
    if args.dry_run:
        target_dir = _preview_snapshot_dir(backup_root, basename)
        print(f"backup dir {target_dir}")
        print(f"database {_safe_database_label(database_url)}")
        _backup_database(database_url, target_dir, dry_run=True)
        _backup_uploads(upload_folder, target_dir, dry_run=True)
        print("backup plan ok")
        return

    target_dir = create_backup_snapshot(database_url, upload_folder, backup_root)
    print(f"backup complete: {target_dir}")


if __name__ == "__main__":
    main()
