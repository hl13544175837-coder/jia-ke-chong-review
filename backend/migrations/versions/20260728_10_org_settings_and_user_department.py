"""Add persistent admin settings and the user department field."""

from alembic import op
import sqlalchemy as sa


revision = "20260728_10"
down_revision = "20260726_09"
branch_labels = None
depends_on = None


def _table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table_name):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade():
    if "users" in _table_names() and "department" not in _column_names("users"):
        with op.batch_alter_table("users") as batch:
            batch.add_column(
                sa.Column("department", sa.String(length=120), nullable=False, server_default="")
            )

    if "organization_settings" not in _table_names():
        op.create_table(
            "organization_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("config_json", sa.JSON(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("org_id", name="uq_organization_settings_org"),
        )
        op.create_index("ix_organization_settings_org_id", "organization_settings", ["org_id"])


def downgrade():
    raise RuntimeError("组织设置属于审计配置，不支持破坏性在线降级。")
