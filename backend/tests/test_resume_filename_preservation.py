import io
import zipfile
from pathlib import Path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _candidate(app, candidate_id):
    with app.app_context():
        from app import db
        from app.models import Candidate

        return db.session.get(Candidate, candidate_id)


def test_plain_chinese_pdf_upload_preserves_extension_and_original(
    client, make_user, app, tmp_path
):
    _, token = make_user("chinese-upload@example.com", role="recruiter")
    app.config.update(
        RESUME_PARSE_ASYNC_ENABLED=True,
        UPLOAD_FOLDER=str(tmp_path),
    )

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 chinese filename"), "向桂华简历.pdf")},
        content_type="multipart/form-data",
    )

    result = response.get_json()["results"][0]
    candidate = _candidate(app, result["candidate_id"])
    assert Path(candidate.raw_file_path).suffix == ".pdf"

    detail = client.get(
        f"/api/resume/{candidate.id}", headers=_auth(token)
    ).get_json()
    assert detail["original_resume"]["available"] is True


def test_chinese_pdf_inside_zip_preserves_extension_and_original(
    client, make_user, app, tmp_path
):
    _, token = make_user("chinese-zip@example.com", role="recruiter")
    app.config.update(
        RESUME_PARSE_ASYNC_ENABLED=True,
        UPLOAD_FOLDER=str(tmp_path),
    )
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("向桂华简历.pdf", b"%PDF-1.4 zipped chinese filename")
    archive.seek(0)

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (archive, "中文简历包.zip")},
        content_type="multipart/form-data",
    )

    result = response.get_json()["results"][0]
    candidate = _candidate(app, result["candidate_id"])
    assert Path(candidate.raw_file_path).suffix == ".pdf"

    detail = client.get(
        f"/api/resume/{candidate.id}", headers=_auth(token)
    ).get_json()
    assert detail["original_resume"]["available"] is True


def test_chinese_replacement_filename_preserves_extension_and_original(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("chinese-replace@example.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    old_file = tmp_path / "old.pdf"
    old_file.write_bytes(b"%PDF-1.4 old")

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="待更换候选人",
            resume_json={},
            raw_file_path=str(old_file),
            parse_status="failed",
            parse_error="旧解析失败",
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    class Parser:
        def parse_resume(self, file_path):
            return {"extracted_info": {"name": "向桂华"}, "skills": []}

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    response = client.post(
        f"/api/resume/{candidate_id}/replace",
        headers=_auth(token),
        data={"file": (io.BytesIO(b"%PDF-1.4 replacement"), "向桂华简历.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    candidate = _candidate(app, candidate_id)
    assert Path(candidate.raw_file_path).suffix == ".pdf"
    assert response.get_json()["original_resume"]["available"] is True
