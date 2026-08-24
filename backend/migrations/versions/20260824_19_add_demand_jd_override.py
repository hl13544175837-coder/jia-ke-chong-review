"""Add demand jd_override flag (JD 是否人工指定，决定详情展示快照还是实时跟随岗位 JD)."""

from alembic import op
import sqlalchemy as sa


revision = "20260824_19"
down_revision = "20260811_18"
branch_labels = None
depends_on = None


def _table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _column_names(table_name):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade():
    if (
        "recruitment_demands" in _table_names()
        and "jd_override" not in _column_names("recruitment_demands")
    ):
        with op.batch_alter_table("recruitment_demands") as batch:
            batch.add_column(
                sa.Column(
                    "jd_override",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("0"),
                )
            )


def downgrade():
    if (
        "recruitment_demands" in _table_names()
        and "jd_override" in _column_names("recruitment_demands")
    ):
        with op.batch_alter_table("recruitment_demands") as batch:
            batch.drop_column("jd_override")