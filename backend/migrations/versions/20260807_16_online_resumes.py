"""Add independent storage for imported online resumes."""

from alembic import op
import sqlalchemy as sa


revision = "20260807_16"
down_revision = "20260806_15"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "online_resumes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("owner_hr_id", sa.Integer(), nullable=False),
        sa.Column("demand_id", sa.Integer(), nullable=False),
        sa.Column("boss_account", sa.String(length=160), nullable=False),
        sa.Column("source_platform", sa.String(length=60), nullable=False),
        sa.Column("external_record_id", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("resume_json", sa.JSON(), nullable=False),
        sa.Column(
            "is_manually_edited",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("chat_json", sa.JSON(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_hr_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["demand_id"],
            ["recruitment_demands.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "org_id",
            "owner_hr_id",
            "source_platform",
            "external_record_id",
            name="uq_online_resume_owner_external",
        ),
    )
    op.create_index(
        "ix_online_resumes_owner_created",
        "online_resumes",
        ["org_id", "owner_hr_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_online_resumes_demand",
        "online_resumes",
        ["org_id", "demand_id"],
        unique=False,
    )


def downgrade():
    raise RuntimeError("在线简历包含招聘业务数据，不支持破坏性在线降级。")
