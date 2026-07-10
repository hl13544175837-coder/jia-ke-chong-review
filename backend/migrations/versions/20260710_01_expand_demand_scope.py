"""Expand recruitment facts with demand scope.

This first ledger revision is deliberately additive and schema-aware. Existing
pilot databases receive missing columns and indexes; databases created from the
current ORM metadata are stamped without attempting duplicate DDL.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260710_01"
down_revision = None
branch_labels = None
depends_on = None


DEMAND_FK = "recruitment_demands.id"


def _table_exists(table_name):
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _column_names(table_name):
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name):
    if not _table_exists(table_name):
        return set()
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _add_columns(table_name, columns):
    missing = [column for column in columns if column.name not in _column_names(table_name)]
    if not missing:
        return
    with op.batch_alter_table(table_name) as batch_op:
        for column in missing:
            batch_op.add_column(column)


def _create_index(name, table_name, columns, unique=False):
    if name not in _index_names(table_name):
        op.create_index(name, table_name, columns, unique=unique)


def _demand_id_column(table_name):
    return sa.Column(
        "demand_id",
        sa.Integer(),
        sa.ForeignKey(
            DEMAND_FK,
            name=f"fk_{table_name}_demand_id_recruitment_demands",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )


def upgrade():
    _add_columns(
        "recruitment_demands",
        [
            sa.Column("city", sa.String(length=80), nullable=True),
            sa.Column("department", sa.String(length=120), nullable=True),
            sa.Column("job_title_snapshot", sa.String(length=200), nullable=True),
            sa.Column("jd_text_snapshot", sa.Text(), nullable=True),
            sa.Column(
                "created_by",
                sa.Integer(),
                sa.ForeignKey(
                    "users.id",
                    name="fk_recruitment_demands_created_by_users",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            ),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column(
                "closed_by",
                sa.Integer(),
                sa.ForeignKey(
                    "users.id",
                    name="fk_recruitment_demands_closed_by_users",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            ),
        ],
    )
    _create_index(
        "ix_recruitment_demands_org_job",
        "recruitment_demands",
        ["org_id", "job_id"],
    )
    _create_index(
        "ix_recruitment_demands_org_owner_status",
        "recruitment_demands",
        ["org_id", "owner_hr_id", "status"],
    )
    _create_index(
        "ix_recruitment_demands_org_status_created",
        "recruitment_demands",
        ["org_id", "status", "created_at"],
    )

    _add_columns(
        "candidates",
        [
            sa.Column(
                "current_demand_id",
                sa.Integer(),
                sa.ForeignKey(
                    DEMAND_FK,
                    name="fk_candidates_current_demand_id_recruitment_demands",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            )
        ],
    )
    _create_index(
        "ix_candidates_current_demand_id",
        "candidates",
        ["current_demand_id"],
    )

    if not _table_exists("candidate_demand_flows"):
        op.create_table(
            "candidate_demand_flows",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "candidate_id",
                sa.Integer(),
                sa.ForeignKey(
                    "candidates.id",
                    name="fk_candidate_demand_flows_candidate_id_candidates",
                    ondelete="RESTRICT",
                ),
                nullable=False,
            ),
            sa.Column(
                "demand_id",
                sa.Integer(),
                sa.ForeignKey(
                    DEMAND_FK,
                    name="fk_candidate_demand_flows_demand_id_recruitment_demands",
                    ondelete="RESTRICT",
                ),
                nullable=False,
            ),
            sa.Column(
                "owner_hr_id",
                sa.Integer(),
                sa.ForeignKey(
                    "users.id",
                    name="fk_candidate_demand_flows_owner_hr_id_users",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            ),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("ended_at", sa.DateTime(), nullable=True),
            sa.Column(
                "transfer_from_demand_id",
                sa.Integer(),
                sa.ForeignKey(
                    DEMAND_FK,
                    name="fk_candidate_demand_flows_transfer_from_demand_id",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            ),
            sa.Column("transfer_reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "org_id",
                "candidate_id",
                "demand_id",
                name="uq_candidate_demand_flows_org_candidate_demand",
            ),
        )
    _create_index(
        "ix_candidate_demand_flows_org_demand_status",
        "candidate_demand_flows",
        ["org_id", "demand_id", "status"],
    )
    _create_index(
        "ix_candidate_demand_flows_org_owner_status",
        "candidate_demand_flows",
        ["org_id", "owner_hr_id", "status"],
    )

    fact_columns = {
        "pipeline_stages": [_demand_id_column("pipeline_stages")],
        "interviews": [_demand_id_column("interviews")],
        "interview_assignments": [
            _demand_id_column("interview_assignments"),
            sa.Column("round_sequence", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        ],
        "interview_feedback": [
            _demand_id_column("interview_feedback"),
            sa.Column(
                "assignment_id",
                sa.Integer(),
                sa.ForeignKey(
                    "interview_assignments.id",
                    name="fk_interview_feedback_assignment_id_assignments",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            ),
        ],
        "offer_records": [_demand_id_column("offer_records")],
        "candidate_dispositions": [_demand_id_column("candidate_dispositions")],
        "events": [_demand_id_column("events")],
        "notifications": [_demand_id_column("notifications")],
        "upload_batches": [_demand_id_column("upload_batches")],
    }
    for table_name, columns in fact_columns.items():
        _add_columns(table_name, columns)

    indexes = {
        "ix_pipeline_stages_org_demand_candidate_ts": (
            "pipeline_stages",
            ["org_id", "demand_id", "candidate_id", "ts"],
        ),
        "ix_interviews_org_demand_candidate": (
            "interviews",
            ["org_id", "demand_id", "candidate_id"],
        ),
        "ix_interview_assignments_org_demand_candidate_round": (
            "interview_assignments",
            ["org_id", "demand_id", "candidate_id", "round_sequence"],
        ),
        "ix_interview_feedback_org_demand_candidate_round": (
            "interview_feedback",
            ["org_id", "demand_id", "candidate_id", "round"],
        ),
        "ix_offer_records_org_demand_candidate": (
            "offer_records",
            ["org_id", "demand_id", "candidate_id"],
        ),
        "ix_candidate_dispositions_org_demand_candidate": (
            "candidate_dispositions",
            ["org_id", "demand_id", "candidate_id"],
        ),
        "ix_events_org_demand_ts": ("events", ["org_id", "demand_id", "ts"]),
        "ix_notifications_org_demand_user": (
            "notifications",
            ["org_id", "demand_id", "user_id"],
        ),
        "ix_upload_batches_org_demand": ("upload_batches", ["org_id", "demand_id"]),
    }
    for index_name, (table_name, columns) in indexes.items():
        _create_index(index_name, table_name, columns)


def _drop_index_if_present(name, table_name):
    if name in _index_names(table_name):
        op.drop_index(name, table_name=table_name)


def _drop_columns(table_name, column_names):
    existing = _column_names(table_name)
    present = [name for name in column_names if name in existing]
    if not present:
        return
    with op.batch_alter_table(table_name) as batch_op:
        for name in present:
            batch_op.drop_column(name)


def downgrade():
    indexes = {
        "ix_upload_batches_org_demand": "upload_batches",
        "ix_notifications_org_demand_user": "notifications",
        "ix_events_org_demand_ts": "events",
        "ix_candidate_dispositions_org_demand_candidate": "candidate_dispositions",
        "ix_offer_records_org_demand_candidate": "offer_records",
        "ix_interview_feedback_org_demand_candidate_round": "interview_feedback",
        "ix_interview_assignments_org_demand_candidate_round": "interview_assignments",
        "ix_interviews_org_demand_candidate": "interviews",
        "ix_pipeline_stages_org_demand_candidate_ts": "pipeline_stages",
    }
    for index_name, table_name in indexes.items():
        _drop_index_if_present(index_name, table_name)

    _drop_columns("upload_batches", ["demand_id"])
    _drop_columns("notifications", ["demand_id"])
    _drop_columns("events", ["demand_id"])
    _drop_columns("candidate_dispositions", ["demand_id"])
    _drop_columns("offer_records", ["demand_id"])
    _drop_columns("interview_feedback", ["assignment_id", "demand_id"])
    _drop_columns("interview_assignments", ["is_primary", "round_sequence", "demand_id"])
    _drop_columns("interviews", ["demand_id"])
    _drop_columns("pipeline_stages", ["demand_id"])

    if _table_exists("candidate_demand_flows"):
        op.drop_table("candidate_demand_flows")
    _drop_index_if_present("ix_candidates_current_demand_id", "candidates")
    _drop_columns("candidates", ["current_demand_id"])

    for name in (
        "ix_recruitment_demands_org_status_created",
        "ix_recruitment_demands_org_owner_status",
        "ix_recruitment_demands_org_job",
    ):
        _drop_index_if_present(name, "recruitment_demands")
    _drop_columns(
        "recruitment_demands",
        [
            "closed_by",
            "closed_at",
            "created_by",
            "jd_text_snapshot",
            "job_title_snapshot",
            "department",
            "city",
        ],
    )
