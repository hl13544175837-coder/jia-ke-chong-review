from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app import db
from app import models as _models  # noqa: F401
from app.models import OnlineResume


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _config(db_path):
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def test_offer_lifecycle_migration_preserves_existing_offer_rows(tmp_path):
    db_path = tmp_path / "offer-lifecycle.db"
    engine = create_engine(f"sqlite:///{db_path}")
    db.metadata.create_all(bind=engine)
    OnlineResume.__table__.drop(bind=engine)
    config = _config(db_path)
    command.stamp(config, "20260721_05")

    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO offer_records "
                "(id, org_id, candidate_id, job_id, demand_id, salary_range, "
                "approval_status, version, created_at, updated_at) "
                "VALUES (1, 1, 1, 1, 1, '30-35K', 'draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
    engine.dispose()

    command.downgrade(config, "20260711_04")
    engine = create_engine(f"sqlite:///{db_path}")
    assert "offer_events" not in inspect(engine).get_table_names()
    old_columns = {item["name"] for item in inspect(engine).get_columns("offer_records")}
    assert "submitted_at" not in old_columns
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT salary_range FROM offer_records WHERE id = 1")
        ).scalar_one() == "30-35K"
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{db_path}")
    assert "offer_events" in inspect(engine).get_table_names()
    columns = {item["name"] for item in inspect(engine).get_columns("offer_records")}
    assert {
        "submitted_at",
        "candidate_reply",
        "version",
        "oa_instance_no",
        "oa_status",
        "oa_note",
        "oa_updated_at",
    }.issubset(columns)
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT salary_range FROM offer_records WHERE id = 1")
        ).scalar_one() == "30-35K"
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260807_16"
        assert connection.execute(
            text("SELECT oa_status FROM offer_records WHERE id = 1")
        ).scalar_one() == "not_started"
    engine.dispose()


def test_offer_oa_registration_migration_downgrades_without_losing_legacy_fields(tmp_path):
    db_path = tmp_path / "offer-oa-registration.db"
    engine = create_engine(f"sqlite:///{db_path}")
    db.metadata.create_all(bind=engine)
    engine.dispose()
    config = _config(db_path)
    command.stamp(config, "20260730_13")
    command.upgrade(config, "20260804_14")
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        connection.execute(text("UPDATE offer_records SET oa_status = 'approved' WHERE 1 = 0"))
    engine.dispose()

    command.downgrade(config, "20260730_13")
    engine = create_engine(f"sqlite:///{db_path}")
    columns = {item["name"] for item in inspect(engine).get_columns("offer_records")}
    assert "oa_status" not in columns
    assert {"approval_status", "salary_range", "version"}.issubset(columns)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20260730_13"
    engine.dispose()
