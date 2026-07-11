import os
import sqlite3
import subprocess
from pathlib import Path

import pytest
from alembic.config import Config
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
    RATE_LIMIT_ENABLED = False

    @classmethod
    def for_path(cls, path):
        return type(
            "ProductionSQLiteConfig",
            (cls,),
            {"SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}"},
        )


class _DebugSQLiteConfig(_ProductionSQLiteConfig):
    FLASK_DEBUG = True


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


def _load_bootstrap_module():
    from scripts import bootstrap_database

    return bootstrap_database


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


def test_debug_sqlite_app_factory_keeps_local_schema_compatibility(tmp_path):
    db_path = tmp_path / "debug-empty.db"
    app = create_app(_DebugSQLiteConfig.for_path(db_path))

    try:
        with app.app_context():
            assert "users" in inspect(db.engine).get_table_names()
    finally:
        with app.app_context():
            db.session.remove()
            db.drop_all()
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
        [str(BACKEND_DIR / "docker-entrypoint.sh"), "start-app", "ready"],
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
