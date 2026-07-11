#!/usr/bin/env python3
"""Verify demand-scope schema revision and strict cutover invariants."""

import argparse
from datetime import date, datetime
import json
from pathlib import Path

from sqlalchemy import MetaData, and_, create_engine, func, select

try:
    from scripts.audit_demand_scope import FACT_SPECS, fact_context
except ImportError:  # Direct execution: python backend/scripts/verify_demand_scope.py
    from audit_demand_scope import FACT_SPECS, fact_context


EXPECTED_REVISION = "20260711_02"
EXPECTED_COLUMNS = {
    "recruitment_demands": {
        "city",
        "department",
        "job_title_snapshot",
        "jd_text_snapshot",
        "created_by",
        "closed_at",
        "closed_by",
    },
    "candidates": {"current_demand_id"},
    "pipeline_stages": {"demand_id"},
    "interviews": {"demand_id"},
    "interview_assignments": {
        "demand_id",
        "round_sequence",
        "is_primary",
        "primary_slot",
    },
    "interview_feedback": {"demand_id", "assignment_id"},
    "offer_records": {"demand_id"},
    "candidate_dispositions": {"demand_id"},
    "events": {"demand_id"},
    "notifications": {"demand_id"},
    "upload_batches": {"demand_id"},
}
EXPECTED_UNIQUE_INDEXES = {
    "interview_assignments": {
        "uq_interview_assignment_primary_slot": (
            "org_id",
            "demand_id",
            "candidate_id",
            "primary_slot",
        ),
    },
    "interview_feedback": {
        "uq_interview_feedback_assignment_id": ("assignment_id",),
    },
}


def _safe(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _current_revision(connection, metadata):
    table = metadata.tables.get("alembic_version")
    if table is None or "version_num" not in table.c:
        return None
    return connection.execute(select(table.c.version_num)).scalar_one_or_none()


def verify_database(database_url):
    engine = create_engine(database_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)
    schema_errors = []
    unmapped_by_table = {}
    mismatches = []
    demand_mismatches = []
    flow_mismatches = []
    active_flow_conflicts = []
    pointer_mismatches = []

    with engine.connect() as connection:
        current_revision = _current_revision(connection, metadata)
        revision_result = {
            "current": current_revision,
            "expected": EXPECTED_REVISION,
            "ok": current_revision == EXPECTED_REVISION,
        }

        for table_name, expected in EXPECTED_COLUMNS.items():
            table = metadata.tables.get(table_name)
            if table is None:
                schema_errors.append(f"missing_table:{table_name}")
                continue
            missing_columns = sorted(expected - set(table.c.keys()))
            schema_errors.extend(
                f"missing_column:{table_name}.{column}" for column in missing_columns
            )
        for table_name, expected_indexes in EXPECTED_UNIQUE_INDEXES.items():
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            actual_indexes = {index.name: index for index in table.indexes}
            for index_name, expected_columns in expected_indexes.items():
                index = actual_indexes.get(index_name)
                if index is None:
                    schema_errors.append(
                        f"missing_unique_index:{table_name}.{index_name}"
                    )
                    continue
                if not index.unique:
                    schema_errors.append(
                        f"non_unique_index:{table_name}.{index_name}"
                    )
                actual_columns = tuple(column.name for column in index.columns)
                if actual_columns != expected_columns:
                    schema_errors.append(
                        f"index_columns_mismatch:{table_name}.{index_name}"
                    )
        if "candidate_demand_flows" not in metadata.tables:
            schema_errors.append("missing_table:candidate_demand_flows")

        demand_table = metadata.tables.get("recruitment_demands")
        candidate_table = metadata.tables.get("candidates")
        job_table = metadata.tables.get("jobs")
        demands = {}
        candidates = {}
        jobs = {}
        if demand_table is not None:
            demands = {
                row["id"]: dict(row)
                for row in connection.execute(select(demand_table)).mappings()
            }
        if candidate_table is not None:
            candidates = {
                row["id"]: dict(row)
                for row in connection.execute(select(candidate_table)).mappings()
            }
        if job_table is None:
            schema_errors.append("missing_table:jobs")
        else:
            jobs = {
                row["id"]: dict(row)
                for row in connection.execute(select(job_table)).mappings()
            }

        for demand in demands.values():
            issues = []
            job = jobs.get(demand.get("job_id"))
            if job is None:
                issues.append("orphan_job")
            elif job.get("org_id", 1) != demand.get("org_id", 1):
                issues.append("job_org_mismatch")
            if issues:
                demand_mismatches.append(
                    {
                        "demand_id": demand["id"],
                        "job_id": demand.get("job_id"),
                        "issues": issues,
                    }
                )

        for table_name, timestamp_column in FACT_SPECS:
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            if "demand_id" not in table.c:
                unmapped_by_table[table_name] = connection.execute(
                    select(func.count()).select_from(table)
                ).scalar_one()
                continue
            unmapped = 0
            for row in connection.execute(select(table)).mappings():
                context = fact_context(table_name, row, timestamp_column)
                if context is None:
                    continue
                demand_id = context.get("demand_id")
                if demand_id is None:
                    unmapped += 1
                    continue
                demand = demands.get(demand_id)
                issues = []
                if demand is None:
                    issues.append("orphan_demand")
                else:
                    if demand.get("org_id", 1) != context["org_id"]:
                        issues.append("org_mismatch")
                    if demand.get("job_id") != context["job_id"]:
                        issues.append("job_mismatch")
                candidate = candidates.get(context["candidate_id"])
                if candidate is None:
                    issues.append("orphan_candidate")
                elif candidate.get("org_id", 1) != context["org_id"]:
                    issues.append("candidate_org_mismatch")
                if issues:
                    mismatches.append(
                        {
                            "table": table_name,
                            "record_id": context["record_id"],
                            "demand_id": demand_id,
                            "issues": issues,
                        }
                    )
            unmapped_by_table[table_name] = unmapped

        flow_table = metadata.tables.get("candidate_demand_flows")
        if (
            flow_table is not None
            and candidate_table is not None
            and "current_demand_id" in candidate_table.c
        ):
            for flow in connection.execute(select(flow_table)).mappings():
                issues = []
                candidate = candidates.get(flow["candidate_id"])
                demand = demands.get(flow["demand_id"])
                if candidate is None:
                    issues.append("orphan_candidate")
                elif candidate.get("org_id", 1) != flow["org_id"]:
                    issues.append("candidate_org_mismatch")
                if demand is None:
                    issues.append("orphan_demand")
                elif demand.get("org_id", 1) != flow["org_id"]:
                    issues.append("demand_org_mismatch")
                transfer_from_id = flow.get("transfer_from_demand_id")
                if transfer_from_id is not None:
                    transfer_from = demands.get(transfer_from_id)
                    if transfer_from is None:
                        issues.append("orphan_transfer_from_demand")
                    elif transfer_from.get("org_id", 1) != flow["org_id"]:
                        issues.append("transfer_from_demand_org_mismatch")
                if issues:
                    flow_mismatches.append(
                        {
                            "flow_id": flow["id"],
                            "candidate_id": flow["candidate_id"],
                            "demand_id": flow["demand_id"],
                            "issues": issues,
                        }
                    )

            active_counts = connection.execute(
                select(
                    flow_table.c.org_id,
                    flow_table.c.candidate_id,
                    func.count().label("active_count"),
                )
                .where(flow_table.c.status == "active")
                .group_by(flow_table.c.org_id, flow_table.c.candidate_id)
            ).mappings().all()
            for row in active_counts:
                if row["active_count"] > 1:
                    active_flow_conflicts.append(
                        {
                            "org_id": row["org_id"],
                            "candidate_id": row["candidate_id"],
                            "active_count": row["active_count"],
                        }
                    )

            for candidate in candidates.values():
                active_ids = connection.execute(
                    select(flow_table.c.demand_id).where(
                        and_(
                            flow_table.c.org_id == candidate.get("org_id", 1),
                            flow_table.c.candidate_id == candidate["id"],
                            flow_table.c.status == "active",
                        )
                    )
                ).scalars().all()
                expected_pointer = active_ids[0] if len(active_ids) == 1 else None
                if candidate.get("current_demand_id") != expected_pointer:
                    pointer_mismatches.append(
                        {
                            "candidate_id": candidate["id"],
                            "current_demand_id": candidate.get("current_demand_id"),
                            "expected_demand_id": expected_pointer,
                        }
                    )

    engine.dispose()
    unmapped_total = sum(unmapped_by_table.values())
    mismatch_total = len(mismatches)
    ok = (
        revision_result["ok"]
        and not schema_errors
        and unmapped_total == 0
        and mismatch_total == 0
        and not demand_mismatches
        and not flow_mismatches
        and not active_flow_conflicts
        and not pointer_mismatches
    )
    return {
        "ok": ok,
        "schema_revision": revision_result,
        "schema_errors": schema_errors,
        "unmapped_by_table": unmapped_by_table,
        "unmapped_total": unmapped_total,
        "mismatches": mismatches,
        "mismatch_total": mismatch_total,
        "demand_mismatches": demand_mismatches,
        "flow_mismatches": flow_mismatches,
        "active_flow_conflicts": active_flow_conflicts,
        "pointer_mismatches": pointer_mismatches,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Verify demand_id cutover invariants")
    parser.add_argument("--database", required=True, help="SQLAlchemy database URL")
    parser.add_argument("--output", help="Optional JSON report path")
    args = parser.parse_args(argv)

    report = verify_database(args.database)
    body = json.dumps(report, ensure_ascii=False, indent=2, default=_safe)
    if args.output:
        Path(args.output).write_text(body, encoding="utf-8")
    print(body)
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
