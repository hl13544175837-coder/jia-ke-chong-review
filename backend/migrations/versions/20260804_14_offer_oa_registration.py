"""Add local OA result registration fields to Offer records."""

from alembic import op
import sqlalchemy as sa


revision = "20260804_14"
down_revision = "20260730_13"
branch_labels = None
depends_on = None


OA_COLUMNS = {
    "oa_instance_no": sa.Column("oa_instance_no", sa.String(length=120), nullable=True),
    "oa_status": sa.Column(
        "oa_status",
        sa.String(length=30),
        nullable=False,
        server_default=sa.text("'not_started'"),
    ),
    "oa_note": sa.Column("oa_note", sa.Text(), nullable=True),
    "oa_updated_at": sa.Column("oa_updated_at", sa.DateTime(), nullable=True),
}


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    if "offer_records" not in set(_inspector().get_table_names()):
        return
    existing = {column["name"] for column in _inspector().get_columns("offer_records")}
    missing = [column for name, column in OA_COLUMNS.items() if name not in existing]
    if missing:
        with op.batch_alter_table("offer_records") as batch_op:
            for column in missing:
                batch_op.add_column(column)
    indexes = {index["name"] for index in _inspector().get_indexes("offer_records")}
    if "ix_offer_records_org_oa_status_updated" not in indexes:
        op.create_index(
            "ix_offer_records_org_oa_status_updated",
            "offer_records",
            ["org_id", "oa_status", "oa_updated_at"],
            unique=False,
        )


def downgrade():
    if "offer_records" not in set(_inspector().get_table_names()):
        return
    indexes = {index["name"] for index in _inspector().get_indexes("offer_records")}
    if "ix_offer_records_org_oa_status_updated" in indexes:
        op.drop_index("ix_offer_records_org_oa_status_updated", table_name="offer_records")
    existing = {column["name"] for column in _inspector().get_columns("offer_records")}
    removable = [name for name in OA_COLUMNS if name in existing]
    if removable:
        with op.batch_alter_table("offer_records") as batch_op:
            for name in reversed(removable):
                batch_op.drop_column(name)
