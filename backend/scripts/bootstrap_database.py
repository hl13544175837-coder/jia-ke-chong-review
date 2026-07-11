#!/usr/bin/env python3
"""Create and stamp the current schema only for an explicitly allowed empty DB."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import sys

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database_urls import normalize_database_url

ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

# The first Alembic expand revision requires these legacy owner/fact tables.
# A database containing only a subset is not safe to infer or repair here.
LEGACY_SCHEMA_TABLES = {
    "users",
    "jobs",
    "recruitment_demands",
    "candidates",
    "upload_batches",
    "candidate_tags",
    "talent_maps",
    "talent_map_companies",
    "talent_map_people",
    "matches",
    "pipeline_stages",
    "interviews",
    "candidate_dispositions",
    "offer_records",
    "interview_assignments",
    "events",
    "audit_logs",
    "notifications",
    "idempotency_records",
    "conversations",
    "conversation_messages",
    "interview_feedback",
    "boss_accounts",
}


class BootstrapError(RuntimeError):
    """Raised when controlled database bootstrap cannot proceed safely."""


@dataclass(frozen=True)
class BootstrapResult:
    status: str
    revision: str | None


def _alembic_config(database_url: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    database_url = normalize_database_url(database_url)
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _current_head(database_url: str) -> tuple[Config, str]:
    config = _alembic_config(database_url)
    head = ScriptDirectory.from_config(config).get_current_head()
    if not head:
        raise BootstrapError("Alembic has no current head; refusing empty database bootstrap")
    return config, head


def _database_revision(engine) -> str | None:
    if "alembic_version" not in inspect(engine).get_table_names():
        return None
    with engine.connect() as connection:
        return connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()


def bootstrap_database(database_url: str, *, allow_empty: bool) -> BootstrapResult:
    """Bootstrap a truly empty database; leave complete legacy schemas to Alembic."""
    database_url = normalize_database_url(database_url)
    if not allow_empty:
        raise BootstrapError(
            "empty database bootstrap requires the explicit --allow-empty flag"
        )

    from app import db
    from app import models as _models  # noqa: F401 - registers ORM metadata

    engine = create_engine(database_url)
    try:
        table_names = set(inspect(engine).get_table_names())
        if table_names:
            if LEGACY_SCHEMA_TABLES.issubset(table_names):
                return BootstrapResult(
                    status="existing_schema",
                    revision=_database_revision(engine),
                )

            missing = sorted(LEGACY_SCHEMA_TABLES - table_names)
            raise BootstrapError(
                "partial schema detected; refusing to infer missing tables: "
                + ", ".join(missing)
            )

        config, head = _current_head(database_url)
        db.metadata.create_all(bind=engine)
    finally:
        engine.dispose()

    command.stamp(config, "head")

    verification_engine = create_engine(database_url)
    try:
        revision = _database_revision(verification_engine)
    finally:
        verification_engine.dispose()
    if revision != head:
        raise BootstrapError(
            f"bootstrap revision verification failed: expected {head}, got {revision}"
        )
    return BootstrapResult(status="bootstrapped", revision=revision)


def _parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--allow-empty", action="store_true")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    database_url = args.database_url
    if not database_url:
        from app.config import Config as AppConfig

        database_url = AppConfig.SQLALCHEMY_DATABASE_URI

    try:
        result = bootstrap_database(database_url, allow_empty=args.allow_empty)
    except BootstrapError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2

    print(
        json.dumps(
            {
                "ok": True,
                "status": result.status,
                "revision": result.revision,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
