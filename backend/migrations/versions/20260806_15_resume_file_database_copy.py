"""Keep a database copy of resume originals across pod replacement."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20260806_15"
down_revision = "20260804_14"
branch_labels = None
depends_on = None


def _column_names(table_name):
    inspector = sa.inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _resume_binary_type():
    return sa.LargeBinary().with_variant(mysql.LONGBLOB(), "mysql")


def upgrade():
    for table_name in ("candidates", "candidate_resume_versions"):
        columns = _column_names(table_name)
        if "raw_file_name" not in columns:
            op.add_column(
                table_name,
                sa.Column("raw_file_name", sa.String(length=255), nullable=True),
            )
        if "raw_file_data" not in columns:
            op.add_column(
                table_name,
                sa.Column("raw_file_data", _resume_binary_type(), nullable=True),
            )


def downgrade():
    raise RuntimeError("数据库中的原简历用于防止文件丢失，不支持破坏性在线降级。")
