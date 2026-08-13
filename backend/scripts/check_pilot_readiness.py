#!/usr/bin/env python3
"""Check whether pilot deployment environment settings satisfy hard gates.

This script is read-only. It never prints secret values and never writes .env.
"""

import argparse
import fnmatch
import os
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config_validation import validate_cors_origins
from app.services.gateway_role_service import parse_gateway_role_map
from runtime_paths import RuntimePathError, resolve_upload_folder


WEAK_SECRETS = {
    "",
    "dev-secret",
    "dev-secret-change-in-prod",
    "test-secret",
    "change-me-in-production",
    "sit-disposable-not-a-real-secret",
}


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() == "true"


def _is_false(value: str | None) -> bool:
    return (value or "").strip().lower() == "false"


def _is_positive_int(value: str | None) -> bool:
    try:
        return int(value or "") > 0
    except ValueError:
        return False


def _is_valid_fernet_key(value: str | None) -> bool:
    key = (value or "").strip()
    if not key or "change-me" in key or "your-fixed-fernet-key" in key:
        return False
    try:
        from cryptography.fernet import Fernet

        Fernet(key.encode("ascii"))
    except Exception:
        return False
    return True


def _database_kind(database_url: str) -> str:
    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        return "postgresql"
    if database_url.startswith(("mysql://", "mysql+pymysql://")):
        return "mysql"
    if database_url.startswith("sqlite:///"):
        return "sqlite"
    if not database_url:
        return "missing"
    return "unsupported"


def _valid_cors_origins(value: str | None) -> bool:
    try:
        return bool(validate_cors_origins(value or ""))
    except ValueError:
        return False


def _valid_persistent_upload_folder(value: str | None, project_root: Path) -> bool:
    try:
        resolve_upload_folder(
            value,
            project_root=project_root,
            require_persistent=True,
        )
    except RuntimePathError:
        return False
    return True


def _has_placeholder(value: str | None) -> bool:
    normalized = (value or "").strip().upper()
    return "REPLACE_" in normalized or "CHANGE_ME" in normalized


def _valid_persistent_directory(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw or _has_placeholder(raw):
        return False
    path = Path(raw).expanduser()
    if not path.is_absolute():
        return False
    try:
        normalized = path.resolve(strict=False)
        rejected_roots = {
            Path(temporary).resolve(strict=False)
            for temporary in (
                "/tmp",
                "/private/tmp",
                "/var/tmp",
                "/dev",
                "/proc",
                "/run",
                "/sys",
            )
        }
    except OSError:
        return False
    if any(
        normalized == temporary or temporary in normalized.parents
        for temporary in rejected_roots
    ):
        return False
    try:
        return normalized.is_dir() and os.access(normalized, os.W_OK | os.X_OK)
    except OSError:
        return False


def _valid_gateway_role_map(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw or _has_placeholder(raw):
        return False
    entries = [item.strip() for item in raw.split(",") if item.strip()]
    parsed = parse_gateway_role_map(raw)
    return bool(parsed) and len(parsed) == len(entries)


def _gitignore_patterns(project_root: Path) -> list[str]:
    gitignore = project_root / ".gitignore"
    if not gitignore.exists():
        return []
    patterns = []
    for raw_line in gitignore.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        patterns.append(line.lstrip("/"))
    return patterns


def _env_is_ignored(project_root: Path, env_file: Path) -> bool:
    try:
        rel = env_file.resolve().relative_to(project_root.resolve()).as_posix()
    except ValueError:
        return False

    name = env_file.name
    for pattern in _gitignore_patterns(project_root):
        if pattern == rel:
            return True
        if pattern == ".env" and name == ".env":
            return True
        if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern):
            return True
    return False


def run_checks(
    values: dict[str, str],
    project_root: Path,
    env_file: Path,
    *,
    profile: str = "production",
) -> list[CheckResult]:
    if profile not in {"production", "sit-team", "internal-trial"}:
        raise ValueError(f"unsupported readiness profile: {profile}")

    is_sit_team = profile == "sit-team"
    is_internal_trial = profile == "internal-trial"
    secret = values.get("JWT_SECRET", "")
    database_url = values.get("DATABASE_URL", "")
    database_kind = _database_kind(database_url)
    resume_ai_enabled = _is_true(values.get("RESUME_AI_ENABLED"))

    checks = [
        CheckResult(
            "JWT_SECRET",
            len(secret) >= 32 and secret not in WEAK_SECRETS and not _has_placeholder(secret),
            "长度需 >=32 且不能是默认弱值",
        ),
        CheckResult("JWT_EXPIRY_HOURS", _is_positive_int(values.get("JWT_EXPIRY_HOURS")), "需配置为正整数"),
        CheckResult("FLASK_DEBUG", _is_false(values.get("FLASK_DEBUG")), "生产/试点必须为 false"),
        CheckResult(
            "ALLOW_INSECURE_SIT_STARTUP",
            (
                _is_true(values.get("ALLOW_INSECURE_SIT_STARTUP"))
                if is_sit_team
                else _is_false(values.get("ALLOW_INSECURE_SIT_STARTUP"))
            ),
            (
                "Test/SIT 小团队试用必须显式为 true，且不得导入真实个人信息"
                if is_sit_team
                else "生产/真实数据试点必须显式为 false"
            ),
        ),
        CheckResult("DATABASE_URL", database_kind in {"mysql", "postgresql"}, f"生产/试点需使用 MySQL 或 PostgreSQL，当前类型：{database_kind}"),
        CheckResult(
            "CORS_ORIGINS",
            _valid_cors_origins(values.get("CORS_ORIGINS")),
            "生产/试点必须配置合法的 http(s) 公司域名 origin 白名单",
        ),
        CheckResult("SECURITY_HEADERS_ENABLED", _is_true(values.get("SECURITY_HEADERS_ENABLED")), "必须显式为 true"),
        CheckResult("RATE_LIMIT_ENABLED", _is_true(values.get("RATE_LIMIT_ENABLED")), "必须显式为 true"),
        CheckResult("RATE_LIMIT_LOGIN", _is_positive_int(values.get("RATE_LIMIT_LOGIN")), "必须显式配置正整数"),
        CheckResult("RATE_LIMIT_AGENT_CHAT", _is_positive_int(values.get("RATE_LIMIT_AGENT_CHAT")), "必须显式配置正整数"),
        CheckResult("RATE_LIMIT_RESUME_UPLOAD", _is_positive_int(values.get("RATE_LIMIT_RESUME_UPLOAD")), "必须显式配置正整数"),
        CheckResult(
            "BACKUP_DIR",
            _valid_persistent_directory(values.get("BACKUP_DIR")),
            "必须配置非临时目录的绝对服务器备份路径",
        ),
        CheckResult(
            "UPLOAD_FOLDER",
            _valid_persistent_upload_folder(values.get("UPLOAD_FOLDER"), project_root),
            "必须显式配置非临时目录的绝对持久路径",
        ),
        CheckResult(
            "LOCAL_SCHEMA_COMPAT",
            _is_false(values.get("LOCAL_SCHEMA_COMPAT")),
            "试点/生产必须显式为 false",
        ),
        CheckResult(
            "AUTO_MIGRATE_DATABASE",
            (
                _is_true(values.get("AUTO_MIGRATE_DATABASE"))
                if is_sit_team
                else _is_false(values.get("AUTO_MIGRATE_DATABASE"))
            ),
            (
                "Test/SIT 单实例启动迁移必须显式为 true"
                if is_sit_team
                else "试点/生产必须显式为 false"
            ),
        ),
        CheckResult(
            "ALLOW_EMPTY_DATABASE_BOOTSTRAP",
            (
                _is_true(values.get("ALLOW_EMPTY_DATABASE_BOOTSTRAP"))
                if is_sit_team
                else _is_false(values.get("ALLOW_EMPTY_DATABASE_BOOTSTRAP"))
            ),
            (
                "Test/SIT 可丢弃空库初始化必须显式为 true"
                if is_sit_team
                else "试点/生产必须显式为 false"
            ),
        ),
        CheckResult("ALLOW_PUBLIC_REGISTRATION", _is_false(values.get("ALLOW_PUBLIC_REGISTRATION")), "生产/试点必须关闭公开注册"),
        CheckResult(
            "BOSS_CLI_AUTO_INSTALL",
            _is_false(values.get("BOSS_CLI_AUTO_INSTALL")),
            "必须显式为 false；CLI 只能在镜像构建阶段固定安装",
        ),
        CheckResult(
            "AI_RECRUITMENT_COMPLIANCE_ACK",
            (
                not resume_ai_enabled
                if is_sit_team or is_internal_trial
                else _is_true(values.get("AI_RECRUITMENT_COMPLIANCE_ACK"))
            ),
            "真实候选人数据进入 AI 前必须显式确认合规边界；Test 关闭 AI 时无需确认",
        ),
        CheckResult(
            "CANDIDATE_PRIVACY_NOTICE_URL",
            (
                not resume_ai_enabled
                if is_sit_team or is_internal_trial
                else bool(values.get("CANDIDATE_PRIVACY_NOTICE_URL", "").strip())
            ),
            "必须配置候选人隐私告知/授权说明地址；Test 关闭 AI 时无需配置",
        ),
        CheckResult("AI_HUMAN_REVIEW_REQUIRED", _is_true(values.get("AI_HUMAN_REVIEW_REQUIRED")), "AI 结论必须保留人工复核"),
        CheckResult("FIELD_ENCRYPTION_KEY", _is_valid_fernet_key(values.get("FIELD_ENCRYPTION_KEY")), "测试/生产必须配置固定合法 Fernet key，避免 BOSS Cookie 无法加密或重启后无法解密；该检查不打印密钥"),
        CheckResult(".env gitignore", _env_is_ignored(project_root, env_file), "真实 .env 必须被 .gitignore 忽略"),
    ]
    if is_sit_team:
        checks.extend(
            [
                CheckResult(
                    "RESUME_AI_ENABLED",
                    _is_false(values.get("RESUME_AI_ENABLED")),
                    "Test/SIT 本轮必须显式关闭简历 AI 并使用人工补录",
                ),
                CheckResult(
                    "AUTH_DISABLED",
                    _is_true(values.get("AUTH_DISABLED")),
                    "Test/SIT 公司网关模式必须显式为 true",
                ),
                CheckResult(
                    "AUTH_GATEWAY_USER_ROLE",
                    values.get("AUTH_GATEWAY_USER_ROLE", "").strip().lower() == "recruiter",
                    "未映射公司账号必须使用最低权限 recruiter",
                ),
                CheckResult(
                    "AUTH_GATEWAY_ROLE_MAP",
                    _valid_gateway_role_map(values.get("AUTH_GATEWAY_ROLE_MAP")),
                    "必须是无占位工号的可解析角色映射，格式为 A001:recruiter",
                ),
            ]
        )
    elif is_internal_trial:
        checks.extend(
            [
                CheckResult(
                    "RESUME_AI_ENABLED",
                    _is_false(values.get("RESUME_AI_ENABLED")),
                    "真实数据内部试用本轮必须关闭简历 AI，使用人工补录",
                ),
                CheckResult(
                    "JOB_PROFILE_AI_ENABLED",
                    _is_false(values.get("JOB_PROFILE_AI_ENABLED")),
                    "真实数据内部试用本轮必须关闭岗位画像 AI，使用人工填写的 JD",
                ),
                CheckResult(
                    "AUTH_DISABLED",
                    _is_false(values.get("AUTH_DISABLED")),
                    "真实数据内部试用必须保留后端 JWT 校验，不使用宽松网关免鉴权模式",
                ),
            ]
        )
    return checks


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Check pilot deployment readiness without printing secrets.")
    parser.add_argument("--env-file", default=str(root / "backend" / ".env"), help="Path to backend .env")
    parser.add_argument("--project-root", default=str(root), help="Project root containing .gitignore")
    parser.add_argument(
        "--profile",
        choices=("production", "sit-team", "internal-trial"),
        default="production",
        help="Validation rules: production, disposable-data SIT, or strict real-data internal trial",
    )
    args = parser.parse_args()

    env_file = Path(args.env_file).expanduser()
    project_root = Path(args.project_root).expanduser()
    values = _parse_env_file(env_file)

    checks = run_checks(values, project_root, env_file, profile=args.profile)
    failed = [check for check in checks if not check.ok]

    print(f"试点部署前自检（profile={args.profile}）")
    print(f"env_file={env_file}")
    for check in checks:
        marker = "PASS" if check.ok else "FAIL"
        print(f"[{marker}] {check.name}: {check.detail}")

    if failed:
        print(f"自检未通过：{len(failed)} 项需要处理。")
        return 1

    print("试点部署前自检通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
