from types import SimpleNamespace


def test_job_clarify_does_not_return_internal_exception(
    client,
    make_user,
    monkeypatch,
):
    _, token = make_user("error-mask@example.com", role="recruiter")

    def fail_chat(*_args, **_kwargs):
        raise RuntimeError("/srv/private/config token=secret-value")

    monkeypatch.setattr("llm_client.LLMClient.chat", fail_chat)
    response = client.post(
        "/api/jobs/clarify",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "测试", "jd_text": "测试 JD"},
    )
    assert response.status_code == 200
    assert response.get_json()["warning"] == "澄清生成暂时不可用，可直接保存职位信息"
    assert "secret-value" not in response.get_data(as_text=True)


def test_public_resume_error_hides_raw_parser_detail(app):
    from app.services.resumes.version_service import _public_parse_error

    candidate = SimpleNamespace(
        parse_status="failed",
        parse_error="/srv/private/file.pdf api_key=secret",
    )
    with app.app_context():
        assert _public_parse_error(candidate) == "简历解析失败，请重试或人工补录"


def test_boss_process_error_hides_internal_exception(monkeypatch):
    from app.services import boss_service

    monkeypatch.setattr(
        boss_service,
        "_ensure_cli",
        lambda: (True, "/private/bin/boss"),
    )

    def fail_process(*_args, **_kwargs):
        raise RuntimeError("/srv/private token=boss-secret")

    monkeypatch.setattr(boss_service.subprocess, "run", fail_process)
    result = boss_service._run(["status"])

    assert result["error"]["message"] == "BOSS 服务暂时不可用，请稍后重试"
    assert "boss-secret" not in str(result)
