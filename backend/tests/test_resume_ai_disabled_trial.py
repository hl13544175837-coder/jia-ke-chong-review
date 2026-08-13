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


def test_trial_upload_with_target_demand_enters_pipeline_when_ai_is_disabled(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("manual-resume-demand@example.com", role="recruiter")
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        job = Job(org_id=1, owner_hr_id=owner_id, title="人工补录岗位", jd_text="x")
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-MANUAL-RESUME",
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={
            "files": (io.BytesIO(b"%PDF-1.4 manual demand"), "manual-demand.pdf"),
            "target_demand_id": str(demand_id),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "needs_confirmation"
    assert result["target_demand_id"] == demand_id
    assert result["pipeline_joined"] is False
    assert result["pipeline_pending_confirmation"] is True
    candidate_id = result["candidate_id"]
    before_confirmation = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(token),
    ).get_json()
    assert all(
        item["candidate_id"] != candidate_id
        for item in before_confirmation["candidates"]
    )

    confirmed = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(token),
        json={"profile": {"name": "人工补录候选人", "summary": "已确认原件"}},
    )
    assert confirmed.status_code == 200
    assert confirmed.get_json()["pipeline_joined"] is True
    assert confirmed.get_json()["pipeline_stage"] == "pending"
    board = client.get(
        f"/api/pipeline/demands/{demand_id}/board",
        headers=_auth(token),
    ).get_json()
    row = next(
        item
        for item in board["candidates"]
        if item["candidate_id"] == candidate_id
    )
    assert row["stage"] == "pending"
