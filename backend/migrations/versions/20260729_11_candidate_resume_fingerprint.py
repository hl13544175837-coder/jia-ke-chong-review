"""Add a reusable content fingerprint for exact resume duplicate blocking."""

from alembic import op
import sqlalchemy as sa


revision = "20260729_11"
down_revision = "20260728_10"
branch_labels = None
depends_on = None


def _column_names(table_name):
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _index_names(table_name):
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade():
    if "resume_sha256" not in _column_names("candidates"):
        with op.batch_alter_table("candidates") as batch:
            batch.add_column(sa.Column("resume_sha256", sa.String(length=64), nullable=True))

    if "ix_candidates_org_resume_sha256" not in _index_names("candidates"):
        op.create_index(
            "ix_candidates_org_resume_sha256",
            "candidates",
            ["org_id", "resume_sha256"],
        )


def downgrade():
    raise RuntimeError("简历指纹属于重复导入保护，不支持破坏性在线降级。")
