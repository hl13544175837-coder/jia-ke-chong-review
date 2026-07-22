"""增加面试接单状态、受控访问版本和外部通知投递记录。"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_05"
down_revision = "20260711_04"
branch_labels = None
depends_on = None


DELIVERY_TABLE = "interview_notification_deliveries"
DELIVERY_STATUS_INDEX = "ix_interview_notification_deliveries_org_status"
DELIVERY_ASSIGNMENT_UNIQUE = "uq_interview_notification_deliveries_assignment_id"


def _inspector():
    return sa.inspect(op.get_bind())


def _column_names(table_name):
    return {
        column["name"]
        for column in _inspector().get_columns(table_name)
    }


def upgrade():
    table_names = set(_inspector().get_table_names())
    if "interview_assignments" not in table_names:
        return

    assignment_columns = _column_names("interview_assignments")
    with op.batch_alter_table("interview_assignments") as batch_op:
        if "response_status" not in assignment_columns:
            batch_op.add_column(
                sa.Column(
                    "response_status",
                    sa.String(length=20),
                    nullable=False,
                    server_default="pending",
                )
            )
        if "response_reason" not in assignment_columns:
            batch_op.add_column(sa.Column("response_reason", sa.Text(), nullable=True))
        if "responded_at" not in assignment_columns:
            batch_op.add_column(sa.Column("responded_at", sa.DateTime(), nullable=True))
        if "access_token_version" not in assignment_columns:
            batch_op.add_column(
                sa.Column(
                    "access_token_version",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )

    if (
        "interview_feedback" in table_names
        and "assignment_id" in _column_names("interview_feedback")
    ):
        assignments = sa.table(
            "interview_assignments",
            sa.column("id", sa.Integer()),
            sa.column("response_status", sa.String(length=20)),
            sa.column("responded_at", sa.DateTime()),
        )
        feedback = sa.table(
            "interview_feedback",
            sa.column("assignment_id", sa.Integer()),
            sa.column("created_at", sa.DateTime()),
        )
        feedback_rows = list(
            op.get_bind().execute(
                sa.select(feedback.c.assignment_id, feedback.c.created_at).where(
                    feedback.c.assignment_id.is_not(None)
                )
            ).mappings()
        )
        for row in feedback_rows:
            op.get_bind().execute(
                sa.update(assignments)
                .where(assignments.c.id == row["assignment_id"])
                .values(
                    response_status="accepted",
                    responded_at=row["created_at"],
                )
            )

    if (
        "users" in table_names
        and DELIVERY_TABLE not in _inspector().get_table_names()
    ):
        op.create_table(
            DELIVERY_TABLE,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("org_id", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("assignment_id", sa.Integer(), nullable=False),
            sa.Column("recipient_user_id", sa.Integer(), nullable=False),
            sa.Column("channel", sa.String(length=40), nullable=False, server_default="wecom_webhook"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_error", sa.String(length=240), nullable=True),
            sa.Column("response_code", sa.Integer(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(
                ["assignment_id"],
                ["interview_assignments.id"],
                name="fk_interview_notification_deliveries_assignment_id",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["recipient_user_id"],
                ["users.id"],
                name="fk_interview_notification_deliveries_recipient_user_id",
                ondelete="RESTRICT",
            ),
            sa.UniqueConstraint(
                "assignment_id",
                name=DELIVERY_ASSIGNMENT_UNIQUE,
            ),
        )
        op.create_index(
            DELIVERY_STATUS_INDEX,
            DELIVERY_TABLE,
            ["org_id", "status"],
            unique=False,
        )


def downgrade():
    if DELIVERY_TABLE in _inspector().get_table_names():
        op.drop_table(DELIVERY_TABLE)

    if "interview_assignments" not in _inspector().get_table_names():
        return
    assignment_columns = _column_names("interview_assignments")
    with op.batch_alter_table("interview_assignments") as batch_op:
        for column_name in (
            "access_token_version",
            "responded_at",
            "response_reason",
            "response_status",
        ):
            if column_name in assignment_columns:
                batch_op.drop_column(column_name)
