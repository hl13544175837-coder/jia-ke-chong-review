"""Add editable fields (department/level/module/phone/owner) to talent_map_people."""

from alembic import op
import sqlalchemy as sa


revision = "20260808_17"
down_revision = "20260807_16"
branch_labels = None
depends_on = None


def upgrade():
    _ensure_talent_map_tables()
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("talent_map_people")}
    with op.batch_alter_table("talent_map_people") as batch_op:
        if "department" not in columns:
            batch_op.add_column(sa.Column("department", sa.String(length=120), nullable=False, server_default=""))
        if "level" not in columns:
            batch_op.add_column(sa.Column("level", sa.String(length=80), nullable=False, server_default=""))
        if "module" not in columns:
            batch_op.add_column(sa.Column("module", sa.String(length=120), nullable=False, server_default=""))
        if "phone" not in columns:
            batch_op.add_column(sa.Column("phone", sa.String(length=60), nullable=False, server_default=""))
        if "owner_hr_id" not in columns:
            batch_op.add_column(sa.Column("owner_hr_id", sa.Integer(), nullable=True))


def _ensure_talent_map_tables():
    """人才地图三张核心表历史上由 db.create_all 创建，从未进入迁移链。

    这里在首个引用它们的迁移中补建，保证从旧库升级到 head 不会因表缺失中断；
    已存在表的库（正式/SIT）会跳过，不影响已应用过的迁移。
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("talent_maps"):
        op.create_table(
            "talent_maps",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id")),
            sa.Column("department", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("owner_hr_id", sa.Integer(), sa.ForeignKey("users.id")),
            sa.Column("board_json", sa.JSON()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if not inspector.has_table("talent_map_companies"):
        op.create_table(
            "talent_map_companies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column(
                "map_id",
                sa.Integer(),
                sa.ForeignKey("talent_maps.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("company_name", sa.String(length=200), nullable=False),
            sa.Column("city", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("region", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("industry", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("priority", sa.String(length=40), nullable=False, server_default="medium"),
            sa.Column("note", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )

    if not inspector.has_table("talent_map_people"):
        op.create_table(
            "talent_map_people",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column(
                "map_id",
                sa.Integer(),
                sa.ForeignKey("talent_maps.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("talent_map_companies.id")),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("city", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("tags", sa.JSON()),
            sa.Column("salary_range", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("contact_status", sa.String(length=80), nullable=False, server_default="未接触"),
            sa.Column("evaluation", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("source", sa.String(length=160), nullable=False, server_default=""),
            sa.Column("next_follow_at", sa.Date()),
            sa.Column("note", sa.Text()),
            sa.Column("created_at", sa.DateTime()),
            sa.Column("updated_at", sa.DateTime()),
        )


def downgrade():
    with op.batch_alter_table("talent_map_people") as batch_op:
        batch_op.drop_column("owner_hr_id")
        batch_op.drop_column("phone")
        batch_op.drop_column("module")
        batch_op.drop_column("level")
        batch_op.drop_column("department")
