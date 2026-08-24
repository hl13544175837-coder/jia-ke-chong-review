from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app import db
from app import models as _models  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_online_resume_migration_creates_independent_library(tmp_path):
    db_path = tmp_path / "online-resume.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    engine = create_engine(f"sqlite:///{db_path}")
    db.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS online_resumes"))
    engine.dispose()
    command.stamp(config, "20260806_15")
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("online_resumes")}
    assert {
        "id",
        "org_id",
        "owner_hr_id",
        "demand_id",
        "boss_account",
        "source_platform",
        "external_record_id",
        "display_name",
        "resume_json",
        "chat_json",
        "source_url",
        "created_at",
        "updated_at",
    }.issubset(columns)
    unique_names = {
        item["name"] for item in inspector.get_unique_constraints("online_resumes")
    }
    assert "uq_online_resume_owner_external" in unique_names
    with engine.connect() as connection:
        assert (
            connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            == "20260824_19"
        )
    engine.dispose()
