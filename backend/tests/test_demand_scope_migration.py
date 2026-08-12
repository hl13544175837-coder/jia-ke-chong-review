import importlib
import json
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
SCRIPTS_DIR = BACKEND_DIR / "scripts"


def _database_url(path):
    return f"sqlite:///{path}"


def _load_script(name):
    path = SCRIPTS_DIR / f"{name}.py"
    assert path.exists(), f"missing migration script: {path}"
    importlib.invalidate_caches()
    return importlib.import_module(f"scripts.{name}")


def _upgrade(path):
    assert ALEMBIC_INI.exists(), "Alembic config must be version-controlled"
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", _database_url(path))
    command.upgrade(config, "head")


def _create_legacy_database(path, scenario="one", all_facts=False):
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            name VARCHAR(100),
            email VARCHAR(100),
            role VARCHAR(20),
            password_hash VARCHAR(255)
        );
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            title VARCHAR(200) NOT NULL,
            jd_text TEXT NOT NULL,
            owner_hr_id INTEGER,
            status VARCHAR(20),
            created_at DATETIME
        );
        CREATE TABLE recruitment_demands (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            owner_hr_id INTEGER,
            request_no VARCHAR(80),
            requester_name VARCHAR(120),
            requester_department VARCHAR(120),
            hiring_manager_name VARCHAR(120),
            requested_at DATE,
            accepted_at DATE,
            target_date DATE,
            priority VARCHAR(1),
            headcount INTEGER,
            status VARCHAR(20),
            close_reason TEXT,
            downgrade_reason TEXT,
            note TEXT,
            created_at DATETIME,
            updated_at DATETIME
        );
        CREATE TABLE candidates (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            owner_hr_id INTEGER,
            resume_json JSON NOT NULL,
            created_at DATETIME
        );
        CREATE TABLE upload_batches (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            owner_hr_id INTEGER,
            source_channel VARCHAR(120),
            target_job_id INTEGER,
            created_at DATETIME
        );
        CREATE TABLE pipeline_stages (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER,
            job_id INTEGER,
            stage VARCHAR(50) NOT NULL,
            updated_by INTEGER,
            note TEXT,
            ts DATETIME
        );
        CREATE TABLE interviews (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER,
            job_id INTEGER,
            qa_json JSON,
            ai_report JSON,
            score FLOAT,
            pass_recommended BOOLEAN,
            created_at DATETIME
        );
        CREATE TABLE candidate_dispositions (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            reason VARCHAR(240),
            created_at DATETIME
        );
        CREATE TABLE offer_records (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            approval_status VARCHAR(40),
            created_at DATETIME
        );
        CREATE TABLE interview_assignments (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            round VARCHAR(30) NOT NULL,
            interviewer_id INTEGER NOT NULL,
            status VARCHAR(40),
            created_at DATETIME
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            actor_id INTEGER,
            action VARCHAR(100) NOT NULL,
            entity_id INTEGER,
            entity_type VARCHAR(50),
            payload JSON,
            ts DATETIME
        );
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(200) NOT NULL,
            created_at DATETIME
        );
        CREATE TABLE interview_feedback (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            round VARCHAR(30) NOT NULL,
            interviewer_id INTEGER NOT NULL,
            created_at DATETIME
        );
        CREATE TABLE conversations (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL DEFAULT 1,
            user_id INTEGER NOT NULL,
            title VARCHAR(200),
            created_at DATETIME,
            updated_at DATETIME
        );
        CREATE TABLE conversation_messages (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL DEFAULT 1,
            conversation_id INTEGER NOT NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            tool_calls JSON,
            thoughts JSON,
            created_at DATETIME
        );
        """
    )
    connection.executemany(
        "INSERT INTO users (id, org_id, name, email, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (1, 1, "HR", "hr@example.test", "recruiter", "x"),
            (2, 2, "Other", "other@example.test", "recruiter", "x"),
        ],
    )
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (1, 1, 'Driver', 'JD', 1, 'active', '2026-01-01 00:00:00')"
    )
    connection.execute(
        "INSERT INTO candidates (id, org_id, owner_hr_id, resume_json, created_at) "
        "VALUES (1, 1, 1, '{}', '2026-01-01 00:00:00')"
    )

    if scenario in {"one", "multiple_unambiguous", "multiple_ambiguous"}:
        connection.execute(
            "INSERT INTO recruitment_demands "
            "(id, org_id, job_id, owner_hr_id, request_no, requested_at, accepted_at, priority, "
            "headcount, status, created_at, updated_at) "
            "VALUES (10, 1, 1, 1, 'REQ-10', '2026-01-01', '2026-01-01', 'B', 1, "
            "'active', '2026-01-01 00:00:00', '2026-01-31 23:59:59')"
        )
    if scenario in {"multiple_unambiguous", "multiple_ambiguous"}:
        second_start = "2026-02-01" if scenario == "multiple_unambiguous" else "2026-01-05"
        connection.execute(
            "INSERT INTO recruitment_demands "
            "(id, org_id, job_id, owner_hr_id, request_no, requested_at, accepted_at, priority, "
            "headcount, status, created_at, updated_at) VALUES "
            "(11, 1, 1, 1, 'REQ-11', ?, ?, 'B', 1, 'active', ?, ?)",
            (second_start, second_start, f"{second_start} 00:00:00", f"{second_start} 00:00:00"),
        )

    connection.execute(
        "INSERT INTO pipeline_stages (id, org_id, candidate_id, job_id, stage, updated_by, ts) "
        "VALUES (1, 1, 1, 1, 'pending', 1, '2026-01-15 12:00:00')"
    )
    if all_facts:
        connection.execute(
            "INSERT INTO interviews (id, org_id, candidate_id, job_id, created_at) "
            "VALUES (1, 1, 1, 1, '2026-01-15 12:01:00')"
        )
        connection.execute(
            "INSERT INTO interview_assignments "
            "(id, org_id, candidate_id, job_id, round, interviewer_id, status, created_at) "
            "VALUES (1, 1, 1, 1, 'interview_first', 1, 'scheduled', '2026-01-15 12:02:00')"
        )
        connection.execute(
            "INSERT INTO interview_feedback "
            "(id, org_id, candidate_id, job_id, round, interviewer_id, created_at) "
            "VALUES (1, 1, 1, 1, 'interview_first', 1, '2026-01-15 12:03:00')"
        )
        connection.execute(
            "INSERT INTO offer_records (id, org_id, candidate_id, job_id, approval_status, created_at) "
            "VALUES (1, 1, 1, 1, 'draft', '2026-01-15 12:04:00')"
        )
        connection.execute(
            "INSERT INTO candidate_dispositions (id, org_id, candidate_id, job_id, reason, created_at) "
            "VALUES (1, 1, 1, 1, '', '2026-01-15 12:05:00')"
        )
        connection.execute(
            "INSERT INTO events (id, org_id, actor_id, action, entity_id, entity_type, payload, ts) "
            "VALUES (1, 1, 1, 'legacy.event', 1, 'candidate', "
            "'{\"candidate_id\": 1, \"job_id\": 1}', '2026-01-15 12:06:00')"
        )
    connection.commit()
    connection.close()


def _set_first_demand_closed(path):
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE recruitment_demands SET status = 'filled', closed_at = '2026-01-31 23:59:59' "
        "WHERE id = 10"
    )
    connection.commit()
    connection.close()


def test_alembic_expand_is_additive_revisioned_and_idempotent(tmp_path):
    path = tmp_path / "expand.db"
    _create_legacy_database(path, scenario="zero")

    _upgrade(path)
    _upgrade(path)

    engine = create_engine(_database_url(path))
    inspector = inspect(engine)
    assert inspector.has_table("candidate_demand_flows")
    assert "current_demand_id" in {column["name"] for column in inspector.get_columns("candidates")}
    assert {"demand_id", "round_sequence", "is_primary"}.issubset(
        {column["name"] for column in inspector.get_columns("interview_assignments")}
    )
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM pipeline_stages")).scalar_one() == 1
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20260811_18"
    engine.dispose()


def test_interview_uniqueness_revision_adds_primary_slot_and_unique_indexes(tmp_path):
    path = tmp_path / "interview-uniqueness.db"
    _create_legacy_database(path, scenario="one", all_facts=True)

    _upgrade(path)

    engine = create_engine(_database_url(path))
    inspector = inspect(engine)
    assignment_columns = {
        column["name"] for column in inspector.get_columns("interview_assignments")
    }
    assignment_indexes = {
        index["name"]: index
        for index in inspector.get_indexes("interview_assignments")
    }
    feedback_indexes = {
        index["name"]: index
        for index in inspector.get_indexes("interview_feedback")
    }
    assert "primary_slot" in assignment_columns
    assert bool(assignment_indexes["uq_interview_assignment_primary_slot"]["unique"])
    assert bool(feedback_indexes["uq_interview_feedback_assignment_id"]["unique"])
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260811_18"
    engine.dispose()


def test_interview_uniqueness_migration_stops_on_duplicate_active_primary(tmp_path):
    path = tmp_path / "duplicate-primary.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", _database_url(path))
    command.upgrade(config, "20260710_01")
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE interview_assignments "
        "SET demand_id = 10, round_sequence = 1, is_primary = 1, status = 'scheduled' "
        "WHERE id = 1"
    )
    connection.execute(
        "INSERT INTO interview_assignments "
        "(id, org_id, candidate_id, job_id, demand_id, round, round_sequence, "
        "is_primary, interviewer_id, status, created_at) "
        "VALUES (2, 1, 1, 1, 10, 'round_1', 1, 1, 1, 'scheduled', '2026-01-16')"
    )
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match="duplicate active primary"):
        command.upgrade(config, "head")


def test_interview_uniqueness_migration_stops_on_duplicate_assignment_feedback(tmp_path):
    path = tmp_path / "duplicate-feedback.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", _database_url(path))
    command.upgrade(config, "20260710_01")
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE interview_feedback SET assignment_id = 1 WHERE id = 1"
    )
    connection.execute(
        "INSERT INTO interview_feedback "
        "(id, org_id, candidate_id, job_id, demand_id, assignment_id, round, "
        "interviewer_id, created_at) "
        "VALUES (2, 1, 1, 1, 10, 1, 'round_1', 1, '2026-01-16')"
    )
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match="duplicate interview feedback"):
        command.upgrade(config, "head")


def test_interview_uniqueness_migration_backfills_only_active_primary_slots(tmp_path):
    path = tmp_path / "primary-slot-backfill.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", _database_url(path))
    command.upgrade(config, "20260710_01")
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE interview_assignments "
        "SET demand_id = 10, round_sequence = 2, is_primary = 1, status = 'scheduled' "
        "WHERE id = 1"
    )
    connection.execute(
        "INSERT INTO interview_assignments "
        "(id, org_id, candidate_id, job_id, demand_id, round, round_sequence, "
        "is_primary, interviewer_id, status, created_at) "
        "VALUES (2, 1, 1, 1, 10, 'round_1', 1, 1, 1, ' Cancelled ', '2026-01-16')"
    )
    connection.commit()
    connection.close()

    command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT primary_slot FROM interview_assignments WHERE id = 1"
    ).fetchone()[0] == 2
    assert connection.execute(
        "SELECT primary_slot FROM interview_assignments WHERE id = 2"
    ).fetchone()[0] is None
    connection.close()


def test_alembic_expand_can_downgrade_and_upgrade_again_on_sqlite(tmp_path):
    path = tmp_path / "expand-round-trip.db"
    _create_legacy_database(path, scenario="one")
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", _database_url(path))

    command.upgrade(config, "20260710_01")
    command.downgrade(config, "base")

    engine = create_engine(_database_url(path))
    inspector = inspect(engine)
    assert not inspector.has_table("candidate_demand_flows")
    assert "current_demand_id" not in {
        column["name"] for column in inspector.get_columns("candidates")
    }
    assert "demand_id" not in {
        column["name"] for column in inspector.get_columns("pipeline_stages")
    }
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT COUNT(*) FROM pipeline_stages")
        ).scalar_one() == 1
    engine.dispose()

    command.upgrade(config, "20260710_01")
    engine = create_engine(_database_url(path))
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260710_01"
        assert connection.execute(
            text("SELECT COUNT(*) FROM pipeline_stages")
        ).scalar_one() == 1
    engine.dispose()


@pytest.mark.parametrize(
    ("scenario", "expected_category"),
    [
        ("zero", "B"),
        ("one", "A"),
        ("multiple_unambiguous", "C"),
        ("multiple_ambiguous", "D"),
    ],
)
def test_audit_classifies_zero_one_and_multiple_demand_bundles(
    tmp_path,
    scenario,
    expected_category,
):
    path = tmp_path / f"{scenario}.db"
    _create_legacy_database(path, scenario=scenario)
    _upgrade(path)
    if scenario == "multiple_unambiguous":
        _set_first_demand_closed(path)

    audit = _load_script("audit_demand_scope")
    report = audit.audit_database(_database_url(path))

    assert report["summary"][expected_category] == 1
    assert len(report["bundles"]) == 1
    assert report["bundles"][0]["category"] == expected_category
    json.dumps(report, ensure_ascii=False)
    if expected_category in {"A", "C"}:
        assert report["bundles"][0]["facts"][0]["proposed_demand_id"] == 10
    else:
        assert report["bundles"][0]["facts"][0]["proposed_demand_id"] is None


def test_audit_blocks_existing_cross_job_mapping_as_category_e(tmp_path):
    path = tmp_path / "integrity.db"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (2, 1, 'Sorter', 'JD', 1, 'active', '2026-01-01')"
    )
    connection.execute(
        "INSERT INTO recruitment_demands "
        "(id, org_id, job_id, owner_hr_id, request_no, priority, headcount, status, created_at, updated_at) "
        "VALUES (20, 1, 2, 1, 'REQ-20', 'B', 1, 'active', '2026-01-01', '2026-01-01')"
    )
    connection.execute("UPDATE pipeline_stages SET demand_id = 20 WHERE id = 1")
    connection.commit()
    connection.close()

    report = _load_script("audit_demand_scope").audit_database(_database_url(path))

    assert report["summary"]["E"] == 1
    assert "job_mismatch" in report["bundles"][0]["issues"]


def test_backfill_defaults_to_dry_run_and_applies_only_approved_fact_mappings(tmp_path):
    path = tmp_path / "backfill.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    url = _database_url(path)
    audit = _load_script("audit_demand_scope")
    backfill = _load_script("backfill_demand_scope")
    report = audit.audit_database(url)
    manifest = audit.build_mapping_manifest(report, categories=("A",), approved=True)

    assert len(manifest["mappings"]) == 7
    dry_run = backfill.backfill_database(url, manifest)
    assert dry_run["mode"] == "dry-run"
    assert dry_run["planned"] == 7

    engine = create_engine(url)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT demand_id FROM pipeline_stages WHERE id = 1")).scalar_one() is None
        assert connection.execute(text("SELECT COUNT(*) FROM candidate_demand_flows")).scalar_one() == 0

    applied = backfill.backfill_database(url, manifest, apply=True)
    assert applied["applied"] == 7
    assert applied["flows_created"] == 1
    with engine.connect() as connection:
        for table_name in (
            "pipeline_stages",
            "interviews",
            "interview_assignments",
            "interview_feedback",
            "offer_records",
            "candidate_dispositions",
            "events",
        ):
            assert connection.execute(
                text(f"SELECT demand_id FROM {table_name} WHERE id = 1")
            ).scalar_one() == 10
        assert connection.execute(text("SELECT current_demand_id FROM candidates WHERE id = 1")).scalar_one() == 10

    rerun = backfill.backfill_database(url, manifest, apply=True)
    assert rerun["applied"] == 0
    assert rerun["already_applied"] == 7
    assert rerun["flows_created"] == 0
    engine.dispose()


def test_backfill_skips_unapproved_mapping_and_rejects_job_mismatch_atomically(tmp_path):
    path = tmp_path / "approval.db"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    url = _database_url(path)
    backfill = _load_script("backfill_demand_scope")
    unapproved = {
        "schema_version": 1,
        "mappings": [
            {
                "table": "pipeline_stages",
                "record_id": 1,
                "demand_id": 10,
                "basis": "manual review pending",
                "approved": False,
            }
        ],
    }

    result = backfill.backfill_database(url, unapproved, apply=True)
    assert result["skipped_unapproved"] == 1

    connection = sqlite3.connect(path)
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (2, 1, 'Sorter', 'JD', 1, 'active', '2026-01-01')"
    )
    connection.execute(
        "INSERT INTO recruitment_demands "
        "(id, org_id, job_id, owner_hr_id, request_no, priority, headcount, status, created_at, updated_at) "
        "VALUES (20, 1, 2, 1, 'REQ-20', 'B', 1, 'active', '2026-01-01', '2026-01-01')"
    )
    connection.commit()
    connection.close()
    mismatched = {
        "schema_version": 1,
        "mappings": [
            {
                "table": "pipeline_stages",
                "record_id": 1,
                "demand_id": 20,
                "basis": "bad mapping",
                "approved": True,
            }
        ],
    }

    with pytest.raises(backfill.DemandScopeBackfillError, match="job_id"):
        backfill.backfill_database(url, mismatched, apply=True)

    engine = create_engine(url)
    with engine.connect() as sql_connection:
        assert sql_connection.execute(
            text("SELECT demand_id FROM pipeline_stages WHERE id = 1")
        ).scalar_one() is None
        assert sql_connection.execute(text("SELECT COUNT(*) FROM candidate_demand_flows")).scalar_one() == 0
    engine.dispose()


def test_verify_checks_revision_completeness_and_job_consistency(tmp_path):
    path = tmp_path / "verify.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    verify = _load_script("verify_demand_scope")

    before_upgrade = verify.verify_database(_database_url(path))
    assert before_upgrade["ok"] is False
    assert before_upgrade["schema_revision"]["current"] is None

    _upgrade(path)
    url = _database_url(path)
    after_upgrade = verify.verify_database(url)
    assert after_upgrade["ok"] is False
    assert after_upgrade["unmapped_total"] == 7

    audit = _load_script("audit_demand_scope")
    manifest = audit.build_mapping_manifest(
        audit.audit_database(url),
        categories=("A",),
        approved=True,
    )
    _load_script("backfill_demand_scope").backfill_database(url, manifest, apply=True)

    verified = verify.verify_database(url)
    assert verified["ok"] is True
    assert verified["schema_revision"] == {
        "current": "20260811_18",
        "expected": "20260811_18",
        "ok": True,
    }
    assert verified["unmapped_total"] == 0
    assert verified["mismatch_total"] == 0


def test_verify_reports_missing_interview_uniqueness_index(tmp_path):
    path = tmp_path / "missing-interview-index.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute("DROP INDEX uq_interview_assignment_primary_slot")
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert (
        "missing_unique_index:interview_assignments."
        "uq_interview_assignment_primary_slot"
    ) in report["schema_errors"]


def test_verify_reports_missing_demand_request_no_unique_index(tmp_path):
    path = tmp_path / "missing-demand-request-no-index.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute("DROP INDEX uq_recruitment_demands_org_request_no")
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert (
        "missing_unique_index:recruitment_demands."
        "uq_recruitment_demands_org_request_no"
    ) in report["schema_errors"]


def test_verify_reports_missing_offer_lifecycle_and_kpi_schema(tmp_path):
    path = tmp_path / "missing-readdy-schema.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute("DROP TABLE offer_events")
    connection.execute("DROP TABLE kpi_standards")
    connection.execute("ALTER TABLE offer_records DROP COLUMN submitted_at")
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert "missing_table:offer_events" in report["schema_errors"]
    assert "missing_table:kpi_standards" in report["schema_errors"]
    assert "missing_column:offer_records.submitted_at" in report["schema_errors"]


def test_verify_reports_missing_default_interviewer_index_and_foreign_key(
    tmp_path,
):
    path = tmp_path / "missing-default-interviewer-constraints.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    engine = create_engine(_database_url(path))
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        operations = Operations(context)
        with operations.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.drop_constraint(
                "fk_recruitment_demands_default_interviewer_id_users",
                type_="foreignkey",
            )
        operations.drop_index(
            "ix_recruitment_demands_org_default_interviewer",
            table_name="recruitment_demands",
        )
    engine.dispose()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert (
        "missing_index:recruitment_demands."
        "ix_recruitment_demands_org_default_interviewer"
    ) in report["schema_errors"]
    assert (
        "missing_foreign_key:recruitment_demands."
        "fk_recruitment_demands_default_interviewer_id_users"
    ) in report["schema_errors"]


def test_verify_reports_nullable_and_unnormalized_request_numbers(tmp_path):
    path = tmp_path / "invalid-request-number-contract.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    engine = create_engine(_database_url(path))
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        operations = Operations(context)
        with operations.batch_alter_table("recruitment_demands") as batch_op:
            batch_op.alter_column("request_no", nullable=True)
        connection.execute(
            text("UPDATE recruitment_demands SET request_no = NULL WHERE id = 10")
        )
    engine.dispose()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert (
        "nullable_column:recruitment_demands.request_no"
        in report["schema_errors"]
    )
    assert report["request_no_issues"] == [
        {
            "demand_id": 10,
            "request_no": None,
            "issue": "null",
        }
    ]


def test_verify_rejects_cross_org_default_and_only_warns_for_inactive(tmp_path):
    path = tmp_path / "default-interviewer-data-verification.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN")
    connection.executemany(
        "INSERT INTO users "
        "(id, org_id, name, email, role, password_hash, is_active) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (3, 2, "Foreign", "foreign@example.test", "interviewer", "x", 1),
            (4, 1, "Inactive", "inactive@example.test", "interviewer", "x", 0),
        ],
    )
    connection.execute(
        "UPDATE recruitment_demands SET default_interviewer_id = 3 WHERE id = 10"
    )
    connection.commit()
    connection.close()

    verify = _load_script("verify_demand_scope")
    cross_org = verify.verify_database(_database_url(path))
    assert cross_org["default_interviewer_mismatches"] == [
        {
            "demand_id": 10,
            "default_interviewer_id": 3,
            "issues": ["org_mismatch"],
        }
    ]

    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE recruitment_demands SET default_interviewer_id = 4 WHERE id = 10"
    )
    connection.commit()
    connection.close()
    inactive = verify.verify_database(_database_url(path))

    assert inactive["default_interviewer_mismatches"] == []
    assert inactive["default_interviewer_warnings"] == [
        {
            "demand_id": 10,
            "default_interviewer_id": 4,
            "warnings": ["inactive"],
        }
    ]


def test_verify_reports_assignment_primary_slot_invariant_violations(tmp_path):
    path = tmp_path / "cancelled-primary-slot.db"
    _create_legacy_database(path, scenario="one", all_facts=True)
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE interview_assignments "
        "SET status = ' Cancelled ', is_primary = 1, primary_slot = 1 WHERE id = 1"
    )
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(
        _database_url(path)
    )

    assert report["ok"] is False
    assert report["assignment_slot_conflicts"] == [
        {
            "assignment_id": 1,
            "status": " Cancelled ",
            "is_primary": True,
            "round_sequence": 1,
            "primary_slot": 1,
            "expected_primary_slot": None,
        }
    ]

    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE interview_assignments "
        "SET demand_id = 10, status = 'scheduled', is_primary = 1, "
        "round_sequence = 2, primary_slot = NULL "
        "WHERE id = 1"
    )
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(_database_url(path))

    assert report["assignment_slot_conflicts"][0]["expected_primary_slot"] == 2


def test_backfill_rejects_a_job_owned_by_another_organization(tmp_path):
    path = tmp_path / "cross-org-job.db"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (2, 2, 'Other org job', 'JD', 2, 'active', '2026-01-01')"
    )
    connection.execute(
        "INSERT INTO recruitment_demands "
        "(id, org_id, job_id, owner_hr_id, request_no, priority, headcount, status, created_at, updated_at) "
        "VALUES (20, 1, 2, 1, 'REQ-CROSS-ORG', 'B', 1, 'active', '2026-01-01', '2026-01-01')"
    )
    connection.execute("UPDATE pipeline_stages SET job_id = 2 WHERE id = 1")
    connection.commit()
    connection.close()

    manifest = {
        "schema_version": 1,
        "mappings": [
            {
                "table": "pipeline_stages",
                "record_id": 1,
                "demand_id": 20,
                "basis": "must not cross organization boundaries",
                "approved": True,
            }
        ],
    }
    backfill = _load_script("backfill_demand_scope")

    with pytest.raises(backfill.DemandScopeBackfillError, match="job org_id"):
        backfill.backfill_database(_database_url(path), manifest, apply=True)

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT demand_id FROM pipeline_stages WHERE id = 1"
    ).fetchone()[0] is None
    connection.close()


def test_verify_blocks_cross_org_demand_flow_even_when_pointer_matches(tmp_path):
    path = tmp_path / "cross-org-flow.db"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (2, 2, 'Other org job', 'JD', 2, 'active', '2026-01-01')"
    )
    connection.execute(
        "INSERT INTO recruitment_demands "
        "(id, org_id, job_id, owner_hr_id, request_no, priority, headcount, status, created_at, updated_at) "
        "VALUES (20, 2, 2, 2, 'REQ-OTHER', 'B', 1, 'active', '2026-01-01', '2026-01-01')"
    )
    connection.execute("UPDATE pipeline_stages SET demand_id = 10 WHERE id = 1")
    connection.execute(
        "INSERT INTO candidate_demand_flows "
        "(org_id, candidate_id, demand_id, owner_hr_id, status, started_at, created_at, updated_at) "
        "VALUES (1, 1, 20, 1, 'active', '2026-01-15', '2026-01-15', '2026-01-15')"
    )
    connection.execute("UPDATE candidates SET current_demand_id = 20 WHERE id = 1")
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(_database_url(path))

    assert report["ok"] is False
    assert any(
        "demand_org_mismatch" in item["issues"]
        for item in report["flow_mismatches"]
    )


def test_verify_blocks_demand_pointing_to_cross_org_job_without_facts(tmp_path):
    path = tmp_path / "cross-org-demand.db"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "INSERT INTO jobs (id, org_id, title, jd_text, owner_hr_id, status, created_at) "
        "VALUES (2, 2, 'Other org job', 'JD', 2, 'active', '2026-01-01')"
    )
    connection.execute(
        "INSERT INTO recruitment_demands "
        "(id, org_id, job_id, owner_hr_id, request_no, priority, headcount, status, created_at, updated_at) "
        "VALUES (20, 1, 2, 1, 'REQ-BAD-JOB', 'B', 1, 'active', '2026-01-01', '2026-01-01')"
    )
    connection.execute("UPDATE pipeline_stages SET demand_id = 10 WHERE id = 1")
    connection.execute(
        "INSERT INTO candidate_demand_flows "
        "(org_id, candidate_id, demand_id, owner_hr_id, status, started_at, created_at, updated_at) "
        "VALUES (1, 1, 10, 1, 'active', '2026-01-15', '2026-01-15', '2026-01-15')"
    )
    connection.execute("UPDATE candidates SET current_demand_id = 10 WHERE id = 1")
    connection.commit()
    connection.close()

    report = _load_script("verify_demand_scope").verify_database(_database_url(path))

    assert report["ok"] is False
    assert any(
        "job_org_mismatch" in item["issues"]
        for item in report["demand_mismatches"]
    )


def test_backfill_cli_accepts_explicit_dry_run_flag(tmp_path):
    path = tmp_path / "explicit-dry-run.db"
    mapping_path = tmp_path / "mapping.json"
    _create_legacy_database(path, scenario="one")
    _upgrade(path)
    url = _database_url(path)
    audit = _load_script("audit_demand_scope")
    mapping_path.write_text(
        json.dumps(
            audit.build_mapping_manifest(
                audit.audit_database(url), categories=("A",), approved=True
            )
        ),
        encoding="utf-8",
    )

    result = _load_script("backfill_demand_scope").main(
        [
            "--database",
            url,
            "--mapping",
            str(mapping_path),
            "--dry-run",
        ]
    )

    assert result == 0
    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT demand_id FROM pipeline_stages WHERE id = 1"
    ).fetchone()[0] is None
    connection.close()
