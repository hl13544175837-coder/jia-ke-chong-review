#!/usr/bin/env python3
"""Clean local demo data after backing up database and uploads.

Default mode is a dry run. Pass --confirm to delete rows and upload files.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

from sqlalchemy import MetaData, and_, create_engine, delete, inspect, or_, select

try:
    from scripts.backup_pilot_data import database_url_summary
except ModuleNotFoundError:  # Direct execution adds backend/scripts, not backend, to sys.path.
    from backup_pilot_data import database_url_summary


ROOT = Path(__file__).resolve().parents[2]


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
    query = select(table.c.id)
    if conditions:
        query = query.where(or_(*conditions))
    return {row[0] for row in connection.execute(query)}


def _in(table, column, values):
    if table is None or column not in table.c or not values:
        return None
    return table.c[column].in_(values)


def _eq(table, column, value):
    if table is None or column not in table.c:
        return None
    return table.c[column] == value


def _or(*conditions):
    conditions = [condition for condition in conditions if condition is not None]
    if not conditions:
        return None
    return or_(*conditions)


def _like(table, column, pattern):
    if table is None or column not in table.c:
        return None
    return table.c[column].like(pattern)


def _and(*conditions):
    if any(condition is None for condition in conditions):
        return None
    return and_(*conditions)


def _collect_plan(connection, tables, demo_domain):
    users = tables.get("users")
    jobs = tables.get("jobs")
    candidates = tables.get("candidates")
    upload_batches = tables.get("upload_batches")
    talent_maps = tables.get("talent_maps")
    talent_map_companies = tables.get("talent_map_companies")
    conversations = tables.get("conversations")

    demo_user_ids = _ids(connection, users, _like(users, "email", f"%{demo_domain}"))
    demo_job_ids = _ids(connection, jobs, _in(jobs, "owner_hr_id", demo_user_ids))
    demo_upload_batch_ids = _ids(
        connection,
        upload_batches,
        _in(upload_batches, "owner_hr_id", demo_user_ids),
        _in(upload_batches, "target_job_id", demo_job_ids),
    )
    demo_candidate_ids = _ids(
        connection,
        candidates,
        _in(candidates, "owner_hr_id", demo_user_ids),
        _in(candidates, "upload_batch_id", demo_upload_batch_ids),
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
        "conversation_messages": _in(tables.get("conversation_messages"), "conversation_id", demo_conversation_ids),
        "conversations": _in(conversations, "id", demo_conversation_ids),
        "interview_feedback": _or(
            _in(tables.get("interview_feedback"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interview_feedback"), "job_id", demo_job_ids),
            _in(tables.get("interview_feedback"), "interviewer_id", demo_user_ids),
        ),
        "interview_assignments": _or(
            _in(tables.get("interview_assignments"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interview_assignments"), "job_id", demo_job_ids),
            _in(tables.get("interview_assignments"), "interviewer_id", demo_user_ids),
            _in(tables.get("interview_assignments"), "created_by", demo_user_ids),
        ),
        "offer_records": _or(
            _in(tables.get("offer_records"), "candidate_id", demo_candidate_ids),
            _in(tables.get("offer_records"), "job_id", demo_job_ids),
            _in(tables.get("offer_records"), "created_by", demo_user_ids),
        ),
        "candidate_dispositions": _or(
            _in(tables.get("candidate_dispositions"), "candidate_id", demo_candidate_ids),
            _in(tables.get("candidate_dispositions"), "job_id", demo_job_ids),
            _in(tables.get("candidate_dispositions"), "created_by", demo_user_ids),
        ),
        "pipeline_stages": _or(
            _in(tables.get("pipeline_stages"), "candidate_id", demo_candidate_ids),
            _in(tables.get("pipeline_stages"), "job_id", demo_job_ids),
            _in(tables.get("pipeline_stages"), "updated_by", demo_user_ids),
        ),
        "interviews": _or(
            _in(tables.get("interviews"), "candidate_id", demo_candidate_ids),
            _in(tables.get("interviews"), "job_id", demo_job_ids),
        ),
        "matches": _or(
            _in(tables.get("matches"), "candidate_id", demo_candidate_ids),
            _in(tables.get("matches"), "job_id", demo_job_ids),
        ),
        "candidate_tags": _in(tables.get("candidate_tags"), "candidate_id", demo_candidate_ids),
        "notifications": _in(tables.get("notifications"), "user_id", demo_user_ids),
        "events": _or(
            _in(tables.get("events"), "actor_id", demo_user_ids),
            _and(
                _eq(tables.get("events"), "entity_type", "candidate"),
                _in(tables.get("events"), "entity_id", demo_candidate_ids),
            ),
            _and(
                _eq(tables.get("events"), "entity_type", "job"),
                _in(tables.get("events"), "entity_id", demo_job_ids),
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
        ),
        "talent_map_people": _or(
            _in(tables.get("talent_map_people"), "map_id", demo_talent_map_ids),
            _in(tables.get("talent_map_people"), "company_id", demo_talent_company_ids),
        ),
        "talent_map_companies": _in(tables.get("talent_map_companies"), "map_id", demo_talent_map_ids),
        "talent_maps": _in(talent_maps, "id", demo_talent_map_ids),
        "recruitment_demands": _or(
            _in(tables.get("recruitment_demands"), "owner_hr_id", demo_user_ids),
            _in(tables.get("recruitment_demands"), "job_id", demo_job_ids),
        ),
        "candidates": _in(candidates, "id", demo_candidate_ids),
        "upload_batches": _in(upload_batches, "id", demo_upload_batch_ids),
        "jobs": _in(jobs, "id", demo_job_ids),
        "users": _in(users, "id", demo_user_ids),
    }

    delete_order = [
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
        "recruitment_demands",
        "candidates",
        "upload_batches",
        "jobs",
        "users",
    ]
    return [(name, conditions[name]) for name in delete_order if conditions.get(name) is not None]


def _safe_upload_dirs(project_root):
    root = project_root.resolve()
    configured = os.environ.get("UPLOAD_FOLDER")
    upload_dir = Path(configured).expanduser() if configured else root / "backend" / "uploads"
    if not upload_dir.is_absolute():
        upload_dir = root / upload_dir
    resolved = upload_dir.resolve()
    if resolved == root or resolved in root.parents:
        raise SystemExit(f"Refusing unsafe upload folder: {resolved}")
    return [resolved]


def _paths_overlap(first, second):
    return first == second or first in second.parents or second in first.parents


def _validate_cleanup_paths(project_root, database_url, upload_dirs):
    root = project_root.resolve()
    backup_root = Path(os.environ.get("BACKUP_DIR", str(ROOT / "backups"))).expanduser().resolve()
    sqlite_path = None
    if database_url.startswith("sqlite:///"):
        sqlite_path = Path(database_url[len("sqlite:///"):]).expanduser().resolve()

    for upload_dir in upload_dirs:
        if _paths_overlap(upload_dir, backup_root):
            raise SystemExit(
                f"Refusing unsafe cleanup path overlap: uploads={upload_dir} backups={backup_root}"
            )
        if sqlite_path is not None and _paths_overlap(upload_dir, sqlite_path):
            raise SystemExit(
                f"Refusing unsafe cleanup path overlap: uploads={upload_dir} database={sqlite_path}"
            )
    if sqlite_path is not None and _paths_overlap(backup_root, sqlite_path):
        raise SystemExit(
            f"Refusing unsafe cleanup path overlap: backups={backup_root} database={sqlite_path}"
        )
    if backup_root == root or backup_root in root.parents:
        raise SystemExit(f"Refusing unsafe cleanup path: backups={backup_root}")


def _candidate_file_references(connection, tables, plan):
    candidates = tables.get("candidates")
    condition = dict(plan).get("candidates")
    if (
        candidates is None
        or condition is None
        or "id" not in candidates.c
        or "raw_file_path" not in candidates.c
    ):
        return [], []

    demo_rows = connection.execute(
        select(candidates.c.id, candidates.c.raw_file_path).where(condition)
    ).fetchall()
    demo_ids = {row[0] for row in demo_rows}
    demo_references = [row[1] for row in demo_rows if row[1]]
    protected_references = [
        row[1]
        for row in connection.execute(select(candidates.c.id, candidates.c.raw_file_path)).fetchall()
        if row[0] not in demo_ids and row[1]
    ]
    return demo_references, protected_references


def _resolved_reference(project_root, raw_file_path):
    path = Path(str(raw_file_path)).expanduser()
    if not path.is_absolute():
        path = project_root / path
    return path, path.resolve()


def _inside_any(path, roots):
    return any(path == root or root in path.parents for root in roots)


def _safe_demo_files(project_root, upload_dirs, demo_references, protected_references):
    root = project_root.resolve()
    allowed_roots = [path.resolve() for path in upload_dirs]
    protected_paths = {
        resolved
        for raw_path in protected_references
        for _path, resolved in [_resolved_reference(root, raw_path)]
    }
    safe_files = set()
    unsafe_count = 0
    for raw_path in demo_references:
        original, resolved = _resolved_reference(root, raw_path)
        if original.is_symlink() or not _inside_any(resolved, allowed_roots):
            unsafe_count += 1
            continue
        if resolved in protected_paths:
            continue
        if resolved.is_file():
            safe_files.add(resolved)
        elif resolved.exists():
            unsafe_count += 1
    return sorted(safe_files), unsafe_count


def _delete_demo_files(paths, upload_dirs):
    allowed_roots = [path.resolve() for path in upload_dirs]
    deleted = 0
    for path in paths:
        current = path.resolve()
        if path.is_symlink() or current != path or not _inside_any(current, allowed_roots):
            continue
        if path.is_file():
            path.unlink()
            deleted += 1
    return deleted


def _run_backup(database_url, upload_dirs):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import backup_pilot_data

    backup_root = Path(os.environ.get("BACKUP_DIR", str(ROOT / "backups"))).expanduser().resolve()
    target_dir = backup_pilot_data._create_snapshot_dir(backup_root, suffix="-cleanup-demo-data")
    try:
        backup_pilot_data._backup_database(database_url, target_dir, dry_run=False)
        backup_pilot_data._backup_uploads(upload_dirs[0], target_dir, dry_run=False)
    except BaseException:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise

    print(f"backup complete: {target_dir}")
    return target_dir


def _delete_counted_rows(connection, tables, counts):
    for table_name, rows in counts:
        row_ids = [row[0] for row in rows]
        table = tables[table_name]
        for offset in range(0, len(row_ids), 500):
            batch_ids = row_ids[offset:offset + 500]
            connection.execute(delete(table).where(table.c.id.in_(batch_ids)))


def main():
    parser = argparse.ArgumentParser(description="Clean demo rows and upload files after backup.")
    parser.add_argument("--project-root", default=str(ROOT), help="Project root containing backend/uploads and uploads.")
    parser.add_argument("--demo-email-domain", default="@mvp.local", help="Demo account email suffix to remove.")
    parser.add_argument("--confirm", action="store_true", help="Actually back up and delete demo data.")
    parser.add_argument("--dry-run", action="store_true", help="Preview actions only. This is the default.")
    args = parser.parse_args()

    project_root = Path(args.project_root).expanduser().resolve()
    database_url = _database_url()
    is_mysql = database_url.startswith(("mysql://", "mysql+pymysql://"))
    if args.confirm and is_mysql:
        raise SystemExit(
            "Confirmed MySQL demo cleanup is disabled because restore_pilot_data.py cannot restore "
            "database.sql. Use the DBA-reviewed manual cleanup path in DEPLOYMENT.md or add and verify "
            "MySQL restore support first."
        )
    engine = create_engine(database_url)
    upload_dirs = _safe_upload_dirs(project_root)
    _validate_cleanup_paths(project_root, database_url, upload_dirs)

    with engine.begin() as connection:
        tables = _load_tables(engine)
        table_names = set(inspect(engine).get_table_names())
        plan = _collect_plan(connection, tables, args.demo_email_domain)
        demo_references, protected_references = _candidate_file_references(connection, tables, plan)
        demo_files, unsafe_file_count = _safe_demo_files(
            project_root,
            upload_dirs,
            demo_references,
            protected_references,
        )
        counts = []
        for table_name, condition in plan:
            if table_name not in table_names:
                continue
            table = tables[table_name]
            frozen_rows = connection.execute(
                select(table.c.id).where(condition).with_for_update()
            ).fetchall()
            counts.append((table_name, frozen_rows))

        mode = "DELETE CONFIRMED" if args.confirm else "DRY RUN"
        print(f"{mode}: demo cleanup for {database_url_summary(database_url)}")
        for table_name, rows in counts:
            print(f"{table_name}: {len(rows)}")
        print(f"demo upload files: {len(demo_files)}")
        if unsafe_file_count:
            print(f"skipped unsafe demo file references: {unsafe_file_count}")
        if is_mysql:
            print("WARNING: MySQL --confirm cleanup is disabled; follow the DBA-reviewed path in DEPLOYMENT.md.")

        if not args.confirm:
            print("No data deleted. Re-run with --confirm after reviewing counts.")
            return

        _run_backup(database_url, upload_dirs)

        _delete_counted_rows(connection, tables, counts)

    deleted_files = _delete_demo_files(demo_files, upload_dirs)
    print(f"cleanup complete: deleted upload files {deleted_files}")


if __name__ == "__main__":
    main()
