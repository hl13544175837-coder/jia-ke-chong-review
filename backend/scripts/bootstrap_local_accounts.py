"""为受控本地 Docker 环境准备招聘专员与面试官账号。"""

import json
import os

import bcrypt

from app import create_app, db
from app.models import User


def _password_hash(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _upsert_user(*, email, name, role, password):
    user = User.query.filter_by(email=email).first()
    if user is None:
        user = User(org_id=1, email=email)
        db.session.add(user)
    user.name = name
    user.role = role
    user.is_active = True
    user.password_hash = _password_hash(password)
    return user


def main():
    if os.environ.get("LOCAL_DEMO_BOOTSTRAP", "false").lower() != "true":
        raise RuntimeError("仅允许在显式启用的本地演示环境准备账号")
    if os.environ.get("ALLOW_INSECURE_SIT_STARTUP", "false").lower() != "true":
        raise RuntimeError("本地账号准备需要受控测试环境标记")

    password = os.environ.get("LOCAL_DEMO_PASSWORD", "")
    if len(password) < 10:
        raise RuntimeError("LOCAL_DEMO_PASSWORD 至少需要 10 个字符")
    accounts = (
        {
            "email": os.environ.get("LOCAL_HR_EMAIL", "hr.local@example.test"),
            "name": "本地招聘专员",
            "role": "recruiter",
        },
        {
            "email": os.environ.get(
                "LOCAL_INTERVIEWER_EMAIL",
                "interviewer.local@example.test",
            ),
            "name": "本地面试官",
            "role": "interviewer",
        },
    )
    app = create_app()
    with app.app_context():
        for account in accounts:
            _upsert_user(password=password, **account)
        db.session.commit()
    print(json.dumps({"accounts": accounts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
