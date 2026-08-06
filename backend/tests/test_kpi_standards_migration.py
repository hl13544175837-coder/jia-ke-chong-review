from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app import db
from app import models as _models  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _config(path):
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    return config


def test_kpi_standards_migration_round_trip(tmp_path):
    path = tmp_path / "kpi-standards.db"
    engine = create_engine(f"sqlite:///{path}")
    db.metadata.create_all(bind=engine)
    engine.dispose()
    config = _config(path)
    command.stamp(config, "20260721_06")

    command.downgrade(config, "20260721_05")
    engine = create_engine(f"sqlite:///{path}")
    assert "kpi_standards" not in inspect(engine).get_table_names()
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path}")
    inspector = inspect(engine)
    assert "kpi_standards" in inspector.get_table_names()
    indexes = {item["name"]: item for item in inspector.get_indexes("kpi_standards")}
    assert bool(indexes["ix_kpi_standards_org_id"]["unique"]) is True
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260806_15"
    engine.dispose()
