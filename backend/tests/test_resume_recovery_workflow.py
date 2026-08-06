import hashlib
import io
from pathlib import Path

import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _failed_candidate(app, owner_id, raw_file, *, name="待确认简历"):
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked=name,
            resume_json={},
            raw_file_path=str(raw_file),
            resume_sha256=hashlib.sha256(raw_file.read_bytes()).hexdigest(),
            parse_status="failed",
            parse_error="AI 模型暂时无法解析",
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate.id


def test_failed_upload_becomes_actionable_confirmation_item_and_same_file_is_not_recreated(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("resume-confirm-upload@example.com", role="recruiter")
    calls = []

    def fail_parse(self, fpath, owner_hr_id, upload_batch_id=None):
        calls.append(fpath)
        raise ValueError("PDF 内容无法解析")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        fail_parse,
    )

    first = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 valid original"), "candidate.pdf")},
        content_type="multipart/form-data",
    )
    second = client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(b"%PDF-1.4 valid original"), "renamed.pdf")},
        content_type="multipart/form-data",
    )

    assert first.status_code == 202
    first_result = first.get_json()["results"][0]
    assert first_result["status"] == "needs_confirmation"
    assert first_result["candidate_id"]
    assert first_result["reason"] == "AI 未能识别该简历，请确认原文件或重新上传"

    assert second.status_code == 202
    second_result = second.get_json()["results"][0]
    assert second_result["status"] == "duplicate"
    assert second_result["existing_candidate_id"] == first_result["candidate_id"]
    assert len(calls) == 1

    with app.app_context():
        from app.models import Candidate

        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.parse_status == "failed"
        assert candidate.resume_sha256 == hashlib.sha256(b"%PDF-1.4 valid original").hexdigest()


def test_owner_can_confirm_valid_original_and_unblock_candidate_flow(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("resume-confirm-owner@example.com", role="recruiter")
    original = tmp_path / "original.pdf"
    original.write_bytes(b"%PDF-1.4 original")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    candidate_id = _failed_candidate(app, owner_id, original)

    response = client.post(
        f"/api/resume/{candidate_id}/confirm-original",
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["candidate_id"] == candidate_id
    assert body["parse_status"] == "original_confirmed"
    assert body["status_label"] == "原件有效，结构化信息待补全"

    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["parse_status"] == "original_confirmed"
    assert detail["original_resume"]["available"] is True

    with app.app_context():
        from app.models import Event

        event = Event.query.filter_by(
            action="resume.original_confirmed",
            entity_id=candidate_id,
        ).one()
        assert event.actor_id == owner_id


def test_retry_parse_returns_full_detail_needed_by_the_existing_drawer(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("resume-retry-detail@example.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    original = tmp_path / "retry-detail.pdf"
    original.write_bytes(b"%PDF-1.4 retry detail")
    candidate_id = _failed_candidate(app, owner_id, original)

    class Parser:
        def parse_resume(self, file_path):
            return {
                "extracted_info": {"name": "重试成功候选人"},
                "skills": [],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == candidate_id
    assert body["candidate_id"] == candidate_id
    assert body["parse_status"] == "ok"
    assert body["original_resume"]["available"] is True
    assert body["created_at"]


def test_retry_parse_model_failure_returns_actionable_copy_and_keeps_original(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("resume-retry-model-failure@example.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    original = tmp_path / "retry-model-failure.pdf"
    original.write_bytes(b"%PDF-1.4 retry model failure")
    candidate_id = _failed_candidate(app, owner_id, original)

    class Parser:
        def parse_resume(self, file_path):
            raise RuntimeError("HTTP 403 Model.AccessDenied")

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )

    assert response.status_code == 422
    body = response.get_json()
    assert body["error"] == "模型暂时不可用，可先手动补录；原始文件已保留。"
    assert body["code"] == "resume_parse_unavailable"
    assert body["parse_status"] == "failed"
    assert body["original_resume"]["available"] is True


def test_replacing_resume_updates_same_candidate_and_keeps_business_history(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("resume-replace-owner@example.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    old_file = tmp_path / "old.pdf"
    old_file.write_bytes(b"%PDF-1.4 old")
    candidate_id = _failed_candidate(app, owner_id, old_file)

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, RecruitmentDemand

        candidate = db.session.get(Candidate, candidate_id)
        candidate.raw_file_name = old_file.name
        candidate.raw_file_data = old_file.read_bytes()

        job = Job(org_id=1, title="后端工程师", jd_text="Python", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no="REQ-RESUME-REPLACE",
            headcount=2,
            status="active",
            approval_status="approved",
        )
        db.session.add(demand)
        db.session.flush()
        db.session.add(PipelineStage(
            org_id=1,
            candidate_id=candidate_id,
            demand_id=demand.id,
            job_id=job.id,
            stage="pending",
            updated_by=owner_id,
        ))
        db.session.commit()
        demand_id = demand.id

    class Parser:
        def parse_resume(self, file_path):
            assert Path(file_path).read_bytes() == b"%PDF-1.4 new"
            return {
                "extracted_info": {
                    "name": "新版候选人",
                    "phone": "13800138000",
                    "email": "new@example.com",
                    "target_position": "高级后端工程师",
                },
                "skills": [{"skill_name": "Python", "score": 5}],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    response = client.post(
        f"/api/resume/{candidate_id}/replace",
        headers=_auth(token),
        data={"file": (io.BytesIO(b"%PDF-1.4 new"), "new.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["candidate_id"] == candidate_id
    assert body["parse_status"] == "ok"
    assert body["name_masked"] == "新版候选人"
    assert body["replaced"] is True
    assert old_file.exists() is True

    with app.app_context():
        from app.models import Candidate, CandidateResumeVersion, PipelineStage

        candidate = app.extensions["sqlalchemy"].session.get(Candidate, candidate_id)
        assert candidate.resume_json["extracted_info"]["email"] == "new@example.com"
        assert candidate.raw_file_path != str(old_file)
        assert candidate.raw_file_data == b"%PDF-1.4 new"
        assert PipelineStage.query.filter_by(
            candidate_id=candidate_id,
            demand_id=demand_id,
        ).count() == 1
        archived = CandidateResumeVersion.query.filter_by(candidate_id=candidate_id).one()
        assert archived.raw_file_path == str(old_file)
        assert archived.raw_file_data == b"%PDF-1.4 old"
        assert archived.parse_status == "failed"
        assert archived.created_by == owner_id

    old_file.unlink()

    history = client.get(
        f"/api/resume/{candidate_id}/versions",
        headers=_auth(token),
    )
    assert history.status_code == 200
    versions = history.get_json()["versions"]
    assert len(versions) == 1
    assert versions[0]["version_no"] == 1
    assert versions[0]["is_current"] is False
    assert versions[0]["download_url"]

    archived_file = client.get(versions[0]["download_url"], headers=_auth(token))
    assert archived_file.status_code == 200
    assert archived_file.data == b"%PDF-1.4 old"


def test_replacement_parse_failure_keeps_new_original_as_confirmation_item(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("resume-replace-fail@example.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    old_file = tmp_path / "old-failed.pdf"
    old_file.write_bytes(b"%PDF-1.4 old failed")
    candidate_id = _failed_candidate(app, owner_id, old_file)

    class Parser:
        def parse_resume(self, file_path):
            raise RuntimeError("图像模型暂时不可用")

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: Parser())

    response = client.post(
        f"/api/resume/{candidate_id}/replace",
        headers=_auth(token),
        data={"file": (io.BytesIO(b"%PDF-1.4 correct but ai failed"), "correct.pdf")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 202
    body = response.get_json()
    assert body["candidate_id"] == candidate_id
    assert body["status"] == "needs_confirmation"
    assert body["parse_status"] == "failed"
    assert body["original_resume"]["available"] is True
    assert old_file.exists() is True

    with app.app_context():
        from app.models import Candidate, CandidateResumeVersion

        candidate = app.extensions["sqlalchemy"].session.get(Candidate, candidate_id)
        assert Path(candidate.raw_file_path).read_bytes() == b"%PDF-1.4 correct but ai failed"
        assert candidate.parse_error == "简历解析失败，请重试或人工补录"
        archived = CandidateResumeVersion.query.filter_by(candidate_id=candidate_id).one()
        assert archived.raw_file_path == str(old_file)
        assert archived.created_by == owner_id


def test_manual_completion_keeps_supported_basic_fields_and_marks_resume_ready(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("resume-manual-completion@example.com", role="recruiter")
    original = tmp_path / "manual.pdf"
    original.write_bytes(b"%PDF-1.4 manual")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    candidate_id = _failed_candidate(app, owner_id, original)

    response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(token),
        json={
            "profile": {
                "name": "手动补录候选人",
                "phone": "13900139000",
                "email": "manual@example.com",
                "target_position": "产品经理",
                "intent_city": "上海",
                "work_years": "8年",
                "education": [{"degree": "本科"}],
            },
            "skills": [
                {"tag": "需求分析", "score": 4},
                {"tag": "AI 产品", "score": 5},
            ],
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["parse_status"] == "ok"
    info = body["resume_json"]["extracted_info"]
    assert info["work_years"] == "8年"
    assert info["education"] == [{"degree": "本科"}]
    assert [item["tag"] for item in body["tags"]] == ["需求分析", "AI 产品"]
    assert body["resume_versions"] == []


def test_unconfirmed_resume_cannot_enter_flow_but_confirmed_original_can(
    make_user, app
):
    owner_id, _token = make_user("resume-flow-gate@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, RecruitmentDemand
        from app.services.pipeline_service import PipelineServiceError, move_candidate

        job = Job(org_id=1, title="算法工程师", jd_text="Python", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no="REQ-RESUME-GATE",
            headcount=2,
            status="active",
            approval_status="approved",
        )
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="待确认候选人",
            resume_json={},
            parse_status="failed",
            parse_error="AI 解析失败",
        )
        db.session.add_all([demand, candidate])
        db.session.commit()

        with pytest.raises(PipelineServiceError) as blocked:
            move_candidate(
                candidate_id=candidate.id,
                demand_id=demand.id,
                org_id=1,
                actor_id=owner_id,
                stage="pending",
            )
        assert blocked.value.code == "resume_confirmation_required"

        candidate.parse_status = "original_confirmed"
        db.session.commit()
        result = move_candidate(
            candidate_id=candidate.id,
            demand_id=demand.id,
            org_id=1,
            actor_id=owner_id,
            stage="pending",
        )
        assert result["status"] == "ok"
