"""试点上线安全硬化（C1 密钥强制 / C2 CORS / C3 注册关闭）回归测试。"""
from contextlib import contextmanager

import pytest

from app import create_app, _enforce_production_security, db
from app.config import Config, TestingConfig, _normalize_database_url, _upload_folder
from runtime_paths import PROJECT_ROOT


class _ProdLike(Config):
    """模拟生产：关闭 debug、关闭 testing。"""
    TESTING = False
    FLASK_DEBUG = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CELERY_TASK_ALWAYS_EAGER = True
    UPLOAD_FOLDER = "/var/lib/zhipin/uploads"
    UPLOAD_FOLDER_SOURCE = "/var/lib/zhipin/uploads"


def _mk(**over):
    cfg = type("C", (_ProdLike,), over)
    app = type("A", (), {"config": {k: getattr(cfg, k) for k in dir(cfg) if k.isupper()}})()
    return app


@contextmanager
def _managed_app(config):
    app = create_app(config)
    try:
        yield app
    finally:
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()


def test_prod_rejects_default_secret():
    app = _mk(JWT_SECRET="dev-secret-change-in-prod", CORS_ORIGINS=["https://x.com"])
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        _enforce_production_security(app)


def test_prod_rejects_short_secret():
    app = _mk(JWT_SECRET="abc123", CORS_ORIGINS=["https://x.com"])
    with pytest.raises(RuntimeError, match="长度"):
        _enforce_production_security(app)


def test_prod_rejects_public_sit_template_secret():
    app = _mk(
        JWT_SECRET="sit-disposable-not-a-real-secret",
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
        SECURITY_HEADERS_ENABLED=True,
        RATE_LIMIT_ENABLED=True,
        ALLOW_PUBLIC_REGISTRATION=False,
        AUTO_MIGRATE_DATABASE=False,
        ALLOW_EMPTY_DATABASE_BOOTSTRAP=False,
    )

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        _enforce_production_security(app)


def test_prod_requires_cors_whitelist():
    app = _mk(JWT_SECRET="x" * 40, CORS_ORIGINS=[])
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        _enforce_production_security(app)


def test_prod_requires_ai_compliance_acknowledgement():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=False,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    with pytest.raises(RuntimeError, match="AI_RECRUITMENT_COMPLIANCE_ACK"):
        _enforce_production_security(app)


def test_prod_requires_candidate_privacy_notice_url():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    with pytest.raises(RuntimeError, match="CANDIDATE_PRIVACY_NOTICE_URL"):
        _enforce_production_security(app)


def test_prod_requires_ai_human_review():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=False,
    )
    with pytest.raises(RuntimeError, match="AI_HUMAN_REVIEW_REQUIRED"):
        _enforce_production_security(app)


def test_prod_passes_with_strong_config():
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
    )
    _enforce_production_security(app)  # 不抛即通过


@pytest.mark.parametrize(
    ("setting", "unsafe_value"),
    [
        ("SECURITY_HEADERS_ENABLED", False),
        ("RATE_LIMIT_ENABLED", False),
        ("ALLOW_PUBLIC_REGISTRATION", True),
        ("AUTO_MIGRATE_DATABASE", True),
        ("ALLOW_EMPTY_DATABASE_BOOTSTRAP", True),
    ],
)
def test_prod_rejects_unsafe_runtime_policy(setting, unsafe_value):
    values = {
        "JWT_SECRET": "x" * 40,
        "CORS_ORIGINS": ["https://x.com"],
        "AI_RECRUITMENT_COMPLIANCE_ACK": True,
        "CANDIDATE_PRIVACY_NOTICE_URL": "https://x.com/privacy",
        "AI_HUMAN_REVIEW_REQUIRED": True,
        "SECURITY_HEADERS_ENABLED": True,
        "RATE_LIMIT_ENABLED": True,
        "ALLOW_PUBLIC_REGISTRATION": False,
        "AUTO_MIGRATE_DATABASE": False,
        "ALLOW_EMPTY_DATABASE_BOOTSTRAP": False,
        setting: unsafe_value,
    }
    app = _mk(**values)

    with pytest.raises(RuntimeError, match=setting):
        _enforce_production_security(app)


def test_postgres_url_uses_psycopg_driver():
    assert _normalize_database_url("postgresql://user:pass@db:5432/zhipin") == (
        "postgresql+psycopg://user:pass@db:5432/zhipin"
    )
    assert _normalize_database_url("sqlite:///hireinsight.db") == "sqlite:///hireinsight.db"


def test_mysql_url_uses_pymysql_driver():
    assert _normalize_database_url("mysql://user:pass@db:3306/zhipin") == (
        "mysql+pymysql://user:pass@db:3306/zhipin"
    )


def test_upload_folder_defaults_to_container_writable_tmp(monkeypatch):
    monkeypatch.delenv("UPLOAD_FOLDER", raising=False)
    assert _upload_folder() == "/tmp/zhipin_uploads"


def test_local_relative_upload_folder_is_anchored_at_project_root(monkeypatch):
    monkeypatch.setenv("UPLOAD_FOLDER", "backend/uploads")

    assert _upload_folder() == str((PROJECT_ROOT / "backend" / "uploads").absolute())


@pytest.mark.parametrize(
    ("source", "folder"),
    [
        ("", "/tmp/zhipin_uploads"),
        ("backend/uploads", "/workspace/zhipin/backend/uploads"),
        ("/tmp/zhipin-uploads", "/tmp/zhipin-uploads"),
    ],
)
def test_prod_requires_explicit_absolute_persistent_upload_folder(source, folder):
    app = _mk(
        JWT_SECRET="x" * 40,
        CORS_ORIGINS=["https://x.com"],
        AI_RECRUITMENT_COMPLIANCE_ACK=True,
        CANDIDATE_PRIVACY_NOTICE_URL="https://x.com/privacy",
        AI_HUMAN_REVIEW_REQUIRED=True,
        UPLOAD_FOLDER_SOURCE=source,
        UPLOAD_FOLDER=folder,
    )

    with pytest.raises(RuntimeError, match="UPLOAD_FOLDER"):
        _enforce_production_security(app)


def test_dev_mode_skips_enforcement():
    app = _mk(FLASK_DEBUG=True, JWT_SECRET="dev-secret", CORS_ORIGINS=[])
    _enforce_production_security(app)  # 开发模式放行


def test_insecure_sit_startup_is_off_by_default():
    assert Config.ALLOW_INSECURE_SIT_STARTUP is False
    assert Config.AUTO_MIGRATE_DATABASE is False
    assert Config.ALLOW_EMPTY_DATABASE_BOOTSTRAP is False


def test_explicit_insecure_sit_flag_skips_startup_gate_with_debug_off():
    app = _mk(
        FLASK_DEBUG=False,
        ALLOW_INSECURE_SIT_STARTUP=True,
        JWT_SECRET="sit-disposable-not-a-real-secret",
        CORS_ORIGINS=[],
        AI_RECRUITMENT_COMPLIANCE_ACK=False,
        CANDIDATE_PRIVACY_NOTICE_URL="",
        AI_HUMAN_REVIEW_REQUIRED=False,
        SECURITY_HEADERS_ENABLED=False,
        RATE_LIMIT_ENABLED=False,
        ALLOW_PUBLIC_REGISTRATION=True,
        AUTO_MIGRATE_DATABASE=True,
        ALLOW_EMPTY_DATABASE_BOOTSTRAP=True,
        UPLOAD_FOLDER_SOURCE="",
        UPLOAD_FOLDER="/tmp/zhipin_uploads",
    )

    _enforce_production_security(app)  # SIT 明确放行，不依赖 debug


def test_public_register_closed_by_default():
    with _managed_app(_DefaultClosed) as app:
        client = app.test_client()
        r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw123456"})
    assert r.status_code == 403
    assert "公开注册" in r.get_json()["error"]


class _DefaultClosed(TestingConfig):
    ALLOW_PUBLIC_REGISTRATION = False


class _RuntimeHardeningConfig(_DefaultClosed):
    RATE_LIMIT_ENABLED = True
    RATE_LIMITS = {
        "auth.login": {"limit": 2, "window_seconds": 60},
    }


class _StrictCorsConfig(_DefaultClosed):
    CORS_ORIGINS = ["https://old-only.example"]
    ALLOW_INSECURE_SIT_STARTUP = False


class _UnrestrictedSitCorsConfig(_StrictCorsConfig):
    ALLOW_INSECURE_SIT_STARTUP = True


def test_insecure_sit_ignores_stale_cors_whitelist():
    origin = "http://localhost:5173"
    with _managed_app(_UnrestrictedSitCorsConfig) as app:
        response = app.test_client().get("/api/health", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == origin


def test_strict_mode_keeps_configured_cors_whitelist():
    with _managed_app(_StrictCorsConfig) as app:
        client = app.test_client()
        blocked = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        allowed = client.get("/api/health", headers={"Origin": "https://old-only.example"})

    assert "Access-Control-Allow-Origin" not in blocked.headers
    assert allowed.headers["Access-Control-Allow-Origin"] == "https://old-only.example"


def test_security_headers_are_added_to_api_responses():
    with _managed_app(_DefaultClosed) as app:
        client = app.test_client()

        response = client.post("/api/auth/register", json={"email": "a@b.com", "password": "pw123456"})

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in response.headers["Permissions-Policy"]
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_login_rate_limit_blocks_repeated_failures():
    with _managed_app(_RuntimeHardeningConfig) as app:
        client = app.test_client()

        for _ in range(2):
            response = client.post(
                "/api/auth/login",
                json={"email": "missing@example.com", "password": "wrong"},
                environ_base={"REMOTE_ADDR": "203.0.113.10"},
            )
            assert response.status_code == 401

        blocked = client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "wrong"},
            environ_base={"REMOTE_ADDR": "203.0.113.10"},
        )

    assert blocked.status_code == 429
    assert "请求过于频繁" in blocked.get_json()["error"]
