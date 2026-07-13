"""Normalize demand request numbers and enforce organization-local uniqueness."""

from collections import defaultdict

from alembic import op
import sqlalchemy as sa


revision = "20260711_04"
down_revision = "20260711_03"
branch_labels = None
depends_on = None


INDEX_NAME = "uq_recruitment_demands_org_request_no"
INDEX_COLUMNS = ("org_id", "request_no")


def _inspector():
    return sa.inspect(op.get_bind())


def _column_names():
    return {
        column["name"]
        for column in _inspector().get_columns("recruitment_demands")
    }


def _index_definitions():
    return {
        index["name"]: index
        for index in _inspector().get_indexes("recruitment_demands")
    }


def _validate_index(index):
    columns = tuple(index.get("column_names") or ())
    if columns != INDEX_COLUMNS or not bool(index.get("unique")):
        raise RuntimeError(
            f"index definition mismatch for {INDEX_NAME}: "
            f"columns={columns}, unique={bool(index.get('unique'))}"
        )


def _normalize(value, demand_id):
    normalized = str(value or "").strip().upper()[:80]
    return normalized or f"LEGACY-DEMAND-{demand_id}"


def _normalized_rows():
    demands = sa.table(
        "recruitment_demands",
        sa.column("id", sa.Integer()),
        sa.column("org_id", sa.Integer()),
        sa.column("request_no", sa.String(length=80)),
    )
    rows = list(
        op.get_bind().execute(
            sa.select(demands.c.id, demands.c.org_id, demands.c.request_no)
            .order_by(demands.c.id)
        ).mappings()
    )
    null_org_ids = [row["id"] for row in rows if row["org_id"] is None]
    if null_org_ids:
        raise RuntimeError(
            "recruitment demands contain NULL org_id; resolve before migration: "
            + ", ".join(str(item) for item in null_org_ids)
        )
    normalized = [
        {
            "id": row["id"],
            "org_id": row["org_id"],
            "request_no": _normalize(row["request_no"], row["id"]),
        }
        for row in rows
    ]
    groups = defaultdict(list)
    for row in normalized:
        groups[(row["org_id"], row["request_no"])].append(row["id"])
    duplicates = {
        key: ids for key, ids in groups.items() if len(ids) > 1
    }
    if duplicates:
        details = ", ".join(
            f"org_id={org_id}, request_no={request_no}, ids={ids}"
            for (org_id, request_no), ids in sorted(duplicates.items())
        )
        raise RuntimeError(
            "normalized duplicate request numbers; resolve before migration: "
            + details
        )
    return demands, normalized


def upgrade():
    if "request_no" not in _column_names():
        raise RuntimeError(
            "recruitment_demands.request_no is missing; refusing uniqueness migration"
        )

    existing_index = _index_definitions().get(INDEX_NAME)
    if existing_index is not None:
        _validate_index(existing_index)

    demands, normalized = _normalized_rows()
    for row in normalized:
        op.get_bind().execute(
            sa.update(demands)
            .where(demands.c.id == row["id"])
            .values(request_no=row["request_no"])
        )

    with op.batch_alter_table("recruitment_demands") as batch_op:
        batch_op.alter_column(
            "request_no",
            existing_type=sa.String(length=80),
            nullable=False,
        )

    if existing_index is None:
        op.create_index(
            INDEX_NAME,
            "recruitment_demands",
            list(INDEX_COLUMNS),
            unique=True,
        )


def downgrade():
    index = _index_definitions().get(INDEX_NAME)
    if index is not None:
        _validate_index(index)
        op.drop_index(INDEX_NAME, table_name="recruitment_demands")
    if "request_no" in _column_names():
        with op.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.alter_column(
                "request_no",
                existing_type=sa.String(length=80),
                nullable=True,
            )
