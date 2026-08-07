import io


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _upload(client, token, content=b"%PDF-1.4 ticket preview"):
    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(content), "票据预览.pdf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    return response.get_json()["results"][0]["candidate_id"]


def test_issue_preview_ticket_then_open_without_token(client, make_user):
    _owner_id, token = make_user("preview-ticket-owner@x.com")
    candidate_id = _upload(client, token)

    ticket_response = client.get(
        f"/api/resume/{candidate_id}/original/preview-ticket",
        headers=_auth(token),
    )

    assert ticket_response.status_code == 200
    body = ticket_response.get_json()
    assert body["ticket"]
    assert body["exp"] > 0
    assert "preview-file" in body["url"]

    preview = client.get(f"/api{body['url']}")
    assert preview.status_code == 200
    assert preview.data.startswith(b"%PDF")
    assert preview.mimetype == "application/pdf"


def test_preview_file_without_ticket_is_forbidden(client, make_user):
    _owner_id, token = make_user("preview-ticket-missing@x.com")
    candidate_id = _upload(client, token)

    response = client.get(f"/api/resume/{candidate_id}/original/preview-file")

    assert response.status_code == 403


def test_tampered_preview_ticket_is_forbidden(client, make_user):
    _owner_id, token = make_user("preview-ticket-tampered@x.com")
    candidate_id = _upload(client, token)
    ticket = client.get(
        f"/api/resume/{candidate_id}/original/preview-ticket",
        headers=_auth(token),
    ).get_json()
    url = ticket["url"]
    tampered = url[:-1] + ("0" if url[-1] != "0" else "1")

    response = client.get(f"/api{tampered}")

    assert response.status_code == 403


def test_expired_preview_ticket_is_forbidden(app, client, make_user):
    from datetime import UTC, datetime, timedelta

    from app.services.resume_preview_ticket import build_preview_ticket

    _owner_id, token = make_user("preview-ticket-expired@x.com")
    candidate_id = _upload(client, token)
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = db.session.get(Candidate, candidate_id)
        expired = int((datetime.now(UTC) - timedelta(minutes=5)).timestamp())
        ticket = build_preview_ticket(
            app.config["JWT_SECRET"],
            candidate.org_id,
            candidate.id,
            expired,
        )

    response = client.get(
        f"/api/resume/{candidate_id}/original/preview-file"
        f"?ticket={ticket}&exp={expired}"
    )

    assert response.status_code == 403


def test_preview_ticket_cannot_be_reused_for_another_candidate(app, client, make_user):
    _owner_id, token = make_user("preview-ticket-cross@x.com")
    first_id = _upload(client, token, content=b"%PDF-1.4 first ticket")
    second_id = _upload(client, token, content=b"%PDF-1.4 second ticket")
    ticket = client.get(
        f"/api/resume/{first_id}/original/preview-ticket",
        headers=_auth(token),
    ).get_json()

    response = client.get(
        f"/api/resume/{second_id}/original/preview-file"
        f"?ticket={ticket['ticket']}&exp={ticket['exp']}"
    )

    assert response.status_code == 403
