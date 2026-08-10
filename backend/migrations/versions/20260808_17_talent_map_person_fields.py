"""Add editable fields (department/level/module/phone/owner) to talent_map_people."""

from alembic import op
import sqlalchemy as sa


revision = "20260808_17"
down_revision = "20260807_16"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("talent_map_people") as batch_op:
        batch_op.add_column(sa.Column("department", sa.String(length=120), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("level", sa.String(length=80), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("module", sa.String(length=120), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("phone", sa.String(length=60), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("owner_hr_id", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("talent_map_people") as batch_op:
        batch_op.drop_column("owner_hr_id")
        batch_op.drop_column("phone")
        batch_op.drop_column("module")
        batch_op.drop_column("level")
        batch_op.drop_column("department")
