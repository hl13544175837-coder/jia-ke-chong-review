import json
import sqlite3

from sqlalchemy import inspect

from app import create_app, db
from app.config import TestingConfig
from app.models import UploadBatch


def test_create_app_backfills_legacy_upload_batch_columns(tmp_path):
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE upload_batches (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            source_channel VARCHAR(120)
        )
        """
    )
    connection.commit()
    connection.close()

    class LegacyUploadBatchConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"

    app = create_app(LegacyUploadBatchConfig)

    with app.app_context():
        columns = {column["name"] for column in inspect(db.engine).get_columns("upload_batches")}

    expected_columns = {column.name for column in UploadBatch.__table__.columns}
    assert expected_columns.issubset(columns)


def test_create_app_backfills_legacy_feedback_org_after_demand_expand(tmp_path):
    db_path = tmp_path / "legacy_feedback.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE interview_feedback (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            demand_id INTEGER,
            assignment_id INTEGER,
            round VARCHAR(30) NOT NULL,
            interviewer_id INTEGER NOT NULL,
            score INTEGER,
            passed BOOLEAN,
            strengths TEXT,
            concerns TEXT,
            reason_tags JSON,
            evaluation_json JSON,
            note TEXT,
            created_at DATETIME
        )
        """
    )
    connection.execute(
        """
        INSERT INTO interview_feedback (
            id, candidate_id, job_id, round, interviewer_id, reason_tags
        ) VALUES (1, 1, 1, 'interview_first', 1, '["岗位画像变化"]')
        """
    )
    connection.commit()
    connection.close()

    class LegacyFeedbackConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"

    app = create_app(LegacyFeedbackConfig)

    with app.app_context():
        columns = {column["name"] for column in inspect(db.engine).get_columns("interview_feedback")}
        row = db.session.execute(db.text("SELECT org_id, reason_tags FROM interview_feedback WHERE id = 1")).one()

    assert "org_id" in columns
    assert row.org_id == 1
    tags = json.loads(row.reason_tags)
    assert "岗位要求变化" in tags
    assert "岗位画像变化" not in tags


def test_fresh_schema_contains_demand_scope_expand_columns(app):
    expected_columns = {
        "pipeline_stages": {"demand_id"},
        "interviews": {"demand_id"},
        "interview_assignments": {"demand_id", "round_sequence", "is_primary"},
        "interview_feedback": {"demand_id", "assignment_id"},
        "offer_records": {"demand_id"},
        "candidate_dispositions": {"demand_id"},
        "events": {"demand_id"},
        "notifications": {"demand_id"},
        "upload_batches": {"demand_id"},
    }

    with app.app_context():
        inspector = inspect(db.engine)
        assert "candidate_demand_flows" in inspector.get_table_names()
        for table_name, required in expected_columns.items():
            actual = {column["name"] for column in inspector.get_columns(table_name)}
            assert required.issubset(actual), table_name
