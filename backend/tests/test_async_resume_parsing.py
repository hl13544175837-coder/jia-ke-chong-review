import io
from pathlib import Path


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_async_upload_returns_pending_candidate_without_waiting_for_model(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("async-resume-owner@example.com", role="recruiter")
    app.config["RESUME_PARSE_ASYNC_ENABLED"] = True
    parser_called = False

    def unexpected_sync_parse(self, file_path, owner_hr_id, upload_batch_id=None):
        nonlocal parser_called
        parser_called = True
        raise AssertionError("上传请求不应同步等待模型")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        unexpected_sync_parse,
    )

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 async resume"), "async.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "processing"
    assert result["reason"] == "文件已入库，AI 正在后台解析"
    assert parser_called is False

    with app.app_context():
        from app.models import Candidate

        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.id == result["candidate_id"]
        assert candidate.parse_status == "pending"
        assert candidate.raw_file_path
        assert candidate.resume_sha256

    detail = client.get(
        f"/api/resume/{result['candidate_id']}", headers=_auth(token)
    ).get_json()
    assert detail["parse_error"] is None
    listed = client.get("/api/candidates", headers=_auth(token)).get_json()
    assert listed[0]["parse_error"] is None


def test_background_worker_claims_pending_candidate_and_saves_model_result(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("async-resume-worker@example.com", role="recruiter")
    app.config["RESUME_PARSE_ASYNC_ENABLED"] = True

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 queued resume"), "queued.pdf")},
        content_type="multipart/form-data",
    )
    candidate_id = response.get_json()["results"][0]["candidate_id"]

    class Parser:
        def parse_resume(self, file_path):
            return {
                "extracted_info": {
                    "name": "后台解析候选人",
                    "email": "queued@example.com",
                    "phone": "13800138009",
                },
                "skills": [{"skill_name": "Python", "score": 5}],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    from app.services.resume_parse_worker import process_next_pending

    assert process_next_pending(app) is True

    with app.app_context():
        from app.models import Candidate

        candidate = Candidate.query.filter_by(id=candidate_id, owner_hr_id=owner_id).one()
        assert candidate.parse_status == "ok"
        assert candidate.name_masked == "后台解析候选人"
        assert candidate.parse_error is None
        assert [tag.tag for tag in candidate.tags] == ["Python"]


def test_async_retry_requeues_failed_candidate_without_waiting_for_model(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("async-resume-retry@example.com", role="recruiter")
    app.config["RESUME_PARSE_ASYNC_ENABLED"] = True
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    resume = Path(tmp_path) / "retry.pdf"
    resume.write_bytes(b"%PDF-1.4 retry async")

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="待重试候选人",
            resume_json={},
            raw_file_path=str(resume),
            parse_status="failed",
            parse_error="旧模型错误",
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    def unexpected_sync_retry(self, candidate):
        raise AssertionError("重试请求不应同步等待模型")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.reparse_candidate",
        unexpected_sync_retry,
    )

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )

    assert response.status_code == 202
    body = response.get_json()
    assert body["parse_status"] == "pending"
    assert body["parse_error"] is None

    with app.app_context():
        from app import db
        from app.models import Candidate

        queued = db.session.get(Candidate, candidate_id)
        assert queued.parse_status == "pending"


def test_background_worker_recovers_stale_processing_after_pod_restart(
    make_user, app, monkeypatch
):
    owner_id, _token = make_user("async-resume-stale@example.com", role="recruiter")
    monkeypatch.setenv("HOSTNAME", "pod-stale")

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="重启恢复候选人",
            resume_json={},
            raw_file_path="/tmp/stale.pdf",
            parse_status="processing",
            parse_error="worker:pod-stale:2000-01-01T00:00:00",
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    from app.services.resume_parse_worker import recover_stale_processing

    assert recover_stale_processing(app, max_age_seconds=60) == 1

    with app.app_context():
        from app import db
        from app.models import Candidate

        recovered = db.session.get(Candidate, candidate_id)
        assert recovered.parse_status == "pending"
        assert recovered.parse_error == "queued:pod-stale"


def test_background_worker_can_claim_database_backed_file_from_a_new_pod(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("async-resume-pod@example.com", role="recruiter")
    app.config["RESUME_PARSE_ASYNC_ENABLED"] = True
    monkeypatch.setenv("HOSTNAME", "pod-a")

    response = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 pod local"), "pod.pdf")},
        content_type="multipart/form-data",
    )
    candidate_id = response.get_json()["results"][0]["candidate_id"]

    from app.services.resume_parse_worker import process_next_pending

    class Parser:
        def parse_resume(self, file_path):
            return {"extracted_info": {"name": "跨 Pod 候选人"}, "skills": []}

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())
    monkeypatch.setenv("HOSTNAME", "pod-b")
    assert process_next_pending(app) is True

    with app.app_context():
        from app import db
        from app.models import Candidate

        completed = db.session.get(Candidate, candidate_id)
        assert completed.parse_status == "ok"
        assert completed.name_masked == "跨 Pod 候选人"
