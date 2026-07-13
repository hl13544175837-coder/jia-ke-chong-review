"""Add an optional default interviewer to each recruitment demand."""

from alembic import op
import sqlalchemy as sa


revision = "20260711_03"
down_revision = "20260711_02"
branch_labels = None
depends_on = None


INDEX_NAME = "ix_recruitment_demands_org_default_interviewer"
FK_NAME = "fk_recruitment_demands_default_interviewer_id_users"
INDEX_COLUMNS = ("org_id", "default_interviewer_id")
FK_COLUMNS = ("default_interviewer_id",)
FK_REFERRED_COLUMNS = ("id",)


def _inspector():
    return sa.inspect(op.get_bind())


def _columns():
    return {
        column["name"]: column
        for column in _inspector().get_columns("recruitment_demands")
    }


def _index_definitions():
    return {
        index["name"]: index
        for index in _inspector().get_indexes("recruitment_demands")
    }


def _foreign_key_definitions():
    return {
        foreign_key["name"]: foreign_key
        for foreign_key in _inspector().get_foreign_keys(
            "recruitment_demands"
        )
        if foreign_key.get("name")
    }


def _validate_index(index):
    columns = tuple(index.get("column_names") or ())
    if columns != INDEX_COLUMNS or bool(index.get("unique")):
        raise RuntimeError(
            f"index definition mismatch for {INDEX_NAME}: "
            f"columns={columns}, unique={bool(index.get('unique'))}"
        )


def _validate_foreign_key(foreign_key):
    constrained = tuple(foreign_key.get("constrained_columns") or ())
    referred = tuple(foreign_key.get("referred_columns") or ())
    ondelete = str(
        (foreign_key.get("options") or {}).get("ondelete") or ""
    ).upper()
    if (
        constrained != FK_COLUMNS
        or foreign_key.get("referred_table") != "users"
        or referred != FK_REFERRED_COLUMNS
        or ondelete != "SET NULL"
    ):
        raise RuntimeError(
            f"foreign key definition mismatch for {FK_NAME}: "
            f"columns={constrained}, referred_table="
            f"{foreign_key.get('referred_table')}, "
            f"referred_columns={referred}, ondelete={ondelete!r}"
        )


def upgrade():
    existing_index = _index_definitions().get(INDEX_NAME)
    if existing_index is not None:
        _validate_index(existing_index)

    columns = _columns()
    existing_column = columns.get("default_interviewer_id")
    if existing_column is not None:
        if not isinstance(existing_column["type"], sa.Integer):
            raise RuntimeError(
                "default_interviewer_id column definition mismatch: "
                f"type={existing_column['type']}"
            )
        if existing_column.get("nullable") is not True:
            raise RuntimeError(
                "default_interviewer_id column definition mismatch: "
                "column must be nullable"
            )
    else:
        with op.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "default_interviewer_id",
                    sa.Integer(),
                    nullable=True,
                )
            )

    foreign_keys = _foreign_key_definitions()
    existing_foreign_key = foreign_keys.get(FK_NAME)
    if existing_foreign_key is None:
        conflicting = [
            foreign_key
            for foreign_key in foreign_keys.values()
            if tuple(foreign_key.get("constrained_columns") or ())
            == FK_COLUMNS
        ]
        if conflicting:
            raise RuntimeError(
                f"foreign key definition mismatch for {FK_NAME}: "
                "the column is already constrained under another definition"
            )
        with op.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.create_foreign_key(
                FK_NAME,
                "users",
                ["default_interviewer_id"],
                ["id"],
                ondelete="SET NULL",
            )
    else:
        _validate_foreign_key(existing_foreign_key)

    if existing_index is None:
        op.create_index(
            INDEX_NAME,
            "recruitment_demands",
            list(INDEX_COLUMNS),
            unique=False,
        )


def downgrade():
    foreign_key = _foreign_key_definitions().get(FK_NAME)
    if foreign_key is not None:
        _validate_foreign_key(foreign_key)
        with op.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.drop_constraint(FK_NAME, type_="foreignkey")

    index = _index_definitions().get(INDEX_NAME)
    if index is not None:
        _validate_index(index)
        op.drop_index(INDEX_NAME, table_name="recruitment_demands")
    if "default_interviewer_id" in _columns():
        with op.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.drop_column("default_interviewer_id")
