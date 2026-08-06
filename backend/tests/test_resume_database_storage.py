import io
from pathlib import Path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _upload_resume(client, token, content=b"%PDF-1.4 database original"):
    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(content), "数据库原简历.pdf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    return response.get_json()["results"][0]["candidate_id"]


def test_original_resume_remains_available_when_pod_file_is_gone(
    client, make_user, app
):
    _owner_id, token = make_user(
        "resume-database-original@example.com",
        role="recruiter",
    )
    content = b"%PDF-1.4 database original"
    candidate_id = _upload_resume(client, token, content)

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = db.session.get(Candidate, candidate_id)
        Path(candidate.raw_file_path).unlink()
        assert candidate.raw_file_data == content
        assert candidate.raw_file_name.endswith(".pdf")

    detail = client.get(
        f"/api/resume/{candidate_id}",
        headers=_auth(token),
    )
    assert detail.status_code == 200
    assert detail.get_json()["original_resume"]["available"] is True

    preview = client.get(
        f"/api/resume/{candidate_id}/original/preview",
        headers=_auth(token),
    )
    assert preview.status_code == 200
    assert preview.data == content
    assert preview.mimetype == "application/pdf"


def test_new_pod_can_parse_pending_resume_from_database(
    client, make_user, app, monkeypatch
):
    _owner_id, token = make_user(
        "resume-database-worker@example.com",
        role="recruiter",
    )
    app.config["RESUME_PARSE_ASYNC_ENABLED"] = True
    content = b"%PDF-1.4 survives pod replacement"
    monkeypatch.setenv("HOSTNAME", "old-pod")
    candidate_id = _upload_resume(client, token, content)

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = db.session.get(Candidate, candidate_id)
        Path(candidate.raw_file_path).unlink()

    class Parser:
        def parse_resume(self, file_path):
            assert Path(file_path).read_bytes() == content
            return {
                "extracted_info": {"name": "跨 Pod 解析成功"},
                "skills": [],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())
    monkeypatch.setenv("HOSTNAME", "new-pod")

    from app.services.resume_parse_worker import process_next_pending

    assert process_next_pending(app) is True

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = db.session.get(Candidate, candidate_id)
        assert candidate.parse_status == "ok"
        assert candidate.name_masked == "跨 Pod 解析成功"
        assert candidate.raw_file_data == content
