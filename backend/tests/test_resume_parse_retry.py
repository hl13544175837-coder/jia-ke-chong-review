from pathlib import Path
from threading import Barrier

import pytest
from PIL import Image


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_image_resume_uses_base64_vision_and_normalizes_result(tmp_path):
    from image_resume_parser import DashScopeVisionConfig, ImageResumeVisionParser

    image_path = tmp_path / "resume.png"
    image = Image.new("RGB", (32, 32), "white")
    image.save(image_path, format="PNG")

    class FakeResponse:
        ok = True
        status_code = 200

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"extracted_info":{"name":"候选人图",'
                                '"email":"image@example.com","phone":"13800000000",'
                                '"summary":"后端工程师","intent_city":"杭州",'
                                '"target_position":"高级Python后端工程师",'
                                '"education":[],"experience":[],"projects":[],'
                                '"certifications":[],"languages":[],"additional_info":""},'
                                '"skills":[{"skill_name":"Python","score":5,'
                                '"category":"编程语言"}]}'
                            )
                        }
                    }
                ]
            }

    class FakeHttpClient:
        def __init__(self):
            self.request_json = None

        def post(self, url, headers, json, timeout):
            assert url == "https://workspace.example.com/compatible-mode/v1/chat/completions"
            assert headers["Authorization"] == "Bearer secret"
            assert timeout == 120
            self.request_json = json
            return FakeResponse()

    http_client = FakeHttpClient()
    parser = ImageResumeVisionParser(
        config=DashScopeVisionConfig(
            endpoint="https://workspace.example.com/compatible-mode/v1/chat/completions",
            api_key="secret",
            model="qwen3.7-plus",
            timeout_seconds=120,
        ),
        http_client=http_client,
    )

    result = parser.parse(str(image_path))

    assert result.extracted_info["name"] == "候选人图"
    assert result.extracted_info["intent_city"] == "杭州"
    assert result.extracted_info["target_position"] == "高级Python后端工程师"
    assert result.skills[0]["skill_name"] == "Python"
    assert result.skills[0]["score"] == 5
    content = http_client.request_json["messages"][1]["content"]
    image_url = content[0]["image_url"]["url"]
    assert image_url.startswith("data:image/png;base64,")
    assert str(image_path) not in str(http_client.request_json)


def test_image_resume_rejects_placeholder_workspace_url(monkeypatch):
    from image_resume_parser import DashScopeVisionConfig

    monkeypatch.setenv("DASHSCOPE_API_KEY", "test-key")
    monkeypatch.setenv(
        "DASHSCOPE_BASE_URL",
        "https://your-workspace-id.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    )

    with pytest.raises(RuntimeError, match="占位符"):
        DashScopeVisionConfig.from_environment()


def test_document_resume_sends_pages_to_vision_model_in_parallel():
    """多页简历不能按页串行等待，否则会超过网关的等待时间。"""
    from image_resume_parser import DashScopeVisionConfig, ImageResumeVisionParser

    class FakeResponse:
        ok = True
        status_code = 200

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": '{"name":"并行候选人","experience":[]}'
                        }
                    }
                ]
            }

    class FakeHttpClient:
        def __init__(self):
            self.barrier = Barrier(3, timeout=1)
            self.calls = 0

        def post(self, url, headers, json, timeout):
            self.calls += 1
            self.barrier.wait()
            return FakeResponse()

    client = FakeHttpClient()
    parser = ImageResumeVisionParser(
        config=DashScopeVisionConfig(
            endpoint="https://workspace.example.com/compatible-mode/v1/chat/completions",
            api_key="secret",
            model="qwen3.7-plus",
            timeout_seconds=120,
        ),
        http_client=client,
    )

    result = parser.parse_document([
        "data:image/png;base64,cGFnZTE=",
        "data:image/png;base64,cGFnZTI=",
        "data:image/png;base64,cGFnZTM=",
    ])

    assert client.calls == 3
    assert result.extracted_info["name"] == "并行候选人"


def test_empty_document_resume_returns_empty_result_without_starting_workers():
    from image_resume_parser import DashScopeVisionConfig, ImageResumeVisionParser

    parser = ImageResumeVisionParser(
        config=DashScopeVisionConfig(
            endpoint="https://workspace.example.com/compatible-mode/v1/chat/completions",
            api_key="secret",
            model="qwen3.7-plus",
            timeout_seconds=120,
        )
    )

    result = parser.parse_document([])

    assert result.extracted_info == {}
    assert result.skills == []


def test_failed_resume_upload_keeps_retryable_candidate(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("retry-upload@x.com", role="recruiter")

    def fail_parse(self, fpath, owner_hr_id, upload_batch_id=None):
        raise ValueError("PDF 内容无法解析")

    from app.services.resume_service import ResumeBatchService

    monkeypatch.setattr(ResumeBatchService, "parse_and_save", fail_parse)
    resume = tmp_path / "broken.pdf"
    resume.write_bytes(b"%PDF-1.4 broken")

    with resume.open("rb") as f:
        response = client.post(
            "/api/resume/upload",
            headers=_auth(token),
            data={"files": (f, "broken.pdf")},
            content_type="multipart/form-data",
        )

    assert response.status_code == 202
    body = response.get_json()
    assert body["results"][0]["status"] == "needs_confirmation"
    assert body["results"][0]["reason"] == "AI 未能识别该简历，请确认原文件或重新上传"
    assert body["results"][0]["candidate_id"]

    candidate_id = body["results"][0]["candidate_id"]
    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["parse_status"] == "failed"
    assert detail["parse_error"] == "简历解析失败，请重试或人工补录"

    library = client.get("/api/candidates", headers=_auth(token)).get_json()
    item = next(c for c in library if c["id"] == candidate_id)
    assert item["parse_status"] == "failed"
    assert item["parse_error"]


def test_retry_parse_updates_failed_candidate(client, make_user, app, monkeypatch, tmp_path):
    uid, token = make_user("retry-owner@x.com", role="recruiter")
    other_uid, other_token = make_user("retry-other@x.com", role="recruiter")
    app.config["UPLOAD_FOLDER"] = str(tmp_path)
    resume = tmp_path / "retry.pdf"
    resume.write_bytes(b"%PDF-1.4 retry")

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="broken.pdf",
            resume_json={},
            raw_file_path="retry.pdf",
            parse_status="failed",
            parse_error="旧错误",
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="旧标签", score=1))
        db.session.commit()
        candidate_id = candidate.id

    class FakeParser:
        def parse_resume(self, file_path):
            assert Path(file_path) == resume
            return {
                "extracted_info": {
                    "name": "候选人C",
                    "email": "c@example.com",
                    "phone": "13800000000",
                },
                "skills": [
                    {"skill_name": "Python", "score": 5},
                    {"skill_name": "招聘系统", "score": 4},
                ],
            }

    monkeypatch.setattr("app.services.resume_service.ResumeParser", lambda: FakeParser())

    forbidden = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(other_token),
    )
    assert forbidden.status_code == 403

    response = client.post(
        f"/api/resume/{candidate_id}/retry-parse",
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["candidate_id"] == candidate_id
    assert body["parse_status"] == "ok"
    assert body["name_masked"] == "候选人C"
    assert [tag["tag"] for tag in body["tags"]] == ["Python", "招聘系统"]

    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["owner_hr_id"] == uid
    assert detail["parse_status"] == "ok"
    assert detail["parse_error"] is None
    assert detail["resume_json"]["extracted_info"]["email"] == "c@example.com"


def test_update_candidate_profile_syncs_resume_fields_and_tags(client, make_user, app):
    uid, token = make_user("profile-editor@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="旧姓名",
            email_masked="old@example.com",
            phone_masked="13000000000",
            resume_json={
                "extracted_info": {
                    "name": "旧姓名",
                    "email": "old@example.com",
                    "phone": "13000000000",
                    "experience": [],
                },
                "skills": [{"skill_name": "旧标签", "score": 1}],
            },
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateTag(candidate_id=candidate.id, tag="旧标签", score=1))
        db.session.commit()
        candidate_id = candidate.id

    response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(token),
        json={
            "profile": {
                "name": "候选人P",
                "email": "p@example.com",
                "phone": "13900000000",
                "summary": "偏产品化的 AI 工程候选人",
                "experience": [
                    {"company": "某AI公司", "position": "AI产品工程师", "duration": "2023-至今"}
                ],
                "projects": [
                    {
                        "name": "招聘助手",
                        "role": "负责人",
                        "duration": "2024",
                        "description": "负责简历解析和人岗匹配闭环",
                    }
                ],
                "additional_info": "HR 手动补充：沟通主动，项目表达清楚",
            },
            "skills": [
                {"tag": "Python", "score": 5},
                {"tag": "招聘系统", "score": 4},
            ],
        },
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["owner_hr_id"] == uid
    assert body["name_masked"] == "候选人P"
    assert body["resume_json"]["extracted_info"]["projects"][0]["name"] == "招聘助手"
    assert body["resume_json"]["extracted_info"]["additional_info"] == "HR 手动补充：沟通主动，项目表达清楚"
    assert body["tags"] == [
        {"tag": "Python", "score": 5},
        {"tag": "招聘系统", "score": 4},
    ]

    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token)).get_json()
    assert detail["owner_hr_id"] == uid
    assert detail["resume_json"]["extracted_info"]["email"] == "p@example.com"
    assert detail["tags"][0]["tag"] == "Python"


def test_update_candidate_profile_requires_owner_permission(client, make_user, app):
    owner_id, _owner_token = make_user("profile-owner@x.com", role="recruiter")
    _other_id, other_token = make_user("profile-other@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="候选人A",
            resume_json={"extracted_info": {"name": "候选人A"}},
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(other_token),
        json={"profile": {"name": "不该改名"}},
    )

    assert response.status_code == 403


def test_update_candidate_profile_refreshes_related_job_matches(client, make_user, app, monkeypatch):
    uid, token = make_user("profile-rematch@x.com", role="recruiter")
    called_job_ids = []

    def fake_rank_for_job(self, job_id, top_n=20):
        called_job_ids.append(job_id)
        return []

    monkeypatch.setattr("app.services.match_service.MatchService.rank_for_job", fake_rank_for_job)

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, UploadBatch

        source_job = Job(title="AI 产品经理", jd_text="负责 AI 产品设计", owner_hr_id=uid)
        pipeline_job = Job(title="增长产品经理", jd_text="负责增长实验", owner_hr_id=uid)
        db.session.add_all([source_job, pipeline_job])
        db.session.flush()

        batch = UploadBatch(owner_hr_id=uid, target_job_id=source_job.id, source_channel="BOSS直聘")
        db.session.add(batch)
        db.session.flush()

        candidate = Candidate(
            owner_hr_id=uid,
            upload_batch_id=batch.id,
            name_masked="候选人R",
            resume_json={"extracted_info": {"name": "候选人R"}},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=pipeline_job.id,
            stage="pending",
            updated_by=uid,
        ))
        db.session.commit()
        candidate_id = candidate.id
        source_job_id = source_job.id
        pipeline_job_id = pipeline_job.id

    response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(token),
        json={"profile": {"name": "候选人R2", "summary": "更新后的简介"}},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["name_masked"] == "候选人R2"
    assert body["rematched_jobs"] == [
        {"id": source_job_id, "title": "AI 产品经理"},
        {"id": pipeline_job_id, "title": "增长产品经理"},
    ]
    assert called_job_ids == [source_job_id, pipeline_job_id]


def test_update_candidate_profile_skips_match_model_when_resume_ai_is_disabled(
    client, make_user, app, monkeypatch
):
    uid, token = make_user("profile-manual-only@x.com", role="recruiter")
    app.config["RESUME_AI_ENABLED"] = False
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage

        job = Job(title="人工补录岗位", jd_text="x", owner_hr_id=uid)
        db.session.add(job)
        db.session.flush()
        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="待补录候选人",
            resume_json={"extracted_info": {}},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="pending",
            updated_by=uid,
        ))
        db.session.commit()
        candidate_id = candidate.id

    model_calls = []

    def track_model_call(*args, **kwargs):
        model_calls.append((args, kwargs))
        return []

    monkeypatch.setattr(
        "app.services.match_service.MatchService.rank_for_job",
        track_model_call,
    )

    response = client.patch(
        f"/api/resume/{candidate_id}/profile",
        headers=_auth(token),
        json={"profile": {"name": "人工补录候选人", "summary": "已补录"}},
    )

    assert response.status_code == 200
    assert response.get_json()["rematched_jobs"] == []
    assert model_calls == []
