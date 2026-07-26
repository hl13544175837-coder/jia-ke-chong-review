"""增加候选人收藏和可审计的重复档案合并记录。"""

from alembic import op
import sqlalchemy as sa


revision = "20260726_09"
down_revision = "20260724_08"
branch_labels = None
depends_on = None


def _table_names():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _create_candidate_favorites():
    if "candidate_favorites" in _table_names():
        return
    op.create_table(
        "candidate_favorites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.Integer(),
            sa.ForeignKey("candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "org_id",
            "user_id",
            "candidate_id",
            name="uq_candidate_favorites_org_user_candidate",
        ),
    )
    op.create_index(
        "ix_candidate_favorites_org_candidate",
        "candidate_favorites",
        ["org_id", "candidate_id"],
    )


def _create_candidate_merges():
    if "candidate_merges" in _table_names():
        return
    op.create_table(
        "candidate_merges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "primary_candidate_id",
            sa.Integer(),
            sa.ForeignKey("candidates.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "duplicate_candidate_id",
            sa.Integer(),
            sa.ForeignKey("candidates.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "merged_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "org_id",
            "duplicate_candidate_id",
            name="uq_candidate_merges_org_duplicate",
        ),
    )
    op.create_index(
        "ix_candidate_merges_org_primary",
        "candidate_merges",
        ["org_id", "primary_candidate_id"],
    )


def upgrade():
    _create_candidate_favorites()
    _create_candidate_merges()


def downgrade():
    raise RuntimeError(
        "版本 20260726_09 保留候选人合并审计历史，不支持破坏性在线降级。"
    )
