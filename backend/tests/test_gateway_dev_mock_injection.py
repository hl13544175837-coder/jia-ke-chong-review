from app import create_app, db
from app.config import TestingConfig
from app.models import User


class _DebugGatewayTestingConfig(TestingConfig):
    FLASK_DEBUG = True


def test_dev_gateway_account_prefix_treats_like_wildcards_as_literal_text(
):
    app = create_app(_DebugGatewayTestingConfig)
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(
                    email="literal_percent@example.com",
                    name="百分号账号",
                    role="recruiter",
                    password_hash="unused",
                ),
                User(
                    email="ordinary@example.com",
                    name="普通账号",
                    role="recruiter",
                    password_hash="unused",
                ),
            ]
        )
        db.session.commit()

    response = app.test_client().post(
        "/pgs/oauth/login",
        json={"account": "%", "password": "unused-in-dev-mock"},
    )

    assert response.status_code == 200
    assert response.get_json()["succ"] is False
    with app.app_context():
        assert db.session.query(User).count() == 2
        db.session.remove()
        db.drop_all()
        db.engine.dispose()
