import pytest
from pathlib import Path

from app import db
from app.models import User


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _account_service():
    try:
        from app.services import local_trial_account_service
    except ModuleNotFoundError:
        pytest.fail("local_trial_account_service 尚未实现")
    return local_trial_account_service


def test_local_account_sync_is_dry_run_and_idempotent(app):
    service = _account_service()
    with app.app_context():
        assert User.query.filter_by(
            email="interviewer02@mvp.local"
        ).one_or_none() is None

        preview = service.ensure_local_interviewer02(apply=False)

        assert preview == {
            "action": "create",
            "email": "interviewer02@mvp.local",
        }
        assert User.query.filter_by(
            email="interviewer02@mvp.local"
        ).one_or_none() is None

        created = service.ensure_local_interviewer02(apply=True)

        assert created == {
            "action": "created",
            "email": "interviewer02@mvp.local",
        }
        user = User.query.filter_by(email="interviewer02@mvp.local").one()
        assert user.name == "演示账号·面试官02"
        assert user.role == "interviewer"
        assert user.department == "业务部门"
        assert user.is_active is True

        repeated = service.ensure_local_interviewer02(apply=True)

        assert repeated == {
            "action": "unchanged",
            "email": "interviewer02@mvp.local",
        }
        assert User.query.filter_by(
            email="interviewer02@mvp.local"
        ).count() == 1


def test_local_director_account_sync_is_dry_run_and_idempotent(app):
    service = _account_service()
    with app.app_context():
        preview = service.ensure_local_director01(apply=False)
        assert preview == {"action": "create", "email": "director01@mvp.local"}
        assert User.query.filter_by(email="director01@mvp.local").one_or_none() is None

        created = service.ensure_local_director01(apply=True)
        assert created == {"action": "created", "email": "director01@mvp.local"}
        user = User.query.filter_by(email="director01@mvp.local").one()
        assert user.name == "人力资源总监01"
        assert user.role == "hr_director"
        assert user.department == "人力资源部"
        assert user.is_active is True

        repeated = service.ensure_local_director01(apply=True)
        assert repeated == {"action": "unchanged", "email": "director01@mvp.local"}
        assert User.query.filter_by(email="director01@mvp.local").count() == 1


def test_local_account_sync_refuses_non_sqlite(app, monkeypatch):
    service = _account_service()
    with app.app_context():
        monkeypatch.setattr(
            service,
            "_database_dialect_name",
            lambda: "mysql",
        )

        with pytest.raises(RuntimeError, match="只允许本地 SQLite"):
            service.ensure_local_interviewer02(apply=True)

        with pytest.raises(RuntimeError, match="只允许本地 SQLite"):
            service.ensure_local_director01(apply=True)


def test_local_account_sync_refuses_to_repair_conflicting_account(
    app,
    make_user,
):
    service = _account_service()
    make_user(
        "interviewer02@mvp.local",
        role="recruiter",
        name="冲突账号",
    )

    with app.app_context():
        with pytest.raises(RuntimeError, match="角色或启用状态不正确"):
            service.ensure_local_interviewer02(apply=True)

        stored = User.query.filter_by(email="interviewer02@mvp.local").one()
        assert stored.name == "冲突账号"
        assert stored.role == "recruiter"


def test_local_account_cli_is_preview_only_without_apply_flag():
    script_path = BACKEND_DIR / "scripts" / "ensure_local_trial_accounts.py"
    assert script_path.exists(), "本地账号同步命令尚未实现"

    source = script_path.read_text(encoding="utf-8")
    assert 'parser.add_argument("--apply", action="store_true")' in source
    assert "ensure_local_interviewer02(apply=args.apply)" in source
    assert "ensure_local_director01(apply=args.apply)" in source
