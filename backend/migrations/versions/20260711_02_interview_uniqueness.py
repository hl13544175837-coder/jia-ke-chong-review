"""Enforce one primary assignment per demand round and one feedback per task."""

from alembic import op
import sqlalchemy as sa


revision = "20260711_02"
down_revision = "20260710_01"
branch_labels = None
depends_on = None


PRIMARY_INDEX = "uq_interview_assignment_primary_slot"
FEEDBACK_INDEX = "uq_interview_feedback_assignment_id"
CANCELLED_STATUSES = ("cancelled", "canceled")


def _inspector():
    return sa.inspect(op.get_bind())


def _column_names(table_name):
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_names(table_name):
    return {index["name"] for index in _inspector().get_indexes(table_name)}


def _assignment_table(include_primary_slot=False):
    columns = [
        sa.column("id", sa.Integer()),
        sa.column("org_id", sa.Integer()),
        sa.column("demand_id", sa.Integer()),
        sa.column("candidate_id", sa.Integer()),
        sa.column("round_sequence", sa.Integer()),
        sa.column("is_primary", sa.Boolean()),
        sa.column("status", sa.String()),
    ]
    if include_primary_slot:
        columns.append(sa.column("primary_slot", sa.Integer()))
    return sa.table("interview_assignments", *columns)


def _feedback_table():
    return sa.table(
        "interview_feedback",
        sa.column("id", sa.Integer()),
        sa.column("assignment_id", sa.Integer()),
    )


def _duplicate_primary_groups():
    assignments = _assignment_table()
    active_status = sa.func.lower(sa.func.coalesce(assignments.c.status, "scheduled"))
    count = sa.func.count().label("row_count")
    statement = (
        sa.select(
            assignments.c.org_id,
            assignments.c.demand_id,
            assignments.c.candidate_id,
            assignments.c.round_sequence,
            count,
        )
        .where(
            assignments.c.demand_id.is_not(None),
            assignments.c.is_primary.is_(True),
            active_status.not_in(CANCELLED_STATUSES),
        )
        .group_by(
            assignments.c.org_id,
            assignments.c.demand_id,
            assignments.c.candidate_id,
            assignments.c.round_sequence,
        )
        .having(sa.func.count() > 1)
        .limit(20)
    )
    return list(op.get_bind().execute(statement).mappings())


def _duplicate_feedback_groups():
    feedback = _feedback_table()
    statement = (
        sa.select(
            feedback.c.assignment_id,
            sa.func.count().label("row_count"),
        )
        .where(feedback.c.assignment_id.is_not(None))
        .group_by(feedback.c.assignment_id)
        .having(sa.func.count() > 1)
        .limit(20)
    )
    return list(op.get_bind().execute(statement).mappings())


def _format_rows(rows):
    return ", ".join(str(dict(row)) for row in rows)


def upgrade():
    duplicate_primary = _duplicate_primary_groups()
    if duplicate_primary:
        raise RuntimeError(
            "duplicate active primary interview assignments; resolve before migration: "
            + _format_rows(duplicate_primary)
        )

    duplicate_feedback = _duplicate_feedback_groups()
    if duplicate_feedback:
        raise RuntimeError(
            "duplicate interview feedback assignment_id values; resolve before migration: "
            + _format_rows(duplicate_feedback)
        )

    if "primary_slot" not in _column_names("interview_assignments"):
        op.add_column(
            "interview_assignments",
            sa.Column("primary_slot", sa.Integer(), nullable=True),
        )

    assignments = _assignment_table(include_primary_slot=True)
    active_status = sa.func.lower(sa.func.coalesce(assignments.c.status, "scheduled"))
    op.get_bind().execute(
        sa.update(assignments)
        .where(
            assignments.c.demand_id.is_not(None),
            assignments.c.is_primary.is_(True),
            active_status.not_in(CANCELLED_STATUSES),
        )
        .values(primary_slot=assignments.c.round_sequence)
    )
    op.get_bind().execute(
        sa.update(assignments)
        .where(
            sa.or_(
                assignments.c.demand_id.is_(None),
                assignments.c.is_primary.is_not(True),
                active_status.in_(CANCELLED_STATUSES),
            )
        )
        .values(primary_slot=None)
    )

    if PRIMARY_INDEX not in _index_names("interview_assignments"):
        op.create_index(
            PRIMARY_INDEX,
            "interview_assignments",
            ["org_id", "demand_id", "candidate_id", "primary_slot"],
            unique=True,
        )
    if FEEDBACK_INDEX not in _index_names("interview_feedback"):
        op.create_index(
            FEEDBACK_INDEX,
            "interview_feedback",
            ["assignment_id"],
            unique=True,
        )


def downgrade():
    if FEEDBACK_INDEX in _index_names("interview_feedback"):
        op.drop_index(FEEDBACK_INDEX, table_name="interview_feedback")
    if PRIMARY_INDEX in _index_names("interview_assignments"):
        op.drop_index(PRIMARY_INDEX, table_name="interview_assignments")
    if "primary_slot" in _column_names("interview_assignments"):
        with op.batch_alter_table("interview_assignments") as batch_op:
            batch_op.drop_column("primary_slot")
