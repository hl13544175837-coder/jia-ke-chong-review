"""Make built-in demo users visibly distinct from real acceptance accounts."""

from alembic import op
import sqlalchemy as sa


revision = "20260819_19"
down_revision = "20260811_18"
branch_labels = None
depends_on = None


DEMO_ACCOUNT_LABELS = {
    "hr01@mvp.local": "演示账号·招聘专员01",
    "hr02@mvp.local": "演示账号·招聘专员02",
    "hr03@mvp.local": "演示账号·招聘专员03",
    "interviewer01@mvp.local": "演示账号·面试官01",
    "interviewer02@mvp.local": "演示账号·面试官02",
}


def upgrade():
    bind = op.get_bind()
    for email, name in DEMO_ACCOUNT_LABELS.items():
        bind.execute(
            sa.text("UPDATE users SET name = :name WHERE email = :email"),
            {"name": name, "email": email},
        )


def downgrade():
    bind = op.get_bind()
    for email, name in DEMO_ACCOUNT_LABELS.items():
        original_name = name.removeprefix("演示账号·")
        bind.execute(
            sa.text(
                "UPDATE users SET name = :original_name "
                "WHERE email = :email AND name = :name"
            ),
            {"original_name": original_name, "email": email, "name": name},
        )
