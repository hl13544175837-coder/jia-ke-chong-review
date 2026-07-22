"""Complete AI conversation storage and add organization-scoped call logs.

The revision is deliberately schema-aware because pilot databases can already
contain the original conversations tables. Offer uniqueness is validated
before any DDL; conflicting historical rows stop the migration without an
automatic winner or deletion.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_07"
down_revision = "20260721_06"
branch_labels = None
depends_on = None


OFFER_UNIQUE_NAME = "uq_offer_records_org_demand_candidate"
OFFER_UNIQUE_COLUMNS = ("org_id", "demand_id", "candidate_id")


def _inspector():
    return sa.inspect(op.get_bind())


def _table_names():
    return set(_inspector().get_table_names())


def _column_names(table_name):
    if table_name not in _table_names():
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _indexes(table_name):
    if table_name not in _table_names():
        return []
    return _inspector().get_indexes(table_name)


def _unique_constraints(table_name):
    if table_name not in _table_names():
        return []
    return _inspector().get_unique_constraints(table_name)


def _assert_complete_ai_legacy_schema():
    tables = _table_names()
    ai_tables = {"conversations", "conversation_messages"}
    present = ai_tables & tables
    if present != ai_tables or "users" not in tables:
        missing = sorted((ai_tables | {"users"}) - tables)
        raise RuntimeError(
            "partial AI conversation schema; missing tables: " + ", ".join(missing)
        )
    if "org_id" not in _column_names("users"):
        raise RuntimeError("partial AI conversation schema; users.org_id is missing")


def _assert_resolvable_ai_ownership():
    conversation_rows = op.get_bind().execute(sa.text(
        "SELECT conversations.id, conversations.user_id "
        "FROM conversations "
        "LEFT JOIN users ON users.id = conversations.user_id "
        "WHERE users.id IS NULL OR users.org_id IS NULL "
        "LIMIT 10"
    )).fetchall()
    if conversation_rows:
        raise RuntimeError(
            "conversation owners cannot be resolved; repair orphaned users before retry: "
            f"{[tuple(row) for row in conversation_rows]}"
        )

    message_rows = op.get_bind().execute(sa.text(
        "SELECT conversation_messages.id, conversation_messages.conversation_id "
        "FROM conversation_messages "
        "LEFT JOIN conversations "
        "ON conversations.id = conversation_messages.conversation_id "
        "WHERE conversations.id IS NULL "
        "LIMIT 10"
    )).fetchall()
    if message_rows:
        raise RuntimeError(
            "conversation message parents cannot be resolved; repair orphaned rows before retry: "
            f"{[tuple(row) for row in message_rows]}"
        )


def _offer_unique_exists():
    expected = list(OFFER_UNIQUE_COLUMNS)
    for constraint in _unique_constraints("offer_records"):
        name = constraint.get("name")
        columns = constraint.get("column_names") or []
        if name == OFFER_UNIQUE_NAME:
            if columns != expected:
                raise RuntimeError(
                    f"{OFFER_UNIQUE_NAME} constraint definition mismatch"
                )
            return True
        if columns == expected:
            return True

    for index in _indexes("offer_records"):
        name = index.get("name")
        columns = index.get("column_names") or []
        unique = bool(index.get("unique"))
        if name == OFFER_UNIQUE_NAME:
            if columns != expected or not unique:
                raise RuntimeError(f"{OFFER_UNIQUE_NAME} index definition mismatch")
            return True
        if columns == expected and unique:
            return True
    return False


def _assert_no_offer_duplicates():
    if "offer_records" not in _table_names():
        return
    columns = _column_names("offer_records")
    missing = sorted(set(OFFER_UNIQUE_COLUMNS) - columns)
    if missing:
        raise RuntimeError(
            "offer_records is missing uniqueness columns: " + ", ".join(missing)
        )
    rows = op.get_bind().execute(sa.text(
        "SELECT org_id, demand_id, candidate_id, COUNT(*) AS row_count "
        "FROM offer_records "
        "WHERE org_id IS NOT NULL "
        "AND demand_id IS NOT NULL "
        "AND candidate_id IS NOT NULL "
        "GROUP BY org_id, demand_id, candidate_id "
        "HAVING COUNT(*) > 1 "
        "LIMIT 10"
    )).fetchall()
    if rows:
        evidence = [tuple(row) for row in rows]
        raise RuntimeError(
            "duplicate offer records block "
            f"{OFFER_UNIQUE_NAME}; resolve explicitly before retry: {evidence}"
        )


def _add_column(table_name, column):
    if column.name in _column_names(table_name):
        return
    with op.batch_alter_table(table_name) as batch_op:
        batch_op.add_column(column)


def _create_index(name, table_name, columns):
    existing = {index["name"]: index for index in _indexes(table_name)}
    if name in existing:
        if (existing[name].get("column_names") or []) != list(columns):
            raise RuntimeError(f"{name} index definition mismatch")
        return
    op.create_index(name, table_name, list(columns), unique=False)


def _backfill_conversation_orgs(*, reconcile_existing):
    if reconcile_existing:
        op.execute(sa.text(
            "UPDATE conversations "
            "SET org_id = ("
            "SELECT users.org_id FROM users WHERE users.id = conversations.user_id"
            ")"
        ))
    else:
        op.execute(sa.text(
            "UPDATE conversations "
            "SET org_id = ("
            "SELECT users.org_id FROM users WHERE users.id = conversations.user_id"
            ") "
            "WHERE org_id IS NULL"
        ))

    message_filter = "" if reconcile_existing else " WHERE org_id IS NULL"
    op.execute(sa.text(
        "UPDATE conversation_messages "
        "SET org_id = ("
        "SELECT conversations.org_id FROM conversations "
        "WHERE conversations.id = conversation_messages.conversation_id"
        ")" + message_filter
    ))


def _ensure_ai_columns_and_indexes():
    conversation_columns = _column_names("conversations")
    revision_07_markers = {"title_source", "archived"}
    present_markers = conversation_columns & revision_07_markers
    if present_markers and present_markers != revision_07_markers:
        missing = sorted(revision_07_markers - present_markers)
        raise RuntimeError(
            "partial revision 07 conversations schema; missing columns: "
            + ", ".join(missing)
        )
    reconcile_existing_orgs = not present_markers

    _add_column(
        "conversations",
        sa.Column("org_id", sa.Integer(), nullable=True),
    )
    _add_column(
        "conversations",
        sa.Column(
            "title_source",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'auto'"),
        ),
    )
    _add_column(
        "conversations",
        sa.Column(
            "archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    _add_column(
        "conversation_messages",
        sa.Column("org_id", sa.Integer(), nullable=True),
    )
    _backfill_conversation_orgs(reconcile_existing=reconcile_existing_orgs)

    with op.batch_alter_table("conversations") as batch_op:
        batch_op.alter_column(
            "org_id",
            existing_type=sa.Integer(),
            nullable=False,
            server_default=None,
        )
    with op.batch_alter_table("conversation_messages") as batch_op:
        batch_op.alter_column(
            "org_id",
            existing_type=sa.Integer(),
            nullable=False,
            server_default=None,
        )

    _create_index(
        "ix_conversations_org_user_archived_updated",
        "conversations",
        ("org_id", "user_id", "archived", "updated_at"),
    )
    _create_index(
        "ix_conversation_messages_org_conversation",
        "conversation_messages",
        ("org_id", "conversation_id"),
    )


def _ensure_agent_call_logs():
    if "agent_call_logs" not in _table_names():
        op.create_table(
            "agent_call_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column(
                "conversation_id",
                sa.Integer(),
                sa.ForeignKey("conversations.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "message_id",
                sa.Integer(),
                sa.ForeignKey("conversation_messages.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("kind", sa.String(length=30), nullable=False),
            sa.Column("model", sa.String(length=120), nullable=True),
            sa.Column("prompt_tokens", sa.Integer(), nullable=True),
            sa.Column("completion_tokens", sa.Integer(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("error_msg", sa.Text(), nullable=True),
            sa.Column("tool_calls", sa.JSON(), nullable=True),
            sa.Column("thoughts", sa.JSON(), nullable=True),
            sa.Column("input_text", sa.Text(), nullable=True),
            sa.Column("output_text", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
    else:
        required = {
            "id", "org_id", "conversation_id", "message_id", "user_id", "role",
            "kind", "model", "prompt_tokens", "completion_tokens", "duration_ms",
            "status", "error_msg", "tool_calls", "thoughts", "input_text",
            "output_text", "created_at",
        }
        missing = sorted(required - _column_names("agent_call_logs"))
        if missing:
            raise RuntimeError(
                "partial agent_call_logs schema; missing columns: " + ", ".join(missing)
            )

    _create_index(
        "ix_agent_call_logs_org_created",
        "agent_call_logs",
        ("org_id", "created_at"),
    )
    _create_index(
        "ix_agent_call_logs_org_conversation_created",
        "agent_call_logs",
        ("org_id", "conversation_id", "created_at"),
    )
    _create_index(
        "ix_agent_call_logs_org_user_created",
        "agent_call_logs",
        ("org_id", "user_id", "created_at"),
    )


def upgrade():
    # Validate all destructive ambiguity before any DDL. Never auto-delete or
    # choose an Offer winner during schema migration.
    _assert_complete_ai_legacy_schema()
    _assert_resolvable_ai_ownership()
    _assert_no_offer_duplicates()
    offer_unique_exists = (
        _offer_unique_exists() if "offer_records" in _table_names() else True
    )

    _ensure_ai_columns_and_indexes()
    _ensure_agent_call_logs()

    if "offer_records" in _table_names() and not offer_unique_exists:
        with op.batch_alter_table("offer_records") as batch_op:
            batch_op.create_unique_constraint(
                OFFER_UNIQUE_NAME,
                list(OFFER_UNIQUE_COLUMNS),
            )


def _drop_index_if_exists(name, table_name):
    if name in {index["name"] for index in _indexes(table_name)}:
        op.drop_index(name, table_name=table_name)


def downgrade():
    if "offer_records" in _table_names():
        named_constraints = {
            constraint.get("name")
            for constraint in _unique_constraints("offer_records")
        }
        if OFFER_UNIQUE_NAME in named_constraints:
            with op.batch_alter_table("offer_records") as batch_op:
                batch_op.drop_constraint(OFFER_UNIQUE_NAME, type_="unique")

    if "agent_call_logs" in _table_names():
        op.drop_table("agent_call_logs")

    if "conversation_messages" in _table_names():
        _drop_index_if_exists(
            "ix_conversation_messages_org_conversation",
            "conversation_messages",
        )
    if "conversations" in _table_names():
        _drop_index_if_exists(
            "ix_conversations_org_user_archived_updated",
            "conversations",
        )
        removable = [
            column
            for column in ("archived", "title_source")
            if column in _column_names("conversations")
        ]
        if removable:
            with op.batch_alter_table("conversations") as batch_op:
                for column in removable:
                    batch_op.drop_column(column)
