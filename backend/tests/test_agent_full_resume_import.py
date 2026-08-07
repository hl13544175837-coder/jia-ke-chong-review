import io
import json

import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_full_resume_demand(app, owner_id, request_no="REQ-FULL-001"):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        job = Job(
            org_id=1,
            title="Java开发",
            jd_text="Java",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="Java开发",
            request_no=request_no,
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        return demand.id


def _resume_json(name="完整候选人", phone="13800138000", email=None):
    email = email or (
        "candidate@example.com"
        if phone == "13800138000"
        else f"candidate-{phone[-4:]}@example.com"
    )
    return {
        "extracted_info": {
            "name": name,
            "phone": phone,
            "email": email,
            "target_position": "Java开发",
        },
        "skills": [{"tag": "Spring Boot", "score": 1}],
        "experience": [{"company": "示例科技", "role": "Java开发"}],
    }


def _metadata(*items):
    return json.dumps({"items": list(items)}, ensure_ascii=False)


def _item(filename, external_import_id, resume_json=None):
    item = {
        "filename": filename,
        "external_import_id": external_import_id,
    }
    if resume_json is not None:
        item["resume_json"] = resume_json
    return item


def _post_full_resumes(client, token, demand_id=None, files=(), metadata_items=()):
    data = {
        "boss_account": "何龙-BOSS账号",
        "source_link": "https://www.zhipin.com/web/chat/index",
        "metadata_json": _metadata(*metadata_items),
        "files": [(io.BytesIO(content), filename) for content, filename in files],
    }
    if demand_id is not None:
        data["target_demand_id"] = str(demand_id)
    return client.post(
        "/api/agent-imports/full-resumes",
        headers=_auth(token),
        data=data,
        content_type="multipart/form-data",
    )


def test_agent_full_resume_uses_structured_data_when_ai_is_disabled(
    client, make_user, app, monkeypatch, tmp_path
):
    owner_id, token = make_user("agent-full@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))
    resume_json = _resume_json()

    def model_must_not_run(*args, **kwargs):
        raise AssertionError("Agent结构化简历不得调用模型解析")

    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save",
        model_must_not_run,
    )

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(b"%PDF-1.4 complete resume", "full.pdf")],
        metadata_items=[_item("full.pdf", "full-import-001", resume_json)],
    )

    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "ok"

    with app.app_context():
        from app.models import Candidate, OnlineResume, PipelineStage, UploadBatch

        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.resume_json["extracted_info"] == resume_json["extracted_info"]
        assert candidate.resume_json["skills"] == resume_json["skills"]
        assert candidate.resume_json["experience"] == resume_json["experience"]
        assert candidate.resume_json["_agent_source"] == {
            "external_import_id": "full-import-001",
            "source_platform": "BOSS直聘",
            "boss_account": "何龙-BOSS账号",
            "source_link": "https://www.zhipin.com/web/chat/index",
        }
        assert candidate.raw_file_data == b"%PDF-1.4 complete resume"
        assert candidate.parse_status == "ok"
        assert candidate.current_demand_id == demand_id
        assert OnlineResume.query.count() == 0
        assert UploadBatch.query.filter_by(
            owner_hr_id=owner_id,
            demand_id=demand_id,
            source_channel="BOSS直聘",
        ).count() == 1
        assert PipelineStage.query.filter_by(
            candidate_id=candidate.id,
            demand_id=demand_id,
            stage="pending",
        ).count() == 1


def test_agent_full_resume_requires_target_demand_before_creating_batch(
    client, make_user, app
):
    owner_id, token = make_user("agent-no-demand@example.com", role="recruiter")

    response = _post_full_resumes(
        client,
        token,
        files=[(b"%PDF-1.4 missing demand", "missing-demand.pdf")],
        metadata_items=[
            _item("missing-demand.pdf", "full-import-no-demand", _resume_json())
        ],
    )

    assert response.status_code == 400
    assert "招聘需求" in response.get_json()["error"]
    with app.app_context():
        from app.models import Candidate, UploadBatch

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 0
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 0


def test_agent_full_resume_requires_structure_for_every_file_before_creating_batch(
    client, make_user, app
):
    owner_id, token = make_user("agent-missing-structure@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[
            (b"%PDF-1.4 first", "first.pdf"),
            (b"%PDF-1.4 second", "second.pdf"),
        ],
        metadata_items=[_item("first.pdf", "full-import-first", _resume_json())],
    )

    assert response.status_code == 400
    assert "second.pdf" in response.get_json()["error"]
    with app.app_context():
        from app.models import Candidate, UploadBatch

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 0
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 0


def test_agent_full_resume_rejects_zip_before_creating_batch(client, make_user, app):
    owner_id, token = make_user("agent-zip@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(b"PK\x03\x04 fake zip", "resumes.zip")],
        metadata_items=[_item("resumes.zip", "full-import-zip", _resume_json())],
    )

    assert response.status_code == 400
    assert "ZIP" in response.get_json()["error"]
    with app.app_context():
        from app.models import UploadBatch

        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 0


def test_agent_full_resume_reuses_existing_file_duplicate_response(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("agent-duplicate@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))
    content = b"%PDF-1.4 same complete resume"

    first = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(content, "first.pdf")],
        metadata_items=[_item("first.pdf", "full-import-first", _resume_json())],
    )
    second = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(content, "renamed.pdf")],
        metadata_items=[_item("renamed.pdf", "full-import-second", _resume_json())],
    )

    assert first.status_code == 202
    assert second.status_code == 202
    duplicate = second.get_json()["results"][0]
    assert duplicate["status"] == "duplicate"
    assert duplicate["reason"] == "导入失败：系统中已存在重复简历"
    assert duplicate["match_basis"] == "文件内容一致"
    with app.app_context():
        from app.models import Candidate

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_agent_full_resume_external_import_id_is_idempotent_across_changed_file(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("agent-external-id@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))

    first = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(b"%PDF-1.4 first file body", "first.pdf")],
        metadata_items=[
            _item("first.pdf", "stable-external-id", _resume_json("第一版候选人"))
        ],
    )
    second = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(b"%PDF-1.4 changed file body", "renamed.pdf")],
        metadata_items=[
            _item(
                "renamed.pdf",
                "stable-external-id",
                _resume_json("第二版候选人", "13800138999"),
            )
        ],
    )

    assert first.status_code == 202
    assert second.status_code == 202
    first_candidate_id = first.get_json()["results"][0]["candidate_id"]
    duplicate = second.get_json()["results"][0]
    assert duplicate["status"] == "duplicate"
    assert duplicate["reason"] == "该外部导入编号已经处理过"
    assert duplicate["match_basis"] == "外部导入编号一致"
    assert duplicate["existing_candidate_id"] == first_candidate_id
    with app.app_context():
        from app.models import Candidate

        candidates = Candidate.query.filter_by(owner_hr_id=owner_id).all()
        assert len(candidates) == 1
        assert candidates[0].name_masked == "第一版候选人"


def test_agent_full_resume_pipeline_failure_removes_candidate_file_and_empty_batch(
    client, make_user, app, monkeypatch, tmp_path
):
    from app.services.pipeline_service import PipelineServiceError

    owner_id, token = make_user("agent-pipeline-fail@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))

    def reject_pipeline(*args, **kwargs):
        raise PipelineServiceError("模拟加入需求失败", 409, "simulated_failure")

    monkeypatch.setattr(
        "app.services.resumes.parse_service._add_to_target_pipeline",
        reject_pipeline,
    )

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[(b"%PDF-1.4 pipeline failure", "pipeline-fail.pdf")],
        metadata_items=[
            _item("pipeline-fail.pdf", "pipeline-fail-id", _resume_json())
        ],
    )

    assert response.status_code == 202
    assert response.get_json()["batch_id"] is None
    result = response.get_json()["results"][0]
    assert result["status"] == "error"
    assert result["pipeline_error_code"] == "simulated_failure"
    with app.app_context():
        from app.models import Candidate, UploadBatch

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 0
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 0
    assert list(tmp_path.iterdir()) == []


def test_agent_full_resume_keeps_prior_success_when_later_pipeline_join_fails(
    client, make_user, app, monkeypatch, tmp_path
):
    from app.services.pipeline_service import PipelineServiceError
    from app.services.resumes import parse_service

    owner_id, token = make_user("agent-pipeline-partial@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))
    real_add_to_pipeline = parse_service._add_to_target_pipeline
    attempts = 0

    def fail_second_pipeline_join(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 2:
            raise PipelineServiceError("模拟第二份失败", 409, "simulated_second_failure")
        return real_add_to_pipeline(*args, **kwargs)

    monkeypatch.setattr(parse_service, "_add_to_target_pipeline", fail_second_pipeline_join)

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[
            (b"%PDF-1.4 successful item", "success.pdf"),
            (b"%PDF-1.4 failing item", "failure.pdf"),
        ],
        metadata_items=[
            _item("success.pdf", "pipeline-success-id", _resume_json("成功候选人", "13800138011")),
            _item("failure.pdf", "pipeline-failure-id", _resume_json("失败候选人", "13800138012")),
        ],
    )

    assert response.status_code == 202
    results = {item["file"]: item for item in response.get_json()["results"]}
    assert results["success.pdf"]["status"] == "ok"
    assert results["failure.pdf"]["status"] == "error"
    with app.app_context():
        from app.models import Candidate, UploadBatch

        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.name_masked == "成功候选人"
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_agent_full_resume_imports_two_valid_files_in_one_request(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("agent-two-files@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[
            (b"%PDF-1.4 candidate one", "one.pdf"),
            (b"%PDF-1.4 candidate two", "two.pdf"),
        ],
        metadata_items=[
            _item("one.pdf", "full-import-one", _resume_json("候选人一", "13800138001")),
            _item("two.pdf", "full-import-two", _resume_json("候选人二", "13800138002")),
        ],
    )

    assert response.status_code == 202
    assert [item["status"] for item in response.get_json()["results"]] == ["ok", "ok"]
    with app.app_context():
        from app.models import Candidate, UploadBatch

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 2
        assert UploadBatch.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_agent_full_resume_keeps_valid_file_when_another_file_fails_validation(
    client, make_user, app, tmp_path
):
    owner_id, token = make_user("agent-partial@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))

    response = _post_full_resumes(
        client,
        token,
        demand_id,
        files=[
            (b"%PDF-1.4 valid", "valid.pdf"),
            (b"not a real pdf", "broken.pdf"),
        ],
        metadata_items=[
            _item("valid.pdf", "full-import-valid", _resume_json()),
            _item("broken.pdf", "full-import-broken", _resume_json("损坏简历")),
        ],
    )

    assert response.status_code == 202
    results = {item["file"]: item for item in response.get_json()["results"]}
    assert results["valid.pdf"]["status"] == "ok"
    assert results["broken.pdf"]["status"] == "skipped"
    with app.app_context():
        from app.models import Candidate

        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_agent_full_resume_endpoint_is_recruiter_only(client, make_user, app):
    owner_id, _ = make_user("agent-owner@example.com", role="recruiter")
    _, interviewer_token = make_user("agent-interviewer@example.com", role="interviewer")
    demand_id = _make_full_resume_demand(app, owner_id)

    response = _post_full_resumes(
        client,
        interviewer_token,
        demand_id,
        files=[(b"%PDF-1.4 forbidden", "forbidden.pdf")],
        metadata_items=[_item("forbidden.pdf", "full-import-forbidden", _resume_json())],
    )

    assert response.status_code == 403


def test_agent_full_resume_rejects_oversized_structure(app):
    from app.services.resume_service import ResumeBatchService

    oversized = _resume_json()
    oversized["full_text"] = "x" * (1024 * 1024)

    with app.app_context():
        with pytest.raises(ValueError, match="1MB"):
            ResumeBatchService().normalize_structured_resume(oversized)
