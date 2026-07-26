import hashlib
import json
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    create_engine,
    text,
)

from scripts import audit_mysql_pilot_schema, backup_pilot_data, prepare_mysql_pilot


ROOT = Path(__file__).resolve().parents[2]
EXPECTED_REVISION = "20260726_09"


def _sqlite_schema(
    tmp_path,
    *,
    conflicting_index=False,
    approval_server_default=True,
):
    database_path = tmp_path / "pilot.sqlite"
    database_url = f"sqlite:///{database_path}"
    metadata = MetaData()

    Table(
        "alembic_version",
        metadata,
        Column("version_num", String(32), primary_key=True),
    )
    Table(
        "recruitment_demands",
        metadata,
        Column("id", Integer, primary_key=True),
        Column(
            "approval_status",
            String(20),
            nullable=False,
            server_default=text("'approved'") if approval_server_default else None,
        ),
        Column("submitted_at", DateTime),
        Column("reviewed_by", Integer),
        Column("reviewed_at", DateTime),
        Column("review_reason", Text),
    )
    Table(
        "interview_feedback",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("updated_by", Integer),
        Column("updated_at", DateTime, nullable=False),
    )
    tasks = Table(
        "business_review_tasks",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("org_id", Integer, nullable=False),
        Column("demand_id", Integer, nullable=False),
        Column("candidate_id", Integer, nullable=False),
        Column("reviewer_id", Integer, nullable=False),
        Column("status", String(20), nullable=False),
        Column("pending_slot", Integer),
        Column("hr_note", Text),
        Column("business_note", Text),
        Column("due_at", DateTime),
        Column("created_by", Integer, nullable=False),
        Column("decided_by", Integer),
        Column("decided_at", DateTime),
        Column("created_at", DateTime, nullable=False),
        Column("updated_at", DateTime, nullable=False),
    )
    Index(
        "ix_business_reviews_org_reviewer_status",
        tasks.c.org_id,
        tasks.c.reviewer_id,
        tasks.c.status,
    )
    Index(
        "ix_business_reviews_org_demand_candidate",
        tasks.c.org_id,
        tasks.c.demand_id,
        tasks.c.candidate_id,
    )
    if conflicting_index:
        Index(
            "uq_business_reviews_pending_slot",
            tasks.c.org_id,
            tasks.c.candidate_id,
        )
    else:
        Index(
            "uq_business_reviews_pending_slot",
            tasks.c.org_id,
            tasks.c.demand_id,
            tasks.c.candidate_id,
            tasks.c.pending_slot,
            unique=True,
        )

    favorites = Table(
        "candidate_favorites",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("org_id", Integer, nullable=False),
        Column("user_id", Integer, nullable=False),
        Column("candidate_id", Integer, nullable=False),
        Column("created_at", DateTime, nullable=False),
        UniqueConstraint(
            "org_id",
            "user_id",
            "candidate_id",
            name="uq_candidate_favorites_org_user_candidate",
        ),
    )
    Index(
        "ix_candidate_favorites_org_candidate",
        favorites.c.org_id,
        favorites.c.candidate_id,
    )
    merges = Table(
        "candidate_merges",
        metadata,
        Column("id", Integer, primary_key=True),
        Column("org_id", Integer, nullable=False),
        Column("primary_candidate_id", Integer, nullable=False),
        Column("duplicate_candidate_id", Integer, nullable=False),
        Column("merged_by", Integer, nullable=False),
        Column("reason", String(240), nullable=False),
        Column("created_at", DateTime, nullable=False),
        UniqueConstraint(
            "org_id",
            "duplicate_candidate_id",
            name="uq_candidate_merges_org_duplicate",
        ),
    )
    Index(
        "ix_candidate_merges_org_primary",
        merges.c.org_id,
        merges.c.primary_candidate_id,
    )

    engine = create_engine(database_url)
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            metadata.tables["alembic_version"].insert().values(
                version_num=EXPECTED_REVISION
            )
        )
    engine.dispose()
    return database_url


def _report(*, ok, missing=None, conflicts=None, revision=None):
    revision = EXPECTED_REVISION if revision is None else revision
    return {
        "ok": ok,
        "database": {"dialect": "sqlite", "name": "pilot.sqlite"},
        "revision": {"current": revision, "expected": EXPECTED_REVISION},
        "missing": list(missing or []),
        "conflicts": list(conflicts or []),
    }


def test_audit_redacts_database_credentials(monkeypatch, capsys):
    username = "pilot-user"
    secret = "must-not-appear"
    host = "db.invalid"
    database_url = (
        f"mysql+pymysql://{username}:{secret}@{host}/pilot?token=hidden-token"
    )
    monkeypatch.setenv("DATABASE_URL", database_url)
    report = {
        "ok": False,
        "missing": ["recruitment_demands.default_interviewer_id"],
        "database_url": database_url,
        "detail": f"connection failed at {database_url} using {secret}",
        "host": host,
    }

    print(audit_mysql_pilot_schema.safe_report(report))
    output = capsys.readouterr().out

    assert username not in output
    assert secret not in output
    assert host not in output
    assert "hidden-token" not in output
    assert database_url not in output


def test_audit_accepts_compatible_temporary_sqlite_schema(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", _sqlite_schema(tmp_path))

    report = audit_mysql_pilot_schema.audit_database()

    assert report["ok"] is True
    assert report["revision"] == {
        "current": EXPECTED_REVISION,
        "expected": EXPECTED_REVISION,
        "ok": True,
    }
    assert report["missing"] == []
    assert report["conflicts"] == []
    assert report["database"] == {
        "dialect": "sqlite",
        "name": "pilot.sqlite",
    }
    assert audit_mysql_pilot_schema.report_exit_code(report) == 0


def test_audit_accepts_approval_default_owned_by_orm(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        _sqlite_schema(tmp_path, approval_server_default=False),
    )

    report = audit_mysql_pilot_schema.audit_database()

    assert report["ok"] is True
    assert report["conflicts"] == []


def test_audit_marks_missing_schema_as_additive_repair(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy.sqlite"
    create_engine(f"sqlite:///{database_path}").dispose()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")

    report = audit_mysql_pilot_schema.audit_database()

    assert report["ok"] is False
    assert "missing_table:business_review_tasks" in report["missing"]
    assert report["conflicts"] == []
    assert audit_mysql_pilot_schema.report_exit_code(report) == 2


def test_audit_marks_existing_wrong_index_as_conflict(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        _sqlite_schema(tmp_path, conflicting_index=True),
    )

    report = audit_mysql_pilot_schema.audit_database()

    assert report["ok"] is False
    assert (
        "index_definition:business_review_tasks.uq_business_reviews_pending_slot"
        in report["conflicts"]
    )
    assert audit_mysql_pilot_schema.report_exit_code(report) == 3


def test_audit_invalid_url_returns_safe_error(monkeypatch):
    secret = "invalid-url-must-not-appear"
    monkeypatch.setenv("DATABASE_URL", f"this is not a database URL {secret}")

    report = audit_mysql_pilot_schema.audit_database()
    output = audit_mysql_pilot_schema.safe_report(report)

    assert report["ok"] is False
    assert report["errors"]
    assert audit_mysql_pilot_schema.report_exit_code(report) == 3
    assert secret not in output


def test_prepare_refuses_apply_without_successful_backup(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "create_backup",
        lambda: (_ for _ in ()).throw(SystemExit("backup failed")),
    )

    with pytest.raises(SystemExit, match="backup failed"):
        prepare_mysql_pilot.prepare(apply=True)


def test_prepare_dry_run_never_calls_backup_or_migration(monkeypatch):
    called = []
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "create_backup",
        lambda: called.append("backup"),
    )
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "run_migrations",
        lambda: called.append("migration"),
    )

    assert prepare_mysql_pilot.prepare(apply=False) == 0
    assert called == []


def test_prepare_applies_in_fail_closed_order(monkeypatch):
    events = []
    reports = iter(
        [
            _report(
                ok=False,
                missing=["missing_column:recruitment_demands.approval_status"],
                revision="20260722_07",
            ),
            _report(ok=True),
        ]
    )

    def audit():
        events.append("audit")
        return next(reports)

    monkeypatch.setattr(prepare_mysql_pilot, "audit_database", audit)
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "create_backup",
        lambda: events.append("backup") or Path("/safe/snapshot"),
    )
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "require_complete_snapshot",
        lambda snapshot: events.append(f"manifest:{snapshot.name}"),
    )
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "run_alembic_upgrade",
        lambda revision: events.append(f"upgrade:{revision}"),
    )
    monkeypatch.setattr(
        prepare_mysql_pilot,
        "print_safe_summary",
        lambda report: events.append("summary"),
    )

    assert prepare_mysql_pilot.prepare(apply=True) == 0
    assert events == [
        "audit",
        "backup",
        "manifest:snapshot",
        f"upgrade:{EXPECTED_REVISION}",
        "audit",
        "summary",
    ]


def test_complete_snapshot_requires_manifest_and_matching_artifacts(tmp_path):
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()
    database_dump = snapshot / "database.sql"
    uploads_dump = snapshot / "uploads.tar.gz"
    database_dump.write_bytes(b"database")
    uploads_dump.write_bytes(b"uploads")

    def artifact(path):
        content = path.read_bytes()
        return {
            "artifact": path.name,
            "size": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }

    (snapshot / "manifest.json").write_text(
        json.dumps(
            {
                "format_version": 1,
                "status": "complete",
                "database": artifact(database_dump),
                "uploads": artifact(uploads_dump),
            }
        ),
        encoding="utf-8",
    )

    manifest = prepare_mysql_pilot.require_complete_snapshot(snapshot)

    assert manifest["status"] == "complete"


def test_mysql_backup_uses_discovered_tcp_client_without_secret_in_arguments(
    tmp_path,
    monkeypatch,
):
    calls = {}
    secret = "dump-secret"

    monkeypatch.setattr(
        backup_pilot_data.shutil,
        "which",
        lambda name: "/opt/homebrew/bin/mysqldump" if name == "mysqldump" else None,
    )

    def run(command, **kwargs):
        calls["command"] = command
        calls["kwargs"] = kwargs
        kwargs["stdout"].write(b"mysql dump")

    monkeypatch.setattr(backup_pilot_data.subprocess, "run", run)

    dump_path = backup_pilot_data._backup_database(
        f"mysql+pymysql://pilot:{secret}@db.invalid:3307/pilot",
        tmp_path,
    )

    assert dump_path.read_bytes() == b"mysql dump"
    assert calls["command"][0] == "/opt/homebrew/bin/mysqldump"
    assert "--protocol=TCP" in calls["command"]
    assert secret not in " ".join(calls["command"])
    assert calls["kwargs"]["env"]["MYSQL_PWD"] == secret
    assert calls["kwargs"]["check"] is True


def test_mysql_backup_fails_closed_and_removes_partial_dump(tmp_path, monkeypatch):
    secret = "dump-secret"
    monkeypatch.setattr(
        backup_pilot_data.shutil,
        "which",
        lambda name: "/usr/local/bin/mysqldump",
    )

    def fail(command, **kwargs):
        kwargs["stdout"].write(b"partial")
        raise subprocess.CalledProcessError(9, command)

    monkeypatch.setattr(backup_pilot_data.subprocess, "run", fail)

    with pytest.raises(SystemExit) as error:
        backup_pilot_data._backup_database(
            f"mysql+pymysql://pilot:{secret}@db.invalid/pilot",
            tmp_path,
        )

    assert not (tmp_path / "database.sql").exists()
    assert secret not in str(error.value)
    assert "mysql+pymysql://pilot:" not in str(error.value)


def test_mysql_backup_requires_installed_client(tmp_path, monkeypatch):
    monkeypatch.setattr(backup_pilot_data.shutil, "which", lambda name: None)

    with pytest.raises(SystemExit, match="mysqldump"):
        backup_pilot_data._backup_database(
            "mysql+pymysql://pilot:secret@db.invalid/pilot",
            tmp_path,
        )


def test_mysql_shell_contract_is_secret_safe_and_fail_closed():
    start_script = (ROOT / "scripts" / "start-isolated-demo.sh").read_text(
        encoding="utf-8"
    )
    prepare_script = (ROOT / "scripts" / "prepare-mysql-pilot.sh").read_text(
        encoding="utf-8"
    )
    serve_script = (ROOT / "scripts" / "serve-mysql-pilot.sh").read_text(
        encoding="utf-8"
    )
    check_script = (ROOT / "scripts" / "check-mysql-pilot.sh").read_text(
        encoding="utf-8"
    )

    assert 'DATABASE_URL_VALUE="${PILOT_DATABASE_URL:-sqlite:///$DATABASE_PATH}"' in start_script
    assert 'LOCAL_SCHEMA_COMPAT_VALUE=true' in start_script
    assert 'LOCAL_SCHEMA_COMPAT_VALUE=false' in start_script
    assert "PILOT_SCHEMA_VERIFIED" in start_script
    assert "VITE_ENABLE_ROLE_PREVIEW=false" in start_script

    for script in (prepare_script, serve_script, check_script):
        assert "mysql-pilot.env" in script
        assert "600" in script
        assert "set -x" not in script
        assert 'echo "$PILOT_DATABASE_URL"' not in script

    assert "--require-compatible" in serve_script
    assert "PILOT_SCHEMA_VERIFIED=true" in serve_script
    assert "audit_mysql_pilot_schema.py" in check_script


def test_gitignore_names_mysql_pilot_credentials_and_manifests():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

    assert "runtime/mysql-pilot.env" in gitignore
    assert "runtime/mysql-pilot-acceptance/" in gitignore
