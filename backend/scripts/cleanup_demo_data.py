#!/usr/bin/env python3
"""Remove demo-owned data after creating a standard restorable snapshot.

Dry-run is the default. The confirmed path freezes matching primary keys in a
transaction, backs up the database and configured uploads directory, deletes
Demand-scoped rows in dependency order, then removes only files referenced by
the demo candidates selected in that same plan.
"""

import argparse
import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import MetaData, and_, create_engine, delete, inspect, or_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import SQLAlchemyError


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

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
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
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
        _in(demands, "created_by", demo_user_ids),
        _in(demands, "job_id", demo_job_ids),
    )
    demo_upload_batch_ids = _ids(
        connection,
        upload_batches,
        _in(upload_batches, "owner_hr_id", demo_user_ids),
    )
    demo_candidate_ids = _ids(
        connection,
        candidates,
        _in(candidates, "owner_hr_id", demo_user_ids),
        _in(candidates, "upload_batch_id", demo_upload_batch_ids),
    )
    candidates_linked_to_demo_demands = _ids(
        connection,
        candidates,
        _in(candidates, "current_demand_id", demo_demand_ids),
    )
    surviving_candidate_blockers = candidates_linked_to_demo_demands - demo_candidate_ids
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
    demo_flow_ids = _ids(
        connection,
        flows,
        _in(flows, "candidate_id", demo_candidate_ids),
        _in(flows, "demand_id", demo_demand_ids),
        _in(flows, "owner_hr_id", demo_user_ids),
        _in(flows, "transfer_from_demand_id", demo_demand_ids),
    )
    if (
        demo_flow_ids
        and flows is not None
        and candidates is not None
        and "candidate_id" in flows.c
        and "demand_id" in flows.c
        and "current_demand_id" in candidates.c
    ):
        selected_flow_rows = connection.execute(
            select(flows.c.candidate_id, flows.c.demand_id)
            .where(flows.c.id.in_(tuple(demo_flow_ids)))
            .with_for_update()
        ).fetchall()
        surviving_flow_candidate_ids = {
            row[0] for row in selected_flow_rows if row[0] not in demo_candidate_ids
        }
        if surviving_flow_candidate_ids:
            current_demands = dict(
                connection.execute(
                    select(candidates.c.id, candidates.c.current_demand_id)
                    .where(candidates.c.id.in_(tuple(surviving_flow_candidate_ids)))
                    .with_for_update()
                ).fetchall()
            )
            flow_blockers = sorted(
                candidate_id
                for candidate_id, demand_id in selected_flow_rows
                if candidate_id in surviving_flow_candidate_ids
                and current_demands.get(candidate_id) == demand_id
            )
            if flow_blockers:
                raise SystemExit(
                    "Demo cleanup is blocked because selected demo flows are current for surviving "
                    f"candidates: {flow_blockers}"
                )
    demo_assignment_ids = _ids(
        connection,
        assignments,
        _in(assignments, "candidate_id", demo_candidate_ids),
        _in(assignments, "job_id", demo_job_ids),
        _in(assignments, "demand_id", demo_demand_ids),
        _in(assignments, "interviewer_id", demo_user_ids),
        _in(assignments, "created_by", demo_user_ids),
    )
    demo_talent_map_ids = _ids(
        connection,
        talent_maps,
        _in(talent_maps, "owner_hr_id", demo_user_ids),
        _in(talent_maps, "job_id", demo_job_ids),
    )
    demo_talent_company_ids = _ids(
        connection,
        talent_map_companies,
        _in(talent_map_companies, "map_id", demo_talent_map_ids),
    )
    demo_conversation_ids = _ids(
        connection,
        conversations,
        _in(conversations, "user_id", demo_user_ids),
    )

    conditions = {
        "conversation_messages": _in(
            tables.get("conversation_messages"), "conversation_id", demo_conversation_ids
        ),
        "conversations": _in(conversations, "id", demo_conversation_ids),
        "interview_feedback": _or(
            _in(tables.get("interview_feedback"), "assignment_id", demo_assignment_ids),
            _in(tables.get("interview_feedback"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interview_feedback"), "job_id", demo_job_ids),
            _in(tables.get("interview_feedback"), "demand_id", demo_demand_ids),
            _in(tables.get("interview_feedback"), "interviewer_id", demo_user_ids),
        ),
        "interview_assignments": _in(assignments, "id", demo_assignment_ids),
        "offer_records": _or(
            _in(tables.get("offer_records"), "candidate_id", demo_candidate_ids),
            _in(tables.get("offer_records"), "job_id", demo_job_ids),
            _in(tables.get("offer_records"), "demand_id", demo_demand_ids),
            _in(tables.get("offer_records"), "created_by", demo_user_ids),
        ),
        "candidate_dispositions": _or(
            _in(tables.get("candidate_dispositions"), "candidate_id", demo_candidate_ids),
            _in(tables.get("candidate_dispositions"), "job_id", demo_job_ids),
            _in(tables.get("candidate_dispositions"), "demand_id", demo_demand_ids),
            _in(tables.get("candidate_dispositions"), "created_by", demo_user_ids),
        ),
        "pipeline_stages": _or(
            _in(tables.get("pipeline_stages"), "candidate_id", demo_candidate_ids),
            _in(tables.get("pipeline_stages"), "job_id", demo_job_ids),
            _in(tables.get("pipeline_stages"), "demand_id", demo_demand_ids),
            _in(tables.get("pipeline_stages"), "updated_by", demo_user_ids),
        ),
        "interviews": _or(
            _in(tables.get("interviews"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interviews"), "job_id", demo_job_ids),
            _in(tables.get("interviews"), "demand_id", demo_demand_ids),
        ),
        "matches": _or(
            _in(tables.get("matches"), "candidate_id", demo_candidate_ids),
            _in(tables.get("matches"), "job_id", demo_job_ids),
        ),
        "candidate_tags": _in(tables.get("candidate_tags"), "candidate_id", demo_candidate_ids),
        "notifications": _or(
            _in(tables.get("notifications"), "user_id", demo_user_ids),
            _in(tables.get("notifications"), "demand_id", demo_demand_ids),
        ),
        "events": _or(
            _in(tables.get("events"), "actor_id", demo_user_ids),
            _in(tables.get("events"), "demand_id", demo_demand_ids),
            _and(
                _eq(tables.get("events"), "entity_type", "candidate"),
                _in(tables.get("events"), "entity_id", demo_candidate_ids),
            ),
            _and(
                _eq(tables.get("events"), "entity_type", "job"),
                _in(tables.get("events"), "entity_id", demo_job_ids),
            ),
            _and(
                _eq(tables.get("events"), "entity_type", "demand"),
                _in(tables.get("events"), "entity_id", demo_demand_ids),
            ),
            _and(
                _eq(tables.get("events"), "entity_type", "recruitment_demand"),
                _in(tables.get("events"), "entity_id", demo_demand_ids),
            ),
        ),
        "audit_logs": _or(
            _in(tables.get("audit_logs"), "actor_id", demo_user_ids),
            _and(
                _eq(tables.get("audit_logs"), "target_table", "candidates"),
                _in(tables.get("audit_logs"), "target_id", demo_candidate_ids),
            ),
            _and(
                _eq(tables.get("audit_logs"), "target_table", "jobs"),
                _in(tables.get("audit_logs"), "target_id", demo_job_ids),
            ),
            _and(
                _eq(tables.get("audit_logs"), "target_table", "recruitment_demands"),
                _in(tables.get("audit_logs"), "target_id", demo_demand_ids),
            ),
        ),
        "talent_map_people": _or(
            _in(tables.get("talent_map_people"), "map_id", demo_talent_map_ids),
            _in(tables.get("talent_map_people"), "company_id", demo_talent_company_ids),
        ),
        "talent_map_companies": _in(
            tables.get("talent_map_companies"), "map_id", demo_talent_map_ids
        ),
        "talent_maps": _in(talent_maps, "id", demo_talent_map_ids),
        "boss_accounts": _in(tables.get("boss_accounts"), "owner_hr_id", demo_user_ids),
        "candidate_demand_flows": _in(flows, "id", demo_flow_ids),
        "recruitment_demands": _in(demands, "id", demo_demand_ids),
        "candidates": _in(candidates, "id", demo_candidate_ids),
        "upload_batches": _in(upload_batches, "id", demo_upload_batch_ids),
        "jobs": _in(jobs, "id", demo_job_ids),
        "users": _in(users, "id", demo_user_ids),
    }

    delete_order = (
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
    configured = os.environ.get("UPLOAD_FOLDER")
    path = Path(configured).expanduser() if configured else project_root / "backend" / "uploads"
    if not path.is_absolute():
        path = project_root / path
    lexical = path.absolute()
    if lexical.is_symlink():
        raise SystemExit(f"拒绝将符号链接作为 UPLOAD_FOLDER: {lexical}")
    resolved = lexical.resolve()
    if resolved == Path(resolved.anchor) or resolved == project_root or resolved in project_root.parents:
        raise SystemExit(f"拒绝不安全的 UPLOAD_FOLDER: {resolved}")
    return lexical


def _resolve_demo_uploads(raw_paths, protected_raw_paths, project_root, upload_folder):
    selected = []
    upload_folder = upload_folder.resolve()
    protected = set()
    for raw_path in protected_raw_paths:
        stored = Path(raw_path).expanduser()
        lexical = stored if stored.is_absolute() else project_root / stored
        protected.add(lexical.resolve(strict=False))
    for raw_path in raw_paths:
        stored = Path(raw_path).expanduser()
        lexical = stored if stored.is_absolute() else project_root / stored
        if lexical.is_symlink():
            print(f"skip unsafe demo upload symlink: {lexical}")
            continue
        resolved = lexical.resolve(strict=False)
        if resolved != upload_folder and upload_folder not in resolved.parents:
            print(f"skip demo upload outside configured folder: {resolved}")
            continue
        if resolved in protected:
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
