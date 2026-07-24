"""Add the pilot demand approval and business-review schema contract."""

from alembic import op
import sqlalchemy as sa


revision = "20260724_08"
down_revision = "20260722_07"
branch_labels = None
depends_on = None


TASK_TABLE = "business_review_tasks"

DEMAND_COLUMN_SPECS = {
    "approval_status": (sa.String(length=20), False),
    "submitted_at": (sa.DateTime(), True),
    "reviewed_by": (sa.Integer(), True),
    "reviewed_at": (sa.DateTime(), True),
    "review_reason": (sa.Text(), True),
}

FEEDBACK_COLUMN_SPECS = {
    "updated_by": (sa.Integer(), True),
    "updated_at": (sa.DateTime(), False),
}

TASK_COLUMN_SPECS = {
    "id": (sa.Integer(), False),
    "org_id": (sa.Integer(), False),
    "demand_id": (sa.Integer(), False),
    "candidate_id": (sa.Integer(), False),
    "reviewer_id": (sa.Integer(), False),
    "status": (sa.String(length=20), False),
    "pending_slot": (sa.Integer(), True),
    "hr_note": (sa.Text(), True),
    "business_note": (sa.Text(), True),
    "due_at": (sa.DateTime(), True),
    "created_by": (sa.Integer(), False),
    "decided_by": (sa.Integer(), True),
    "decided_at": (sa.DateTime(), True),
    "created_at": (sa.DateTime(), False),
    "updated_at": (sa.DateTime(), False),
}

TASK_INDEX_SPECS = {
    "ix_business_reviews_org_reviewer_status": (
        ("org_id", "reviewer_id", "status"),
        False,
    ),
    "ix_business_reviews_org_demand_candidate": (
        ("org_id", "demand_id", "candidate_id"),
        False,
    ),
    "uq_business_reviews_pending_slot": (
        ("org_id", "demand_id", "candidate_id", "pending_slot"),
        True,
    ),
}

DEMAND_REVIEWER_FK = (
    "fk_recruitment_demands_reviewed_by_users",
    "recruitment_demands",
    ("reviewed_by",),
    "users",
    ("id",),
    "SET NULL",
)

FEEDBACK_UPDATER_FK = (
    "fk_interview_feedback_updated_by_users",
    "interview_feedback",
    ("updated_by",),
    "users",
    ("id",),
    "SET NULL",
)

TASK_FOREIGN_KEY_SPECS = (
    (
        "fk_business_review_tasks_demand_id_recruitment_demands",
        TASK_TABLE,
        ("demand_id",),
        "recruitment_demands",
        ("id",),
        "RESTRICT",
    ),
    (
        "fk_business_review_tasks_candidate_id_candidates",
        TASK_TABLE,
        ("candidate_id",),
        "candidates",
        ("id",),
        "RESTRICT",
    ),
    (
        "fk_business_review_tasks_reviewer_id_users",
        TASK_TABLE,
        ("reviewer_id",),
        "users",
        ("id",),
        "RESTRICT",
    ),
    (
        "fk_business_review_tasks_created_by_users",
        TASK_TABLE,
        ("created_by",),
        "users",
        ("id",),
        "RESTRICT",
    ),
    (
        "fk_business_review_tasks_decided_by_users",
        TASK_TABLE,
        ("decided_by",),
        "users",
        ("id",),
        "SET NULL",
    ),
)


def _inspector():
    return sa.inspect(op.get_bind())


def _table_names():
    return set(_inspector().get_table_names())


def _columns(table_name):
    if table_name not in _table_names():
        return {}
    return {
        column["name"]: column
        for column in _inspector().get_columns(table_name)
    }


def _indexes(table_name):
    if table_name not in _table_names():
        return {}
    return {
        index["name"]: index
        for index in _inspector().get_indexes(table_name)
        if index.get("name")
    }


def _unique_constraints(table_name):
    if table_name not in _table_names():
        return {}
    return {
        constraint["name"]: constraint
        for constraint in _inspector().get_unique_constraints(table_name)
        if constraint.get("name")
    }


def _foreign_keys(table_name):
    if table_name not in _table_names():
        return []
    return _inspector().get_foreign_keys(table_name)


def _type_matches(actual, expected):
    if isinstance(expected, sa.Text):
        return isinstance(actual, sa.Text)
    if isinstance(expected, sa.String):
        return (
            isinstance(actual, sa.String)
            and getattr(actual, "length", None) == expected.length
        )
    if isinstance(expected, sa.DateTime):
        return isinstance(actual, sa.DateTime)
    if isinstance(expected, sa.Integer):
        return isinstance(actual, sa.Integer)
    return isinstance(actual, type(expected))


def _validate_column(
    table_name,
    column,
    expected_type,
    allowed_nullability,
):
    if not _type_matches(column["type"], expected_type):
        raise RuntimeError(
            f"{table_name}.{column['name']} column definition mismatch: "
            f"type={column['type']}"
        )
    nullable = bool(column.get("nullable"))
    if nullable not in allowed_nullability:
        raise RuntimeError(
            f"{table_name}.{column['name']} column definition mismatch: "
            f"nullable={nullable}"
        )


def _normalized_default(value):
    if value is None:
        return None
    normalized = str(value).strip()
    while normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1].strip()
    if "::" in normalized:
        normalized = normalized.split("::", 1)[0]
    return normalized.strip("'\"").lower()


def _validate_approval_default(column):
    default = _normalized_default(column.get("default"))
    if default not in {None, "approved"}:
        raise RuntimeError(
            "recruitment_demands.approval_status column definition mismatch: "
            f"default={column.get('default')!r}"
        )


def _validate_index(table_name, name, definition, columns, unique):
    actual_columns = tuple(definition.get("column_names") or ())
    actual_unique = bool(definition.get("unique"))
    if actual_columns != columns or actual_unique != unique:
        raise RuntimeError(
            f"{table_name}.{name} index definition mismatch: "
            f"columns={actual_columns}, unique={actual_unique}"
        )


def _named_index_exists(table_name, name, columns, unique):
    indexes = _indexes(table_name)
    constraints = _unique_constraints(table_name)
    found = False

    index = indexes.get(name)
    if index is not None:
        _validate_index(table_name, name, index, columns, unique)
        found = True

    constraint = constraints.get(name)
    if constraint is not None:
        constraint_columns = tuple(constraint.get("column_names") or ())
        if not unique or constraint_columns != columns:
            raise RuntimeError(
                f"{table_name}.{name} index definition mismatch: "
                f"columns={constraint_columns}, unique=True"
            )
        found = True

    return found


def _validate_foreign_key(definition, spec):
    name, table_name, columns, referred_table, referred_columns, ondelete = spec
    actual_columns = tuple(definition.get("constrained_columns") or ())
    actual_referred_columns = tuple(definition.get("referred_columns") or ())
    actual_ondelete = str(
        (definition.get("options") or {}).get("ondelete") or ""
    ).upper()
    if (
        actual_columns != columns
        or definition.get("referred_table") != referred_table
        or actual_referred_columns != referred_columns
        or actual_ondelete != ondelete
    ):
        raise RuntimeError(
            f"{table_name}.{name} foreign key definition mismatch: "
            f"columns={actual_columns}, referred_table="
            f"{definition.get('referred_table')}, "
            f"referred_columns={actual_referred_columns}, "
            f"ondelete={actual_ondelete!r}"
        )


def _foreign_key_exists(spec):
    name, table_name, columns, _table, _columns, _ondelete = spec
    foreign_keys = _foreign_keys(table_name)
    named = next(
        (item for item in foreign_keys if item.get("name") == name),
        None,
    )
    if named is not None:
        _validate_foreign_key(named, spec)
        return True

    constrained = [
        item
        for item in foreign_keys
        if tuple(item.get("constrained_columns") or ()) == columns
    ]
    if len(constrained) > 1:
        raise RuntimeError(
            f"{table_name}.{name} foreign key definition mismatch: "
            "multiple constraints use the expected columns"
        )
    if constrained:
        _validate_foreign_key(constrained[0], spec)
        return True
    return False


def _validate_existing_column(
    table_name,
    column_name,
    expected_type,
    nullable,
    *,
    allow_nullable_repair=False,
):
    column = _columns(table_name).get(column_name)
    if column is None:
        return
    allowed = {nullable}
    if allow_nullable_repair:
        allowed.add(True)
    _validate_column(table_name, column, expected_type, allowed)


def _validate_existing_task_table():
    columns = _columns(TASK_TABLE)
    missing = sorted(set(TASK_COLUMN_SPECS) - set(columns))
    if missing:
        raise RuntimeError(
            "partial business_review_tasks schema; missing columns: "
            + ", ".join(missing)
        )

    for column_name, (expected_type, nullable) in TASK_COLUMN_SPECS.items():
        _validate_column(
            TASK_TABLE,
            columns[column_name],
            expected_type,
            {nullable},
        )

    primary_key = tuple(
        _inspector().get_pk_constraint(TASK_TABLE).get("constrained_columns")
        or ()
    )
    if primary_key != ("id",):
        raise RuntimeError(
            "business_review_tasks primary key definition mismatch: "
            f"columns={primary_key}"
        )

    for name, (index_columns, unique) in TASK_INDEX_SPECS.items():
        _named_index_exists(TASK_TABLE, name, index_columns, unique)
    for spec in TASK_FOREIGN_KEY_SPECS:
        _foreign_key_exists(spec)


def _validate_preexisting_schema():
    required_tables = {
        "users",
        "candidates",
        "recruitment_demands",
        "interview_feedback",
    }
    missing_tables = sorted(required_tables - _table_names())
    if missing_tables:
        raise RuntimeError(
            "pilot recruitment schema requires existing tables: "
            + ", ".join(missing_tables)
        )

    for column_name, (expected_type, nullable) in DEMAND_COLUMN_SPECS.items():
        _validate_existing_column(
            "recruitment_demands",
            column_name,
            expected_type,
            nullable,
        )
    approval_column = _columns("recruitment_demands").get("approval_status")
    if approval_column is not None:
        _validate_approval_default(approval_column)
    if "reviewed_by" in _columns("recruitment_demands"):
        _foreign_key_exists(DEMAND_REVIEWER_FK)

    for column_name, (expected_type, nullable) in FEEDBACK_COLUMN_SPECS.items():
        _validate_existing_column(
            "interview_feedback",
            column_name,
            expected_type,
            nullable,
            allow_nullable_repair=column_name == "updated_at",
        )
    if "updated_by" in _columns("interview_feedback"):
        _foreign_key_exists(FEEDBACK_UPDATER_FK)

    if TASK_TABLE in _table_names():
        _validate_existing_task_table()


def _add_column_if_missing(
    table_name,
    column,
    *,
    allow_nullable_repair=False,
):
    existing = _columns(table_name).get(column.name)
    if existing is not None:
        allowed = {bool(column.nullable)}
        if allow_nullable_repair:
            allowed.update({False, True})
        _validate_column(table_name, existing, column.type, allowed)
        if table_name == "recruitment_demands" and column.name == "approval_status":
            _validate_approval_default(existing)
        return

    with op.batch_alter_table(table_name) as batch_op:
        batch_op.add_column(column)


def _ensure_foreign_key(spec):
    if _foreign_key_exists(spec):
        return
    name, table_name, columns, referred_table, referred_columns, ondelete = spec
    with op.batch_alter_table(table_name) as batch_op:
        batch_op.create_foreign_key(
            name,
            referred_table,
            list(columns),
            list(referred_columns),
            ondelete=ondelete,
        )


def _ensure_index(table_name, name, columns, unique):
    if _named_index_exists(table_name, name, columns, unique):
        return
    op.create_index(name, table_name, list(columns), unique=unique)


def _ensure_demand_columns():
    _add_column_if_missing(
        "recruitment_demands",
        sa.Column(
            "approval_status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'approved'"),
        ),
    )
    _add_column_if_missing(
        "recruitment_demands",
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
    )
    _add_column_if_missing(
        "recruitment_demands",
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    _add_column_if_missing(
        "recruitment_demands",
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    _add_column_if_missing(
        "recruitment_demands",
        sa.Column("review_reason", sa.Text(), nullable=True),
    )
    _ensure_foreign_key(DEMAND_REVIEWER_FK)


def _ensure_feedback_columns():
    _add_column_if_missing(
        "interview_feedback",
        sa.Column("updated_by", sa.Integer(), nullable=True),
    )
    _add_column_if_missing(
        "interview_feedback",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        allow_nullable_repair=True,
    )
    _ensure_foreign_key(FEEDBACK_UPDATER_FK)

    feedback = sa.table(
        "interview_feedback",
        sa.column("updated_at", sa.DateTime()),
    )
    op.get_bind().execute(
        sa.update(feedback)
        .where(feedback.c.updated_at.is_(None))
        .values(updated_at=sa.func.now())
    )

    updated_at = _columns("interview_feedback")["updated_at"]
    if bool(updated_at.get("nullable")):
        with op.batch_alter_table("interview_feedback") as batch_op:
            batch_op.alter_column(
                "updated_at",
                existing_type=sa.DateTime(),
                nullable=False,
            )


def _create_task_table_if_missing():
    if TASK_TABLE in _table_names():
        _validate_existing_task_table()
        return

    op.create_table(
        TASK_TABLE,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "org_id",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "demand_id",
            sa.Integer(),
            sa.ForeignKey(
                "recruitment_demands.id",
                name="fk_business_review_tasks_demand_id_recruitment_demands",
                ondelete="RESTRICT",
            ),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.Integer(),
            sa.ForeignKey(
                "candidates.id",
                name="fk_business_review_tasks_candidate_id_candidates",
                ondelete="RESTRICT",
            ),
            nullable=False,
        ),
        sa.Column(
            "reviewer_id",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                name="fk_business_review_tasks_reviewer_id_users",
                ondelete="RESTRICT",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "pending_slot",
            sa.Integer(),
            nullable=True,
            server_default=sa.text("1"),
        ),
        sa.Column("hr_note", sa.Text(), nullable=True),
        sa.Column("business_note", sa.Text(), nullable=True),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                name="fk_business_review_tasks_created_by_users",
                ondelete="RESTRICT",
            ),
            nullable=False,
        ),
        sa.Column(
            "decided_by",
            sa.Integer(),
            sa.ForeignKey(
                "users.id",
                name="fk_business_review_tasks_decided_by_users",
                ondelete="SET NULL",
            ),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def _ensure_task_contract():
    _create_task_table_if_missing()
    for spec in TASK_FOREIGN_KEY_SPECS:
        _ensure_foreign_key(spec)
    for name, (columns, unique) in TASK_INDEX_SPECS.items():
        _ensure_index(TASK_TABLE, name, columns, unique)


def upgrade():
    _validate_preexisting_schema()
    _ensure_demand_columns()
    _ensure_feedback_columns()
    _ensure_task_contract()


def downgrade():
    raise RuntimeError(
        "Revision 20260724_08 is additive; an online destructive downgrade "
        "is intentionally unsupported."
    )
