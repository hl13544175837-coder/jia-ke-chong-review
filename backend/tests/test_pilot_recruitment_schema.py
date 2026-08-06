from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app import db
from app.models import (
    BusinessReviewTask,
    CandidateFavorite,
    CandidateMerge,
    CandidateResumeVersion,
    InterviewFeedback,
    RecruitmentDemand,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def test_pilot_schema_contains_review_workflow(app):
    with app.app_context():
        inspector = inspect(db.engine)
        demand_columns = {
            item["name"] for item in inspector.get_columns("recruitment_demands")
        }
        feedback_columns = {
            item["name"] for item in inspector.get_columns("interview_feedback")
        }
        task_columns = {
            item["name"] for item in inspector.get_columns("business_review_tasks")
        }
        candidate_columns = {
            item["name"] for item in inspector.get_columns("candidates")
        }
        candidate_indexes = {
            item["name"]: tuple(item["column_names"])
            for item in inspector.get_indexes("candidates")
        }
        resume_version_columns = {
            item["name"] for item in inspector.get_columns("candidate_resume_versions")
        }

    assert {
        "approval_status",
        "submitted_at",
        "reviewed_by",
        "reviewed_at",
        "review_reason",
    }.issubset(demand_columns)
    assert {"updated_by", "updated_at"}.issubset(feedback_columns)
    assert {
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
    }.issubset(task_columns)
    assert RecruitmentDemand.approval_status.default is not None
    assert BusinessReviewTask.__tablename__ == "business_review_tasks"
    assert CandidateFavorite.__tablename__ == "candidate_favorites"
    assert CandidateMerge.__tablename__ == "candidate_merges"
    assert CandidateResumeVersion.__tablename__ == "candidate_resume_versions"
    assert InterviewFeedback.updated_at is not None
    assert "resume_sha256" in candidate_columns
    assert candidate_indexes["ix_candidates_org_resume_sha256"] == (
        "org_id",
        "resume_sha256",
    )
    assert {"candidate_id", "version_no", "raw_file_path", "resume_json"}.issubset(
        resume_version_columns
    )


def test_revision_11_adds_candidate_resume_fingerprint_without_backfilling_history(
    tmp_path,
):
    database_url = f"sqlite:///{tmp_path / 'candidate-resume-fingerprint.db'}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("DROP INDEX ix_candidates_org_resume_sha256"))
        connection.execute(text("ALTER TABLE candidates DROP COLUMN resume_sha256"))
    engine.dispose()

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.stamp(config, "20260728_10")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        assert "resume_sha256" in {
            item["name"] for item in inspector.get_columns("candidates")
        }
        assert {
            item["name"]: tuple(item["column_names"])
            for item in inspector.get_indexes("candidates")
        }["ix_candidates_org_resume_sha256"] == ("org_id", "resume_sha256")
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == "20260806_15"
    finally:
        engine.dispose()


def test_revision_12_adds_candidate_resume_version_history_additively(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'candidate-resume-versions.db'}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    CandidateResumeVersion.__table__.drop(bind=engine)
    engine.dispose()

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.stamp(config, "20260729_11")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        assert "candidate_resume_versions" in inspector.get_table_names()
        assert {
            "org_id",
            "candidate_id",
            "version_no",
            "resume_json",
            "raw_file_path",
            "created_by",
        }.issubset({
            item["name"]
            for item in inspector.get_columns("candidate_resume_versions")
        })
        assert "ix_candidate_resume_versions_org_candidate_created" in {
            item["name"]
            for item in inspector.get_indexes("candidate_resume_versions")
        }
        assert "uq_candidate_resume_versions_org_candidate_no" in {
            item["name"]
            for item in inspector.get_unique_constraints("candidate_resume_versions")
        }
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == "20260806_15"
    finally:
        engine.dispose()


def test_revisions_08_and_09_accept_preexisting_orm_contract(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'preexisting-contract.db'}"
    engine = create_engine(database_url)
    try:
        db.metadata.create_all(bind=engine)
    finally:
        engine.dispose()

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.stamp(config, "20260722_07")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == "20260806_15"
    finally:
        engine.dispose()


def test_revision_09_creates_candidate_talent_pool_tables(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'candidate-talent-pool.db'}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    CandidateMerge.__table__.drop(bind=engine)
    CandidateFavorite.__table__.drop(bind=engine)
    engine.dispose()

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", database_url)
    command.stamp(config, "20260724_08")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        assert {"candidate_favorites", "candidate_merges"}.issubset(
            inspector.get_table_names()
        )
        favorite_indexes = {
            item["name"] for item in inspector.get_indexes("candidate_favorites")
        }
        merge_indexes = {
            item["name"] for item in inspector.get_indexes("candidate_merges")
        }
        favorite_uniques = {
            item["name"]
            for item in inspector.get_unique_constraints("candidate_favorites")
        }
        merge_uniques = {
            item["name"]
            for item in inspector.get_unique_constraints("candidate_merges")
        }
        assert "ix_candidate_favorites_org_candidate" in favorite_indexes
        assert "ix_candidate_merges_org_primary" in merge_indexes
        assert "uq_candidate_favorites_org_user_candidate" in favorite_uniques
        assert "uq_candidate_merges_org_duplicate" in merge_uniques
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one() == "20260806_15"
    finally:
        engine.dispose()
