from app import db
from app.models import User
from app.services.gateway_role_service import (
    parse_gateway_role_map,
    resolve_gateway_role,
)


def test_gateway_role_map_is_case_insensitive_and_rejects_unknown_roles():
    assert parse_gateway_role_map(
        "EMP001:admin, emp002:interviewer, EMP003:unknown, broken"
    ) == {
        "EMP001": "admin",
        "EMP002": "interviewer",
    }


def test_gateway_role_resolution_uses_least_privilege_fallback():
    raw = "EMP001:manager,EMP002:hr_director"

    assert resolve_gateway_role("emp001", raw) == ("manager", True)
    assert resolve_gateway_role("not-mapped", raw) == ("recruiter", False)
    assert resolve_gateway_role("not-mapped", raw, fallback="interviewer") == (
        "interviewer",
        False,
    )
    assert resolve_gateway_role("not-mapped", raw, fallback="owner") == (
        "recruiter",
        False,
    )


def test_gateway_request_creates_and_synchronizes_explicitly_mapped_user(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP="EMP001:interviewer",
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "emp001"})
    assert response.status_code == 200

    with app.app_context():
        user = User.query.filter_by(email="emp001@gateway.local").one()
        assert user.role == "interviewer"
        user.role = "admin"
        db.session.commit()

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "EMP001"})
    assert response.status_code == 200
    with app.app_context():
        assert User.query.filter_by(email="emp001@gateway.local").one().role == "interviewer"


def test_unmapped_gateway_user_defaults_to_recruiter(app, client):
    app.config.update(
        AUTH_DISABLED=True,
        ALLOW_INSECURE_SIT_STARTUP=True,
        AUTH_GATEWAY_ROLE_MAP="EMP001:admin",
        AUTH_GATEWAY_USER_ROLE="recruiter",
    )

    response = client.get("/api/auth/me", headers={"X-Emp-Code": "EMP999"})

    assert response.status_code == 200
    with app.app_context():
        user = User.query.filter_by(email="emp999@gateway.local").one()
        assert user.role == "recruiter"
