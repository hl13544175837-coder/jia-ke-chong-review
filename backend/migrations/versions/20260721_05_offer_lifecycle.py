"""Persist the complete Offer approval and delivery lifecycle."""

from alembic import op
import sqlalchemy as sa


revision = "20260721_05"
down_revision = "20260711_04"
branch_labels = None
depends_on = None


OFFER_COLUMNS = {
    "approver_id": sa.Column(
        "approver_id",
        sa.Integer(),
        sa.ForeignKey("users.id", name="fk_offer_records_approver_id_users"),
        nullable=True,
    ),
    "submitted_at": sa.Column("submitted_at", sa.DateTime(), nullable=True),
    "approved_at": sa.Column("approved_at", sa.DateTime(), nullable=True),
    "sent_at": sa.Column("sent_at", sa.DateTime(), nullable=True),
    "responded_at": sa.Column("responded_at", sa.DateTime(), nullable=True),
    "withdrawn_at": sa.Column("withdrawn_at", sa.DateTime(), nullable=True),
    "expires_at": sa.Column("expires_at", sa.DateTime(), nullable=True),
    "onboarded_at": sa.Column("onboarded_at", sa.DateTime(), nullable=True),
    "rejection_reason": sa.Column("rejection_reason", sa.Text(), nullable=True),
    "candidate_reply": sa.Column("candidate_reply", sa.JSON(), nullable=True),
    "salary_breakdown": sa.Column("salary_breakdown", sa.JSON(), nullable=True),
    "version": sa.Column(
        "version",
        sa.Integer(),
        nullable=False,
        server_default=sa.text("1"),
    ),
}


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    table_names = set(_inspector().get_table_names())
    if "offer_records" not in table_names:
        # Narrow legacy schemas used by maintenance tools may not carry the
        # optional Offer module. Do not manufacture a partial aggregate there.
        return

    existing_columns = {
        column["name"] for column in _inspector().get_columns("offer_records")
    }
    missing = [column for name, column in OFFER_COLUMNS.items() if name not in existing_columns]
    if missing:
        with op.batch_alter_table("offer_records") as batch_op:
            for column in missing:
                batch_op.add_column(column)

    table_names = set(_inspector().get_table_names())
    if "offer_events" not in table_names:
        op.create_table(
            "offer_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column(
                "offer_id",
                sa.Integer(),
                sa.ForeignKey("offer_records.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("action", sa.String(length=40), nullable=False),
            sa.Column("from_status", sa.String(length=40), nullable=True),
            sa.Column("to_status", sa.String(length=40), nullable=False),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("comment", sa.Text(), nullable=True),
            sa.Column("detail", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    index_names = {
        index["name"] for index in _inspector().get_indexes("offer_events")
    }
    if "ix_offer_events_org_offer_created" not in index_names:
        op.create_index(
            "ix_offer_events_org_offer_created",
            "offer_events",
            ["org_id", "offer_id", "created_at"],
            unique=False,
        )


def downgrade():
    table_names = set(_inspector().get_table_names())
    if "offer_events" in table_names:
        index_names = {
            index["name"] for index in _inspector().get_indexes("offer_events")
        }
        if "ix_offer_events_org_offer_created" in index_names:
            op.drop_index("ix_offer_events_org_offer_created", table_name="offer_events")
        op.drop_table("offer_events")

    if "offer_records" not in set(_inspector().get_table_names()):
        return
    existing_columns = {
        column["name"] for column in _inspector().get_columns("offer_records")
    }
    removable = [name for name in OFFER_COLUMNS if name in existing_columns]
    if removable:
        with op.batch_alter_table("offer_records") as batch_op:
            for name in reversed(removable):
                batch_op.drop_column(name)
