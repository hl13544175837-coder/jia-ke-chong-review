#!/usr/bin/env python3
"""Verify demand-scope schema revision and strict cutover invariants."""

import argparse
from datetime import date, datetime
import json
from pathlib import Path
import sys

from sqlalchemy import MetaData, and_, create_engine, func, inspect, select


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database_urls import normalize_database_url

try:
    from scripts.audit_demand_scope import FACT_SPECS, fact_context
except ImportError:  # Direct execution: python backend/scripts/verify_demand_scope.py
    from audit_demand_scope import FACT_SPECS, fact_context


EXPECTED_REVISION = "20260730_13"
EXPECTED_COLUMNS = {
    "recruitment_demands": {
        "approval_status",
        "city",
        "department",
        "job_title_snapshot",
        "jd_text_snapshot",
        "created_by",
        "closed_at",
        "closed_by",
        "default_interviewer_id",
        "request_no",
        "review_reason",
        "reviewed_at",
        "reviewed_by",
        "submitted_at",
    },
    "candidates": {"current_demand_id", "resume_sha256"},
    "pipeline_stages": {"demand_id"},
    "interviews": {"demand_id"},
    "interview_assignments": {
        "demand_id",
        "round_sequence",
        "is_primary",
        "primary_slot",
    },
    "interview_reschedule_requests": {
        "org_id",
        "assignment_id",
        "replacement_assignment_id",
        "candidate_id",
        "job_id",
        "demand_id",
        "round",
        "round_sequence",
        "source",
        "status",
        "requested_by",
        "requested_at",
        "reason",
        "proposed_times",
        "original_interviewer_id",
        "original_scheduled_at",
        "original_location",
        "final_interviewer_id",
        "final_scheduled_at",
        "final_location",
        "processed_by",
        "processed_at",
        "processor_note",
        "created_at",
        "updated_at",
    },
    "interview_feedback": {
        "demand_id",
        "assignment_id",
        "updated_at",
        "updated_by",
    },
    "business_review_tasks": {
        "id",
        "org_id",
        "demand_id",
        "candidate_id",
        "reviewer_id",
        "status",
        "pending_slot",
        "hr_note",
        "business_note",
        "due_at",
        "created_by",
        "decided_by",
        "decided_at",
        "created_at",
        "updated_at",
    },
    "offer_records": {
        "demand_id",
        "approver_id",
        "submitted_at",
        "approved_at",
        "sent_at",
        "responded_at",
        "withdrawn_at",
        "expires_at",
        "onboarded_at",
        "rejection_reason",
        "candidate_reply",
        "salary_breakdown",
        "version",
    },
    "conversations": {"org_id", "title_source", "archived"},
    "conversation_messages": {"org_id"},
    "agent_call_logs": {
        "id",
        "org_id",
        "conversation_id",
        "message_id",
        "user_id",
        "role",
        "kind",
        "model",
        "prompt_tokens",
        "completion_tokens",
        "duration_ms",
        "status",
        "error_msg",
        "tool_calls",
        "thoughts",
        "input_text",
        "output_text",
        "created_at",
    },
    "offer_events": {
        "org_id",
        "offer_id",
        "action",
        "from_status",
        "to_status",
        "actor_id",
        "comment",
        "detail",
        "created_at",
    },
    "kpi_standards": {
        "org_id",
        "config_json",
        "version",
        "updated_by",
        "created_at",
        "updated_at",
    },
    "candidate_dispositions": {"demand_id"},
    "events": {"demand_id"},
    "notifications": {"demand_id"},
    "upload_batches": {"demand_id"},
    "organization_settings": {
        "org_id",
        "config_json",
        "version",
        "updated_by",
        "created_at",
        "updated_at",
    },
    "users": {"department"},
}
EXPECTED_UNIQUE_INDEXES = {
    "recruitment_demands": {
        "uq_recruitment_demands_org_request_no": (
            "org_id",
            "request_no",
        ),
    },
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
    "kpi_standards": {
        "ix_kpi_standards_org_id": ("org_id",),
    },
    "offer_records": {
        "uq_offer_records_org_demand_candidate": (
            "org_id",
            "demand_id",
            "candidate_id",
        ),
    },
    "business_review_tasks": {
        "uq_business_reviews_pending_slot": (
            "org_id",
            "demand_id",
            "candidate_id",
            "pending_slot",
        ),
    },
    "organization_settings": {
        "uq_organization_settings_org": ("org_id",),
    },
}
EXPECTED_INDEXES = {
    "candidates": {
        "ix_candidates_org_resume_sha256": (
            "org_id",
            "resume_sha256",
        ),
    },
    "recruitment_demands": {
        "ix_recruitment_demands_org_default_interviewer": (
            "org_id",
            "default_interviewer_id",
        ),
    },
    "offer_events": {
        "ix_offer_events_org_offer_created": (
            "org_id",
            "offer_id",
            "created_at",
        ),
    },
    "conversations": {
        "ix_conversations_org_user_archived_updated": (
            "org_id",
            "user_id",
            "archived",
            "updated_at",
        ),
    },
    "conversation_messages": {
        "ix_conversation_messages_org_conversation": (
            "org_id",
            "conversation_id",
        ),
    },
    "agent_call_logs": {
        "ix_agent_call_logs_org_created": ("org_id", "created_at"),
        "ix_agent_call_logs_org_conversation_created": (
            "org_id",
            "conversation_id",
            "created_at",
        ),
        "ix_agent_call_logs_org_user_created": (
            "org_id",
            "user_id",
            "created_at",
        ),
    },
    "business_review_tasks": {
        "ix_business_reviews_org_reviewer_status": (
            "org_id",
            "reviewer_id",
            "status",
        ),
        "ix_business_reviews_org_demand_candidate": (
            "org_id",
            "demand_id",
            "candidate_id",
        ),
    },
    "organization_settings": {
        "ix_organization_settings_org_id": ("org_id",),
    },
}
EXPECTED_NOT_NULL_COLUMNS = {
    "recruitment_demands": {"approval_status", "request_no"},
    "interview_feedback": {"updated_at"},
    "business_review_tasks": {
        "id",
        "org_id",
        "demand_id",
        "candidate_id",
        "reviewer_id",
        "status",
        "created_by",
        "created_at",
        "updated_at",
    },
    "organization_settings": {"org_id", "config_json", "version", "updated_by", "created_at", "updated_at"},
    "users": {"department"},
}
EXPECTED_FOREIGN_KEYS = {
    "recruitment_demands": {
        "fk_recruitment_demands_default_interviewer_id_users": {
            "constrained_columns": ("default_interviewer_id",),
            "referred_table": "users",
            "referred_columns": ("id",),
            "ondelete": "SET NULL",
        },
    },
}
DEFAULT_INTERVIEWER_ROLES = {"interviewer", "manager", "admin"}


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
    engine = create_engine(normalize_database_url(database_url))
    metadata = MetaData()
    metadata.reflect(bind=engine)
    schema_errors = []
    unmapped_by_table = {}
    mismatches = []
    demand_mismatches = []
    flow_mismatches = []
    active_flow_conflicts = []
    pointer_mismatches = []
    assignment_slot_conflicts = []
    request_no_issues = []
    default_interviewer_mismatches = []
    default_interviewer_warnings = []

    with engine.connect() as connection:
        inspector = inspect(connection)
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
            actual_indexes = {
                index.get("name"): index
                for index in inspector.get_indexes(table_name)
                if index.get("name")
            }
            actual_unique_constraints = {
                constraint.get("name"): constraint
                for constraint in inspector.get_unique_constraints(table_name)
                if constraint.get("name")
            }
            for index_name, expected_columns in expected_indexes.items():
                constraint = actual_unique_constraints.get(index_name)
                if constraint is not None:
                    actual_columns = tuple(constraint.get("column_names") or ())
                    if actual_columns != expected_columns:
                        schema_errors.append(
                            f"index_columns_mismatch:{table_name}.{index_name}"
                        )
                    continue

                index = actual_indexes.get(index_name)
                if index is None:
                    schema_errors.append(
                        f"missing_unique_index:{table_name}.{index_name}"
                    )
                    continue
                if not index.get("unique"):
                    schema_errors.append(
                        f"non_unique_index:{table_name}.{index_name}"
                    )
                actual_columns = tuple(index.get("column_names") or ())
                if actual_columns != expected_columns:
                    schema_errors.append(
                        f"index_columns_mismatch:{table_name}.{index_name}"
                    )
        for table_name, expected_indexes in EXPECTED_INDEXES.items():
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            actual_indexes = {
                index.get("name"): index
                for index in inspector.get_indexes(table_name)
                if index.get("name")
            }
            for index_name, expected_columns in expected_indexes.items():
                index = actual_indexes.get(index_name)
                if index is None:
                    schema_errors.append(
                        f"missing_index:{table_name}.{index_name}"
                    )
                    continue
                if index.get("unique"):
                    schema_errors.append(
                        f"unexpected_unique_index:{table_name}.{index_name}"
                    )
                actual_columns = tuple(index.get("column_names") or ())
                if actual_columns != expected_columns:
                    schema_errors.append(
                        f"index_columns_mismatch:{table_name}.{index_name}"
                    )
        for table_name, expected_columns in EXPECTED_NOT_NULL_COLUMNS.items():
            table = metadata.tables.get(table_name)
            if table is None:
                continue
            for column_name in expected_columns:
                column = table.c.get(column_name)
                if column is not None and column.nullable:
                    schema_errors.append(
                        f"nullable_column:{table_name}.{column_name}"
                    )
        for table_name, expected_foreign_keys in EXPECTED_FOREIGN_KEYS.items():
            if table_name not in metadata.tables:
                continue
            actual_foreign_keys = {
                foreign_key.get("name"): foreign_key
                for foreign_key in inspector.get_foreign_keys(table_name)
                if foreign_key.get("name")
            }
            for foreign_key_name, expected in expected_foreign_keys.items():
                foreign_key = actual_foreign_keys.get(foreign_key_name)
                if foreign_key is None:
                    schema_errors.append(
                        f"missing_foreign_key:{table_name}.{foreign_key_name}"
                    )
                    continue
                actual_columns = tuple(
                    foreign_key.get("constrained_columns") or ()
                )
                actual_referred_columns = tuple(
                    foreign_key.get("referred_columns") or ()
                )
                actual_ondelete = str(
                    (foreign_key.get("options") or {}).get("ondelete") or ""
                ).upper()
                if actual_columns != expected["constrained_columns"]:
                    schema_errors.append(
                        f"foreign_key_columns_mismatch:"
                        f"{table_name}.{foreign_key_name}"
                    )
                if foreign_key.get("referred_table") != expected["referred_table"]:
                    schema_errors.append(
                        f"foreign_key_table_mismatch:"
                        f"{table_name}.{foreign_key_name}"
                    )
                if actual_referred_columns != expected["referred_columns"]:
                    schema_errors.append(
                        f"foreign_key_referred_columns_mismatch:"
                        f"{table_name}.{foreign_key_name}"
                    )
                if actual_ondelete != expected["ondelete"]:
                    schema_errors.append(
                        f"foreign_key_ondelete_mismatch:"
                        f"{table_name}.{foreign_key_name}"
                    )
        if "candidate_demand_flows" not in metadata.tables:
            schema_errors.append("missing_table:candidate_demand_flows")

        assignment_table = metadata.tables.get("interview_assignments")
        assignment_slot_columns = {
            "id",
            "demand_id",
            "round_sequence",
            "is_primary",
            "status",
            "primary_slot",
        }
        if assignment_table is not None and assignment_slot_columns.issubset(
            assignment_table.c.keys()
        ):
            for row in connection.execute(
                select(*(assignment_table.c[name] for name in assignment_slot_columns))
            ).mappings():
                status = str(row["status"] or "scheduled").strip().lower()
                active_primary = (
                    row["demand_id"] is not None
                    and bool(row["is_primary"])
                    and status not in {"cancelled", "canceled"}
                )
                expected_slot = row["round_sequence"] if active_primary else None
                if row["primary_slot"] != expected_slot:
                    assignment_slot_conflicts.append({
                        "assignment_id": row["id"],
                        "status": row["status"],
                        "is_primary": bool(row["is_primary"]),
                        "round_sequence": row["round_sequence"],
                        "primary_slot": row["primary_slot"],
                        "expected_primary_slot": expected_slot,
                    })

        demand_table = metadata.tables.get("recruitment_demands")
        candidate_table = metadata.tables.get("candidates")
        job_table = metadata.tables.get("jobs")
        user_table = metadata.tables.get("users")
        demands = {}
        candidates = {}
        jobs = {}
        users = {}
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
        if user_table is None:
            schema_errors.append("missing_table:users")
        else:
            users = {
                row["id"]: dict(row)
                for row in connection.execute(select(user_table)).mappings()
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

            raw_request_no = demand.get("request_no")
            normalized_request_no = str(raw_request_no or "").strip().upper()[:80]
            request_no_issue = None
            if raw_request_no is None:
                request_no_issue = "null"
            elif not normalized_request_no:
                request_no_issue = "blank"
            elif raw_request_no != normalized_request_no:
                request_no_issue = "not_normalized"
            if request_no_issue:
                request_no_issues.append(
                    {
                        "demand_id": demand["id"],
                        "request_no": raw_request_no,
                        "issue": request_no_issue,
                    }
                )

            default_interviewer_id = demand.get("default_interviewer_id")
            if default_interviewer_id is not None:
                default_interviewer = users.get(default_interviewer_id)
                default_issues = []
                if default_interviewer is None:
                    default_issues.append("orphan_user")
                elif default_interviewer.get("org_id") != demand.get("org_id"):
                    default_issues.append("org_mismatch")
                if default_issues:
                    default_interviewer_mismatches.append(
                        {
                            "demand_id": demand["id"],
                            "default_interviewer_id": default_interviewer_id,
                            "issues": default_issues,
                        }
                    )
                elif default_interviewer is not None:
                    warnings = []
                    if (
                        "is_active" in default_interviewer
                        and not bool(default_interviewer.get("is_active"))
                    ):
                        warnings.append("inactive")
                    if (
                        default_interviewer.get("role")
                        and default_interviewer.get("role")
                        not in DEFAULT_INTERVIEWER_ROLES
                    ):
                        warnings.append("ineligible_role")
                    if warnings:
                        default_interviewer_warnings.append(
                            {
                                "demand_id": demand["id"],
                                "default_interviewer_id": default_interviewer_id,
                                "warnings": warnings,
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
        and not assignment_slot_conflicts
        and not request_no_issues
        and not default_interviewer_mismatches
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
        "assignment_slot_conflicts": assignment_slot_conflicts,
        "request_no_issues": request_no_issues,
        "default_interviewer_mismatches": default_interviewer_mismatches,
        "default_interviewer_warnings": default_interviewer_warnings,
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
