#!/usr/bin/env python3
"""Back up pilot database data and uploaded resume files.

Environment:
  DATABASE_URL   MySQL, PostgreSQL, or sqlite:/// file URL
  UPLOAD_FOLDER  Directory containing uploaded resume files
  BACKUP_DIR     Destination directory for backup artifacts
"""

import argparse
import os
import shutil
import sqlite3
import subprocess
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

try:
    from scripts.upload_archive_validation import validated_upload_member_parts
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    from upload_archive_validation import validated_upload_member_parts


ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")


def _env_path(name, default):
    return Path(os.environ.get(name, default)).expanduser().resolve()


def _database_url():
    return os.environ.get("DATABASE_URL", "sqlite:///" + str(ROOT / "backend" / "hireinsight.db"))


def _backup_dir():
    return _env_path("BACKUP_DIR", str(ROOT / "backups"))


def _upload_folder():
    return _env_path("UPLOAD_FOLDER", str(ROOT / "backend" / "uploads"))


def _timestamp():
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _create_snapshot_dir(backup_root, suffix=""):
    backup_root.mkdir(parents=True, exist_ok=True)
    stem = f"{_timestamp()}{suffix}"
    for index in range(1000):
        name = stem if index == 0 else f"{stem}-{index}"
        target_dir = backup_root / name
        try:
            target_dir.mkdir(exist_ok=False)
            return target_dir
        except FileExistsError:
            continue
    raise SystemExit(f"Unable to allocate unique backup directory under {backup_root}")


def database_url_summary(database_url):
    """Return a useful database target label without credentials or query values."""
    parsed = urlparse(database_url)
    scheme = (parsed.scheme.split("+", 1)[0] or "database").lower()
    if scheme == "sqlite":
        database = Path(unquote(parsed.path)).name or "database"
        return f"sqlite@local/{database}"
    if scheme not in {"mysql", "postgresql"}:
        return "database@unknown/default"

    try:
        host = parsed.hostname
    except ValueError:
        return "database@unknown/default"
    if not parsed.netloc or not host:
        return "database@unknown/default"
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    try:
        port = f":{parsed.port}" if parsed.port else ""
    except ValueError:
        port = ""
    database = unquote(parsed.path.lstrip("/")) or "default"
    return f"{scheme}@{host}{port}/{database}"


def _paths_overlap(first, second):
    return first == second or first in second.parents or second in first.parents


def _validate_backup_paths(database_url, backup_root, upload_folder):
    project_root = ROOT.resolve()
    backup_root = backup_root.expanduser().resolve()
    upload_folder = upload_folder.expanduser().resolve()
    filesystem_root = Path(backup_root.anchor)

    if backup_root == filesystem_root or backup_root == project_root or backup_root in project_root.parents:
        raise SystemExit(f"Refusing unsafe backup path: backups={backup_root}")
    if upload_folder == filesystem_root or upload_folder == project_root or upload_folder in project_root.parents:
        raise SystemExit(f"Refusing unsafe backup path: uploads={upload_folder}")
    if _paths_overlap(backup_root, upload_folder):
        raise SystemExit(
            f"Refusing unsafe backup path overlap: backups={backup_root} uploads={upload_folder}"
        )
    if database_url.startswith("sqlite:///"):
        sqlite_path = Path(database_url[len("sqlite:///"):]).expanduser().resolve()
        if _paths_overlap(backup_root, sqlite_path):
            raise SystemExit(
                f"Refusing unsafe backup path overlap: backups={backup_root} database={sqlite_path}"
            )


def _postgres_env(database_url):
    normalized = database_url.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlparse(normalized)
    env = os.environ.copy()
    env.update({
        "PGHOST": parsed.hostname or "",
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGUSER": unquote(parsed.username or ""),
    })
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


def _backup_database(database_url, target_dir, dry_run=False):
    if database_url.startswith(("mysql://", "mysql+pymysql://")):
        dump_path = target_dir / "database.sql"
        parsed, env = _mysql_env(database_url)
        database = unquote(parsed.path.lstrip("/"))
        command = [
            "mysqldump",
            "-h", parsed.hostname or "",
            "-P", str(parsed.port or 3306),
            "-u", unquote(parsed.username or ""),
            "--single-transaction",
            "--routines",
            "--triggers",
            database,
        ]
        if dry_run:
            print(
                "mysqldump --single-transaction --routines --triggers "
                f"--result-file {dump_path} (MYSQL_HOST={parsed.hostname or ''} MYSQL_DATABASE={database})"
            )
            return
        with dump_path.open("w", encoding="utf-8") as output:
            subprocess.run(command, env=env, stdout=output, check=True)
        return

    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        dump_path = target_dir / "database.dump"
        command = ["pg_dump", "--format=custom", "--file", str(dump_path)]
        if dry_run:
            env = _postgres_env(database_url)
            print(
                "pg_dump --format=custom --file "
                f"{dump_path} (PGHOST={env.get('PGHOST')} PGDATABASE={env.get('PGDATABASE')})"
            )
            return
        subprocess.run(command, env=_postgres_env(database_url), check=True)
        return

    if database_url.startswith("sqlite:///"):
        source = Path(database_url[len("sqlite:///"):]).expanduser().resolve()
        target = target_dir / "database.sqlite"
        if not source.is_file():
            raise SystemExit(f"SQLite database does not exist: {source}")
        if dry_run:
            print(f"copy sqlite database {source} -> {target}")
            return
        source_connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
        target_connection = sqlite3.connect(target)
        try:
            source_connection.backup(target_connection)
            target_connection.commit()
        finally:
            target_connection.close()
            source_connection.close()
        return

    raise SystemExit("Unsupported DATABASE_URL. Use MySQL, PostgreSQL, or sqlite:/// path.")


def _backup_uploads(upload_folder, target_dir, dry_run=False):
    target = target_dir / "uploads.tar.gz"
    if upload_folder.exists():
        _validate_upload_tree(upload_folder)
    if dry_run:
        print(f"tar uploads {upload_folder} -> {target}")
        return
    if not upload_folder.exists():
        upload_folder.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, "w:gz") as archive:
        archive.add(upload_folder, arcname="uploads")
    _validate_upload_archive(target)


def _validate_upload_tree(upload_folder):
    if upload_folder.is_symlink():
        raise SystemExit(f"Upload folder contains symbolic link: {upload_folder}")
    pending = [upload_folder]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                path = Path(entry.path)
                if entry.is_symlink():
                    raise SystemExit(f"Upload folder contains symbolic link: {path}")
                if entry.is_dir(follow_symlinks=False):
                    pending.append(path)
                elif not entry.is_file(follow_symlinks=False):
                    raise SystemExit(f"Upload folder contains unsupported file type: {path}")


def _validate_upload_archive(tar_path):
    with tarfile.open(tar_path, "r:gz") as archive:
        for member in archive.getmembers():
            validated_upload_member_parts(member)


def main():
    parser = argparse.ArgumentParser(description="Back up pilot database and uploads.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without writing files.")
    args = parser.parse_args()

    backup_root = _backup_dir()
    database_url = _database_url()
    upload_folder = _upload_folder()
    _validate_backup_paths(database_url, backup_root, upload_folder)
    if args.dry_run:
        target_dir = backup_root / _timestamp()
        print(f"backup dir {target_dir}")
    else:
        target_dir = _create_snapshot_dir(backup_root)

    try:
        _backup_database(database_url, target_dir, dry_run=args.dry_run)
        _backup_uploads(upload_folder, target_dir, dry_run=args.dry_run)
    except BaseException:
        if not args.dry_run:
            shutil.rmtree(target_dir, ignore_errors=True)
        raise

    print("backup plan ok" if args.dry_run else f"backup complete: {target_dir}")


if __name__ == "__main__":
    main()
