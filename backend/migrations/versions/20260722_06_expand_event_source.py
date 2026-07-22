"""扩展审计事件来源字段，容纳受控业务入口名称。"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_06"
down_revision = "20260722_05"
branch_labels = None
depends_on = None


def _source_column():
    inspector = sa.inspect(op.get_bind())
    if "events" not in set(inspector.get_table_names()):
        return None
    return next(
        (column for column in inspector.get_columns("events") if column["name"] == "source"),
        None,
    )


def upgrade():
    source = _source_column()
    if source is None or (getattr(source["type"], "length", 0) or 0) >= 64:
        return
    with op.batch_alter_table("events") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=source["type"],
            type_=sa.String(length=64),
            existing_nullable=source["nullable"],
            existing_server_default=source.get("default"),
        )


def downgrade():
    source = _source_column()
    if source is None or (getattr(source["type"], "length", 0) or 0) <= 20:
        return
    # 降级前截断超长自定义来源，避免 MySQL 严格模式在收窄字段时中断。
    op.execute(sa.text("UPDATE events SET source = SUBSTR(source, 1, 20) WHERE LENGTH(source) > 20"))
    with op.batch_alter_table("events") as batch_op:
        batch_op.alter_column(
            "source",
            existing_type=source["type"],
            type_=sa.String(length=20),
            existing_nullable=source["nullable"],
            existing_server_default=source.get("default"),
        )
