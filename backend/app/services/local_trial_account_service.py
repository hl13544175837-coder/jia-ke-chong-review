"""Local-only helpers for preserving trial role accounts without reseeding."""

import bcrypt

from .. import db
from ..models import User


LOCAL_INTERVIEWER_EMAIL = "interviewer02@mvp.local"
LOCAL_DIRECTOR_EMAIL = "director01@mvp.local"


def _database_dialect_name():
    return db.engine.dialect.name


def ensure_local_interviewer02(*, apply=False):
    """Preview or create interviewer02 in SQLite without touching existing users."""
    if _database_dialect_name() != "sqlite":
        raise RuntimeError("只允许本地 SQLite 执行试用账号同步")

    existing = User.query.filter_by(email=LOCAL_INTERVIEWER_EMAIL).one_or_none()
    if existing is not None:
        if existing.role != "interviewer" or not existing.is_active:
            raise RuntimeError(
                "面试官02已存在但角色或启用状态不正确，请人工核对"
            )
        return {
            "action": "unchanged",
            "email": LOCAL_INTERVIEWER_EMAIL,
        }

    if not apply:
        return {
            "action": "create",
            "email": LOCAL_INTERVIEWER_EMAIL,
        }

    password_hash = bcrypt.hashpw(
        b"Zhipin2026",
        bcrypt.gensalt(),
    ).decode()
    db.session.add(
        User(
            org_id=1,
            name="面试官02",
            email=LOCAL_INTERVIEWER_EMAIL,
            role="interviewer",
            department="业务部门",
            password_hash=password_hash,
            is_active=True,
        )
    )
    db.session.commit()
    return {
        "action": "created",
        "email": LOCAL_INTERVIEWER_EMAIL,
    }


def ensure_local_director01(*, apply=False):
    """Preview or create the local HR director without touching other data."""

    if _database_dialect_name() != "sqlite":
        raise RuntimeError("只允许本地 SQLite 执行试用账号同步")

    existing = User.query.filter_by(email=LOCAL_DIRECTOR_EMAIL).one_or_none()
    if existing is not None:
        if existing.role != "hr_director" or not existing.is_active:
            raise RuntimeError(
                "总监01已存在但角色或启用状态不正确，请人工核对"
            )
        return {
            "action": "unchanged",
            "email": LOCAL_DIRECTOR_EMAIL,
        }

    if not apply:
        return {
            "action": "create",
            "email": LOCAL_DIRECTOR_EMAIL,
        }

    password_hash = bcrypt.hashpw(
        b"Zhipin2026",
        bcrypt.gensalt(),
    ).decode()
    db.session.add(
        User(
            org_id=1,
            name="人力资源总监01",
            email=LOCAL_DIRECTOR_EMAIL,
            role="hr_director",
            department="人力资源部",
            password_hash=password_hash,
            is_active=True,
        )
    )
    db.session.commit()
    return {
        "action": "created",
        "email": LOCAL_DIRECTOR_EMAIL,
    }
