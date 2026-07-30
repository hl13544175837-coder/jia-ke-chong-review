import io
from pathlib import Path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_trial_upload_keeps_original_and_skips_model_when_resume_ai_is_disabled(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("manual-resume-trial@example.com", role="recruiter")
    app.config.update(
        RESUME_AI_ENABLED=False,
        UPLOAD_FOLDER=str(tmp_path),
    )

    def model_must_not_run(*args, **kwargs):
        raise AssertionError("resume parser must not run in the small-team Test environment")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        model_must_not_run,
    )

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 manual trial"), "manual-trial.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "needs_confirmation"
    assert result["reason"] == (
        "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。"
    )
    assert result["parse_error"] == result["reason"]

    with app.app_context():
        from app.models import Candidate, Event

        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.parse_status == "failed"
        assert candidate.parse_error == result["reason"]
        assert Path(candidate.raw_file_path).read_bytes() == b"%PDF-1.4 manual trial"
        event = Event.query.filter_by(
            action="resume.parse_skipped",
            entity_id=candidate.id,
        ).one()
        assert event.payload["reason"] == "resume_ai_disabled"


def test_trial_retry_does_not_call_model_when_resume_ai_is_disabled(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("manual-resume-retry@example.com", role="recruiter")
    app.config.update(
        RESUME_AI_ENABLED=False,
        UPLOAD_FOLDER=str(tmp_path),
    )

    upload = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 no retry"), "no-retry.pdf")},
        content_type="multipart/form-data",
    )
    candidate_id = upload.get_json()["results"][0]["candidate_id"]

    def model_must_not_run(*args, **kwargs):
        raise AssertionError("retry parser must not run when resume AI is disabled")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.reparse_candidate",
        model_must_not_run,
    )

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )

    assert response.status_code == 409
    body = response.get_json()
    assert body["code"] == "resume_ai_disabled"
    assert body["error"] == (
        "当前测试环境未启用模型解析，原始简历已保留，请手动补录基础信息。"
    )
