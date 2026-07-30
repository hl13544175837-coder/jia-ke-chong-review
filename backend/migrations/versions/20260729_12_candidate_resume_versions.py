"""Keep archived resume originals and structured snapshots before replacement."""

from alembic import op
import sqlalchemy as sa


revision = "20260729_12"
down_revision = "20260729_11"
branch_labels = None
depends_on = None


def _table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    if "candidate_resume_versions" in _table_names():
        return

    op.create_table(
        "candidate_resume_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("name_masked", sa.String(length=100), nullable=True),
        sa.Column("email_masked", sa.String(length=100), nullable=True),
        sa.Column("phone_masked", sa.String(length=30), nullable=True),
        sa.Column("resume_json", sa.JSON(), nullable=False),
        sa.Column("raw_file_path", sa.Text(), nullable=True),
        sa.Column("resume_sha256", sa.String(length=64), nullable=True),
        sa.Column("parse_status", sa.String(length=20), nullable=False),
        sa.Column("parse_error", sa.Text(), nullable=True),
        sa.Column("reason", sa.String(length=80), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["candidate_id"],
            ["candidates.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "org_id",
            "candidate_id",
            "version_no",
            name="uq_candidate_resume_versions_org_candidate_no",
        ),
    )
    op.create_index(
        "ix_candidate_resume_versions_org_candidate_created",
        "candidate_resume_versions",
        ["org_id", "candidate_id", "created_at"],
    )


def downgrade():
    raise RuntimeError("历史简历版本用于防止误覆盖，不支持破坏性在线降级。")
