"""Add talent_map_contact_logs (contact timeline for talent map people)."""

from alembic import op
import sqlalchemy as sa


revision = "20260811_18"
down_revision = "20260808_17"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("talent_map_contact_logs"):
        op.create_table(
            "talent_map_contact_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "person_id",
                sa.Integer(),
                sa.ForeignKey("talent_map_people.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("contact_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
    indexes = {index["name"] for index in inspector.get_indexes("talent_map_contact_logs")}
    if "ix_talent_map_contact_logs_person_id" not in indexes:
        op.create_index(
            "ix_talent_map_contact_logs_person_id",
            "talent_map_contact_logs",
            ["person_id"],
        )


def downgrade():
    op.drop_index("ix_talent_map_contact_logs_person_id", table_name="talent_map_contact_logs")
    op.drop_table("talent_map_contact_logs")
