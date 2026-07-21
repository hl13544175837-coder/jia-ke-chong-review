"""Add organization-level recruiting process standards."""

from alembic import op
import sqlalchemy as sa


revision = "20260721_06"
down_revision = "20260721_05"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def upgrade():
    if "kpi_standards" in set(_inspector().get_table_names()):
        return
    op.create_table(
        "kpi_standards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_kpi_standards_org_id",
        "kpi_standards",
        ["org_id"],
        unique=True,
    )


def downgrade():
    if "kpi_standards" not in set(_inspector().get_table_names()):
        return
    index_names = {
        index["name"] for index in _inspector().get_indexes("kpi_standards")
    }
    if "ix_kpi_standards_org_id" in index_names:
        op.drop_index("ix_kpi_standards_org_id", table_name="kpi_standards")
    op.drop_table("kpi_standards")
