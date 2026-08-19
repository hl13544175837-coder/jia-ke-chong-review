from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app import db
from app import models as _models  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]
PREVIOUS_REVISION = "20260811_18"


def _config(path):
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    return config


def test_account_label_migration_marks_demo_accounts_without_touching_other_users(tmp_path):
    path = tmp_path / "account-labels.db"
    engine = create_engine(f"sqlite:///{path}")
    db.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, org_id, name, email, role, department, password_hash, is_active, token_version) "
                "VALUES "
                "(4, 1, '招聘专员01', 'hr01@mvp.local', 'recruiter', '', 'x', 1, 0), "
                "(5, 1, '招聘专员02', 'hr02@mvp.local', 'recruiter', '', 'x', 1, 0), "
                "(6, 1, '招聘专员03', 'hr03@mvp.local', 'recruiter', '', 'x', 1, 0), "
                "(7, 1, '面试官01', 'interviewer01@mvp.local', 'interviewer', '', 'x', 1, 0), "
                "(8, 1, '面试官02', 'interviewer02@mvp.local', 'interviewer', '', 'x', 1, 0), "
                "(9, 1, '真实同事', 'employee@example.com', 'recruiter', '', 'x', 1, 0)"
            )
        )
    engine.dispose()

    config = _config(path)
    command.stamp(config, PREVIOUS_REVISION)
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{path}")
    with engine.connect() as connection:
        labels = dict(
            connection.execute(
                text("SELECT email, name FROM users ORDER BY id")
            ).all()
        )
    engine.dispose()

    assert labels == {
        "hr01@mvp.local": "演示账号·招聘专员01",
        "hr02@mvp.local": "演示账号·招聘专员02",
        "hr03@mvp.local": "演示账号·招聘专员03",
        "interviewer01@mvp.local": "演示账号·面试官01",
        "interviewer02@mvp.local": "演示账号·面试官02",
        "employee@example.com": "真实同事",
    }
