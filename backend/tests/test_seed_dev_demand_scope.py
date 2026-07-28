import os
import sqlite3
import subprocess
import sys
import json
from pathlib import Path

from scripts.bootstrap_database import bootstrap_database


BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_SCRIPT = BACKEND_DIR / "seed_dev.py"
INTERVIEW_DEMO_SCRIPT = BACKEND_DIR / "scripts" / "add_interview_demo_data.py"


def _run_seed(database_url):
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "FLASK_DEBUG": "true",
            "LOCAL_SCHEMA_COMPAT": "false",
        }
    )
    return subprocess.run(
        [sys.executable, str(SEED_SCRIPT)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _run_interview_demo_sync(database_url):
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": database_url,
            "FLASK_DEBUG": "true",
            "LOCAL_SCHEMA_COMPAT": "false",
        }
    )
    return subprocess.run(
        [sys.executable, str(INTERVIEW_DEMO_SCRIPT)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_interview_demo_sync_is_idempotent_and_covers_every_action(tmp_path):
    db_path = tmp_path / "interview-demo.db"
    database_url = f"sqlite:///{db_path}"
    bootstrap_database(database_url, allow_empty=True)
    seed_result = _run_seed(database_url)
    assert seed_result.returncode == 0, seed_result.stdout + seed_result.stderr

    for _ in range(2):
        sync_result = _run_interview_demo_sync(database_url)
        assert sync_result.returncode == 0, sync_result.stdout + sync_result.stderr

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            "SELECT candidate.name_masked, assignment.status, assignment.scheduled_at, "
            "feedback.id AS feedback_id "
            "FROM candidates AS candidate "
            "LEFT JOIN interview_assignments AS assignment "
            "ON assignment.candidate_id = candidate.id AND assignment.is_primary = 1 "
            "LEFT JOIN interview_feedback AS feedback ON feedback.assignment_id = assignment.id "
            "WHERE candidate.name_masked LIKE '面试演示-%' "
            "ORDER BY candidate.name_masked"
        ).fetchall()
        assert len(rows) == 5
        by_name = {row["name_masked"]: row for row in rows}
        assert by_name["面试演示-待安排"]["status"] is None
        assert by_name["面试演示-可改期"]["status"] == "scheduled"
        assert by_name["面试演示-待确认"]["status"] == "scheduled"
        assert by_name["面试演示-待反馈"]["status"] == "awaiting_feedback"
        assert by_name["面试演示-已完成"]["status"] == "feedback_submitted"
        assert by_name["面试演示-已完成"]["feedback_id"] is not None

        now = connection.execute("SELECT CURRENT_TIMESTAMP").fetchone()[0]
        assert by_name["面试演示-可改期"]["scheduled_at"] > now
        assert by_name["面试演示-待确认"]["scheduled_at"] <= now
        assert by_name["面试演示-待反馈"]["scheduled_at"] <= now
    finally:
        connection.close()


def test_seed_dev_creates_demand_scoped_acceptance_data_on_bootstrapped_head(tmp_path):
    db_path = tmp_path / "seed-demand-scope.db"
    database_url = f"sqlite:///{db_path}"
    bootstrap_database(database_url, allow_empty=True)

    for _ in range(2):
        result = _run_seed(database_url)
        assert result.returncode == 0, result.stdout + result.stderr

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
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

        hr01_interview_statuses = {
            row[0]
            for row in connection.execute(
                "SELECT DISTINCT assignment.status "
                "FROM interview_assignments AS assignment "
                "JOIN recruitment_demands AS demand ON demand.id = assignment.demand_id "
                "JOIN users AS owner ON owner.id = demand.owner_hr_id "
                "WHERE owner.email = 'hr01@mvp.local' "
                "AND assignment.is_primary = 1 "
                "AND assignment.status IN ('scheduled', 'awaiting_feedback', 'feedback_submitted')"
            ).fetchall()
        }
        assert hr01_interview_statuses == {
            "scheduled",
            "awaiting_feedback",
            "feedback_submitted",
        }

        scheduled_scenarios = connection.execute(
            "SELECT candidate.name_masked, assignment.scheduled_at "
            "FROM interview_assignments AS assignment "
            "JOIN candidates AS candidate ON candidate.id = assignment.candidate_id "
            "JOIN recruitment_demands AS demand ON demand.id = assignment.demand_id "
            "JOIN users AS owner ON owner.id = demand.owner_hr_id "
            "WHERE owner.email = 'hr01@mvp.local' "
            "AND assignment.is_primary = 1 "
            "AND assignment.status = 'scheduled' "
            "AND candidate.name_masked LIKE '验收候选人-%'"
        ).fetchall()
        assert {row["name_masked"] for row in scheduled_scenarios} >= {
            "验收候选人-已安排",
            "验收候选人-待确认",
        }
        now = connection.execute("SELECT CURRENT_TIMESTAMP").fetchone()[0]
        assert any(row["scheduled_at"] > now for row in scheduled_scenarios)
        assert any(row["scheduled_at"] <= now for row in scheduled_scenarios)

        hr01_unassigned_interviews = connection.execute(
            "SELECT COUNT(*) "
            "FROM candidate_demand_flows AS flow "
            "JOIN recruitment_demands AS demand ON demand.id = flow.demand_id "
            "JOIN users AS owner ON owner.id = demand.owner_hr_id "
            "JOIN pipeline_stages AS stage ON stage.id = ("
            "SELECT MAX(latest.id) FROM pipeline_stages AS latest "
            "WHERE latest.candidate_id = flow.candidate_id "
            "AND latest.demand_id = flow.demand_id"
            ") "
            "LEFT JOIN interview_assignments AS assignment "
            "ON assignment.candidate_id = flow.candidate_id "
            "AND assignment.demand_id = flow.demand_id "
            "AND assignment.is_primary = 1 "
            "AND assignment.status NOT IN ('cancelled', 'canceled') "
            "WHERE owner.email = 'hr01@mvp.local' "
            "AND flow.status = 'active' "
            "AND stage.stage = 'interview' "
            "AND assignment.id IS NULL"
        ).fetchone()[0]
        assert hr01_unassigned_interviews >= 1

        hr01_completed_feedback = connection.execute(
            "SELECT COUNT(*) "
            "FROM interview_feedback AS feedback "
            "JOIN interview_assignments AS assignment ON assignment.id = feedback.assignment_id "
            "JOIN recruitment_demands AS demand ON demand.id = assignment.demand_id "
            "JOIN users AS owner ON owner.id = demand.owner_hr_id "
            "WHERE owner.email = 'hr01@mvp.local' "
            "AND assignment.status = 'feedback_submitted'"
        ).fetchone()[0]
        assert hr01_completed_feedback >= 1

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

        offers = connection.execute(
            "SELECT offer.id, offer.org_id, offer.job_id, offer.demand_id, "
            "offer.candidate_id, offer.approval_status, offer.submitted_at, "
            "offer.approved_at, offer.sent_at, offer.responded_at, "
            "offer.onboarded_at, offer.candidate_reply, offer.approver_id, "
            "offer.created_by "
            "FROM offer_records AS offer "
            "JOIN recruitment_demands AS demand ON demand.id = offer.demand_id "
            "JOIN candidates AS candidate ON candidate.id = offer.candidate_id "
            "JOIN candidate_demand_flows AS flow "
            "ON flow.candidate_id = offer.candidate_id "
            "AND flow.demand_id = offer.demand_id "
            "WHERE offer.org_id = demand.org_id "
            "AND offer.org_id = candidate.org_id "
            "AND offer.org_id = flow.org_id "
            "AND offer.job_id = demand.job_id "
            "ORDER BY offer.id"
        ).fetchall()
        assert len(offers) == 5
        assert [row["approval_status"] for row in offers].count("draft") == 1
        # The lifecycle persistence value for the pending-approval UI state is
        # `pending`; changing it would bypass the real Offer state machine.
        assert [row["approval_status"] for row in offers].count("pending") == 1
        assert [row["approval_status"] for row in offers].count("onboarded") == 3
        assert len({(row["org_id"], row["demand_id"], row["candidate_id"]) for row in offers}) == len(offers)

        draft_offer = next(row for row in offers if row["approval_status"] == "draft")
        assert draft_offer["approver_id"] is None

        pending_offer = next(row for row in offers if row["approval_status"] == "pending")
        assert pending_offer["submitted_at"] is not None

        onboarded_offers = [row for row in offers if row["approval_status"] == "onboarded"]
        assert len(onboarded_offers) == 3
        for offer in [pending_offer, *onboarded_offers]:
            approver = connection.execute(
                "SELECT org_id, role FROM users WHERE id = ?", (offer["approver_id"],)
            ).fetchone()
            assert approver is not None
            assert approver["org_id"] == offer["org_id"]
            assert approver["role"] in {"manager", "admin"}

        for offer in onboarded_offers:
            assert all(
                offer[column] is not None
                for column in (
                    "submitted_at",
                    "approved_at",
                    "sent_at",
                    "responded_at",
                    "onboarded_at",
                )
            )
            assert json.loads(offer["candidate_reply"])["answer"] == "accepted"
            lifecycle = connection.execute(
                "SELECT event.action, event.from_status, event.to_status, "
                "event.actor_id, actor.org_id AS actor_org_id, actor.role AS actor_role "
                "FROM offer_events AS event "
                "LEFT JOIN users AS actor ON actor.id = event.actor_id "
                "WHERE event.offer_id = ? AND event.org_id = ? ORDER BY event.id",
                (offer["id"], offer["org_id"]),
            ).fetchall()
            assert [(event["action"], event["to_status"]) for event in lifecycle] == [
                ("saved", "draft"),
                ("submitted", "pending"),
                ("approved", "approved"),
                ("sent", "sent"),
                ("accepted", "accepted"),
                ("onboarded", "onboarded"),
            ]
            assert lifecycle[0]["from_status"] == "draft"
            assert lifecycle[0]["to_status"] == "draft"
            submitted = next(event for event in lifecycle if event["action"] == "submitted")
            approved = next(event for event in lifecycle if event["action"] == "approved")
            assert submitted["actor_id"] == offer["created_by"]
            assert approved["actor_id"] == offer["approver_id"]
            assert approved["actor_role"] in {"manager", "admin"}
            for event in lifecycle:
                assert event["actor_id"] is not None
                assert event["actor_org_id"] == offer["org_id"]

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
