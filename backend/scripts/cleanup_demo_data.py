#!/usr/bin/env python3
"""Remove demo-owned data after creating a standard restorable snapshot.

Dry-run is the default. The confirmed path freezes matching primary keys in a
transaction, backs up the database and configured uploads directory, deletes
Demand-scoped rows in dependency order, then removes only files referenced by
the demo candidates selected in that same plan.
"""

import argparse
import json
import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import MetaData, and_, create_engine, delete, inspect, or_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import SQLAlchemyError


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
SCRIPTS = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from runtime_paths import (
    RuntimePathError,
    requires_persistent_uploads,
    resolve_upload_folder,
)
from database_urls import normalize_database_url

try:
    from scripts import backup_pilot_data
except ModuleNotFoundError:  # Direct execution adds backend/scripts to sys.path.
    import backup_pilot_data


@dataclass(frozen=True)
class CleanupPlan:
    deletions: tuple
    upload_paths: tuple
    protected_upload_paths: tuple


@contextmanager
def _safe_transaction(engine, database_label):
    try:
        with engine.begin() as connection:
            yield connection
    except SQLAlchemyError as exc:
        raise SystemExit(
            f"Demo cleanup database operation failed for {database_label} "
            f"({type(exc).__name__})"
        ) from None


def _database_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return normalize_database_url(url)
    return "sqlite:///" + str(ROOT / "backend" / "hireinsight.db")


def _load_tables(engine):
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata.tables


def _ids(connection, table, *conditions):
    if table is None or "id" not in table.c:
        return set()
    conditions = [condition for condition in conditions if condition is not None]
    if not conditions:
        return set()
    query = select(table.c.id).where(or_(*conditions)).with_for_update()
    return {row[0] for row in connection.execute(query)}


def _in(table, column, values):
    if table is None or column not in table.c or not values:
        return None
    return table.c[column].in_(tuple(values))


def _eq(table, column, value):
    if table is None or column not in table.c:
        return None
    return table.c[column] == value


def _or(*conditions):
    conditions = [condition for condition in conditions if condition is not None]
    return or_(*conditions) if conditions else None


def _like(table, column, pattern):
    if table is None or column not in table.c:
        return None
    return table.c[column].like(pattern)


def _and(*conditions):
    if any(condition is None for condition in conditions):
        return None
    return and_(*conditions)


def _classify_business_rows(
    connection,
    table,
    reference_scopes,
    demo_user_ids,
    actor_columns=(),
):
    """Split demo-context rows from mixed/actor-only real business rows.

    A row is removable only when it references at least one demo-owned business
    entity and every populated business reference is demo-owned.  A demo actor
    does not make an otherwise real row demo data.  That distinction is what
    keeps cleanup from deleting real history merely because a demo account
    created, updated, or interviewed it.
    """
    if table is None or "id" not in table.c:
        return set(), set()
    references = [
        (column, set(scope_ids))
        for column, scope_ids in reference_scopes
        if column in table.c
    ]
    actors = [column for column in actor_columns if column in table.c]
    candidate_conditions = []
    for column, scope_ids in references:
        condition = _in(table, column, scope_ids)
        if condition is not None:
            candidate_conditions.append(condition)
    for column in actors:
        condition = _in(table, column, demo_user_ids)
        if condition is not None:
            candidate_conditions.append(condition)
    if not candidate_conditions:
        return set(), set()

    selected_columns = [table.c.id]
    selected_columns.extend(table.c[column] for column, _scope in references)
    selected_columns.extend(table.c[column] for column in actors)
    rows = connection.execute(
        select(*selected_columns).where(or_(*candidate_conditions)).with_for_update()
    ).mappings()
    removable = set()
    blockers = set()
    for row in rows:
        populated_refs = [
            (row[column], scope_ids)
            for column, scope_ids in references
            if row[column] is not None
        ]
        has_demo_reference = any(value in scope for value, scope in populated_refs)
        has_real_reference = any(value not in scope for value, scope in populated_refs)
        has_demo_actor = any(row[column] in demo_user_ids for column in actors)
        if has_demo_reference and not has_real_reference:
            removable.add(row["id"])
        elif has_demo_reference or has_demo_actor:
            blockers.add(row["id"])
    return removable, blockers


def _classify_target_rows(
    connection,
    table,
    demo_user_ids,
    target_type_column,
    target_id_column,
    target_scopes,
    *,
    actor_column="actor_id",
    demand_column=None,
    demo_demand_ids=(),
    payload_column=None,
):
    """Classify audit/event rows while allowing targetless demo-user activity."""
    if table is None or "id" not in table.c:
        return set(), set()
    has_actor = actor_column in table.c
    has_target = target_type_column in table.c and target_id_column in table.c
    has_demand = bool(demand_column and demand_column in table.c)
    has_payload = bool(payload_column and payload_column in table.c)
    candidate_conditions = []
    if has_actor:
        actor_condition = _in(table, actor_column, demo_user_ids)
        if actor_condition is not None:
            candidate_conditions.append(actor_condition)
    if has_demand:
        demand_condition = _in(table, demand_column, demo_demand_ids)
        if demand_condition is not None:
            candidate_conditions.append(demand_condition)
    if has_target:
        for target_type, scope_ids in target_scopes.items():
            target_condition = _and(
                _eq(table, target_type_column, target_type),
                _in(table, target_id_column, scope_ids),
            )
            if target_condition is not None:
                candidate_conditions.append(target_condition)
        if has_payload:
            candidate_conditions.append(
                table.c[target_type_column] == "agent_tool"
            )
    if not candidate_conditions:
        return set(), set()

    columns = [table.c.id]
    selected_names = {"id"}
    for column in (
        actor_column,
        demand_column,
        target_type_column,
        target_id_column,
        payload_column,
    ):
        if column and column in table.c and column not in selected_names:
            columns.append(table.c[column])
            selected_names.add(column)
    rows = connection.execute(
        select(*columns).where(or_(*candidate_conditions)).with_for_update()
    ).mappings()
    removable = set()
    blockers = set()
    demo_demands = set(demo_demand_ids)
    for row in rows:
        actor_demo = has_actor and row[actor_column] in demo_user_ids
        targets = []
        if has_demand and row[demand_column] is not None:
            targets.append(row[demand_column] in demo_demands)
        is_agent_tool = (
            has_target
            and has_payload
            and row[target_type_column] == "agent_tool"
        )
        if is_agent_tool:
            payload = row[payload_column]
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    payload = None
            target_ids = payload.get("target_ids") if isinstance(payload, dict) else None
            target_key_scopes = {
                "candidate_id": "candidate",
                "demand_id": "demand",
                "job_id": "job",
                "interview_id": "interview",
                "feedback_id": "interview_feedback",
                "user_id": "user",
                "owner_id": "user",
            }
            recognized_target = False
            normalized_target_values = []
            if isinstance(target_ids, dict):
                for key, value in target_ids.items():
                    if value is None or key == "org_id":
                        continue
                    scope_name = target_key_scopes.get(key)
                    scope = target_scopes.get(scope_name) if scope_name else None
                    try:
                        normalized_value = int(value)
                    except (TypeError, ValueError):
                        normalized_value = value
                    normalized_target_values.append(normalized_value)
                    try:
                        target_is_demo = scope is not None and normalized_value in scope
                    except TypeError:
                        target_is_demo = False
                    targets.append(target_is_demo)
                    recognized_target = True
            if row[target_id_column] is not None:
                try:
                    normalized_entity_id = int(row[target_id_column])
                except (TypeError, ValueError):
                    normalized_entity_id = row[target_id_column]
                if (
                    not recognized_target
                    or normalized_entity_id not in normalized_target_values
                ):
                    # A typed payload that disagrees with entity_id is corrupt
                    # mixed context, not permission to guess which one wins.
                    targets.append(False)
        elif has_target and row[target_id_column] is not None:
            scope = target_scopes.get(row[target_type_column])
            targets.append(scope is not None and row[target_id_column] in scope)
        has_demo_target = any(targets)
        has_real_target = any(not target for target in targets)
        if has_demo_target and not has_real_target:
            removable.add(row["id"])
        elif actor_demo and not targets:
            removable.add(row["id"])
        elif has_demo_target or actor_demo:
            blockers.add(row["id"])
    return removable, blockers


def _raise_mixed_scope(blockers, *, flow=False):
    blockers = {name: sorted(ids) for name, ids in blockers.items() if ids}
    if not blockers:
        return
    details = "; ".join(f"{name}={ids}" for name, ids in sorted(blockers.items()))
    flow_note = " selected demo flows or" if flow else ""
    raise SystemExit(
        "Demo cleanup is blocked by mixed demo/real ownership;"
        f"{flow_note} actor-only business rows require manual reassignment: {details}"
    )


def _candidate_upload_paths(connection, candidates, candidate_ids):
    if candidates is None or "raw_file_path" not in candidates.c or not candidate_ids:
        return set(), set()
    query = (
        select(candidates.c.id, candidates.c.raw_file_path)
        .where(candidates.c.raw_file_path.is_not(None))
        .with_for_update()
    )
    rows = connection.execute(query).fetchall()
    demo_paths = {row[1] for row in rows if row[0] in candidate_ids and row[1]}
    protected_paths = {row[1] for row in rows if row[0] not in candidate_ids and row[1]}
    return demo_paths, protected_paths


def _collect_plan(connection, tables, demo_domain):
    users = tables.get("users")
    jobs = tables.get("jobs")
    demands = tables.get("recruitment_demands")
    candidates = tables.get("candidates")
    flows = tables.get("candidate_demand_flows")
    upload_batches = tables.get("upload_batches")
    assignments = tables.get("interview_assignments")
    talent_maps = tables.get("talent_maps")
    talent_map_companies = tables.get("talent_map_companies")
    conversations = tables.get("conversations")

    demo_user_ids = _ids(connection, users, _like(users, "email", f"%{demo_domain}"))
    demo_job_ids = _ids(connection, jobs, _in(jobs, "owner_hr_id", demo_user_ids))
    demo_demand_ids = _ids(
        connection,
        demands,
        _in(demands, "owner_hr_id", demo_user_ids),
    )
    mixed_demand_ids = _ids(
        connection,
        demands,
        _in(demands, "created_by", demo_user_ids),
        _in(demands, "closed_by", demo_user_ids),
        _in(demands, "job_id", demo_job_ids),
    ) - demo_demand_ids
    _raise_mixed_scope({"recruitment_demands": mixed_demand_ids})

    demo_upload_batch_ids = _ids(
        connection,
        upload_batches,
        _in(upload_batches, "owner_hr_id", demo_user_ids),
    )
    demo_candidate_ids = _ids(
        connection,
        candidates,
        _in(candidates, "owner_hr_id", demo_user_ids),
    )
    candidates_linked_to_demo_demands = _ids(
        connection,
        candidates,
        _in(candidates, "current_demand_id", demo_demand_ids),
        _in(candidates, "upload_batch_id", demo_upload_batch_ids),
    )
    surviving_candidate_blockers = candidates_linked_to_demo_demands - demo_candidate_ids
    candidate_actor_blockers = _ids(
        connection,
        candidates,
        _in(candidates, "deleted_by", demo_user_ids),
    ) - demo_candidate_ids
    batches_linked_to_demo_context = _ids(
        connection,
        upload_batches,
        _in(upload_batches, "target_job_id", demo_job_ids),
        _in(upload_batches, "demand_id", demo_demand_ids),
    )
    surviving_batch_blockers = batches_linked_to_demo_context - demo_upload_batch_ids
    if surviving_candidate_blockers or surviving_batch_blockers:
        blockers = []
        if surviving_candidate_blockers:
            blockers.append(
                f"surviving candidates={sorted(surviving_candidate_blockers)}"
            )
        if surviving_batch_blockers:
            blockers.append(
                f"surviving upload batches={sorted(surviving_batch_blockers)}"
            )
        raise SystemExit(
            "Demo cleanup is blocked because real-owned rows still reference demo context: "
            + "; ".join(blockers)
        )
    _raise_mixed_scope({"candidates": candidate_actor_blockers})

    demo_flow_ids, flow_blockers = _classify_business_rows(
        connection,
        flows,
        (
            ("candidate_id", demo_candidate_ids),
            ("demand_id", demo_demand_ids),
            ("transfer_from_demand_id", demo_demand_ids),
        ),
        demo_user_ids,
        actor_columns=("owner_hr_id",),
    )
    _raise_mixed_scope({"candidate_demand_flows": flow_blockers}, flow=True)

    demo_talent_map_ids = _ids(
        connection,
        talent_maps,
        _in(talent_maps, "owner_hr_id", demo_user_ids),
    )
    mixed_talent_map_ids = _ids(
        connection,
        talent_maps,
        _in(talent_maps, "job_id", demo_job_ids),
    ) - demo_talent_map_ids
    demo_talent_company_ids = _ids(
        connection,
        talent_map_companies,
        _in(talent_map_companies, "map_id", demo_talent_map_ids),
    )
    demo_talent_person_ids, mixed_talent_person_ids = _classify_business_rows(
        connection,
        tables.get("talent_map_people"),
        (
            ("map_id", demo_talent_map_ids),
            ("company_id", demo_talent_company_ids),
        ),
        demo_user_ids,
    )
    demo_conversation_ids = _ids(
        connection,
        conversations,
        _in(conversations, "user_id", demo_user_ids),
    )
    demo_idempotency_record_ids = _ids(
        connection,
        tables.get("idempotency_records"),
        _in(
            tables.get("idempotency_records"),
            "actor_scope",
            {f"user:{user_id}" for user_id in demo_user_ids},
        ),
    )
    demo_boss_account_ids = _ids(
        connection,
        tables.get("boss_accounts"),
        _in(tables.get("boss_accounts"), "owner_hr_id", demo_user_ids),
    )

    business_blockers = {
        "talent_maps": mixed_talent_map_ids,
        "talent_map_people": mixed_talent_person_ids,
    }

    def classify(table_name, references, actor_columns=()):
        selected, blockers = _classify_business_rows(
            connection,
            tables.get(table_name),
            references,
            demo_user_ids,
            actor_columns=actor_columns,
        )
        business_blockers[table_name] = blockers
        return selected

    demo_assignment_ids = classify(
        "interview_assignments",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
        actor_columns=("interviewer_id", "created_by"),
    )
    demo_feedback_ids = classify(
        "interview_feedback",
        (
            ("assignment_id", demo_assignment_ids),
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
        actor_columns=("interviewer_id",),
    )
    demo_offer_ids = classify(
        "offer_records",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
        actor_columns=("created_by",),
    )
    demo_disposition_ids = classify(
        "candidate_dispositions",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
        actor_columns=("created_by",),
    )
    demo_pipeline_stage_ids = classify(
        "pipeline_stages",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
        actor_columns=("updated_by",),
    )
    demo_interview_ids = classify(
        "interviews",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
            ("demand_id", demo_demand_ids),
        ),
    )
    demo_match_ids = classify(
        "matches",
        (
            ("candidate_id", demo_candidate_ids),
            ("job_id", demo_job_ids),
        ),
    )

    event_target_scopes = {
        "user": demo_user_ids,
        "candidate": demo_candidate_ids,
        "job": demo_job_ids,
        "demand": demo_demand_ids,
        "recruitment_demand": demo_demand_ids,
        "upload_batch": demo_upload_batch_ids,
        "interview_assignment": demo_assignment_ids,
        "interview_feedback": demo_feedback_ids,
        "offer_record": demo_offer_ids,
        "candidate_disposition": demo_disposition_ids,
        "pipeline_stage": demo_pipeline_stage_ids,
        "interview": demo_interview_ids,
        "match": demo_match_ids,
        "talent_map": demo_talent_map_ids,
        "talent_map_company": demo_talent_company_ids,
        "talent_map_person": demo_talent_person_ids,
        "conversation": demo_conversation_ids,
        "boss_account": demo_boss_account_ids,
    }
    demo_event_ids, event_blockers = _classify_target_rows(
        connection,
        tables.get("events"),
        demo_user_ids,
        "entity_type",
        "entity_id",
        event_target_scopes,
        demand_column="demand_id",
        demo_demand_ids=demo_demand_ids,
        payload_column="payload",
    )
    business_blockers["events"] = event_blockers

    audit_target_scopes = {
        "users": demo_user_ids,
        "candidates": demo_candidate_ids,
        "jobs": demo_job_ids,
        "recruitment_demands": demo_demand_ids,
        "upload_batches": demo_upload_batch_ids,
        "interview_assignments": demo_assignment_ids,
        "interview_feedback": demo_feedback_ids,
        "offer_records": demo_offer_ids,
        "candidate_dispositions": demo_disposition_ids,
        "pipeline_stages": demo_pipeline_stage_ids,
        "interviews": demo_interview_ids,
        "matches": demo_match_ids,
        "talent_maps": demo_talent_map_ids,
        "talent_map_companies": demo_talent_company_ids,
        "talent_map_people": demo_talent_person_ids,
        "conversations": demo_conversation_ids,
        "boss_accounts": demo_boss_account_ids,
    }
    demo_audit_log_ids, audit_blockers = _classify_target_rows(
        connection,
        tables.get("audit_logs"),
        demo_user_ids,
        "target_table",
        "target_id",
        audit_target_scopes,
    )
    business_blockers["audit_logs"] = audit_blockers
    _raise_mixed_scope(business_blockers)

    conditions = {
        "idempotency_records": _in(
            tables.get("idempotency_records"),
            "id",
            demo_idempotency_record_ids,
        ),
        "conversation_messages": _in(
            tables.get("conversation_messages"), "conversation_id", demo_conversation_ids
        ),
        "conversations": _in(conversations, "id", demo_conversation_ids),
        "interview_feedback": _in(
            tables.get("interview_feedback"), "id", demo_feedback_ids
        ),
        "interview_assignments": _in(assignments, "id", demo_assignment_ids),
        "offer_records": _in(tables.get("offer_records"), "id", demo_offer_ids),
        "candidate_dispositions": _in(
            tables.get("candidate_dispositions"), "id", demo_disposition_ids
        ),
        "pipeline_stages": _in(
            tables.get("pipeline_stages"), "id", demo_pipeline_stage_ids
        ),
        "interviews": _in(tables.get("interviews"), "id", demo_interview_ids),
        "matches": _in(tables.get("matches"), "id", demo_match_ids),
        "candidate_tags": _in(tables.get("candidate_tags"), "candidate_id", demo_candidate_ids),
        "notifications": _or(
            _in(tables.get("notifications"), "user_id", demo_user_ids),
            _in(tables.get("notifications"), "demand_id", demo_demand_ids),
        ),
        "events": _in(tables.get("events"), "id", demo_event_ids),
        "audit_logs": _in(tables.get("audit_logs"), "id", demo_audit_log_ids),
        "talent_map_people": _in(
            tables.get("talent_map_people"), "id", demo_talent_person_ids
        ),
        "talent_map_companies": _in(
            tables.get("talent_map_companies"), "map_id", demo_talent_map_ids
        ),
        "talent_maps": _in(talent_maps, "id", demo_talent_map_ids),
        "boss_accounts": _in(
            tables.get("boss_accounts"), "id", demo_boss_account_ids
        ),
        "candidate_demand_flows": _in(flows, "id", demo_flow_ids),
        "recruitment_demands": _in(demands, "id", demo_demand_ids),
        "candidates": _in(candidates, "id", demo_candidate_ids),
        "upload_batches": _in(upload_batches, "id", demo_upload_batch_ids),
        "jobs": _in(jobs, "id", demo_job_ids),
        "users": _in(users, "id", demo_user_ids),
    }

    delete_order = (
        "idempotency_records",
        "conversation_messages",
        "conversations",
        "interview_feedback",
        "interview_assignments",
        "offer_records",
        "candidate_dispositions",
        "pipeline_stages",
        "interviews",
        "matches",
        "candidate_tags",
        "notifications",
        "events",
        "audit_logs",
        "talent_map_people",
        "talent_map_companies",
        "talent_maps",
        "boss_accounts",
        "candidate_demand_flows",
        "candidates",
        "upload_batches",
        "recruitment_demands",
        "jobs",
        "users",
    )
    deletions = tuple(
        (name, conditions[name]) for name in delete_order if conditions.get(name) is not None
    )
    upload_paths, protected_upload_paths = _candidate_upload_paths(
        connection,
        candidates,
        demo_candidate_ids,
    )
    return CleanupPlan(
        deletions=deletions,
        upload_paths=tuple(sorted(upload_paths)),
        protected_upload_paths=tuple(sorted(protected_upload_paths)),
    )


def _configured_upload_folder(project_root):
    try:
        lexical = resolve_upload_folder(
            os.environ.get("UPLOAD_FOLDER"),
            project_root=project_root,
            require_persistent=requires_persistent_uploads(
                os.environ.get("FLASK_DEBUG")
            ),
        )
    except RuntimePathError as exc:
        raise SystemExit(str(exc)) from None
    if lexical.is_symlink():
        raise SystemExit(f"拒绝将符号链接作为 UPLOAD_FOLDER: {lexical}")
    resolved = lexical.resolve()
    if resolved == Path(resolved.anchor) or resolved == project_root or resolved in project_root.parents:
        raise SystemExit(f"拒绝不安全的 UPLOAD_FOLDER: {resolved}")
    return lexical


def _upload_reference_candidates(raw_path, project_root, upload_folder):
    """Resolve portable and legacy project-relative upload references safely."""

    stored = Path(raw_path).expanduser()
    lexicals = (
        [stored]
        if stored.is_absolute()
        else [upload_folder / stored, project_root / stored]
    )
    entries = []
    seen = set()
    for lexical in lexicals:
        resolved = lexical.resolve(strict=False)
        if resolved != upload_folder and upload_folder not in resolved.parents:
            continue
        key = (lexical.absolute(), resolved)
        if key not in seen:
            entries.append((lexical, resolved, lexical.is_symlink()))
            seen.add(key)

    existing = []
    identities = set()
    for entry in entries:
        try:
            stat = entry[1].stat()
        except OSError:
            continue
        identity = (stat.st_dev, stat.st_ino)
        existing.append((entry, identity))
        identities.add(identity)
    if len(identities) > 1:
        raise SystemExit(
            f"拒绝歧义的候选人附件路径（同时命中多个文件）: {raw_path}"
        )
    if existing:
        selected_identity = existing[0][1]
        return tuple(entry for entry, identity in existing if identity == selected_identity)
    return tuple(entries)


def _resolve_demo_uploads(raw_paths, protected_raw_paths, project_root, upload_folder):
    selected = []
    upload_folder = upload_folder.resolve()
    protected = set()
    protected_identities = set()
    for raw_path in protected_raw_paths:
        for _lexical, resolved, _is_symlink in _upload_reference_candidates(
            raw_path, project_root, upload_folder
        ):
            protected.add(resolved)
            try:
                stat = resolved.stat()
            except OSError:
                continue
            protected_identities.add((stat.st_dev, stat.st_ino))
    for raw_path in raw_paths:
        candidates = _upload_reference_candidates(
            raw_path, project_root, upload_folder
        )
        if not candidates:
            print(f"skip demo upload outside configured folder: {raw_path}")
            continue
        for lexical, resolved, is_symlink in candidates:
            if is_symlink:
                print(f"skip unsafe demo upload symlink: {lexical}")
                continue
            try:
                stat = resolved.stat()
                identity = (stat.st_dev, stat.st_ino)
            except OSError:
                identity = None
            if resolved in protected or identity in protected_identities:
                print(f"preserve upload still referenced by non-demo candidate: {resolved}")
                continue
            if resolved.is_file() and not resolved.is_symlink():
                selected.append(resolved)
    return tuple(sorted(set(selected)))


def _validate_cleanup_paths(project_root, database_url, upload_folder):
    backup_root = Path(os.environ.get("BACKUP_DIR", str(ROOT / "backups"))).expanduser().resolve()
    backup_pilot_data._validate_backup_paths(database_url, backup_root, upload_folder)
    resolved_uploads = upload_folder.resolve()
    if resolved_uploads == project_root or resolved_uploads in project_root.parents:
        raise SystemExit(f"Refusing unsafe cleanup path: uploads={resolved_uploads}")


def _upload_inventory(project_root):
    inventory = []
    for label, path in (
        ("backend/uploads files", project_root / "backend" / "uploads"),
        ("uploads files", project_root / "uploads"),
    ):
        count = 0
        if path.exists():
            count = sum(1 for item in path.rglob("*") if item.is_file() or item.is_symlink())
        inventory.append((label, count))
    return inventory


def _run_backup(database_url, upload_folder):
    backup_root = Path(os.environ.get("BACKUP_DIR", str(ROOT / "backups"))).expanduser().resolve()
    target_dir = backup_pilot_data.create_backup_snapshot(
        database_url,
        upload_folder,
        backup_root,
        label="cleanup-demo-data",
        metadata={"purpose": "pre_cleanup_demo_data"},
    )
    print(f"backup complete: {target_dir}")
    return target_dir


def _delete_selected_uploads(paths, upload_folder):
    deleted = 0
    upload_folder = upload_folder.resolve()
    for path in paths:
        if path.is_symlink():
            raise SystemExit(f"清理前文件变成符号链接，已停止: {path}")
        resolved = path.resolve(strict=False)
        if resolved != upload_folder and upload_folder not in resolved.parents:
            raise SystemExit(f"清理前文件移出 UPLOAD_FOLDER，已停止: {resolved}")
        if resolved.is_file():
            resolved.unlink()
            deleted += 1
    return deleted


def _delete_frozen_rows(connection, tables, counts, batch_size=500):
    for table_name, rows in counts:
        row_ids = [row[0] for row in rows]
        table = tables[table_name]
        for offset in range(0, len(row_ids), batch_size):
            batch = row_ids[offset:offset + batch_size]
            connection.execute(delete(table).where(table.c.id.in_(batch)))


def main():
    parser = argparse.ArgumentParser(description="Clean demo rows and referenced uploads after backup.")
    parser.add_argument("--project-root", default=str(ROOT), help="Project root used to resolve legacy relative paths.")
    parser.add_argument("--demo-email-domain", default="@mvp.local", help="Demo account email suffix to remove.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--confirm", action="store_true", help="Back up and delete the selected demo data.")
    mode.add_argument("--dry-run", action="store_true", help="Preview actions only. This is the default.")
    args = parser.parse_args()

    project_root = Path(args.project_root).expanduser().resolve()
    database_url = _database_url()
    upload_folder = _configured_upload_folder(project_root)
    if args.confirm and database_url.startswith(("mysql://", "mysql+pymysql://")):
        raise SystemExit(
            "MySQL confirmed cleanup is disabled until database.sql automated restore is implemented and verified."
        )
    _validate_cleanup_paths(project_root, database_url, upload_folder)
    database_label = backup_pilot_data._safe_database_label(database_url)
    try:
        engine = create_engine(database_url)
    except SQLAlchemyError as exc:
        raise SystemExit(
            f"Demo cleanup database operation failed for {database_label} "
            f"({type(exc).__name__})"
        ) from None

    with _safe_transaction(engine, database_label) as connection:
        tables = _load_tables(engine)
        table_names = set(inspect(engine).get_table_names())
        plan = _collect_plan(connection, tables, args.demo_email_domain)
        counts = []
        for table_name, condition in plan.deletions:
            if table_name not in table_names:
                continue
            table = tables[table_name]
            rows = connection.execute(select(table.c.id).where(condition).with_for_update()).fetchall()
            counts.append((table_name, rows))

        selected_uploads = _resolve_demo_uploads(
            plan.upload_paths,
            plan.protected_upload_paths,
            project_root,
            upload_folder,
        )
        mode_label = "DELETE CONFIRMED" if args.confirm else "DRY RUN"
        print(
            f"{mode_label}: demo cleanup for "
            f"{database_label}"
        )
        for table_name, rows in counts:
            print(f"{table_name}: {len(rows)}")
        for label, count in _upload_inventory(project_root):
            print(f"{label}: {count} (inventory only)")
        print(f"referenced uploads selected: {len(selected_uploads)}")

        if not args.confirm:
            print("No data deleted. Re-run with --confirm after reviewing counts.")
            return

        _run_backup(database_url, upload_folder)
        _delete_frozen_rows(connection, tables, counts)

    deleted_files = _delete_selected_uploads(selected_uploads, upload_folder)
    print(f"cleanup complete: deleted referenced upload files {deleted_files}")


if __name__ == "__main__":
    try:
        main()
    except OperationalError as exc:
        raise SystemExit(
            "Database connection failed for "
            f"{backup_pilot_data._safe_database_label(_database_url())}: "
            f"{exc.__class__.__name__}"
        ) from None
