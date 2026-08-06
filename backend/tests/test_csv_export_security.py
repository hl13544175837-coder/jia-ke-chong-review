import csv
import io

import pytest

from app.services.csv_security import safe_csv_cell


@pytest.mark.parametrize("value", ["=1+1", "+SUM(A1:A2)", "-1+2", "@cmd"])
def test_safe_csv_cell_neutralizes_formula_markers(value):
    assert safe_csv_cell(value).startswith("'")


def test_safe_csv_cell_keeps_normal_values():
    assert safe_csv_cell("Java 工程师") == "Java 工程师"
    assert safe_csv_cell(12) == 12


def test_candidate_export_neutralizes_formula(client, make_user, app):
    owner_id, token = make_user(
        "csv-owner@example.com",
        role="recruiter",
    )
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="=1+1",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    response = client.get(
        f"/api/candidates/{candidate_id}/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    rows = list(csv.reader(io.StringIO(response.get_data(as_text=True))))
    assert rows[1][1] == "'=1+1"


def test_analytics_csv_neutralizes_formula():
    from app.services.analytics_service import analytics_csv

    payload = {
        "demands": [
            {
                "request_no": "=1+1",
                "title": "+SUM(A1:A2)",
                "department": "@cmd",
                "headcount": 1,
                "onboarded": 0,
                "in_progress": 1,
                "remaining": 0,
            }
        ]
    }
    rows = list(csv.reader(io.StringIO(analytics_csv(payload))))
    assert rows[1][:3] == ["'=1+1", "'+SUM(A1:A2)", "'@cmd"]
