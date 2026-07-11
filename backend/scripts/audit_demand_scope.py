#!/usr/bin/env python3
"""Audit legacy recruitment facts before demand_id backfill.

The audit is read-only. It classifies candidate/job fact bundles as:
A - exactly one Demand (safe proposal)
B - no Demand exists
C - multiple Demands but every fact has one non-overlapping time match
D - multiple Demands with ambiguous time evidence
E - orphan/cross-org/job-mismatch integrity error
"""

import argparse
import csv
from datetime import date, datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys

from sqlalchemy import MetaData, create_engine, select


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database_urls import normalize_database_url


SCHEMA_VERSION = 1
CATEGORIES = ("A", "B", "C", "D", "E")
FACT_SPECS = (
    ("pipeline_stages", "ts"),
    ("interviews", "created_at"),
    ("interview_assignments", "created_at"),
    ("interview_feedback", "created_at"),
    ("offer_records", "created_at"),
    ("candidate_dispositions", "created_at"),
    ("events", "ts"),
)


def _json_safe(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


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
        try:
            return datetime.combine(date.fromisoformat(text), datetime.min.time())
        except ValueError:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _payload_dict(value):
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def fact_context(table_name, row, timestamp_column):
    values = dict(row)
    candidate_id = values.get("candidate_id")
    job_id = values.get("job_id")
    if table_name == "events":
        payload = _payload_dict(values.get("payload"))
        candidate_id = payload.get("candidate_id")
        job_id = payload.get("job_id")
        if candidate_id is None and values.get("entity_type") == "candidate":
            candidate_id = values.get("entity_id")
        if job_id is None and values.get("entity_type") == "job":
            job_id = values.get("entity_id")

    if candidate_id is None or job_id is None:
        return None
    return {
        "table": table_name,
        "record_id": values.get("id"),
        "org_id": values.get("org_id", 1),
        "candidate_id": candidate_id,
        "job_id": job_id,
        "demand_id": values.get("demand_id"),
        "occurred_at": _json_safe(values.get(timestamp_column)),
    }


def _demand_start(demand):
    return (
        _as_datetime(demand.get("accepted_at"))
        or _as_datetime(demand.get("requested_at"))
        or _as_datetime(demand.get("created_at"))
    )


def _time_candidates(fact, demands):
    occurred_at = _as_datetime(fact.get("occurred_at"))
    if occurred_at is None:
        return []
    matches = []
    for demand in demands:
        start = _demand_start(demand)
        end = _as_datetime(demand.get("closed_at"))
        if start is None:
            continue
        if start <= occurred_at and (end is None or occurred_at <= end):
            matches.append(demand["id"])
    return matches


def _load_rows(connection, table):
    return [dict(row) for row in connection.execute(select(table)).mappings()]


def audit_database(database_url):
    engine = create_engine(normalize_database_url(database_url))
    metadata = MetaData()
    metadata.reflect(bind=engine)
    required = {"candidates", "jobs", "recruitment_demands"}
    missing = sorted(required - set(metadata.tables))
    if missing:
        engine.dispose()
        return {
            "schema_version": SCHEMA_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": {**{category: 0 for category in CATEGORIES}, "fact_count": 0},
            "bundles": [],
            "csv_rows": [],
            "schema_errors": [f"missing_table:{name}" for name in missing],
        }

    with engine.connect() as connection:
        candidates = {
            row["id"]: row for row in _load_rows(connection, metadata.tables["candidates"])
        }
        jobs = {row["id"]: row for row in _load_rows(connection, metadata.tables["jobs"])}
        demand_rows = _load_rows(connection, metadata.tables["recruitment_demands"])
        demands_by_id = {row["id"]: row for row in demand_rows}
        demands_by_scope = {}
        for demand in demand_rows:
            demands_by_scope.setdefault((demand.get("org_id", 1), demand.get("job_id")), []).append(demand)

        bundles = {}
        ignored_fact_count = 0
        for table_name, timestamp_column in FACT_SPECS:
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            for row in connection.execute(select(table)).mappings():
                fact = fact_context(table_name, row, timestamp_column)
                if fact is None:
                    ignored_fact_count += 1
                    continue
                key = (fact["org_id"], fact["candidate_id"], fact["job_id"])
                bundles.setdefault(key, []).append(fact)

    engine.dispose()

    report_bundles = []
    summary = {category: 0 for category in CATEGORIES}
    fact_count = 0
    for (org_id, candidate_id, job_id), facts in sorted(bundles.items()):
        facts.sort(key=lambda item: (item["table"], item["record_id"] or 0))
        fact_count += len(facts)
        issues = []
        candidate = candidates.get(candidate_id)
        job = jobs.get(job_id)
        if candidate is None:
            issues.append("orphan_candidate")
        elif candidate.get("org_id", 1) != org_id:
            issues.append("candidate_org_mismatch")
        if job is None:
            issues.append("orphan_job")
        elif job.get("org_id", 1) != org_id:
            issues.append("job_org_mismatch")

        scoped_demands = demands_by_scope.get((org_id, job_id), [])
        for fact in facts:
            mapped_id = fact.get("demand_id")
            if mapped_id is None:
                continue
            mapped = demands_by_id.get(mapped_id)
            if mapped is None:
                issues.append("orphan_demand")
            elif mapped.get("org_id", 1) != org_id:
                issues.append("demand_org_mismatch")
            elif mapped.get("job_id") != job_id:
                issues.append("job_mismatch")

        unresolved = [fact for fact in facts if fact.get("demand_id") is None]
        if issues:
            category = "E"
        elif not unresolved:
            mapped_ids = {fact["demand_id"] for fact in facts}
            category = "A" if len(mapped_ids) == 1 else "C"
            for fact in facts:
                fact["proposed_demand_id"] = fact["demand_id"]
                fact["basis"] = "existing demand_id"
        elif len(scoped_demands) == 0:
            category = "B"
            for fact in unresolved:
                fact["proposed_demand_id"] = None
                fact["basis"] = "no Demand for org/job"
        elif len(scoped_demands) == 1:
            category = "A"
            demand_id = scoped_demands[0]["id"]
            for fact in unresolved:
                fact["proposed_demand_id"] = demand_id
                fact["basis"] = "only Demand for org/job"
        else:
            all_unambiguous = True
            for fact in unresolved:
                candidates_for_time = _time_candidates(fact, scoped_demands)
                if len(candidates_for_time) == 1:
                    fact["proposed_demand_id"] = candidates_for_time[0]
                    fact["basis"] = "unique non-overlapping Demand time window"
                else:
                    fact["proposed_demand_id"] = None
                    fact["basis"] = (
                        "no matching Demand time window"
                        if not candidates_for_time
                        else "overlapping Demand time windows"
                    )
                    all_unambiguous = False
            category = "C" if all_unambiguous else "D"

        for fact in facts:
            fact.setdefault("proposed_demand_id", None)
            fact.setdefault("basis", "integrity issue" if issues else "no proposal")
        issues = sorted(set(issues))
        bundle = {
            "category": category,
            "org_id": org_id,
            "candidate_id": candidate_id,
            "job_id": job_id,
            "demand_ids": sorted(demand["id"] for demand in scoped_demands),
            "issues": issues,
            "facts": facts,
        }
        report_bundles.append(_json_safe(bundle))
        summary[category] += 1

    summary["fact_count"] = fact_count
    summary["ignored_fact_count"] = ignored_fact_count
    csv_rows = []
    for bundle in report_bundles:
        for fact in bundle["facts"]:
            csv_rows.append(
                {
                    "category": bundle["category"],
                    "org_id": bundle["org_id"],
                    "candidate_id": bundle["candidate_id"],
                    "job_id": bundle["job_id"],
                    "table": fact["table"],
                    "record_id": fact["record_id"],
                    "current_demand_id": fact["demand_id"],
                    "proposed_demand_id": fact["proposed_demand_id"],
                    "occurred_at": fact["occurred_at"],
                    "basis": fact["basis"],
                    "issues": ";".join(bundle["issues"]),
                }
            )

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "bundles": report_bundles,
        "csv_rows": csv_rows,
        "schema_errors": [],
    }


def build_mapping_manifest(report, categories=("A", "C"), approved=False):
    allowed = set(categories)
    mappings = []
    for bundle in report.get("bundles", []):
        if bundle.get("category") not in allowed or bundle.get("issues"):
            continue
        for fact in bundle.get("facts", []):
            proposed = fact.get("proposed_demand_id")
            if proposed is None:
                continue
            mappings.append(
                {
                    "table": fact["table"],
                    "record_id": fact["record_id"],
                    "org_id": bundle["org_id"],
                    "candidate_id": bundle["candidate_id"],
                    "job_id": bundle["job_id"],
                    "demand_id": proposed,
                    "basis": fact["basis"],
                    "audit_category": bundle["category"],
                    "approved": bool(approved),
                }
            )
    fingerprint_source = json.dumps(report.get("bundles", []), sort_keys=True, ensure_ascii=False)
    return {
        "schema_version": SCHEMA_VERSION,
        "source_report_sha256": hashlib.sha256(fingerprint_source.encode()).hexdigest(),
        "mappings": mappings,
    }


def _csv_text(rows):
    if not rows:
        return ""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Audit legacy facts for demand_id backfill")
    parser.add_argument("--database", required=True, help="SQLAlchemy database URL")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--output", help="Optional output file; stdout by default")
    parser.add_argument(
        "--manifest-output",
        help="Optional unapproved A/C mapping manifest for human review",
    )
    args = parser.parse_args(argv)

    report = audit_database(args.database)
    body = (
        json.dumps(report, ensure_ascii=False, indent=2)
        if args.format == "json"
        else _csv_text(report["csv_rows"])
    )
    if args.output:
        Path(args.output).write_text(body, encoding="utf-8")
    else:
        print(body)
    if args.manifest_output:
        manifest = build_mapping_manifest(report, approved=False)
        Path(args.manifest_output).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return 2 if report.get("summary", {}).get("E") else 0


if __name__ == "__main__":
    raise SystemExit(main())
