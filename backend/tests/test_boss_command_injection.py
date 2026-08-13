import pytest


@pytest.mark.parametrize("identifier", ["--help", "-o", "bad;touch /tmp/pwned"])
def test_boss_external_identifiers_are_validated_before_cli_execution(
    monkeypatch,
    identifier,
):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )

    result = boss_service.BossService().recruiter_resume(identifier)

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_params"
    assert calls == []


@pytest.mark.parametrize(("field", "value"), [
    ("job", "--help"),
    ("job", "bad value"),
    ("security_id", "-o"),
    ("security_id", "bad;value"),
])
def test_boss_optional_external_ids_are_validated_before_cli_execution(
    monkeypatch,
    field,
    value,
):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )

    kwargs = {field: value}
    result = boss_service.BossService().recruiter_resume("valid-geek-id", **kwargs)

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_params"
    assert calls == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("encrypt_geek_id", "g" * 65),
        ("encrypt_geek_id", "g" * 64 + ";ignored"),
        ("job", "j" * 257),
        ("security_id", "s" * 257),
    ],
)
def test_boss_external_ids_are_rejected_instead_of_silently_truncated(
    monkeypatch,
    field,
    value,
):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )

    kwargs = {
        "encrypt_geek_id": "valid-geek-id",
        "job": "valid-job-id",
        "security_id": "valid-security-id",
    }
    kwargs[field] = value
    result = boss_service.BossService().recruiter_resume(**kwargs)

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_params"
    assert calls == []


def test_boss_ids_at_supported_lengths_reach_cli_without_changes(monkeypatch):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )
    geek_id = "g" * 64
    job_id = "j" * 64
    security_id = "s" * 116

    result = boss_service.BossService().recruiter_resume(
        geek_id,
        job=job_id,
        security_id=security_id,
    )

    assert result["ok"] is True
    assert calls == [[
        "recruiter",
        "resume",
        geek_id,
        "--job",
        job_id,
        "--security-id",
        security_id,
    ]]


def test_boss_pipeline_preserves_long_security_id_without_truncation(
    app,
    make_user,
):
    from app.models import Candidate
    from app.services.boss_pipeline_service import BossPipelineService

    owner_id, _ = make_user("boss-long-security@example.com")
    security_id = "s" * 116
    calls = []

    class FakeBoss:
        def recruiter_resume_download(self, **kwargs):
            calls.append(kwargs)
            return {"ok": True, "data": "# 长标识候选人"}

    with app.app_context():
        result = BossPipelineService(boss=FakeBoss()).batch_import(
            owner_id,
            [{"geek_id": "g" * 64, "security_id": security_id}],
            "cookie",
            interval_sec=0,
        )
        candidate = Candidate.query.one()

    assert result["data"]["imported"] == 1
    assert calls[0]["security_id"] == security_id
    assert candidate.resume_json["boss"]["security_id"] == security_id


def test_boss_pipeline_rejects_oversized_id_without_downloading(
    app,
    make_user,
):
    from app.models import Candidate
    from app.services.boss_pipeline_service import BossPipelineService

    owner_id, _ = make_user("boss-oversized-id@example.com")
    calls = []

    class FakeBoss:
        def recruiter_resume_download(self, **kwargs):
            calls.append(kwargs)
            return {"ok": True, "data": "# 不应下载"}

    with app.app_context():
        result = BossPipelineService(boss=FakeBoss()).batch_import(
            owner_id,
            [{"geek_id": "g" * 257, "security_id": "s" * 116}],
            "cookie",
            interval_sec=0,
        )
        candidate_count = Candidate.query.count()

    assert result["data"]["imported"] == 0
    assert result["data"]["failed"] == 1
    assert calls == []
    assert candidate_count == 0


@pytest.mark.parametrize("friend_id", ["abc", "0", "-1", "1.5", "1" * 21])
def test_boss_chat_rejects_non_positive_or_oversized_numeric_friend_id(
    monkeypatch,
    friend_id,
):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )

    result = boss_service.BossService().recruiter_chat(friend_id)

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_params"
    assert calls == []


def test_boss_chat_preserves_valid_numeric_friend_id(monkeypatch):
    from app.services import boss_service

    calls = []
    monkeypatch.setattr(
        boss_service,
        "_run",
        lambda args, **kwargs: calls.append(args) or {"ok": True, "data": {}},
    )

    result = boss_service.BossService().recruiter_chat("123456789")

    assert result["ok"] is True
    assert calls == [["recruiter", "chat", "123456789"]]
