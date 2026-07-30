"""Add durable interview reschedule requests and schedule-change history."""

from alembic import op
import sqlalchemy as sa


revision = "20260730_13"
down_revision = "20260729_12"
branch_labels = None
depends_on = None


def _table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    if "interview_reschedule_requests" in _table_names():
        return

    op.create_table(
        "interview_reschedule_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("replacement_assignment_id", sa.Integer(), nullable=True),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("demand_id", sa.Integer(), nullable=False),
        sa.Column("round", sa.String(length=30), nullable=False),
        sa.Column("round_sequence", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("proposed_times", sa.JSON(), nullable=False),
        sa.Column("original_interviewer_id", sa.Integer(), nullable=False),
        sa.Column("original_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("original_location", sa.String(length=240), nullable=False, server_default=""),
        sa.Column("final_interviewer_id", sa.Integer(), nullable=True),
        sa.Column("final_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("final_location", sa.String(length=240), nullable=False, server_default=""),
        sa.Column("processed_by", sa.Integer(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("processor_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["interview_assignments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["replacement_assignment_id"], ["interview_assignments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["demand_id"], ["recruitment_demands.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["original_interviewer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["final_interviewer_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["processed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_interview_reschedule_org_assignment_status",
        "interview_reschedule_requests",
        ["org_id", "assignment_id", "status"],
    )
    op.create_index(
        "ix_interview_reschedule_org_candidate_demand_round",
        "interview_reschedule_requests",
        ["org_id", "candidate_id", "demand_id", "round_sequence"],
    )


def downgrade():
    raise RuntimeError("面试改约记录属于审计历史，不支持破坏性在线降级。")
