import os
import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app import create_app, db


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT = BACKEND_DIR.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


class _ProductionSQLiteConfig:
    TESTING = False
    FLASK_DEBUG = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CELERY_TASK_ALWAYS_EAGER = True
    JWT_SECRET = "production-schema-lifecycle-secret-2026"
    CORS_ORIGINS = ["https://zhipin.example.com"]
    AI_RECRUITMENT_COMPLIANCE_ACK = True
    CANDIDATE_PRIVACY_NOTICE_URL = "https://zhipin.example.com/privacy"
    AI_HUMAN_REVIEW_REQUIRED = True
    WEAK_SECRETS = set()
    MIN_SECRET_LENGTH = 32
    SECURITY_HEADERS_ENABLED = True
    RATE_LIMIT_ENABLED = True
    ALLOW_PUBLIC_REGISTRATION = False
    AUTO_MIGRATE_DATABASE = False
    ALLOW_EMPTY_DATABASE_BOOTSTRAP = False
    ALLOW_INSECURE_SIT_STARTUP = False
    UPLOAD_FOLDER = "/var/lib/zhipin/uploads"
    UPLOAD_FOLDER_SOURCE = "/var/lib/zhipin/uploads"

    @classmethod
    def for_path(cls, path):
        return type(
            "ProductionSQLiteConfig",
            (cls,),
            {"SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}"},
        )


class _DebugSQLiteConfig(_ProductionSQLiteConfig):
    FLASK_DEBUG = True


class _LocalSchemaCompatSQLiteConfig(_DebugSQLiteConfig):
    LOCAL_SCHEMA_COMPAT = True


class _InsecureSitSQLiteConfig(_ProductionSQLiteConfig):
    FLASK_DEBUG = False
    ALLOW_INSECURE_SIT_STARTUP = True
    LOCAL_SCHEMA_COMPAT = True
    JWT_SECRET = "test-secret"
    CORS_ORIGINS = []
    AI_RECRUITMENT_COMPLIANCE_ACK = False
    CANDIDATE_PRIVACY_NOTICE_URL = ""
    AI_HUMAN_REVIEW_REQUIRED = False
    WEAK_SECRETS = {"test-secret"}


def _database_url(path):
    return f"sqlite:///{path}"


def _current_alembic_head():
    config = Config(str(ALEMBIC_INI))
    return ScriptDirectory.from_config(config).get_current_head()


def _read_revision(path):
    engine = create_engine(_database_url(path))
    try:
        with engine.connect() as connection:
            return connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
    finally:
        engine.dispose()


def _read_table_names(path):
    connection = sqlite3.connect(path)
    try:
        return {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()


def _load_bootstrap_module():
    from scripts import bootstrap_database

    return bootstrap_database


def _load_demand_scope_verifier():
    from scripts import verify_demand_scope

    return verify_demand_scope


def test_production_app_factory_does_not_bootstrap_empty_database(tmp_path):
    db_path = tmp_path / "production-empty.db"
    app = create_app(_ProductionSQLiteConfig.for_path(db_path))

    try:
        with app.app_context():
            assert "users" not in inspect(db.engine).get_table_names()
    finally:
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


def test_debug_sqlite_app_factory_does_not_implicitly_mutate_schema(tmp_path):
    db_path = tmp_path / "debug-empty.db"
    app = create_app(_DebugSQLiteConfig.for_path(db_path))

    try:
        with app.app_context():
            assert "users" not in inspect(db.engine).get_table_names()
    finally:
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


def test_explicit_local_schema_compat_keeps_debug_sqlite_convenience(tmp_path):
    db_path = tmp_path / "debug-compat.db"
    app = create_app(_LocalSchemaCompatSQLiteConfig.for_path(db_path))

    try:
        with app.app_context():
            assert "users" in inspect(db.engine).get_table_names()
    finally:
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()


def test_insecure_sit_startup_does_not_enable_local_schema_compat(tmp_path):
    db_path = tmp_path / "insecure-sit-empty.db"
    app = create_app(_InsecureSitSQLiteConfig.for_path(db_path))

    try:
        with app.app_context():
            assert "users" not in inspect(db.engine).get_table_names()
    finally:
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


def test_bootstrap_requires_explicit_empty_database_permission(tmp_path):
    bootstrap = _load_bootstrap_module()

    with pytest.raises(bootstrap.BootstrapError, match="allow-empty"):
        bootstrap.bootstrap_database(_database_url(tmp_path / "blocked.db"), allow_empty=False)


def test_bootstrap_empty_database_creates_head_schema_and_revision(tmp_path):
    bootstrap = _load_bootstrap_module()
    db_path = tmp_path / "fresh.db"

    result = bootstrap.bootstrap_database(_database_url(db_path), allow_empty=True)

    assert result.status == "bootstrapped"
    assert result.revision == _current_alembic_head()
    assert _read_revision(db_path) == _current_alembic_head()
    engine = create_engine(_database_url(db_path))
    try:
        assert "users" in inspect(engine).get_table_names()
        assert "candidate_demand_flows" in inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_bootstrap_empty_database_passes_demand_scope_schema_verification(tmp_path):
    bootstrap = _load_bootstrap_module()
    verifier = _load_demand_scope_verifier()
    db_path = tmp_path / "fresh-verified.db"
    database_url = _database_url(db_path)

    bootstrap.bootstrap_database(database_url, allow_empty=True)
    report = verifier.verify_database(database_url)

    assert report["schema_revision"]["ok"] is True
    assert report["schema_errors"] == []
    assert report["ok"] is True


def test_verifier_reports_missing_revision_07_agent_storage_schema(tmp_path):
    """The head revision alone is insufficient without its AI storage contract."""
    bootstrap = _load_bootstrap_module()
    verifier = _load_demand_scope_verifier()
    db_path = tmp_path / "missing-agent-storage-schema.db"
    database_url = _database_url(db_path)
    bootstrap.bootstrap_database(database_url, allow_empty=True)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text(
            "DROP INDEX ix_conversations_org_user_archived_updated"
        ))
        connection.execute(text(
            "DROP INDEX ix_conversation_messages_org_conversation"
        ))
        connection.execute(text("ALTER TABLE conversations DROP COLUMN archived"))
        connection.execute(text(
            "ALTER TABLE conversation_messages DROP COLUMN org_id"
        ))
        connection.execute(text("ALTER TABLE agent_call_logs DROP COLUMN output_text"))
        connection.execute(text("DROP INDEX ix_agent_call_logs_org_created"))
        connection.execute(text(
            "DROP INDEX ix_agent_call_logs_org_conversation_created"
        ))
        connection.execute(text("DROP INDEX ix_agent_call_logs_org_user_created"))

        context = MigrationContext.configure(connection)
        operations = Operations(context)
        with operations.batch_alter_table("offer_records") as batch_op:
            batch_op.drop_constraint(
                "uq_offer_records_org_demand_candidate",
                type_="unique",
            )
        operations.create_index(
            "uq_offer_records_org_demand_candidate",
            "offer_records",
            ["org_id", "demand_id", "candidate_id"],
            unique=False,
        )
    engine.dispose()

    report = verifier.verify_database(database_url)

    assert {
        "missing_column:conversations.archived",
        "missing_column:conversation_messages.org_id",
        "missing_column:agent_call_logs.output_text",
        "missing_index:conversations.ix_conversations_org_user_archived_updated",
        "missing_index:conversation_messages."
        "ix_conversation_messages_org_conversation",
        "missing_index:agent_call_logs.ix_agent_call_logs_org_created",
        "missing_index:agent_call_logs."
        "ix_agent_call_logs_org_conversation_created",
        "missing_index:agent_call_logs.ix_agent_call_logs_org_user_created",
        "non_unique_index:offer_records.uq_offer_records_org_demand_candidate",
    }.issubset(report["schema_errors"])


def test_verifier_reports_all_revision_07_agent_storage_tables_missing_at_head(
    tmp_path,
):
    bootstrap = _load_bootstrap_module()
    verifier = _load_demand_scope_verifier()
    db_path = tmp_path / "all-agent-storage-tables-missing.db"
    database_url = _database_url(db_path)
    bootstrap.bootstrap_database(database_url, allow_empty=True)

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE agent_call_logs"))
        connection.execute(text("DROP TABLE conversation_messages"))
        connection.execute(text("DROP TABLE conversations"))
    engine.dispose()

    report = verifier.verify_database(database_url)

    assert {
        "missing_table:conversations",
        "missing_table:conversation_messages",
        "missing_table:agent_call_logs",
    }.issubset(report["schema_errors"])
    assert report["schema_revision"]["ok"] is True
    assert report["ok"] is False


def test_bootstrap_rejects_partial_schema_without_filling_missing_tables(tmp_path):
    bootstrap = _load_bootstrap_module()
    db_path = tmp_path / "partial.db"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    connection.commit()
    connection.close()

    with pytest.raises(bootstrap.BootstrapError, match="partial schema"):
        bootstrap.bootstrap_database(_database_url(db_path), allow_empty=True)

    connection = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()
    assert tables == {"users"}


def test_bootstrap_rejects_metadata_schema_missing_a_table_alembic_never_creates(tmp_path):
    bootstrap = _load_bootstrap_module()
    db_path = tmp_path / "metadata-minus-matches.db"
    engine = create_engine(_database_url(db_path))
    try:
        db.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE matches"))
    finally:
        engine.dispose()

    with pytest.raises(bootstrap.BootstrapError, match="matches"):
        bootstrap.bootstrap_database(_database_url(db_path), allow_empty=True)

    connection = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()
    assert "matches" not in tables
    assert "alembic_version" not in tables


def test_bootstrap_accepts_pre_expand_schema_without_candidate_demand_flows(tmp_path):
    bootstrap = _load_bootstrap_module()
    db_path = tmp_path / "pre-expand.db"
    engine = create_engine(_database_url(db_path))
    try:
        db.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            connection.execute(text("DROP TABLE candidate_demand_flows"))
    finally:
        engine.dispose()

    result = bootstrap.bootstrap_database(_database_url(db_path), allow_empty=True)

    assert result.status == "existing_schema"
    assert result.revision is None
    assert _read_table_names(db_path).isdisjoint({"alembic_version", "candidate_demand_flows"})


def test_bootstrap_leaves_complete_legacy_schema_for_alembic_upgrade(tmp_path):
    bootstrap = _load_bootstrap_module()
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    for table_name in sorted(bootstrap.LEGACY_SCHEMA_TABLES):
        connection.execute(f"CREATE TABLE {table_name} (id INTEGER PRIMARY KEY)")
    connection.commit()
    connection.close()

    result = bootstrap.bootstrap_database(_database_url(db_path), allow_empty=True)

    assert result.status == "existing_schema"
    assert result.revision is None
    connection = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()
    assert tables == bootstrap.LEGACY_SCHEMA_TABLES


def test_rc_image_enables_empty_bootstrap_but_ga_keeps_it_disabled():
    rc = subprocess.run(
        ["make", "-n", "buildserver", "PKG_TAG=RC", "PKG_VERSION=schema-test"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    ga = subprocess.run(
        ["make", "-n", "buildserver", "PKG_TAG=GA", "PKG_VERSION=schema-test"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert rc.returncode == 0
    assert ga.returncode == 0
    assert "--build-arg ALLOW_EMPTY_DATABASE_BOOTSTRAP=true" in rc.stdout
    assert "--build-arg ALLOW_EMPTY_DATABASE_BOOTSTRAP=false" in ga.stdout


def test_backend_image_defaults_empty_bootstrap_to_disabled():
    content = (BACKEND_DIR / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG ALLOW_EMPTY_DATABASE_BOOTSTRAP=false" in content
    assert "ENV ALLOW_EMPTY_DATABASE_BOOTSTRAP=${ALLOW_EMPTY_DATABASE_BOOTSTRAP}" in content


def test_entrypoint_bootstraps_before_alembic_upgrade(tmp_path):
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    entrypoint = backend_dir / "docker-entrypoint.sh"
    shutil.copy2(BACKEND_DIR / "docker-entrypoint.sh", entrypoint)
    entrypoint.chmod(0o755)
    (backend_dir / ".release-channel").write_text("RC\n", encoding="utf-8")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    command_log = tmp_path / "commands.log"
    for name in ("python", "alembic", "start-app"):
        executable = bin_dir / name
        executable.write_text(
            f'#!/bin/sh\nprintf "{name} %s\\n" "$*" >> "$COMMAND_LOG"\n',
            encoding="utf-8",
        )
        executable.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "COMMAND_LOG": str(command_log),
            "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "true",
            "AUTO_MIGRATE_DATABASE": "true",
        }
    )
    result = subprocess.run(
        [str(entrypoint), "start-app", "ready"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert command_log.read_text(encoding="utf-8").splitlines() == [
        "python /app/backend/scripts/bootstrap_database.py --allow-empty",
        "alembic -c /app/backend/alembic.ini upgrade head",
        "start-app ready",
    ]
