import re
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError

from app import db
from app.models import Job, RecruitmentDemand


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
REQUEST_NO_UNIQUE_INDEX = "uq_recruitment_demands_org_request_no"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_job(app, owner_id, *, org_id=1):
    with app.app_context():
        job = Job(
            org_id=org_id,
            title=f"编号测试岗位-{org_id}",
            city="上海",
            department="研发部",
            jd_text="测试 JD",
            owner_hr_id=owner_id,
            status="active",
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def _payload(job_id, owner_id, request_no=..., **overrides):
    payload = {
        "job_id": job_id,
        "owner_hr_id": owner_id,
        "requester_department": "研发部",
        "city": "上海",
        "hiring_manager_name": "用人负责人",
        "requested_at": "2026-07-11",
        "target_date": "2026-08-11",
        "headcount": 1,
        "status": "active",
    }
    if request_no is not ...:
        payload["request_no"] = request_no
    payload.update(overrides)
    return payload


def test_generated_request_no_has_sixteen_character_random_suffix(
    client, make_user, app
):
    owner_id, token = make_user("generated-no-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands", headers=_auth(token), json=_payload(job_id, owner_id)
    )

    assert response.status_code == 201
    assert re.fullmatch(
        r"REQ-\d{8}-[0-9A-F]{16}", response.get_json()["request_no"]
    )


def test_manual_request_no_is_trimmed_and_uppercased(client, make_user, app):
    owner_id, token = make_user("normalized-no-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "  req-case-01  "),
    )

    assert response.status_code == 201
    assert response.get_json()["request_no"] == "REQ-CASE-01"


def test_same_org_normalized_request_no_conflict_is_stable(
    client, make_user, app
):
    owner_id, token = make_user("same-org-no-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    first = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "  req-duplicate  "),
    )
    second = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "REQ-DUPLICATE"),
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.get_json() == {
        "error": "需求编号已存在",
        "code": "request_no_conflict",
        "fields": {"request_no": "需求编号已存在"},
    }
    with app.app_context():
        assert RecruitmentDemand.query.count() == 1


def test_different_orgs_may_use_the_same_request_no(client, make_user, app):
    first_owner_id, first_token = make_user(
        "cross-org-no-first@example.com", role="recruiter", org_id=1
    )
    second_owner_id, second_token = make_user(
        "cross-org-no-second@example.com", role="recruiter", org_id=2
    )
    first_job_id = _make_job(app, first_owner_id, org_id=1)
    second_job_id = _make_job(app, second_owner_id, org_id=2)

    first = client.post(
        "/api/demands",
        headers=_auth(first_token),
        json=_payload(first_job_id, first_owner_id, "REQ-CROSS-ORG"),
    )
    second = client.post(
        "/api/demands",
        headers=_auth(second_token),
        json=_payload(second_job_id, second_owner_id, "req-cross-org"),
    )

    assert first.status_code == second.status_code == 201
    assert first.get_json()["request_no"] == second.get_json()["request_no"]
    with app.app_context():
        assert RecruitmentDemand.query.count() == 2


def test_database_rejects_direct_duplicate_request_no(make_user, app):
    owner_id, _ = make_user("direct-duplicate-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    with app.app_context():
        db.session.add_all(
            [
                RecruitmentDemand(
                    org_id=1,
                    job_id=job_id,
                    owner_hr_id=owner_id,
                    request_no="REQ-DIRECT-DUPLICATE",
                ),
                RecruitmentDemand(
                    org_id=1,
                    job_id=job_id,
                    owner_hr_id=owner_id,
                    request_no="REQ-DIRECT-DUPLICATE",
                ),
            ]
        )
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_patch_normalizes_request_no_and_returns_same_conflict_contract(
    client, make_user, app
):
    owner_id, token = make_user("patch-no-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)
    first = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "REQ-PATCH-FIRST"),
    )
    second = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "REQ-PATCH-SECOND"),
    )

    normalized = client.patch(
        f"/api/demands/{second.get_json()['id']}",
        headers=_auth(token),
        json={"request_no": "  req-patch-renamed  "},
    )
    assert normalized.status_code == 200
    assert normalized.get_json()["request_no"] == "REQ-PATCH-RENAMED"

    conflict = client.patch(
        f"/api/demands/{second.get_json()['id']}",
        headers=_auth(token),
        json={"request_no": "  req-patch-first  "},
    )
    assert first.status_code == second.status_code == 201
    assert conflict.status_code == 409
    assert conflict.get_json()["code"] == "request_no_conflict"
    assert conflict.get_json()["fields"]["request_no"] == "需求编号已存在"


def _named_conflict_error():
    return IntegrityError(
        "INSERT INTO recruitment_demands ...",
        {},
        RuntimeError(
            "Duplicate entry for key 'uq_recruitment_demands_org_request_no'"
        ),
    )


def test_database_race_maps_named_request_no_violation_to_stable_conflict(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("race-no-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    def raise_named_conflict():
        raise _named_conflict_error()

    monkeypatch.setattr(db.session, "commit", raise_named_conflict)
    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "REQ-RACE-CONFLICT"),
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "request_no_conflict"


def test_database_race_during_flush_maps_to_stable_conflict(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("flush-race-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    def raise_named_conflict():
        raise _named_conflict_error()

    monkeypatch.setattr(db.session, "flush", raise_named_conflict)
    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_payload(job_id, owner_id, "REQ-FLUSH-RACE-CONFLICT"),
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "request_no_conflict"


def test_unrelated_integrity_error_is_not_mislabeled(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("other-integrity-owner@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)
    unrelated = IntegrityError(
        "INSERT INTO recruitment_demands ...",
        {},
        RuntimeError("foreign key constraint failed"),
    )

    def raise_unrelated_error():
        raise unrelated

    monkeypatch.setattr(db.session, "commit", raise_unrelated_error)
    with pytest.raises(IntegrityError) as captured:
        client.post(
            "/api/demands",
            headers=_auth(token),
            json=_payload(job_id, owner_id, "REQ-OTHER-INTEGRITY"),
        )
    assert captured.value is unrelated


def _create_revision_02_database(path, rows, *, nullable_org_id=False):
    connection = sqlite3.connect(path)
    org_nullability = "" if nullable_org_id else "NOT NULL"
    connection.executescript(
        f"""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            org_id INTEGER NOT NULL
        );
        CREATE TABLE recruitment_demands (
            id INTEGER PRIMARY KEY,
            org_id INTEGER {org_nullability},
            request_no VARCHAR(80)
        );
        CREATE TABLE alembic_version (
            version_num VARCHAR(32) NOT NULL
        );
        INSERT INTO alembic_version (version_num) VALUES ('20260711_02');
        """
    )
    connection.executemany(
        "INSERT INTO recruitment_demands (id, org_id, request_no) VALUES (?, ?, ?)",
        rows,
    )
    connection.commit()
    connection.close()


def test_request_no_migration_backfills_normalizes_and_adds_unique_index(tmp_path):
    path = tmp_path / "request-no-upgrade.db"
    _create_revision_02_database(
        path,
        [
            (1, 1, None),
            (2, 1, "   "),
            (3, 1, "  req-history  "),
            (4, 2, "req-history"),
        ],
    )
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    command.upgrade(config, "head")

    connection = sqlite3.connect(path)
    assert connection.execute(
        "SELECT id, request_no FROM recruitment_demands ORDER BY id"
    ).fetchall() == [
        (1, "LEGACY-DEMAND-1"),
        (2, "LEGACY-DEMAND-2"),
        (3, "REQ-HISTORY"),
        (4, "REQ-HISTORY"),
    ]
    assert connection.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()[0] == "20260711_04"
    connection.close()

    engine = create_engine(f"sqlite:///{path}")
    inspector = inspect(engine)
    columns = {
        column["name"]: column
        for column in inspector.get_columns("recruitment_demands")
    }
    indexes = {
        index["name"]: index
        for index in inspector.get_indexes("recruitment_demands")
    }
    assert columns["request_no"]["nullable"] is False
    assert bool(indexes[REQUEST_NO_UNIQUE_INDEX]["unique"])
    engine.dispose()


def test_request_no_migration_fails_closed_on_normalized_same_org_duplicates(
    tmp_path,
):
    path = tmp_path / "request-no-duplicate.db"
    _create_revision_02_database(
        path,
        [
            (1, 1, " req-duplicate "),
            (2, 1, "REQ-DUPLICATE"),
        ],
    )
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    with pytest.raises(RuntimeError, match="normalized duplicate request numbers"):
        command.upgrade(config, "head")


def test_request_no_migration_fails_closed_on_null_org_id(tmp_path):
    path = tmp_path / "request-no-null-org.db"
    _create_revision_02_database(
        path,
        [(1, None, "REQ-NULL-ORG")],
        nullable_org_id=True,
    )
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    with pytest.raises(RuntimeError, match="NULL org_id"):
        command.upgrade(config, "head")


def test_request_no_migration_rejects_wrong_same_name_index(tmp_path):
    path = tmp_path / "request-no-wrong-index.db"
    _create_revision_02_database(
        path,
        [(1, 1, "REQ-WRONG-INDEX")],
    )
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    command.upgrade(config, "20260711_03")
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE INDEX uq_recruitment_demands_org_request_no "
        "ON recruitment_demands (request_no)"
    )
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match="index definition mismatch"):
        command.upgrade(config, "head")
