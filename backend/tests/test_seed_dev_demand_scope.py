import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from scripts.bootstrap_database import bootstrap_database


BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_SCRIPT = BACKEND_DIR / "seed_dev.py"


def test_seed_dev_creates_demand_scoped_acceptance_data_on_bootstrapped_head(tmp_path):
    db_path = tmp_path / "seed-demand-scope.db"
    database_url = f"sqlite:///{db_path}"
    bootstrap_database(database_url, allow_empty=True)

    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "FLASK_DEBUG": "true",
            "LOCAL_SCHEMA_COMPAT": "false",
        }
    )
    result = subprocess.run(
        [sys.executable, str(SEED_SCRIPT)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    connection = sqlite3.connect(db_path)
    try:
        demands = connection.execute(
            "SELECT id, org_id, job_id, owner_hr_id, status "
            "FROM recruitment_demands ORDER BY id"
        ).fetchall()
        assert len(demands) >= 2
        assert {row[1] for row in demands} == {1}
        assert {row[4] for row in demands} == {"active"}

        flow_count = connection.execute(
            "SELECT COUNT(*) FROM candidate_demand_flows AS flow "
            "JOIN candidates AS candidate ON candidate.id = flow.candidate_id "
            "JOIN recruitment_demands AS demand ON demand.id = flow.demand_id "
            "WHERE flow.status = 'active' "
            "AND flow.org_id = candidate.org_id "
            "AND flow.org_id = demand.org_id "
            "AND candidate.current_demand_id = flow.demand_id"
        ).fetchone()[0]
        assert flow_count >= 4

        assigned_to_interviewer = connection.execute(
            "SELECT COUNT(*) FROM interview_assignments AS assignment "
            "JOIN users AS interviewer ON interviewer.id = assignment.interviewer_id "
            "JOIN recruitment_demands AS demand ON demand.id = assignment.demand_id "
            "WHERE interviewer.email = 'interviewer01@mvp.local' "
            "AND assignment.status = 'scheduled' "
            "AND assignment.org_id = demand.org_id "
            "AND assignment.job_id = demand.job_id"
        ).fetchone()[0]
        assert assigned_to_interviewer >= 1

        visible_offers = connection.execute(
            "SELECT COUNT(*) FROM offer_records AS offer "
            "JOIN recruitment_demands AS demand ON demand.id = offer.demand_id "
            "JOIN candidate_demand_flows AS flow "
            "ON flow.candidate_id = offer.candidate_id "
            "AND flow.demand_id = offer.demand_id "
            "WHERE offer.org_id = demand.org_id "
            "AND offer.job_id = demand.job_id"
        ).fetchone()[0]
        assert visible_offers >= 1

        null_or_mismatched_pipeline_rows = connection.execute(
            "SELECT COUNT(*) FROM pipeline_stages AS stage "
            "LEFT JOIN recruitment_demands AS demand ON demand.id = stage.demand_id "
            "WHERE stage.demand_id IS NULL "
            "OR demand.id IS NULL "
            "OR stage.org_id != demand.org_id "
            "OR stage.job_id != demand.job_id"
        ).fetchone()[0]
        assert null_or_mismatched_pipeline_rows == 0
    finally:
        connection.close()
