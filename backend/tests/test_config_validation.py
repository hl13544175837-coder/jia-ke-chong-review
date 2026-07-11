from pathlib import Path

import pytest

from app import _enforce_production_security
from app.config import Config
from app.config_validation import safe_database_label, validate_cors_origins
from app.services import boss_service
from scripts.check_pilot_readiness import run_checks


ROOT = Path(__file__).resolve().parents[2]


class _ProductionApp:
    def __init__(self, origins):
        self.config = {
            "TESTING": False,
            "FLASK_DEBUG": False,
            "JWT_SECRET": "x" * 40,
            "WEAK_SECRETS": set(),
            "MIN_SECRET_LENGTH": 32,
            "CORS_ORIGINS": origins,
            "AI_RECRUITMENT_COMPLIANCE_ACK": True,
            "CANDIDATE_PRIVACY_NOTICE_URL": "https://zhipin.example.com/privacy",
            "AI_HUMAN_REVIEW_REQUIRED": True,
        }


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "null",
        "ftp://zhipin.example.com",
        "https://zhipin.example.com/path",
        "https://zhipin.example.com?tenant=1",
        "https://zhipin.example.com#fragment",
        "https://user:password@zhipin.example.com",
    ],
)
def test_cors_validator_and_production_startup_reject_unsafe_origins(origin):
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        validate_cors_origins([origin])
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        _enforce_production_security(_ProductionApp([origin]))


def test_cors_validator_accepts_plain_http_origins():
    assert validate_cors_origins(
        ["https://zhipin.example.com", "http://localhost:5173"]
    ) == ["https://zhipin.example.com", "http://localhost:5173"]


def test_cors_validation_errors_redact_credentials_and_query_secrets():
    unsafe = "https://private-user:password-123@zhipin.example.com?token=query-secret"

    with pytest.raises(ValueError) as validation_error:
        validate_cors_origins([unsafe])
    with pytest.raises(RuntimeError) as startup_error:
        _enforce_production_security(_ProductionApp([unsafe]))

    for message in (str(validation_error.value), str(startup_error.value)):
        assert "CORS_ORIGINS" in message
        assert "#1" in message
        assert "https://zhipin.example.com" in message
        assert "private-user" not in message
        assert "password-123" not in message
        assert "query-secret" not in message


def test_pilot_readiness_reuses_strict_cors_validation(tmp_path):
    values = {"CORS_ORIGINS": "*,https://zhipin.example.com"}

    checks = run_checks(values, ROOT, tmp_path / ".env")
    cors = next(check for check in checks if check.name == "CORS_ORIGINS")

    assert cors.ok is False


def test_pilot_readiness_requires_boss_runtime_install_to_stay_disabled(tmp_path):
    values = {
        "CORS_ORIGINS": "https://zhipin.example.com",
        "BOSS_CLI_AUTO_INSTALL": "true",
    }

    checks = run_checks(values, ROOT, tmp_path / ".env")
    boss = next(check for check in checks if check.name == "BOSS_CLI_AUTO_INSTALL")

    assert boss.ok is False


@pytest.mark.parametrize("upload_folder", ["", "backend/uploads", "/tmp/zhipin/uploads"])
def test_pilot_readiness_requires_absolute_persistent_upload_folder(
    tmp_path,
    upload_folder,
):
    values = {
        "UPLOAD_FOLDER": upload_folder,
        "LOCAL_SCHEMA_COMPAT": "false",
    }

    checks = run_checks(values, ROOT, tmp_path / ".env")
    uploads = next(check for check in checks if check.name == "UPLOAD_FOLDER")

    assert uploads.ok is False


def test_pilot_readiness_requires_local_schema_compat_disabled(tmp_path):
    checks = run_checks(
        {
            "UPLOAD_FOLDER": "/var/lib/zhipin/uploads",
            "LOCAL_SCHEMA_COMPAT": "true",
        },
        ROOT,
        tmp_path / ".env",
    )

    compat = next(check for check in checks if check.name == "LOCAL_SCHEMA_COMPAT")
    assert compat.ok is False


@pytest.mark.parametrize(
    ("database_url", "expected"),
    [
        (
            "mysql+pymysql://user:secret@db.internal:3306/zhipin?token=hidden",
            "mysql+pymysql://db.internal:3306/zhipin",
        ),
        (
            "postgresql+psycopg://user:secret@db.internal/zhipin",
            "postgresql+psycopg://db.internal/zhipin",
        ),
        ("sqlite:////private/user/hireinsight.db", "sqlite:///hireinsight.db"),
    ],
)
def test_database_url_display_redacts_credentials_and_query(database_url, expected):
    label = safe_database_label(database_url)

    assert label == expected
    assert "user" not in label
    assert "secret" not in label
    assert "hidden" not in label


def test_run_entrypoint_uses_safe_database_label():
    source = (ROOT / "backend" / "run.py").read_text(encoding="utf-8")

    assert "safe_database_label" in source
    assert "os.environ.get('DATABASE_URL'" not in source


def test_boss_runtime_auto_install_defaults_off_and_never_executes_pip(
    monkeypatch,
):
    assert Config.BOSS_CLI_AUTO_INSTALL is False
    monkeypatch.setenv("BOSS_CLI_AUTO_INSTALL", "true")
    monkeypatch.setattr(boss_service, "_resolve_bin", lambda: None)
    calls = []
    monkeypatch.setattr(
        boss_service.subprocess,
        "run",
        lambda *args, **kwargs: calls.append((args, kwargs)),
    )

    ok, message = boss_service._ensure_cli()

    assert ok is False
    assert "构建" in message or "手动" in message
    assert calls == []


def test_frontend_build_and_git_hygiene_are_reproducible():
    dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    package_json = (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    backend_dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert "RUN npm ci" in dockerfile
    assert '"node": ">=20.19.0 <21 || >=22.12.0"' in package_json
    assert ".workbuddy/" in gitignore
    assert "outputs/" in gitignore
    assert "apt-get install -y curl git" not in backend_dockerfile
