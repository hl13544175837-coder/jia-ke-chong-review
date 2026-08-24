#!/usr/bin/env python3
"""Apply an explicitly approved demand_id mapping manifest.

Dry-run is the default. ``--apply`` performs one transaction and is idempotent:
already-correct rows and existing CandidateDemandFlow records are preserved.
"""

import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys

from sqlalchemy import MetaData, and_, create_engine, select, update


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database_urls import normalize_database_url

try:
    from scripts.audit_demand_scope import FACT_SPECS, SCHEMA_VERSION, fact_context
except ImportError:  # Direct execution: python backend/scripts/backfill_demand_scope.py
    from audit_demand_scope import FACT_SPECS, SCHEMA_VERSION, fact_context


EXPECTED_REVISION = "20260824_19"
ALLOWED_TABLES = {table_name for table_name, _ in FACT_SPECS}
TIMESTAMP_COLUMNS = dict(FACT_SPECS)
TERMINAL_FLOW_STATUSES = {"transferred", "rejected", "onboarded"}


class DemandScopeBackfillError(RuntimeError):
    pass


def _as_datetime(value):
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _current_revision(connection, metadata):
    table = metadata.tables.get("alembic_version")
    if table is None:
        return None
    return connection.execute(select(table.c.version_num)).scalar_one_or_none()


def _reflect(connection):
    metadata = MetaData()
    metadata.reflect(bind=connection)
    required = {
        "alembic_version",
        "candidates",
        "jobs",
        "recruitment_demands",
        "candidate_demand_flows",
    } | ALLOWED_TABLES
    missing = sorted(required - set(metadata.tables))
    if missing:
        raise DemandScopeBackfillError(f"schema missing tables: {', '.join(missing)}")
    revision = _current_revision(connection, metadata)
    if revision != EXPECTED_REVISION:
        raise DemandScopeBackfillError(
            f"schema revision {revision!r} does not match {EXPECTED_REVISION!r}"
        )
    return metadata


def _row_by_id(connection, table, record_id):
    return connection.execute(
        select(table).where(table.c.id == record_id)
    ).mappings().one_or_none()


def _prepare_mappings(connection, metadata, manifest):
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise DemandScopeBackfillError(
            f"mapping schema_version must be {SCHEMA_VERSION}"
        )

    demand_table = metadata.tables["recruitment_demands"]
    job_table = metadata.tables["jobs"]
    prepared = []
    skipped_unapproved = 0
    seen = {}
    for position, mapping in enumerate(manifest.get("mappings", []), start=1):
        if mapping.get("approved") is not True:
            skipped_unapproved += 1
            continue
        table_name = mapping.get("table")
        record_id = mapping.get("record_id")
        demand_id = mapping.get("demand_id")
        basis = str(mapping.get("basis") or "").strip()
        if table_name not in ALLOWED_TABLES:
            raise DemandScopeBackfillError(f"mapping #{position}: unsupported table {table_name!r}")
        if not isinstance(record_id, int) or not isinstance(demand_id, int):
            raise DemandScopeBackfillError(
                f"mapping #{position}: record_id and demand_id must be integers"
            )
        if not basis:
            raise DemandScopeBackfillError(f"mapping #{position}: basis is required")
        duplicate_key = (table_name, record_id)
        previous = seen.get(duplicate_key)
        if previous is not None and previous != demand_id:
            raise DemandScopeBackfillError(
                f"mapping #{position}: conflicting demand_id for {table_name}#{record_id}"
            )
        if previous is not None:
            continue
        seen[duplicate_key] = demand_id

        table = metadata.tables[table_name]
        if "demand_id" not in table.c:
            raise DemandScopeBackfillError(f"{table_name}.demand_id is missing")
        row = _row_by_id(connection, table, record_id)
        if row is None:
            raise DemandScopeBackfillError(f"{table_name}#{record_id} does not exist")
        context = fact_context(table_name, row, TIMESTAMP_COLUMNS[table_name])
        if context is None:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} has no candidate_id/job_id evidence"
            )
        demand = _row_by_id(connection, demand_table, demand_id)
        if demand is None:
            raise DemandScopeBackfillError(f"demand_id {demand_id} does not exist")
        if context["org_id"] != demand.get("org_id", 1):
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} org_id does not match demand_id {demand_id}"
            )
        if context["job_id"] != demand.get("job_id"):
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} job_id does not match demand_id {demand_id}"
            )
        job = _row_by_id(connection, job_table, context["job_id"])
        if job is None:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} job_id {context['job_id']} does not exist"
            )
        if job.get("org_id", 1) != context["org_id"]:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} job org_id does not match source org_id"
            )
        candidate = _row_by_id(
            connection,
            metadata.tables["candidates"],
            context["candidate_id"],
        )
        if candidate is None:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} candidate_id {context['candidate_id']} does not exist"
            )
        if candidate.get("org_id", 1) != context["org_id"]:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} candidate org_id mismatch"
            )
        for optional_key in ("org_id", "candidate_id", "job_id"):
            declared = mapping.get(optional_key)
            if declared is not None and declared != context[optional_key]:
                raise DemandScopeBackfillError(
                    f"mapping #{position}: declared {optional_key} does not match source row"
                )

        existing = row.get("demand_id")
        if existing is not None and existing != demand_id:
            raise DemandScopeBackfillError(
                f"{table_name}#{record_id} already maps to demand_id {existing}"
            )
        prepared.append(
            {
                "table": table_name,
                "record_id": record_id,
                "demand_id": demand_id,
                "basis": basis,
                "context": context,
                "demand": dict(demand),
                "stage": row.get("stage"),
                "already_applied": existing == demand_id,
            }
        )
    return prepared, skipped_unapproved


def _flow_state(entries):
    pipeline_entries = [entry for entry in entries if entry["table"] == "pipeline_stages"]
    if not pipeline_entries:
        return "active", None
    pipeline_entries.sort(
        key=lambda entry: _as_datetime(entry["context"].get("occurred_at")) or datetime.min
    )
    latest = pipeline_entries[-1]
    table_row_stage = latest.get("stage")
    if table_row_stage in TERMINAL_FLOW_STATUSES:
        return table_row_stage, _as_datetime(latest["context"].get("occurred_at"))
    return "active", None


def _ensure_flows(connection, metadata, prepared, now):
    flow_table = metadata.tables["candidate_demand_flows"]
    grouped = {}
    for entry in prepared:
        context = entry["context"]
        key = (context["org_id"], context["candidate_id"], entry["demand_id"])
        grouped.setdefault(key, []).append(entry)

    created = 0
    updated_count = 0
    touched_candidates = set()
    for (org_id, candidate_id, demand_id), entries in grouped.items():
        touched_candidates.add((org_id, candidate_id))
        occurred = [
            _as_datetime(entry["context"].get("occurred_at"))
            for entry in entries
        ]
        occurred = [value for value in occurred if value is not None]
        started_at = min(occurred) if occurred else now
        state, ended_at = _flow_state(entries)
        owner_hr_id = entries[0]["demand"].get("owner_hr_id")
        existing = connection.execute(
            select(flow_table).where(
                and_(
                    flow_table.c.org_id == org_id,
                    flow_table.c.candidate_id == candidate_id,
                    flow_table.c.demand_id == demand_id,
                )
            )
        ).mappings().one_or_none()
        if existing is None:
            connection.execute(
                flow_table.insert().values(
                    org_id=org_id,
                    candidate_id=candidate_id,
                    demand_id=demand_id,
                    owner_hr_id=owner_hr_id,
                    status=state,
                    started_at=started_at,
                    ended_at=ended_at,
                    created_at=now,
                    updated_at=now,
                )
            )
            created += 1
            continue

        changes = {}
        existing_started = _as_datetime(existing.get("started_at"))
        if existing_started is None or started_at < existing_started:
            changes["started_at"] = started_at
        if existing.get("owner_hr_id") != owner_hr_id:
            changes["owner_hr_id"] = owner_hr_id
        if state in TERMINAL_FLOW_STATUSES and existing.get("status") != state:
            changes["status"] = state
            changes["ended_at"] = ended_at
        if changes:
            changes["updated_at"] = now
            connection.execute(
                update(flow_table).where(flow_table.c.id == existing["id"]).values(**changes)
            )
            updated_count += 1
    return created, updated_count, touched_candidates


def _sync_current_pointers(connection, metadata, touched_candidates):
    flow_table = metadata.tables["candidate_demand_flows"]
    candidate_table = metadata.tables["candidates"]
    for org_id, candidate_id in touched_candidates:
        active_ids = connection.execute(
            select(flow_table.c.demand_id).where(
                and_(
                    flow_table.c.org_id == org_id,
                    flow_table.c.candidate_id == candidate_id,
                    flow_table.c.status == "active",
                )
            )
        ).scalars().all()
        if len(active_ids) > 1:
            raise DemandScopeBackfillError(
                f"candidate_id {candidate_id} would have multiple active demand flows"
            )
        current_demand_id = active_ids[0] if active_ids else None
        connection.execute(
            update(candidate_table)
            .where(
                and_(
                    candidate_table.c.id == candidate_id,
                    candidate_table.c.org_id == org_id,
                )
            )
            .values(current_demand_id=current_demand_id)
        )


def _execute(connection, metadata, prepared):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    flows_created, flows_updated, touched_candidates = _ensure_flows(
        connection,
        metadata,
        prepared,
        now,
    )
    applied = 0
    already_applied = 0
    mapping_report = []
    for entry in prepared:
        if entry["already_applied"]:
            already_applied += 1
            result = "already_applied"
        else:
            table = metadata.tables[entry["table"]]
            connection.execute(
                update(table)
                .where(table.c.id == entry["record_id"])
                .values(demand_id=entry["demand_id"])
            )
            applied += 1
            result = "applied"
        mapping_report.append(
            {
                "table": entry["table"],
                "record_id": entry["record_id"],
                "demand_id": entry["demand_id"],
                "basis": entry["basis"],
                "result": result,
            }
        )
    _sync_current_pointers(connection, metadata, touched_candidates)
    return {
        "applied": applied,
        "already_applied": already_applied,
        "flows_created": flows_created,
        "flows_updated": flows_updated,
        "mapping_report": mapping_report,
    }


def backfill_database(database_url, manifest, apply=False):
    engine = create_engine(normalize_database_url(database_url))
    try:
        if apply:
            with engine.begin() as connection:
                metadata = _reflect(connection)
                prepared, skipped = _prepare_mappings(connection, metadata, manifest)
                result = _execute(connection, metadata, prepared)
            return {
                "schema_version": SCHEMA_VERSION,
                "mode": "apply",
                "planned": len(prepared),
                "skipped_unapproved": skipped,
                **result,
            }

        with engine.connect() as connection:
            metadata = _reflect(connection)
            prepared, skipped = _prepare_mappings(connection, metadata, manifest)
        return {
            "schema_version": SCHEMA_VERSION,
            "mode": "dry-run",
            "planned": len(prepared),
            "skipped_unapproved": skipped,
            "applied": 0,
            "already_applied": sum(entry["already_applied"] for entry in prepared),
            "flows_created": 0,
            "flows_updated": 0,
            "mapping_report": [
                {
                    "table": entry["table"],
                    "record_id": entry["record_id"],
                    "demand_id": entry["demand_id"],
                    "basis": entry["basis"],
                    "result": "already_applied" if entry["already_applied"] else "planned",
                }
                for entry in prepared
            ],
        }
    finally:
        engine.dispose()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Backfill approved demand_id mappings")
    parser.add_argument("--database", required=True, help="SQLAlchemy database URL")
    parser.add_argument("--mapping", required=True, help="Approved JSON mapping manifest")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Commit mappings; without this flag the command is read-only",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicitly select the default read-only mode",
    )
    parser.add_argument("--report-output", help="Optional JSON result path")
    args = parser.parse_args(argv)

    manifest = json.loads(Path(args.mapping).read_text(encoding="utf-8"))
    try:
        result = backfill_database(args.database, manifest, apply=args.apply)
    except DemandScopeBackfillError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2
    body = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report_output:
        Path(args.report_output).write_text(body, encoding="utf-8")
    print(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
