import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app import db
from app.models import Job, RecruitmentDemand


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_job(app, owner_id, *, org_id=1):
    with app.app_context():
        job = Job(
            org_id=org_id,
            title="默认面试官测试岗位",
            city="上海",
            department="研发部",
            jd_text="测试 JD",
            owner_hr_id=owner_id,
            status="active",
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def _demand_payload(job_id, owner_id, request_no, **overrides):
    payload = {
        "job_id": job_id,
        "owner_hr_id": owner_id,
        "request_no": request_no,
        "requester_department": "研发部",
        "city": "上海",
        "hiring_manager_name": "用人负责人",
        "requested_at": "2026-07-11",
        "target_date": "2026-08-11",
        "headcount": 1,
        "status": "active",
    }
    payload.update(overrides)
    return payload


def test_create_demand_without_default_interviewer_returns_null_fields(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "default-empty-owner@example.com", role="recruiter"
    )
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json=_demand_payload(job_id, owner_id, "REQ-DEFAULT-EMPTY"),
    )

    assert response.status_code == 201
    assert response.get_json()["default_interviewer_id"] is None
    assert response.get_json()["default_interviewer_name"] is None


@pytest.mark.parametrize("eligible_role", ["interviewer", "manager", "admin"])
def test_create_demand_accepts_active_eligible_default_interviewer(
    client, make_user, app, eligible_role
):
    owner_id, owner_token = make_user(
        f"default-owner-{eligible_role}@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        f"default-{eligible_role}@example.com",
        role=eligible_role,
        name=f"候选{eligible_role}",
    )
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json=_demand_payload(
            job_id,
            owner_id,
            f"REQ-DEFAULT-{eligible_role}",
            default_interviewer_id=interviewer_id,
        ),
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["default_interviewer_id"] == interviewer_id
    assert body["default_interviewer_name"] == f"候选{eligible_role}"


@pytest.mark.parametrize("invalid_case", ["recruiter", "inactive", "foreign"])
def test_create_demand_rejects_invalid_default_interviewer(
    client, make_user, app, invalid_case
):
    owner_id, owner_token = make_user(
        f"invalid-default-owner-{invalid_case}@example.com", role="recruiter"
    )
    if invalid_case == "recruiter":
        invalid_id, _ = make_user(
            "invalid-default-recruiter@example.com", role="recruiter"
        )
    elif invalid_case == "inactive":
        invalid_id, _ = make_user(
            "invalid-default-inactive@example.com",
            role="interviewer",
            is_active=False,
        )
    else:
        invalid_id, _ = make_user(
            "invalid-default-foreign@example.com",
            role="interviewer",
            org_id=2,
        )
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json=_demand_payload(
            job_id,
            owner_id,
            f"REQ-INVALID-{invalid_case}",
            default_interviewer_id=invalid_id,
        ),
    )

    assert response.status_code == 400
    body = response.get_json()
    assert body["code"] == "validation_error"
    assert "default_interviewer_id" in body["fields"]
    with app.app_context():
        assert RecruitmentDemand.query.count() == 0


def test_patch_demand_can_set_and_clear_default_interviewer(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "patch-default-owner@example.com", role="recruiter"
    )
    interviewer_id, _ = make_user(
        "patch-default-interviewer@example.com",
        role="interviewer",
        name="可选面试官",
    )
    job_id = _make_job(app, owner_id)
    created = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json=_demand_payload(job_id, owner_id, "REQ-PATCH-DEFAULT"),
    )
    demand_id = created.get_json()["id"]

    selected = client.patch(
        f"/api/demands/{demand_id}",
        headers=_auth(owner_token),
        json={"default_interviewer_id": interviewer_id},
    )
    assert selected.status_code == 200
    assert selected.get_json()["default_interviewer_id"] == interviewer_id
    assert selected.get_json()["default_interviewer_name"] == "可选面试官"

    cleared = client.patch(
        f"/api/demands/{demand_id}",
        headers=_auth(owner_token),
        json={"default_interviewer_id": None},
    )
    assert cleared.status_code == 200
    assert cleared.get_json()["default_interviewer_id"] is None
    assert cleared.get_json()["default_interviewer_name"] is None


def test_patch_demand_rejects_invalid_default_interviewer(
    client, make_user, app
):
    owner_id, owner_token = make_user(
        "patch-invalid-default-owner@example.com", role="recruiter"
    )
    invalid_id, _ = make_user(
        "patch-invalid-default-user@example.com", role="recruiter"
    )
    job_id = _make_job(app, owner_id)
    created = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json=_demand_payload(job_id, owner_id, "REQ-PATCH-INVALID-DEFAULT"),
    )

    response = client.patch(
        f"/api/demands/{created.get_json()['id']}",
        headers=_auth(owner_token),
        json={"default_interviewer_id": invalid_id},
    )

    assert response.status_code == 400
    assert "default_interviewer_id" in response.get_json()["fields"]


def test_interviewer_options_include_email(client, make_user):
    _, token = make_user("options-reader@example.com", role="recruiter")
    interviewer_id, _ = make_user(
        "wangjie@example.com", role="interviewer", name="王杰"
    )

    response = client.get("/api/interview/interviewers", headers=_auth(token))

    assert response.status_code == 200
    option = next(item for item in response.get_json() if item["id"] == interviewer_id)
    assert option == {
        "id": interviewer_id,
        "name": "王杰",
        "email": "wangjie@example.com",
        "role": "interviewer",
    }


def test_interviewer_role_cannot_enumerate_interviewer_account_emails(
    client, make_user
):
    _, token = make_user(
        "interviewer-options-reader@example.com",
        role="interviewer",
    )
    make_user(
        "manager-email-must-stay-scoped@example.com",
        role="manager",
    )

    response = client.get("/api/interview/interviewers", headers=_auth(token))

    assert response.status_code == 403


def test_model_declares_nullable_default_interviewer_fk_and_org_index():
    column = RecruitmentDemand.__table__.columns["default_interviewer_id"]
    assert column.nullable is True
    foreign_key = next(iter(column.foreign_keys))
    assert (
        foreign_key.constraint.name
        == "fk_recruitment_demands_default_interviewer_id_users"
    )
    assert foreign_key.target_fullname == "users.id"
    assert foreign_key.ondelete == "SET NULL"
    indexes = {
        index.name: tuple(item.name for item in index.columns)
        for index in RecruitmentDemand.__table__.indexes
    }
    assert indexes["ix_recruitment_demands_org_default_interviewer"] == (
        "org_id",
        "default_interviewer_id",
    )


def _create_revision_02_database(path):
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            name VARCHAR(100),
            email VARCHAR(100),
            role VARCHAR(20),
            is_active BOOLEAN
        );
        CREATE TABLE recruitment_demands (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL,
            request_no VARCHAR(80)
        );
        CREATE TABLE interview_assignments (
            id INTEGER PRIMARY KEY,
            interviewer_id INTEGER NOT NULL
        );
        CREATE TABLE alembic_version (
            version_num VARCHAR(32) NOT NULL
        );
        INSERT INTO alembic_version (version_num) VALUES ('20260711_02');
        INSERT INTO users (id, org_id, name, email, role, is_active)
        VALUES (7, 1, '历史面试官', 'legacy@example.com', 'interviewer', 1);
        INSERT INTO recruitment_demands (id, org_id, request_no)
        VALUES (10, 1, 'REQ-LEGACY');
        INSERT INTO interview_assignments (id, interviewer_id) VALUES (20, 7);
        """
    )
    connection.commit()
    connection.close()


def test_default_interviewer_migration_keeps_legacy_null_and_assignment_on_round_trip(
    tmp_path,
):
    path = tmp_path / "default-interviewer.db"
    _create_revision_02_database(path)
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    command.upgrade(config, "20260711_03")

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT default_interviewer_id FROM recruitment_demands WHERE id = 10"
    ).fetchone()[0] is None
    assert connection.execute(
        "SELECT interviewer_id FROM interview_assignments WHERE id = 20"
    ).fetchone()[0] == 7
    connection.close()

    from sqlalchemy import create_engine

    migration_engine = create_engine(f"sqlite:///{path}")
    inspector = inspect(migration_engine)
    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("recruitment_demands")
    }
    assert "default_interviewer_id" in {
        column["name"] for column in inspector.get_columns("recruitment_demands")
    }
    assert "ix_recruitment_demands_org_default_interviewer" in indexes
    migration_engine.dispose()

    command.downgrade(config, "20260711_02")
    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT interviewer_id FROM interview_assignments WHERE id = 20"
    ).fetchone()[0] == 7
    connection.close()

    migration_engine = create_engine(f"sqlite:///{path}")
    assert "default_interviewer_id" not in {
        column["name"]
        for column in inspect(migration_engine).get_columns("recruitment_demands")
    }
    migration_engine.dispose()


def test_default_interviewer_migration_repairs_a_partially_added_column(tmp_path):
    path = tmp_path / "default-interviewer-partial-column.db"
    _create_revision_02_database(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "ALTER TABLE recruitment_demands "
        "ADD COLUMN default_interviewer_id INTEGER"
    )
    connection.commit()
    connection.close()
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    command.upgrade(config, "20260711_03")

    engine = create_engine(f"sqlite:///{path}")
    foreign_keys = inspect(engine).get_foreign_keys("recruitment_demands")
    engine.dispose()
    foreign_key = next(
        item
        for item in foreign_keys
        if item["name"]
        == "fk_recruitment_demands_default_interviewer_id_users"
    )
    assert tuple(foreign_key["constrained_columns"]) == (
        "default_interviewer_id",
    )
    assert foreign_key["referred_table"] == "users"
    assert tuple(foreign_key["referred_columns"]) == ("id",)
    assert foreign_key["options"].get("ondelete", "").upper() == "SET NULL"


def test_default_interviewer_migration_rejects_wrong_same_name_index(tmp_path):
    path = tmp_path / "default-interviewer-wrong-index.db"
    _create_revision_02_database(path)
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE UNIQUE INDEX ix_recruitment_demands_org_default_interviewer "
        "ON recruitment_demands (id)"
    )
    connection.commit()
    connection.close()
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    with pytest.raises(RuntimeError, match="index definition mismatch"):
        command.upgrade(config, "20260711_03")


def test_default_interviewer_downgrade_drops_fk_before_column():
    migration_source = (
        BACKEND_DIR
        / "migrations"
        / "versions"
        / "20260711_03_demand_default_interviewer.py"
    ).read_text(encoding="utf-8")
    downgrade_source = migration_source.split("def downgrade():", 1)[1]

    assert "drop_constraint" in downgrade_source
    assert downgrade_source.index("drop_constraint") < downgrade_source.index(
        "drop_column"
    )
