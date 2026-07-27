import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.bootstrap_database import bootstrap_database


BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_SCRIPT = BACKEND_DIR / "seed_dev.py"
SCRIPT = BACKEND_DIR / "scripts" / "add_demand_demo_data.py"

EXPECTED = {
    "DEMO-DEMAND-PENDING": ("pending", "pending", "演示需求-待审核"),
    "DEMO-DEMAND-ACTIVE": ("active", "approved", "演示需求-招聘中"),
    "DEMO-DEMAND-FILLED": ("filled", "approved", "演示需求-已完成"),
    "DEMO-DEMAND-PAUSED": ("paused", "approved", "演示需求-已暂停"),
    "DEMO-DEMAND-CLOSED": ("closed", "approved", "演示需求-已关闭"),
}

EXPECTED_CANDIDATE_STAGES = {
    "DEMO-DEMAND-ACTIVE": ("需求演示-招聘中候选人", "business_review"),
    "DEMO-DEMAND-FILLED": ("需求演示-已完成候选人", "onboarded"),
    "DEMO-DEMAND-CLOSED": ("需求演示-已关闭候选人", "interview"),
}

EXPECTED_FLOW_STATE = {
    "DEMO-DEMAND-ACTIVE": ("active", False, True),
    "DEMO-DEMAND-FILLED": ("completed", True, False),
    "DEMO-DEMAND-CLOSED": ("completed", True, False),
}

ACTIVE_DEMO_STAGE_NOTE = "演示招聘中需求：可选候选人并查看招聘阶段。"
USER_STAGE_NOTE = "用户手动推进的普通阶段历史"


def load_demo_module():
    spec = importlib.util.spec_from_file_location("add_demand_demo_data", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_script(script, database_url):
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "FLASK_DEBUG": "true",
            "LOCAL_SCHEMA_COMPAT": "false",
            "DEMAND_DEMO_TEST_PASSWORD": "unit-secret-password",
        }
    )
    return subprocess.run(
        [sys.executable, str(script)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def preload_collision_rows(db_path):
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        base = connection.execute(
            "SELECT job_id FROM recruitment_demands "
            "WHERE org_id = 1 AND request_no = 'DEMO-2026-001'"
        ).fetchone()
        recruiter = connection.execute(
            "SELECT id FROM users WHERE org_id = 1 AND email = 'hr01@mvp.local'"
        ).fetchone()
        assert base is not None
        assert recruiter is not None

        for request_no in EXPECTED:
            connection.execute(
                "INSERT INTO recruitment_demands ("
                "org_id, job_id, request_no, job_title_snapshot, headcount, priority, "
                "status, approval_status, note"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    2,
                    base["job_id"],
                    request_no,
                    "组织2不可修改",
                    99,
                    "C",
                    "closed",
                    "rejected",
                    "cross-org-sentinel",
                ),
            )

        ordinary = connection.execute(
            "INSERT INTO candidates ("
            "org_id, owner_hr_id, name_masked, resume_json, parse_status"
            ") VALUES (?, ?, ?, ?, ?) RETURNING id",
            (
                1,
                recruiter["id"],
                "需求演示-招聘中候选人",
                json.dumps({"source": "ordinary-same-name"}, ensure_ascii=False),
                "ok",
            ),
        ).fetchone()
        connection.commit()
        return ordinary["id"]
    finally:
        connection.close()


def append_user_stage_history(db_path):
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        context = connection.execute(
            "SELECT demand.org_id, demand.id AS demand_id, demand.job_id, "
            "flow.candidate_id, demand.owner_hr_id "
            "FROM recruitment_demands AS demand "
            "JOIN candidate_demand_flows AS flow "
            "ON flow.org_id = demand.org_id AND flow.demand_id = demand.id "
            "WHERE demand.org_id = 1 "
            "AND demand.request_no = 'DEMO-DEMAND-ACTIVE'"
        ).fetchone()
        assert context is not None
        connection.execute(
            "INSERT INTO pipeline_stages ("
            "org_id, candidate_id, job_id, demand_id, stage, updated_by, note"
            ") VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                context["org_id"],
                context["candidate_id"],
                context["job_id"],
                context["demand_id"],
                "interview",
                context["owner_hr_id"],
                USER_STAGE_NOTE,
            ),
        )
        connection.commit()
    finally:
        connection.close()


def test_demand_demo_rejects_non_sqlite_before_writing():
    module = load_demo_module()

    with pytest.raises(RuntimeError, match="只允许写入本地 SQLite"):
        module.require_local_sqlite("mysql+pymysql://user:secret@example/db")


def test_demand_demo_is_idempotent_and_covers_five_scenarios(tmp_path):
    db_path = tmp_path / "demand-demo.db"
    database_url = f"sqlite:///{db_path}"
    bootstrap_database(database_url, allow_empty=True)

    seed_result = run_script(SEED_SCRIPT, database_url)
    assert seed_result.returncode == 0, seed_result.stdout + seed_result.stderr
    ordinary_candidate_id = preload_collision_rows(db_path)

    first_result = run_script(SCRIPT, database_url)
    assert first_result.returncode == 0, first_result.stdout + first_result.stderr
    append_user_stage_history(db_path)

    second_result = run_script(SCRIPT, database_url)
    assert second_result.returncode == 0, second_result.stdout + second_result.stderr
    outputs = [
        first_result.stdout + first_result.stderr,
        second_result.stdout + second_result.stderr,
    ]

    combined_output = "\n".join(outputs)
    assert database_url not in combined_output
    assert "unit-secret-password" not in combined_output

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            "SELECT demand.id, demand.request_no, demand.job_title_snapshot, demand.headcount, "
            "demand.status, "
            "demand.approval_status, demand.submitted_at, demand.closed_at, "
            "demand.closed_by, "
            "owner.email AS owner_email, creator.email AS creator_email "
            "FROM recruitment_demands AS demand "
            "LEFT JOIN users AS owner ON owner.id = demand.owner_hr_id "
            "LEFT JOIN users AS creator ON creator.id = demand.created_by "
            "WHERE demand.org_id = 1 AND demand.request_no LIKE 'DEMO-DEMAND-%' "
            "ORDER BY demand.request_no"
        ).fetchall()

        assert len(rows) == len(EXPECTED)
        assert {
            row["request_no"]: (
                row["status"],
                row["approval_status"],
                row["job_title_snapshot"],
            )
            for row in rows
        } == EXPECTED
        assert {row["owner_email"] for row in rows} == {"hr01@mvp.local"}

        by_request_no = {row["request_no"]: row for row in rows}
        pending = by_request_no["DEMO-DEMAND-PENDING"]
        assert pending["submitted_at"] is not None
        assert pending["creator_email"] == "interviewer01@mvp.local"
        assert by_request_no["DEMO-DEMAND-FILLED"]["headcount"] == 1
        cross_org_rows = connection.execute(
            "SELECT request_no, job_title_snapshot, headcount, priority, status, "
            "approval_status, note FROM recruitment_demands "
            "WHERE org_id = 2 AND request_no LIKE 'DEMO-DEMAND-%' "
            "ORDER BY request_no"
        ).fetchall()
        assert len(cross_org_rows) == len(EXPECTED)
        assert {
            row["request_no"]: (
                row["job_title_snapshot"],
                row["headcount"],
                row["priority"],
                row["status"],
                row["approval_status"],
                row["note"],
            )
            for row in cross_org_rows
        } == {
            request_no: (
                "组织2不可修改",
                99,
                "C",
                "closed",
                "rejected",
                "cross-org-sentinel",
            )
            for request_no in EXPECTED
        }

        ordinary = connection.execute(
            "SELECT resume_json, current_demand_id FROM candidates WHERE id = ?",
            (ordinary_candidate_id,),
        ).fetchall()
        assert len(ordinary) == 1
        assert json.loads(ordinary[0]["resume_json"]) == {
            "source": "ordinary-same-name"
        }
        assert ordinary[0]["current_demand_id"] is None
        assert connection.execute(
            "SELECT COUNT(*) FROM candidate_demand_flows WHERE candidate_id = ?",
            (ordinary_candidate_id,),
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM pipeline_stages WHERE candidate_id = ?",
            (ordinary_candidate_id,),
        ).fetchone()[0] == 0

        candidate_rows = connection.execute(
            "SELECT id, name_masked, resume_json, current_demand_id "
            "FROM candidates WHERE org_id = 1"
        ).fetchall()
        demo_candidates = {}
        for candidate in candidate_rows:
            resume_json = json.loads(candidate["resume_json"])
            demo_key = resume_json.get("demo_key")
            if demo_key in EXPECTED_CANDIDATE_STAGES:
                assert demo_key not in demo_candidates
                demo_candidates[demo_key] = candidate

        assert set(demo_candidates) == set(EXPECTED_CANDIDATE_STAGES)

        for request_no, (expected_name, expected_stage) in EXPECTED_CANDIDATE_STAGES.items():
            demand = by_request_no[request_no]
            candidate = demo_candidates[request_no]
            assert candidate["name_masked"] == expected_name

            flows = connection.execute(
                "SELECT status, ended_at FROM candidate_demand_flows "
                "WHERE org_id = 1 AND candidate_id = ? AND demand_id = ?",
                (candidate["id"], demand["id"]),
            ).fetchall()
            assert len(flows) == 1

            expected_status, should_have_ended, should_be_current = EXPECTED_FLOW_STATE[
                request_no
            ]
            assert flows[0]["status"] == expected_status
            assert (flows[0]["ended_at"] is not None) is should_have_ended
            assert (candidate["current_demand_id"] == demand["id"]) is should_be_current

            stages = connection.execute(
                "SELECT stage, note FROM pipeline_stages "
                "WHERE org_id = 1 AND candidate_id = ? AND demand_id = ? "
                "ORDER BY ts DESC, id DESC",
                (candidate["id"], demand["id"]),
            ).fetchall()
            script_stages = [
                stage
                for stage in stages
                if stage["note"] == (
                    ACTIVE_DEMO_STAGE_NOTE
                    if request_no == "DEMO-DEMAND-ACTIVE"
                    else {
                        "DEMO-DEMAND-FILLED": (
                            "演示已完成需求：可查看候选人与完成状态。"
                        ),
                        "DEMO-DEMAND-CLOSED": (
                            "演示关闭需求：可查看候选人或恢复招聘。"
                        ),
                    }[request_no]
                )
            ]
            assert len(script_stages) == 1
            assert script_stages[0]["stage"] == expected_stage

        active_demand = by_request_no["DEMO-DEMAND-ACTIVE"]
        active_candidate = demo_candidates["DEMO-DEMAND-ACTIVE"]
        active_stage_history = connection.execute(
            "SELECT stage, note FROM pipeline_stages "
            "WHERE org_id = 1 AND candidate_id = ? AND demand_id = ? "
            "ORDER BY id",
            (active_candidate["id"], active_demand["id"]),
        ).fetchall()
        assert sum(
            row["note"] == ACTIVE_DEMO_STAGE_NOTE for row in active_stage_history
        ) == 1
        assert sum(row["note"] == USER_STAGE_NOTE for row in active_stage_history) == 1
        assert any(
            row["stage"] == "interview" and row["note"] == USER_STAGE_NOTE
            for row in active_stage_history
        )

        paused = by_request_no["DEMO-DEMAND-PAUSED"]
        closed = by_request_no["DEMO-DEMAND-CLOSED"]
        assert paused["closed_at"] is None
        assert paused["closed_by"] is None
        assert closed["closed_at"] is not None
        assert closed["closed_by"] is not None

    finally:
        connection.close()
