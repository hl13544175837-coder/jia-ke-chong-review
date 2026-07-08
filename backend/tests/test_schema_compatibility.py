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
