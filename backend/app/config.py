import os
import sys
from pathlib import Path

# 把 base_agent 加入 sys.path，复用原始模块
BASE_AGENT_DIR = Path(__file__).resolve().parent.parent.parent / "base_agent"
if str(BASE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_AGENT_DIR))

from dotenv import load_dotenv
from database_urls import normalize_database_url as _normalize_database_url
from runtime_paths import PROJECT_ROOT, resolve_upload_folder

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _upload_folder() -> str:
    return str(
        resolve_upload_folder(
            os.environ.get("UPLOAD_FOLDER"),
            project_root=PROJECT_ROOT,
        )
    )


def _resume_ai_enabled() -> bool:
    """Allow an explicit Apollo opt-in only for disposable RC/SIT images."""
    image_value = os.environ.get("RESUME_AI_ENABLED", "true")
    if os.environ.get("BUILD_CHANNEL", "").upper() == "RC":
        override = os.environ.get("SIT_RESUME_AI_ENABLED")
        if override is not None:
            return override.lower() == "true"
    return image_value.lower() == "true"


class Config:
    # LLM
    LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai")
    LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
    LLM_API_URL = os.environ.get("LLM_API_URL", "")
    RESUME_AI_ENABLED = _resume_ai_enabled()
    # 模型解析可能超过公司网关等待时间；生产默认落库后由后台任务解析。
    RESUME_PARSE_ASYNC_ENABLED = os.environ.get(
        "RESUME_PARSE_ASYNC_ENABLED", "true"
    ).lower() == "true"
    AI_RECRUITMENT_COMPLIANCE_ACK = os.environ.get("AI_RECRUITMENT_COMPLIANCE_ACK", "false").lower() == "true"
    CANDIDATE_PRIVACY_NOTICE_URL = os.environ.get("CANDIDATE_PRIVACY_NOTICE_URL", "")
    AI_HUMAN_REVIEW_REQUIRED = os.environ.get("AI_HUMAN_REVIEW_REQUIRED", "true").lower() == "true"
    # 外部搜索是独立的数据出网通道，必须显式开启。
    AGENT_WEB_SEARCH_ENABLED = os.environ.get(
        "AGENT_WEB_SEARCH_ENABLED",
        "false",
    ).lower() == "true"

    # JWT
    JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod")
    JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "8"))

    # 运行模式：生产模式下会强制校验密钥强度（见 app/__init__.py 的 _enforce_production_security）
    FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    # 仅供数据可丢弃的 RC/SIT 显式跳过启动安全门禁；默认和 GA 均关闭。
    ALLOW_INSECURE_SIT_STARTUP = os.environ.get("ALLOW_INSECURE_SIT_STARTUP", "false").lower() == "true"
    AUTO_MIGRATE_DATABASE = os.environ.get("AUTO_MIGRATE_DATABASE", "false").lower() == "true"
    ALLOW_EMPTY_DATABASE_BOOTSTRAP = os.environ.get("ALLOW_EMPTY_DATABASE_BOOTSTRAP", "false").lower() == "true"
    # 本地 SQLite 旧库兼容 DDL 必须额外显式开启，debug 本身不再授权改 schema。
    LOCAL_SCHEMA_COMPAT = os.environ.get("LOCAL_SCHEMA_COMPAT", "false").lower() == "true"

    # 公开注册开关：默认关闭，生产/试点下账号由 admin 创建（见 api/auth.py register）
    ALLOW_PUBLIC_REGISTRATION = os.environ.get("ALLOW_PUBLIC_REGISTRATION", "false").lower() == "true"

    # 网关统一鉴权模式：接入公司网关后，鉴权在网关完成，后端不再校验自签 JWT。
    # 开启后 require_auth 跳过 JWT 校验，改用默认用户身份填充 g.user_id/g.role/g.org_id
    # （见 app/middleware/auth.py）。安全护栏：仅在显式不安全环境（FLASK_DEBUG 或
    # ALLOW_INSECURE_SIT_STARTUP 或测试）才真正生效；GA/生产即使误设也不会关闭鉴权，
    # 且启动门禁（docker-entrypoint.sh）会拒绝 GA 携带 AUTH_DISABLED=true。
    AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "false").lower() == "true"
    # 网关模式下的当前用户身份：优先用请求头 X-Emp-Code（网关工号）find-or-create
    # 一个后端用户；没有工号头时才回退到下面的默认账号。
    # 回退账号：留空则取库中第一个在职 admin（否则第一个在职用户）。
    AUTH_DISABLED_USER_EMAIL = os.environ.get("AUTH_DISABLED_USER_EMAIL", "")
    # 按工号自动建号时给的兜底角色。Test 默认最小权限 recruiter；指定人员
    # 通过 EMP001:admin,EMP002:interviewer 形式的映射获得明确角色。
    AUTH_GATEWAY_USER_ROLE = os.environ.get("AUTH_GATEWAY_USER_ROLE", "recruiter")
    AUTH_GATEWAY_ROLE_MAP = os.environ.get("AUTH_GATEWAY_ROLE_MAP", "")

    # CORS 允许来源：逗号分隔的域名白名单；留空表示不限制（仅限开发）
    CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

    # 试点上线安全头和轻量限流。Nginx 层也应配置限流，这里是应用侧兜底。
    SECURITY_HEADERS_ENABLED = os.environ.get("SECURITY_HEADERS_ENABLED", "true").lower() == "true"
    RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true"
    # 只有明确配置了受信反向代理层数，才读取 X-Forwarded-For。
    TRUST_PROXY_HOPS = int(os.environ.get("TRUST_PROXY_HOPS", "0"))
    RATE_LIMIT_BUCKET_MAX = int(os.environ.get("RATE_LIMIT_BUCKET_MAX", "10000"))
    RATE_LIMITS = {
        "auth.login": {"limit": int(os.environ.get("RATE_LIMIT_LOGIN", "10")), "window_seconds": 60},
        "agent.chat": {"limit": int(os.environ.get("RATE_LIMIT_AGENT_CHAT", "20")), "window_seconds": 60},
        "resume.upload": {"limit": int(os.environ.get("RATE_LIMIT_RESUME_UPLOAD", "8")), "window_seconds": 60},
        "interview.submit": {"limit": int(os.environ.get("RATE_LIMIT_INTERVIEW_SUBMIT", "10")), "window_seconds": 60},
    }
    INTERVIEW_QA_MAX_PAIRS = int(os.environ.get("INTERVIEW_QA_MAX_PAIRS", "20"))
    INTERVIEW_QA_MAX_QUESTION_LENGTH = int(
        os.environ.get("INTERVIEW_QA_MAX_QUESTION_LENGTH", "1000")
    )
    INTERVIEW_QA_MAX_ANSWER_LENGTH = int(
        os.environ.get("INTERVIEW_QA_MAX_ANSWER_LENGTH", "5000")
    )
    INTERVIEW_QA_MAX_TOTAL_LENGTH = int(
        os.environ.get("INTERVIEW_QA_MAX_TOTAL_LENGTH", "30000")
    )

    # 视为弱/默认的密钥，生产启动时拒绝
    WEAK_SECRETS = {
        "dev-secret-change-in-prod",
        "dev-secret",
        "test-secret",
        "change-me-in-production",
        "sit-disposable-not-a-real-secret",
        "",
    }
    MIN_SECRET_LENGTH = 32

    # 数据库：开发用 SQLite（绝对路径，避免 CWD 不同导致建出空库），试点/生产换 MySQL 或 PostgreSQL URL
    _default_db = "sqlite:///" + str(Path(__file__).resolve().parent.parent / "hireinsight.db")
    DATABASE_URL = _normalize_database_url(os.environ.get("DATABASE_URL", _default_db))
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # 文件上传：本地开发默认 /tmp；试点/生产安全护栏强制显式绝对持久路径。
    UPLOAD_FOLDER_SOURCE = os.environ.get("UPLOAD_FOLDER", "").strip()
    UPLOAD_FOLDER = _upload_folder()
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB

    # Celery：开发用 eager（同进程，无需 Redis）
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "memory://")
    CELERY_TASK_ALWAYS_EAGER = os.environ.get("CELERY_TASK_ALWAYS_EAGER", "true").lower() == "true"

    # boss-cli（BOSS 直聘招聘端集成）：二进制路径覆盖与自动安装开关
    BOSS_CLI_BIN = os.environ.get("BOSS_CLI_BIN", "")
    BOSS_CLI_AUTO_INSTALL = os.environ.get("BOSS_CLI_AUTO_INSTALL", "false").lower() == "true"

    # 字段级加密密钥（Fernet），用于加密 BOSS 账号 cookies 等敏感数据
    FIELD_ENCRYPTION_KEY = os.environ.get("FIELD_ENCRYPTION_KEY", "")

    # Flask
    SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret")
    TESTING = False

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CELERY_TASK_ALWAYS_EAGER = True
    JWT_SECRET = "test-secret-for-hs256-warning-cleanup-2026"
    # 测试保留公开注册以覆盖既有 register 用例；生产默认关闭
    ALLOW_PUBLIC_REGISTRATION = True
    RATE_LIMIT_ENABLED = False
    # 既有接口测试继续覆盖同步兼容路径；异步测试会显式开启。
    RESUME_PARSE_ASYNC_ENABLED = False
