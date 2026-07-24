#!/usr/bin/env python3
"""Back up, migrate, and verify the MySQL pilot with fail-closed ordering."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT = BACKEND_DIR.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
TARGET_REVISION = "20260724_08"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.audit_mysql_pilot_schema import audit_database, safe_report


def _required_database_url():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required; preparation stopped.")
    if not database_url.startswith(("mysql://", "mysql+pymysql://")):
        raise SystemExit("MySQL DATABASE_URL is required; preparation stopped.")
    return database_url


def reject_conflicts(report):
    blockers = list(report.get("conflicts") or []) + list(report.get("errors") or [])
    if blockers:
        detail = safe_report({"conflicts": blockers})
        raise SystemExit(f"Schema audit found conflicts; preparation stopped: {detail}")


def create_backup():
    database_url = _required_database_url()
    for name in ("UPLOAD_FOLDER", "BACKUP_DIR"):
        if not os.environ.get(name, "").strip():
            raise SystemExit(f"{name} is required; preparation stopped.")

    from scripts import backup_pilot_data

    return backup_pilot_data.create_backup_snapshot(
        database_url,
        backup_pilot_data._upload_folder(),
        backup_pilot_data._backup_dir(),
        label="mysql-pilot-pre-08",
        metadata={"target_revision": TARGET_REVISION},
    )


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_artifact(snapshot, entry, label):
    if not isinstance(entry, dict):
        raise SystemExit(f"Backup manifest has no valid {label} artifact.")
    artifact_name = entry.get("artifact")
    if not isinstance(artifact_name, str) or Path(artifact_name).name != artifact_name:
        raise SystemExit(f"Backup manifest has an unsafe {label} artifact name.")
    artifact = snapshot / artifact_name
    if not artifact.is_file() or artifact.is_symlink():
        raise SystemExit(f"Backup manifest {label} artifact is incomplete.")
    if entry.get("size") != artifact.stat().st_size:
        raise SystemExit(f"Backup manifest {label} artifact size does not match.")
    expected_digest = entry.get("sha256")
    if not isinstance(expected_digest, str) or _sha256(artifact) != expected_digest:
        raise SystemExit(f"Backup manifest {label} artifact digest does not match.")


def require_complete_snapshot(snapshot):
    snapshot = Path(snapshot)
    if not snapshot.is_dir() or snapshot.is_symlink():
        raise SystemExit("Backup snapshot directory is incomplete.")
    manifest_path = snapshot / "manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise SystemExit("Backup snapshot has no complete manifest.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise SystemExit("Backup snapshot manifest is unreadable.") from None
    if manifest.get("format_version") != 1 or manifest.get("status") != "complete":
        raise SystemExit("Backup snapshot manifest is not complete.")
    _validate_artifact(snapshot, manifest.get("database"), "database")
    _validate_artifact(snapshot, manifest.get("uploads"), "uploads")
    return manifest


def run_alembic_upgrade(revision):
    if revision != TARGET_REVISION:
        raise SystemExit("Unexpected migration target; preparation stopped.")
    _required_database_url()
    command = [
        sys.executable,
        "-m",
        "alembic",
        "-c",
        str(ALEMBIC_INI),
        "upgrade",
        revision,
    ]
    try:
        subprocess.run(
            command,
            cwd=BACKEND_DIR,
            env=os.environ.copy(),
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        exit_code = getattr(exc, "returncode", "unavailable")
        raise SystemExit(f"Alembic upgrade failed (exit={exit_code}).") from None


def run_migrations():
    """Compatibility entry point for callers that do not pass a revision."""

    run_alembic_upgrade(TARGET_REVISION)


def require_head_and_schema(report, revision):
    current = (report.get("revision") or {}).get("current")
    if (
        not report.get("ok")
        or current != revision
        or report.get("missing")
        or report.get("conflicts")
        or report.get("errors")
    ):
        detail = safe_report(
            {
                "revision": report.get("revision"),
                "missing": report.get("missing") or [],
                "conflicts": report.get("conflicts") or [],
                "errors": report.get("errors") or [],
            }
        )
        raise SystemExit(
            f"Post-migration schema verification failed; preparation stopped: {detail}"
        )


def print_safe_summary(report):
    print(safe_report(report))


def prepare(*, apply):
    before = audit_database()
    reject_conflicts(before)
    if not apply:
        print_safe_summary(before)
        return 0

    snapshot = create_backup()
    require_complete_snapshot(snapshot)
    run_alembic_upgrade(TARGET_REVISION)
    after = audit_database()
    require_head_and_schema(after, TARGET_REVISION)
    print_safe_summary(after)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Audit by default; apply only after a complete pilot backup."
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true", help="Back up and migrate.")
    modes.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicitly select the default read-only audit.",
    )
    args = parser.parse_args(argv)
    return prepare(apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
