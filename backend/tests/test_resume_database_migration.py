from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _config(db_path):
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def test_resume_database_copy_migration_adds_current_and_history_columns(tmp_path):
    db_path = tmp_path / "resume-database-copy.db"
    config = _config(db_path)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE candidates (id INTEGER PRIMARY KEY, raw_file_path TEXT)"
        ))
        connection.execute(text(
            "CREATE TABLE candidate_resume_versions "
            "(id INTEGER PRIMARY KEY, raw_file_path TEXT)"
        ))
    command.stamp(config, "20260804_14")
    assert "raw_file_data" not in {
        column["name"] for column in inspect(engine).get_columns("candidates")
    }
    engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    for table_name in ("candidates", "candidate_resume_versions"):
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        assert {"raw_file_name", "raw_file_data"}.issubset(columns)
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one() == "20260824_19"
    engine.dispose()
