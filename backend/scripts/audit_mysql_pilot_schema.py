#!/usr/bin/env python3
"""Read-only, secret-safe audit for the MySQL pilot schema."""

import argparse
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.sql import sqltypes


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database_urls import normalize_database_url


EXPECTED_REVISION = "20260804_14"
KNOWN_PREDECESSOR_REVISIONS = {
    "20260710_01",
    "20260711_02",
    "20260711_03",
    "20260711_04",
    "20260721_05",
    "20260721_06",
    "20260722_07",
    "20260724_08",
    "20260726_09",
    "20260728_10",
    "20260729_11",
    "20260729_12",
}

EXPECTED_COLUMNS = {
    "candidates": {
        "resume_sha256": {"family": "string", "length": 64, "nullable": True},
    },
    "candidate_resume_versions": {
        "id": {"family": "integer", "nullable": False, "primary_key": True},
        "org_id": {"family": "integer", "nullable": False},
        "candidate_id": {"family": "integer", "nullable": False},
        "version_no": {"family": "integer", "nullable": False},
        "resume_json": {"family": "json", "nullable": False},
        "raw_file_path": {"family": "text", "nullable": True},
        "resume_sha256": {"family": "string", "length": 64, "nullable": True},
        "parse_status": {"family": "string", "length": 20, "nullable": False},
        "reason": {"family": "string", "length": 80, "nullable": False},
        "created_by": {"family": "integer", "nullable": True},
        "created_at": {"family": "datetime", "nullable": False},
    },
    "interview_reschedule_requests": {
        "id": {"family": "integer", "nullable": False, "primary_key": True},
        "org_id": {"family": "integer", "nullable": False},
        "assignment_id": {"family": "integer", "nullable": False},
        "replacement_assignment_id": {"family": "integer", "nullable": True},
        "candidate_id": {"family": "integer", "nullable": False},
        "job_id": {"family": "integer", "nullable": False},
        "demand_id": {"family": "integer", "nullable": False},
        "round": {"family": "string", "length": 30, "nullable": False},
        "round_sequence": {"family": "integer", "nullable": False},
        "source": {"family": "string", "length": 30, "nullable": False},
        "status": {"family": "string", "length": 30, "nullable": False},
        "requested_by": {"family": "integer", "nullable": False},
        "requested_at": {"family": "datetime", "nullable": False},
        "reason": {"family": "text", "nullable": False},
        "proposed_times": {"family": "json", "nullable": False},
        "original_interviewer_id": {"family": "integer", "nullable": False},
        "original_scheduled_at": {"family": "datetime", "nullable": True},
        "original_location": {"family": "string", "length": 240, "nullable": False},
        "final_interviewer_id": {"family": "integer", "nullable": True},
        "final_scheduled_at": {"family": "datetime", "nullable": True},
        "final_location": {"family": "string", "length": 240, "nullable": False},
        "processed_by": {"family": "integer", "nullable": True},
        "processed_at": {"family": "datetime", "nullable": True},
        "processor_note": {"family": "text", "nullable": True},
        "created_at": {"family": "datetime", "nullable": False},
        "updated_at": {"family": "datetime", "nullable": False},
    },
    "recruitment_demands": {
        "approval_status": {
            "family": "string",
            "length": 20,
            "nullable": False,
            "allowed_defaults": (None, "approved"),
        },
        "submitted_at": {"family": "datetime", "nullable": True},
        "reviewed_by": {"family": "integer", "nullable": True},
        "reviewed_at": {"family": "datetime", "nullable": True},
        "review_reason": {"family": "text", "nullable": True},
    },
    "interview_feedback": {
        "updated_by": {"family": "integer", "nullable": True},
        "updated_at": {"family": "datetime", "nullable": False},
    },
    "business_review_tasks": {
        "id": {
            "family": "integer",
            "nullable": False,
            "primary_key": True,
        },
        "org_id": {"family": "integer", "nullable": False},
        "demand_id": {"family": "integer", "nullable": False},
        "candidate_id": {"family": "integer", "nullable": False},
        "reviewer_id": {"family": "integer", "nullable": False},
        "status": {"family": "string", "length": 20, "nullable": False},
        "pending_slot": {"family": "integer", "nullable": True},
        "hr_note": {"family": "text", "nullable": True},
        "business_note": {"family": "text", "nullable": True},
        "due_at": {"family": "datetime", "nullable": True},
        "created_by": {"family": "integer", "nullable": False},
        "decided_by": {"family": "integer", "nullable": True},
        "decided_at": {"family": "datetime", "nullable": True},
        "created_at": {"family": "datetime", "nullable": False},
        "updated_at": {"family": "datetime", "nullable": False},
    },
    "candidate_favorites": {
        "id": {"family": "integer", "nullable": False, "primary_key": True},
        "org_id": {"family": "integer", "nullable": False},
        "user_id": {"family": "integer", "nullable": False},
        "candidate_id": {"family": "integer", "nullable": False},
        "created_at": {"family": "datetime", "nullable": False},
    },
    "candidate_merges": {
        "id": {"family": "integer", "nullable": False, "primary_key": True},
        "org_id": {"family": "integer", "nullable": False},
        "primary_candidate_id": {"family": "integer", "nullable": False},
        "duplicate_candidate_id": {"family": "integer", "nullable": False},
        "merged_by": {"family": "integer", "nullable": False},
        "reason": {"family": "string", "length": 240, "nullable": False},
        "created_at": {"family": "datetime", "nullable": False},
    },
}

EXPECTED_INDEXES = {
    "candidates": {
        "ix_candidates_org_resume_sha256": {
            "columns": ("org_id", "resume_sha256"),
            "unique": False,
        },
    },
    "candidate_resume_versions": {
        "ix_candidate_resume_versions_org_candidate_created": {
            "columns": ("org_id", "candidate_id", "created_at"),
            "unique": False,
        },
    },
    "interview_reschedule_requests": {
        "ix_interview_reschedule_org_assignment_status": {
            "columns": ("org_id", "assignment_id", "status"),
            "unique": False,
        },
        "ix_interview_reschedule_org_candidate_demand_round": {
            "columns": ("org_id", "candidate_id", "demand_id", "round_sequence"),
            "unique": False,
        },
    },
    "business_review_tasks": {
        "ix_business_reviews_org_reviewer_status": {
            "columns": ("org_id", "reviewer_id", "status"),
            "unique": False,
        },
        "ix_business_reviews_org_demand_candidate": {
            "columns": ("org_id", "demand_id", "candidate_id"),
            "unique": False,
        },
        "uq_business_reviews_pending_slot": {
            "columns": (
                "org_id",
                "demand_id",
                "candidate_id",
                "pending_slot",
            ),
            "unique": True,
        },
    },
    "candidate_favorites": {
        "ix_candidate_favorites_org_candidate": {
            "columns": ("org_id", "candidate_id"),
            "unique": False,
        },
    },
    "candidate_merges": {
        "ix_candidate_merges_org_primary": {
            "columns": ("org_id", "primary_candidate_id"),
            "unique": False,
        },
    },
}

EXPECTED_UNIQUE_CONSTRAINTS = {
    "candidate_resume_versions": {
        "uq_candidate_resume_versions_org_candidate_no": (
            "org_id",
            "candidate_id",
            "version_no",
        ),
    },
    "candidate_favorites": {
        "uq_candidate_favorites_org_user_candidate": (
            "org_id",
            "user_id",
            "candidate_id",
        ),
    },
    "candidate_merges": {
        "uq_candidate_merges_org_duplicate": (
            "org_id",
            "duplicate_candidate_id",
        ),
    },
}

_SENSITIVE_KEYS = {
    "database_url",
    "url",
    "host",
    "hostname",
    "username",
    "user",
    "password",
    "secret",
    "token",
}
_URL_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*://[^\s\"'<>]+")


def _empty_report(database=None):
    return {
        "ok": False,
        "database": database or {"dialect": "unknown", "name": "unknown"},
        "revision": {
            "current": None,
            "expected": EXPECTED_REVISION,
            "ok": False,
        },
        "counts": {"tables": 0, "required_tables": len(EXPECTED_COLUMNS)},
        "tables": {},
        "missing": [],
        "conflicts": [],
        "errors": [],
    }


def _database_identity(database_url):
    try:
        parsed = make_url(normalize_database_url(database_url))
        dialect = parsed.get_backend_name()
        database = unquote(parsed.database or "")
        if dialect == "sqlite":
            database = Path(database).name or ":memory:"
        return {"dialect": dialect, "name": database or "unknown"}
    except Exception:
        return {"dialect": "unknown", "name": "unknown"}


def _type_family(column_type):
    if isinstance(column_type, sqltypes.DateTime):
        return "datetime"
    if isinstance(column_type, sqltypes.Text):
        return "text"
    if isinstance(column_type, sqltypes.Integer):
        return "integer"
    if isinstance(column_type, sqltypes.String):
        return "string"
    return column_type.__class__.__name__.lower()


def _default_matches(actual, expected):
    if expected is None:
        return actual is None
    normalized = re.sub(r"[\s'\"`()]+", "", str(actual or "").lower())
    return normalized == str(expected).lower()


def _column_issues(actual, expected, *, primary_key=False):
    issues = []
    family = _type_family(actual.get("type"))
    if family != expected["family"]:
        issues.append(f"type:{family}")
    expected_length = expected.get("length")
    actual_length = getattr(actual.get("type"), "length", None)
    if expected_length is not None and actual_length != expected_length:
        issues.append(f"length:{actual_length}")
    if bool(actual.get("nullable")) != expected["nullable"]:
        issues.append(f"nullable:{bool(actual.get('nullable'))}")
    if expected.get("primary_key") and not primary_key:
        issues.append("primary_key:false")
    allowed_defaults = expected.get("allowed_defaults")
    if allowed_defaults is not None and not any(
        _default_matches(actual.get("default"), item)
        for item in allowed_defaults
    ):
        issues.append("default:mismatch")
    return issues


def _inspect_revision(connection, inspector, report):
    if "alembic_version" not in inspector.get_table_names():
        report["missing"].append("missing_table:alembic_version")
        report["missing"].append(f"missing_revision:{EXPECTED_REVISION}")
        return

    columns = {item["name"] for item in inspector.get_columns("alembic_version")}
    if "version_num" not in columns:
        report["conflicts"].append("column_definition:alembic_version.version_num")
        return

    rows = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    if len(rows) > 1:
        report["conflicts"].append("revision_rows:multiple")
        return

    current = str(rows[0]) if rows else None
    report["revision"]["current"] = current
    report["revision"]["ok"] = current == EXPECTED_REVISION
    if current == EXPECTED_REVISION:
        return
    if current is None or current in KNOWN_PREDECESSOR_REVISIONS:
        report["missing"].append(f"missing_revision:{EXPECTED_REVISION}")
    else:
        report["conflicts"].append(f"unexpected_revision:{current}")


def _inspect_columns(inspector, table_names, report):
    for table_name, expected_columns in EXPECTED_COLUMNS.items():
        table_state = {"present": table_name in table_names, "columns": {}}
        report["tables"][table_name] = table_state
        if table_name not in table_names:
            report["missing"].append(f"missing_table:{table_name}")
            continue

        actual_columns = {
            column["name"]: column for column in inspector.get_columns(table_name)
        }
        primary_key_columns = set(
            inspector.get_pk_constraint(table_name).get("constrained_columns") or ()
        )
        for column_name, expected in expected_columns.items():
            actual = actual_columns.get(column_name)
            if actual is None:
                marker = f"missing_column:{table_name}.{column_name}"
                if table_name == "business_review_tasks":
                    report["conflicts"].append(
                        f"column_definition:{table_name}.{column_name}"
                    )
                else:
                    report["missing"].append(marker)
                table_state["columns"][column_name] = {"present": False}
                continue

            issues = _column_issues(
                actual,
                expected,
                primary_key=column_name in primary_key_columns,
            )
            table_state["columns"][column_name] = {
                "present": True,
                "family": _type_family(actual.get("type")),
                "nullable": bool(actual.get("nullable")),
                "ok": not issues,
                "issues": issues,
            }
            if issues:
                report["conflicts"].append(
                    f"column_definition:{table_name}.{column_name}"
                )


def _inspect_indexes(inspector, table_names, report):
    for table_name, expected_indexes in EXPECTED_INDEXES.items():
        if table_name not in table_names:
            continue
        actual_indexes = {
            index.get("name"): index
            for index in inspector.get_indexes(table_name)
            if index.get("name")
        }
        table_state = report["tables"][table_name]
        table_state["indexes"] = {}
        for index_name, expected in expected_indexes.items():
            actual = actual_indexes.get(index_name)
            if actual is None:
                report["missing"].append(
                    f"missing_index:{table_name}.{index_name}"
                )
                table_state["indexes"][index_name] = {"present": False}
                continue
            columns = tuple(actual.get("column_names") or ())
            unique = bool(actual.get("unique"))
            ok = columns == expected["columns"] and unique == expected["unique"]
            table_state["indexes"][index_name] = {
                "present": True,
                "columns": list(columns),
                "unique": unique,
                "ok": ok,
            }
            if not ok:
                report["conflicts"].append(
                    f"index_definition:{table_name}.{index_name}"
                )


def _inspect_unique_constraints(inspector, table_names, report):
    for table_name, expected_constraints in EXPECTED_UNIQUE_CONSTRAINTS.items():
        if table_name not in table_names:
            continue
        actual_constraints = {
            constraint.get("name"): tuple(constraint.get("column_names") or ())
            for constraint in inspector.get_unique_constraints(table_name)
            if constraint.get("name")
        }
        table_state = report["tables"][table_name]
        table_state["unique_constraints"] = {}
        for constraint_name, expected_columns in expected_constraints.items():
            actual_columns = actual_constraints.get(constraint_name)
            if actual_columns is None:
                report["missing"].append(
                    f"missing_unique:{table_name}.{constraint_name}"
                )
                table_state["unique_constraints"][constraint_name] = {
                    "present": False,
                }
                continue
            ok = actual_columns == expected_columns
            table_state["unique_constraints"][constraint_name] = {
                "present": True,
                "columns": list(actual_columns),
                "ok": ok,
            }
            if not ok:
                report["conflicts"].append(
                    f"unique_definition:{table_name}.{constraint_name}"
                )


def audit_database():
    """Inspect DATABASE_URL without changing schema or data."""

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        report = _empty_report()
        report["missing"].append("environment:DATABASE_URL")
        return report

    report = _empty_report(_database_identity(database_url))
    engine = None
    try:
        engine = create_engine(normalize_database_url(database_url))
        with engine.connect() as connection:
            inspector = inspect(connection)
            table_names = set(inspector.get_table_names())
            report["counts"]["tables"] = len(table_names)
            report["counts"]["required_tables_present"] = len(
                table_names.intersection(EXPECTED_COLUMNS)
            )
            _inspect_revision(connection, inspector, report)
            _inspect_columns(inspector, table_names, report)
            _inspect_indexes(inspector, table_names, report)
            _inspect_unique_constraints(inspector, table_names, report)
    except Exception as exc:  # Never expose a driver error that may embed its URL.
        report["errors"].append(f"database_audit:{exc.__class__.__name__}")
    finally:
        if engine is not None:
            engine.dispose()

    report["missing"] = sorted(set(report["missing"]))
    report["conflicts"] = sorted(set(report["conflicts"]))
    report["errors"] = sorted(set(report["errors"]))
    report["ok"] = (
        report["revision"]["ok"]
        and not report["missing"]
        and not report["conflicts"]
        and not report["errors"]
    )
    return report


def report_exit_code(report):
    if report.get("ok"):
        return 0
    if report.get("conflicts") or report.get("errors"):
        return 3
    return 2


def _sensitive_fragments():
    raw_url = os.environ.get("DATABASE_URL", "")
    fragments = {raw_url} if raw_url else set()
    try:
        parsed = urlsplit(raw_url)
        for value in (parsed.username, parsed.password, parsed.hostname):
            if value:
                fragments.add(unquote(value))
        for _, value in parse_qsl(parsed.query, keep_blank_values=False):
            if value:
                fragments.add(unquote(value))
    except ValueError:
        pass
    return sorted(
        (fragment for fragment in fragments if len(fragment) >= 3),
        key=len,
        reverse=True,
    )


def _sensitive_key(key):
    normalized = str(key).strip().lower().replace("-", "_")
    return (
        normalized in _SENSITIVE_KEYS
        or normalized.endswith("_password")
        or normalized.endswith("_secret")
        or normalized.endswith("_token")
        or normalized.endswith("_url")
    )


def _sanitize_string(value, fragments):
    sanitized = _URL_PATTERN.sub("[REDACTED_URL]", value)
    for fragment in fragments:
        sanitized = sanitized.replace(fragment, "[REDACTED]")
    return sanitized


def _sanitize(value, fragments, key=None):
    if key is not None and _sensitive_key(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {
            str(item_key): _sanitize(item, fragments, item_key)
            for item_key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [_sanitize(item, fragments) for item in value]
    if isinstance(value, str):
        return _sanitize_string(value, fragments)
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return _sanitize_string(str(value), fragments)


def safe_report(report, *, pretty=False):
    sanitized = _sanitize(report, _sensitive_fragments())
    return json.dumps(
        sanitized,
        ensure_ascii=True,
        indent=2 if pretty else None,
        sort_keys=True,
    )


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only audit of the revision-08 MySQL pilot schema."
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--json", action="store_true", help="Print a JSON report.")
    modes.add_argument(
        "--require-compatible",
        action="store_true",
        help="Return zero only when revision and schema are compatible.",
    )
    args = parser.parse_args(argv)

    report = audit_database()
    print(safe_report(report, pretty=args.json))
    return report_exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
