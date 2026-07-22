import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import OfferRecord


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
REVISION_BEFORE_AGENT_STORAGE = "20260721_06"
AGENT_STORAGE_REVISION = "20260722_07"
OFFER_UNIQUE_NAME = "uq_offer_records_org_demand_candidate"


def _config(path):
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    return config


def _create_revision_06_database(
    path,
    *,
    duplicate_offers=False,
    duplicate_unmapped_offers=False,
    include_conversation_tables=True,
    include_legacy_org_columns=False,
):
    connection = sqlite3.connect(path)
    connection.executescript(
        f"""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL
        );
        CREATE TABLE offer_records (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            demand_id INTEGER,
            approval_status VARCHAR(40)
        );
        CREATE TABLE alembic_version (
            version_num VARCHAR(32) NOT NULL
        );
        INSERT INTO alembic_version (version_num)
        VALUES ('{REVISION_BEFORE_AGENT_STORAGE}');
        INSERT INTO users (id, org_id) VALUES (1, 7);
        INSERT INTO offer_records
            (id, org_id, candidate_id, job_id, demand_id, approval_status)
        VALUES
            (1, 7, 101, 201, 301, 'draft');
        """
    )
    if include_conversation_tables:
        org_column = "org_id INTEGER NOT NULL DEFAULT 1," if include_legacy_org_columns else ""
        connection.executescript(
            f"""
            CREATE TABLE conversations (
                id INTEGER PRIMARY KEY,
                {org_column}
                user_id INTEGER NOT NULL,
                title VARCHAR(200),
                created_at DATETIME,
                updated_at DATETIME
            );
            CREATE TABLE conversation_messages (
                id INTEGER PRIMARY KEY,
                {org_column}
                conversation_id INTEGER NOT NULL,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                tool_calls JSON,
                thoughts JSON,
                created_at DATETIME
            );
            INSERT INTO conversations
                (id, user_id, title, created_at, updated_at)
            VALUES
                (1, 1, '历史会话', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            INSERT INTO conversation_messages
                (id, conversation_id, role, content, created_at)
            VALUES
                (1, 1, 'user', '历史消息', CURRENT_TIMESTAMP);
            """
        )
    if duplicate_offers:
        connection.execute(
            "INSERT INTO offer_records "
            "(id, org_id, candidate_id, job_id, demand_id, approval_status) "
            "VALUES (2, 7, 101, 201, 301, 'approved')"
        )
    if duplicate_unmapped_offers:
        connection.executemany(
            "INSERT INTO offer_records "
            "(id, org_id, candidate_id, job_id, demand_id, approval_status) "
            "VALUES (?, 7, 102, 202, NULL, 'draft')",
            [(2,), (3,)],
        )
    connection.commit()
    connection.close()


def test_offer_record_model_declares_org_demand_candidate_unique_constraint():
    constraints = {
        constraint.name: tuple(column.name for column in constraint.columns)
        for constraint in OfferRecord.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert constraints[OFFER_UNIQUE_NAME] == (
        "org_id",
        "demand_id",
        "candidate_id",
    )


def test_agent_storage_migration_backfills_legacy_conversations_and_adds_constraints(
    tmp_path,
):
    path = tmp_path / "agent-storage.db"
    _create_revision_06_database(path)
    config = _config(path)

    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{path}")
    inspector = inspect(engine)
    assert "agent_call_logs" in inspector.get_table_names()
    conversation_columns = {
        column["name"]: column
        for column in inspector.get_columns("conversations")
    }
    message_columns = {
        column["name"]: column
        for column in inspector.get_columns("conversation_messages")
    }
    assert {"org_id", "title_source", "archived"}.issubset(conversation_columns)
    assert conversation_columns["org_id"]["nullable"] is False
    assert conversation_columns["title_source"]["nullable"] is False
    assert conversation_columns["archived"]["nullable"] is False
    assert message_columns["org_id"]["nullable"] is False

    conversation_indexes = {
        index["name"]: index
        for index in inspector.get_indexes("conversations")
    }
    message_indexes = {
        index["name"]: index
        for index in inspector.get_indexes("conversation_messages")
    }
    assert conversation_indexes["ix_conversations_org_user_archived_updated"]["column_names"] == [
        "org_id",
        "user_id",
        "archived",
        "updated_at",
    ]
    assert message_indexes["ix_conversation_messages_org_conversation"]["column_names"] == [
        "org_id",
        "conversation_id",
    ]

    unique_constraints = {
        constraint["name"]: constraint
        for constraint in inspector.get_unique_constraints("offer_records")
    }
    assert unique_constraints[OFFER_UNIQUE_NAME]["column_names"] == [
        "org_id",
        "demand_id",
        "candidate_id",
    ]
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT org_id, title_source, archived FROM conversations WHERE id = 1")
        ).one() == (7, "auto", 0)
        assert connection.execute(
            text("SELECT org_id FROM conversation_messages WHERE id = 1")
        ).scalar_one() == 7
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == AGENT_STORAGE_REVISION

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(text(
                "INSERT INTO offer_records "
                "(id, org_id, candidate_id, job_id, demand_id, approval_status) "
                "VALUES (2, 7, 101, 201, 301, 'approved')"
            ))
    engine.dispose()


def test_agent_storage_migration_reconciles_wrong_existing_legacy_org_ids(tmp_path):
    path = tmp_path / "legacy-wrong-org.db"
    _create_revision_06_database(path, include_legacy_org_columns=True)

    command.upgrade(_config(path), "head")

    engine = create_engine(f"sqlite:///{path}")
    try:
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT org_id FROM conversations WHERE id = 1")
            ).scalar_one() == 7
            assert connection.execute(
                text("SELECT org_id FROM conversation_messages WHERE id = 1")
            ).scalar_one() == 7
    finally:
        engine.dispose()


def test_agent_storage_migration_idempotent_rerun_preserves_revision_07_org_ids(
    tmp_path,
):
    path = tmp_path / "agent-storage-idempotent.db"
    _create_revision_06_database(path)
    config = _config(path)
    command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    connection.execute("UPDATE conversations SET org_id = 9 WHERE id = 1")
    connection.execute("UPDATE conversation_messages SET org_id = 9 WHERE id = 1")
    connection.execute(
        "UPDATE alembic_version SET version_num = ?",
        (REVISION_BEFORE_AGENT_STORAGE,),
    )
    connection.commit()
    connection.close()

    command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    try:
        assert connection.execute(
            "SELECT org_id FROM conversations WHERE id = 1"
        ).fetchone()[0] == 9
        assert connection.execute(
            "SELECT org_id FROM conversation_messages WHERE id = 1"
        ).fetchone()[0] == 9
    finally:
        connection.close()


def test_agent_storage_migration_fails_closed_when_both_legacy_tables_missing(
    tmp_path,
):
    path = tmp_path / "missing-agent-storage.db"
    _create_revision_06_database(path, include_conversation_tables=False)

    with pytest.raises(RuntimeError, match="partial AI conversation schema"):
        command.upgrade(_config(path), "head")

    connection = sqlite3.connect(path)
    try:
        assert connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()[0] == REVISION_BEFORE_AGENT_STORAGE
        assert {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }.isdisjoint(
            {"conversations", "conversation_messages", "agent_call_logs"}
        )
    finally:
        connection.close()


def test_agent_storage_migration_fails_closed_for_partial_legacy_schema(tmp_path):
    path = tmp_path / "partial-agent-storage.db"
    _create_revision_06_database(path, include_conversation_tables=False)
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE TABLE conversations ("
        "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, "
        "title VARCHAR(200), created_at DATETIME, updated_at DATETIME)"
    )
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match="partial AI conversation schema"):
        command.upgrade(_config(path), "head")

    connection = sqlite3.connect(path)
    try:
        assert connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()[0] == REVISION_BEFORE_AGENT_STORAGE
        assert "conversation_messages" not in {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()


@pytest.mark.parametrize(
    ("statement", "error_pattern"),
    [
        (
            "UPDATE conversations SET user_id = 999 WHERE id = 1",
            "conversation owners cannot be resolved",
        ),
        (
            "UPDATE conversation_messages SET conversation_id = 999 WHERE id = 1",
            "conversation message parents cannot be resolved",
        ),
    ],
)
def test_agent_storage_migration_rejects_orphaned_legacy_ai_rows_before_ddl(
    tmp_path,
    statement,
    error_pattern,
):
    path = tmp_path / "orphaned-agent-storage.db"
    _create_revision_06_database(path, include_legacy_org_columns=True)
    connection = sqlite3.connect(path)
    connection.execute(statement)
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match=error_pattern):
        command.upgrade(_config(path), "head")

    connection = sqlite3.connect(path)
    try:
        assert connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()[0] == REVISION_BEFORE_AGENT_STORAGE
        conversation_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(conversations)")
        }
        assert "title_source" not in conversation_columns
        assert "archived" not in conversation_columns
        assert "agent_call_logs" not in {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()


def test_agent_storage_upgrade_and_downgrade_do_not_leave_org_server_defaults(
    tmp_path,
):
    path = tmp_path / "agent-storage-round-trip.db"
    _create_revision_06_database(path, include_legacy_org_columns=True)
    config = _config(path)

    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path}")
    try:
        inspector = inspect(engine)
        assert next(
            column
            for column in inspector.get_columns("conversations")
            if column["name"] == "org_id"
        )["default"] is None
        assert next(
            column
            for column in inspector.get_columns("conversation_messages")
            if column["name"] == "org_id"
        )["default"] is None
        assert next(
            column
            for column in inspector.get_columns("agent_call_logs")
            if column["name"] == "org_id"
        )["default"] is None
    finally:
        engine.dispose()

    command.downgrade(config, REVISION_BEFORE_AGENT_STORAGE)

    engine = create_engine(f"sqlite:///{path}")
    try:
        inspector = inspect(engine)
        assert next(
            column
            for column in inspector.get_columns("conversations")
            if column["name"] == "org_id"
        )["default"] is None
        assert next(
            column
            for column in inspector.get_columns("conversation_messages")
            if column["name"] == "org_id"
        )["default"] is None
    finally:
        engine.dispose()


def test_agent_storage_migration_fails_closed_when_offer_duplicates_exist(tmp_path):
    path = tmp_path / "duplicate-offers.db"
    _create_revision_06_database(path, duplicate_offers=True)
    config = _config(path)

    with pytest.raises(RuntimeError, match="duplicate offer records"):
        command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT COUNT(*) FROM offer_records"
    ).fetchone()[0] == 2
    assert connection.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()[0] == REVISION_BEFORE_AGENT_STORAGE
    assert "agent_call_logs" not in {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    connection.close()


def test_agent_storage_migration_allows_multiple_legacy_offers_without_demand(tmp_path):
    path = tmp_path / "unmapped-offers.db"
    _create_revision_06_database(path, duplicate_unmapped_offers=True)
    config = _config(path)

    command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()[0] == AGENT_STORAGE_REVISION
    assert connection.execute(
        "SELECT COUNT(*) FROM offer_records WHERE demand_id IS NULL"
    ).fetchone()[0] == 2
    connection.close()
