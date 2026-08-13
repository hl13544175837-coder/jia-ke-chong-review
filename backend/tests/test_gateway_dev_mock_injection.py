from app import db
from app.models import User


def test_dev_gateway_account_prefix_treats_like_wildcards_as_literal_text(
    app,
    client,
    make_user,
):
    make_user("literal_percent@example.com", name="百分号账号")
    make_user("ordinary@example.com", name="普通账号")

    response = client.post(
        "/pgs/oauth/login",
        json={"account": "%", "password": "unused-in-dev-mock"},
    )

    assert response.status_code == 200
    assert response.get_json()["succ"] is False
    with app.app_context():
        assert db.session.query(User).count() == 2
