import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parents[2]


def _copy_entrypoint(tmp_path, release_channel):
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir(exist_ok=True)
    script = backend_dir / "docker-entrypoint.sh"
    shutil.copy2(ROOT / "backend" / "docker-entrypoint.sh", script)
    script.chmod(0o755)
    (backend_dir / ".release-channel").write_text(
        f"{release_channel}\n",
        encoding="utf-8",
    )
    return script


def test_sit_server_build_is_explicitly_unrestricted_but_ga_is_strict():
    rc = subprocess.run(
        ["make", "-n", "buildserver", "PKG_TAG=RC", "PKG_VERSION=contract-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    ga = subprocess.run(
        ["make", "-n", "buildserver", "PKG_TAG=GA", "PKG_VERSION=contract-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert rc.returncode == 0
    assert ga.returncode == 0
    assert "--build-arg RELEASE_CHANNEL=RC" in rc.stdout
    assert "--build-arg RELEASE_CHANNEL=GA" in ga.stdout
    for build_arg, rc_value, ga_value in [
        ("AUTO_MIGRATE_DATABASE", "true", "false"),
        ("ALLOW_EMPTY_DATABASE_BOOTSTRAP", "true", "false"),
        ("ALLOW_INSECURE_SIT_STARTUP", "true", "false"),
        ("SECURITY_HEADERS_ENABLED", "false", "true"),
        ("RATE_LIMIT_ENABLED", "false", "true"),
        ("ALLOW_PUBLIC_REGISTRATION", "true", "false"),
        ("RESUME_AI_ENABLED", "false", "true"),
    ]:
        assert f"--build-arg {build_arg}={rc_value}" in rc.stdout
        assert f"--build-arg {build_arg}={ga_value}" in ga.stdout


def test_rc_images_receive_four_account_role_map_but_ga_does_not():
    role_map = "100000:interviewer,100001:manager,100002:recruiter,100003:interviewer"
    rc = subprocess.run(
        ["make", "-n", "build", "PKG_TAG=RC", "PKG_VERSION=role-map-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    ga = subprocess.run(
        ["make", "-n", "build", "PKG_TAG=GA", "PKG_VERSION=role-map-test"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert rc.returncode == 0
    assert ga.returncode == 0
    assert rc.stdout.count(role_map) == 2
    assert "--build-arg AUTH_GATEWAY_USER_ROLE=recruiter" in rc.stdout
    assert role_map not in ga.stdout


def test_make_rejects_unknown_package_tags():
    for tag in ["QA", "production", "RC2"]:
        result = subprocess.run(
            ["make", "-n", "buildserver", f"PKG_TAG={tag}", "PKG_VERSION=contract-test"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode != 0
        assert "PKG_TAG" in result.stderr


def test_make_release_policy_cannot_be_overridden_from_command_line():
    hostile_values = {
        "RELEASE_CHANNEL": "RC",
        "AUTO_MIGRATE_DATABASE": "true",
        "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "true",
        "ALLOW_INSECURE_SIT_STARTUP": "true",
        "SECURITY_HEADERS_ENABLED": "false",
        "RATE_LIMIT_ENABLED": "false",
        "ALLOW_PUBLIC_REGISTRATION": "true",
    }
    ga = subprocess.run(
        [
            "make",
            "-n",
            "buildserver",
            "PKG_TAG=GA",
            "PKG_VERSION=contract-test",
            *(f"{key}={value}" for key, value in hostile_values.items()),
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    rc = subprocess.run(
        [
            "make",
            "-n",
            "buildserver",
            "PKG_TAG=RC",
            "PKG_VERSION=contract-test",
            *(f"{key}={value}" for key, value in {
                "RELEASE_CHANNEL": "GA",
                "AUTO_MIGRATE_DATABASE": "false",
                "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "false",
                "ALLOW_INSECURE_SIT_STARTUP": "false",
                "SECURITY_HEADERS_ENABLED": "true",
                "RATE_LIMIT_ENABLED": "true",
                "ALLOW_PUBLIC_REGISTRATION": "false",
            }.items()),
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert ga.returncode == 0
    assert rc.returncode == 0
    assert "--build-arg RELEASE_CHANNEL=RC" in rc.stdout
    assert "--build-arg RELEASE_CHANNEL=GA" in ga.stdout
    for build_arg, rc_value, ga_value in [
        ("AUTO_MIGRATE_DATABASE", "true", "false"),
        ("ALLOW_EMPTY_DATABASE_BOOTSTRAP", "true", "false"),
        ("ALLOW_INSECURE_SIT_STARTUP", "true", "false"),
        ("SECURITY_HEADERS_ENABLED", "false", "true"),
        ("RATE_LIMIT_ENABLED", "false", "true"),
        ("ALLOW_PUBLIC_REGISTRATION", "true", "false"),
    ]:
        assert f"--build-arg {build_arg}={rc_value}" in rc.stdout
        assert f"--build-arg {build_arg}={ga_value}" in ga.stdout


def test_backend_entrypoint_runs_alembic_only_when_enabled(tmp_path):
    script = _copy_entrypoint(tmp_path, "RC")
    assert script.exists()

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log_path = tmp_path / "commands.log"
    for name, line in {
        "alembic": 'printf "alembic %s\\n" "$*" >> "$COMMAND_LOG"',
        "start-app": 'printf "start-app %s\\n" "$*" >> "$COMMAND_LOG"',
    }.items():
        executable = bin_dir / name
        executable.write_text(f"#!/bin/sh\n{line}\n", encoding="utf-8")
        executable.chmod(0o755)

    env = os.environ.copy()
    env.update({
        "PATH": f"{bin_dir}:{env['PATH']}",
        "COMMAND_LOG": str(log_path),
        "AUTO_MIGRATE_DATABASE": "true",
    })
    enabled = subprocess.run(
        [str(script), "start-app", "enabled"],
        cwd=str(tmp_path),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert enabled.returncode == 0
    assert log_path.read_text(encoding="utf-8").splitlines() == [
        "alembic -c /app/backend/alembic.ini upgrade head",
        "start-app enabled",
    ]

    log_path.unlink()
    env["AUTO_MIGRATE_DATABASE"] = "false"
    disabled = subprocess.run(
        [str(script), "start-app", "disabled"],
        cwd=str(ROOT / "backend"),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert disabled.returncode == 0
    assert log_path.read_text(encoding="utf-8").splitlines() == ["start-app disabled"]


def test_ga_entrypoint_rejects_each_unsafe_runtime_override_before_database_access(tmp_path):
    unsafe_values = {
        "ALLOW_INSECURE_SIT_STARTUP": "true",
        "AUTO_MIGRATE_DATABASE": "true",
        "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "true",
        "SECURITY_HEADERS_ENABLED": "false",
        "RATE_LIMIT_ENABLED": "false",
        "ALLOW_PUBLIC_REGISTRATION": "true",
    }

    for variable, value in unsafe_values.items():
        case_dir = tmp_path / variable.lower()
        case_dir.mkdir()
        script = _copy_entrypoint(case_dir, "GA")
        bin_dir = case_dir / "bin"
        bin_dir.mkdir()
        command_log = case_dir / "commands.log"
        for name in ("python", "alembic", "start-app"):
            executable = bin_dir / name
            executable.write_text(
                f'#!/bin/sh\nprintf "{name} %s\\n" "$*" >> "$COMMAND_LOG"\n',
                encoding="utf-8",
            )
            executable.chmod(0o755)

        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{bin_dir}:{env['PATH']}",
                "COMMAND_LOG": str(command_log),
                "ALLOW_INSECURE_SIT_STARTUP": "false",
                "AUTO_MIGRATE_DATABASE": "false",
                "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "false",
                "SECURITY_HEADERS_ENABLED": "true",
                "RATE_LIMIT_ENABLED": "true",
                "ALLOW_PUBLIC_REGISTRATION": "false",
                variable: value,
            }
        )

        result = subprocess.run(
            [str(script), "start-app", "blocked"],
            cwd=str(case_dir),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode != 0, variable
        assert variable in result.stderr, variable
        assert not command_log.exists(), variable


def test_entrypoint_fails_closed_for_missing_or_unknown_release_marker(tmp_path):
    for marker in (None, "QA"):
        case_dir = tmp_path / (marker or "missing")
        case_dir.mkdir()
        script = _copy_entrypoint(case_dir, "RC")
        marker_path = script.parent / ".release-channel"
        if marker is None:
            marker_path.unlink()
        else:
            marker_path.write_text(f"{marker}\n", encoding="utf-8")
        command_log = case_dir / "commands.log"
        env = os.environ.copy()
        env.update(
            {
                "COMMAND_LOG": str(command_log),
                "AUTO_MIGRATE_DATABASE": "true",
                "ALLOW_EMPTY_DATABASE_BOOTSTRAP": "true",
            }
        )

        result = subprocess.run(
            [str(script), "start-app", "blocked"],
            cwd=str(case_dir),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode != 0
        assert "release channel" in result.stderr.lower()
        assert not command_log.exists()


def test_backend_dockerfile_wires_migration_entrypoint():
    content = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG AUTO_MIGRATE_DATABASE=false" in content
    assert "ENV AUTO_MIGRATE_DATABASE=${AUTO_MIGRATE_DATABASE}" in content
    assert "ARG ALLOW_INSECURE_SIT_STARTUP=false" in content
    assert "ENV ALLOW_INSECURE_SIT_STARTUP=${ALLOW_INSECURE_SIT_STARTUP}" in content
    assert "ARG SECURITY_HEADERS_ENABLED=true" in content
    assert "ENV SECURITY_HEADERS_ENABLED=${SECURITY_HEADERS_ENABLED}" in content
    assert "ARG RATE_LIMIT_ENABLED=true" in content
    assert "ENV RATE_LIMIT_ENABLED=${RATE_LIMIT_ENABLED}" in content
    assert "ARG ALLOW_PUBLIC_REGISTRATION=false" in content
    assert "ENV ALLOW_PUBLIC_REGISTRATION=${ALLOW_PUBLIC_REGISTRATION}" in content
    assert "ARG RESUME_AI_ENABLED=true" in content
    assert "ENV RESUME_AI_ENABLED=${RESUME_AI_ENABLED}" in content
    assert "ENV FLASK_DEBUG=false" in content
    assert "ARG FLASK_DEBUG" not in content
    assert "ENV LOCAL_SCHEMA_COMPAT=false" in content
    assert "ARG RELEASE_CHANNEL=UNKNOWN" in content
    assert "ENV RELEASE_CHANNEL" not in content
    assert "/app/backend/.release-channel" in content
    assert '"RC"|"GA"' in content
    assert 'ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]' in content


def _read_env_template(path):
    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values


def test_environment_templates_separate_sit_unrestricted_from_production():
    default_values = _read_env_template(ROOT / "backend" / ".env.example")
    pilot_values = _read_env_template(ROOT / "backend" / "lightweight-pilot.env.example")
    sit_path = ROOT / "backend" / "sit-unrestricted.env.example"

    assert default_values["ALLOW_INSECURE_SIT_STARTUP"] == "false"
    assert pilot_values["ALLOW_INSECURE_SIT_STARTUP"] == "false"
    assert default_values["AUTO_MIGRATE_DATABASE"] == "false"
    assert default_values["ALLOW_EMPTY_DATABASE_BOOTSTRAP"] == "false"
    assert pilot_values["AUTO_MIGRATE_DATABASE"] == "false"
    assert pilot_values["ALLOW_EMPTY_DATABASE_BOOTSTRAP"] == "false"

    assert sit_path.exists()
    sit_values = _read_env_template(sit_path)
    assert sit_values["FLASK_DEBUG"] == "false"
    assert sit_values["ALLOW_INSECURE_SIT_STARTUP"] == "true"
    assert sit_values["SECURITY_HEADERS_ENABLED"] == "false"
    assert sit_values["RATE_LIMIT_ENABLED"] == "false"
    assert sit_values["ALLOW_PUBLIC_REGISTRATION"] == "true"
    assert sit_values["AUTO_MIGRATE_DATABASE"] == "true"
    assert sit_values["ALLOW_EMPTY_DATABASE_BOOTSTRAP"] == "true"
    assert sit_values["LOCAL_SCHEMA_COMPAT"] == "false"
    assert sit_values["DATABASE_URL"]
    assert sit_values["JWT_SECRET"]
    assert sit_values["JWT_SECRET"] == "sit-disposable-not-a-real-secret"
    assert "change-me" not in sit_path.read_text(encoding="utf-8")
    assert "sk-" not in sit_path.read_text(encoding="utf-8")


def test_nginx_sample_covers_security_headers_and_hot_path_limits():
    config_path = ROOT / "deploy" / "nginx" / "zhipin.conf.example"
    assert config_path.exists()

    content = config_path.read_text()
    assert "add_header X-Frame-Options" in content
    assert "add_header X-Content-Type-Options" in content
    assert "add_header Referrer-Policy" in content
    assert "limit_req_zone" in content
    assert "location = /api/auth/login" in content
    assert "location = /api/agent/chat" in content
    assert "location = /api/resume/upload" in content


def test_backup_script_dry_run_lists_database_and_uploads_targets(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    assert script.exists()

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "postgresql://user:pass@db:5432/zhipin",
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [sys.executable, str(script), "--dry-run"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "pg_dump" in result.stdout
    assert "uploads" in result.stdout
    assert str(tmp_path / "backups") in result.stdout


def test_backup_script_dry_run_supports_mysql(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "mysql+pymysql://user:pass@db:3306/zhipin?charset=utf8mb4",
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [sys.executable, str(script), "--dry-run"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "mysqldump" in result.stdout
    assert "MYSQL_DATABASE=zhipin" in result.stdout
    assert "pass" not in result.stdout


def test_pilot_readiness_check_fails_without_required_production_env(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=short-secret",
            "FLASK_DEBUG=true",
            "DATABASE_URL=sqlite:///local.db",
            "CORS_ORIGINS=",
        ])
    )

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "JWT_SECRET" in result.stdout
    assert "FLASK_DEBUG" in result.stdout
    assert "DATABASE_URL" in result.stdout
    assert "CORS_ORIGINS" in result.stdout
    assert "UPLOAD_FOLDER" in result.stdout
    assert "ALLOW_INSECURE_SIT_STARTUP" in result.stdout
    assert "AUTO_MIGRATE_DATABASE" in result.stdout
    assert "ALLOW_EMPTY_DATABASE_BOOTSTRAP" in result.stdout
    assert "short-secret" not in result.stdout


def test_pilot_readiness_check_passes_with_production_env(
    tmp_path,
    persistent_test_dir,
):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "ALLOW_INSECURE_SIT_STARTUP=false",
            "AUTO_MIGRATE_DATABASE=false",
            "ALLOW_EMPTY_DATABASE_BOOTSTRAP=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=" + str(persistent_test_dir),
            "UPLOAD_FOLDER=/var/lib/zhipin/uploads",
            "LOCAL_SCHEMA_COMPAT=false",
            "ALLOW_PUBLIC_REGISTRATION=false",
            "BOSS_CLI_AUTO_INSTALL=false",
            "AI_RECRUITMENT_COMPLIANCE_ACK=true",
            "CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.example.com/privacy",
            "AI_HUMAN_REVIEW_REQUIRED=true",
            "FIELD_ENCRYPTION_KEY=" + Fernet.generate_key().decode(),
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "试点部署前自检通过" in result.stdout


def test_pilot_readiness_rejects_insecure_sit_startup_flag(
    tmp_path,
    persistent_test_dir,
):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "ALLOW_INSECURE_SIT_STARTUP=true",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=" + str(persistent_test_dir),
            "UPLOAD_FOLDER=/var/lib/zhipin/uploads",
            "LOCAL_SCHEMA_COMPAT=false",
            "ALLOW_PUBLIC_REGISTRATION=false",
            "BOSS_CLI_AUTO_INSTALL=false",
            "AI_RECRUITMENT_COMPLIANCE_ACK=true",
            "CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.example.com/privacy",
            "AI_HUMAN_REVIEW_REQUIRED=true",
            "FIELD_ENCRYPTION_KEY=" + Fernet.generate_key().decode(),
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "[FAIL] ALLOW_INSECURE_SIT_STARTUP" in result.stdout


def test_pilot_readiness_rejects_public_sit_secret_and_schema_mutation(
    tmp_path,
    persistent_test_dir,
):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=sit-disposable-not-a-real-secret",
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "ALLOW_INSECURE_SIT_STARTUP=false",
            "AUTO_MIGRATE_DATABASE=true",
            "ALLOW_EMPTY_DATABASE_BOOTSTRAP=true",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=" + str(persistent_test_dir),
            "UPLOAD_FOLDER=/var/lib/zhipin/uploads",
            "LOCAL_SCHEMA_COMPAT=false",
            "ALLOW_PUBLIC_REGISTRATION=false",
            "BOSS_CLI_AUTO_INSTALL=false",
            "AI_RECRUITMENT_COMPLIANCE_ACK=true",
            "CANDIDATE_PRIVACY_NOTICE_URL=https://zhipin.example.com/privacy",
            "AI_HUMAN_REVIEW_REQUIRED=true",
            "FIELD_ENCRYPTION_KEY=" + Fernet.generate_key().decode(),
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "[FAIL] JWT_SECRET" in result.stdout
    assert "[FAIL] AUTO_MIGRATE_DATABASE" in result.stdout
    assert "[FAIL] ALLOW_EMPTY_DATABASE_BOOTSTRAP" in result.stdout


def test_pilot_readiness_check_requires_ai_compliance_flags(
    tmp_path,
    persistent_test_dir,
):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "ALLOW_INSECURE_SIT_STARTUP=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=" + str(persistent_test_dir),
            "UPLOAD_FOLDER=/var/lib/zhipin/uploads",
            "LOCAL_SCHEMA_COMPAT=false",
            "ALLOW_PUBLIC_REGISTRATION=false",
            "BOSS_CLI_AUTO_INSTALL=false",
        ])
    )
    (tmp_path / ".gitignore").write_text("backend/.env\n*.env\n")

    result = subprocess.run(
        [sys.executable, str(script), "--env-file", str(env_file), "--project-root", str(tmp_path)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "AI_RECRUITMENT_COMPLIANCE_ACK" in result.stdout
    assert "CANDIDATE_PRIVACY_NOTICE_URL" in result.stdout
    assert "AI_HUMAN_REVIEW_REQUIRED" in result.stdout


def test_restore_script_restores_sqlite_database_and_uploads(tmp_path):
    backup_script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    backup_root = tmp_path / "backups"
    upload_folder.mkdir()

    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE candidates (id INTEGER PRIMARY KEY, name_masked TEXT)")
    connection.execute("INSERT INTO candidates (id, name_masked) VALUES (1, '恢复候选人')")
    connection.commit()
    connection.close()
    (upload_folder / "resume.pdf").write_text("resume", encoding="utf-8")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
        "BACKUP_DIR": str(backup_root),
    })
    backup = subprocess.run(
        [sys.executable, str(backup_script)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert backup.returncode == 0
    snapshot = sorted(backup_root.iterdir())[-1]
    restore_upload_folder = tmp_path / "restored_uploads"

    db_path.unlink()
    for child in upload_folder.iterdir():
        child.unlink()
    upload_folder.rmdir()

    restore_env = env | {"UPLOAD_FOLDER": str(restore_upload_folder)}
    restore = subprocess.run(
        [sys.executable, str(restore_script), "--backup-path", str(snapshot), "--confirm"],
        cwd=str(ROOT),
        env=restore_env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert restore.returncode == 0
    connection = sqlite3.connect(db_path)
    row = connection.execute("SELECT name_masked FROM candidates WHERE id=1").fetchone()
    connection.close()
    assert row == ("恢复候选人",)
    assert (restore_upload_folder / "resume.pdf").read_text(encoding="utf-8") == "resume"


def test_restore_script_rejects_upload_tar_path_traversal(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    sqlite3.connect(db_path).close()
    shutil.copy2(db_path, backup_path / db_path.name)
    with tarfile.open(backup_path / "uploads.tar.gz", "w:gz") as archive:
        evil = tmp_path / "evil.txt"
        evil.write_text("evil", encoding="utf-8")
        archive.add(evil, arcname="../evil.txt")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
    })

    result = subprocess.run(
        [sys.executable, str(restore_script), "--backup-path", str(backup_path), "--confirm"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "不安全" in (result.stderr + result.stdout)


def _seed_cleanup_database(db_path):
    connection = sqlite3.connect(db_path)
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            jd_text TEXT NOT NULL,
            owner_hr_id INTEGER
        );
        CREATE TABLE candidates (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            upload_batch_id INTEGER,
            name_masked TEXT,
            email_masked TEXT,
            phone_masked TEXT,
            resume_json JSON NOT NULL,
            raw_file_path TEXT
        );
        CREATE TABLE upload_batches (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            target_job_id INTEGER
        );
        CREATE TABLE matches (
            id INTEGER PRIMARY KEY,
            job_id INTEGER,
            candidate_id INTEGER,
            score REAL NOT NULL
        );
        CREATE TABLE pipeline_stages (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER,
            job_id INTEGER,
            stage TEXT NOT NULL,
            updated_by INTEGER
        );
        CREATE TABLE interview_assignments (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            round TEXT NOT NULL,
            interviewer_id INTEGER NOT NULL,
            created_by INTEGER
        );
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL
        );
        CREATE TABLE conversations (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT
        );
        CREATE TABLE conversation_messages (
            id INTEGER PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            actor_id INTEGER,
            action TEXT NOT NULL,
            entity_id INTEGER,
            entity_type TEXT
        );
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY,
            actor_id INTEGER,
            target_table TEXT,
            target_id INTEGER,
            action TEXT
        );
        """
    )
    cursor.executescript(
        """
        INSERT INTO users (id, name, email, role, password_hash) VALUES
            (1, 'Demo HR', 'hr01@mvp.local', 'recruiter', 'x'),
            (2, 'Real HR', 'real@example.com', 'recruiter', 'x');
        INSERT INTO jobs (id, title, jd_text, owner_hr_id) VALUES
            (10, 'Demo Job', 'demo jd', 1),
            (20, 'Real Job', 'real jd', 2);
        INSERT INTO upload_batches (id, owner_hr_id, target_job_id) VALUES
            (100, 1, 10),
            (200, 2, 20);
        INSERT INTO candidates (
            id, owner_hr_id, upload_batch_id, name_masked, email_masked, phone_masked, resume_json, raw_file_path
        ) VALUES
            (1000, 1, 100, 'Demo Candidate', 'demo@example.com', '138', '{}', 'backend/uploads/demo.pdf'),
            (2000, 2, 200, 'Real Candidate', 'real@example.com', '139', '{}', 'backend/uploads/real.pdf');
        INSERT INTO matches (id, job_id, candidate_id, score) VALUES
            (1, 10, 1000, 90),
            (2, 20, 2000, 80);
        INSERT INTO pipeline_stages (id, candidate_id, job_id, stage, updated_by) VALUES
            (1, 1000, 10, 'pending', 1),
            (2, 2000, 20, 'pending', 2);
        INSERT INTO interview_assignments (id, candidate_id, job_id, round, interviewer_id, created_by) VALUES
            (1, 1000, 10, 'interview', 1, 1),
            (2, 2000, 20, 'interview', 2, 2);
        INSERT INTO notifications (id, user_id, type, title) VALUES
            (1, 1, 'demo', 'demo'),
            (2, 2, 'real', 'real');
        INSERT INTO conversations (id, user_id, title) VALUES
            (1, 1, 'demo'),
            (2, 2, 'real');
        INSERT INTO conversation_messages (id, conversation_id, role, content) VALUES
            (1, 1, 'user', 'demo'),
            (2, 2, 'user', 'real');
        INSERT INTO events (id, actor_id, action, entity_id, entity_type) VALUES
            (1, 1, 'demo', 1000, 'candidate'),
            (2, 2, 'real', 2000, 'candidate');
        INSERT INTO audit_logs (id, actor_id, target_table, target_id, action) VALUES
            (1, 1, 'candidates', 1000, 'demo'),
            (2, 2, 'candidates', 2000, 'real');
        """
    )
    connection.commit()
    connection.close()


def test_cleanup_demo_data_dry_run_does_not_delete_or_create_backup(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    root_uploads = tmp_path / "uploads"
    backend_uploads.mkdir(parents=True)
    root_uploads.mkdir()
    (backend_uploads / "demo.pdf").write_text("demo")
    (root_uploads / "demo-root.pdf").write_text("demo root")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(backend_uploads),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--project-root",
            str(tmp_path),
            "--dry-run",
        ],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "DRY RUN" in result.stdout
    assert "users: 1" in result.stdout
    assert "backend/uploads files: 1" in result.stdout
    assert "uploads files: 1" in result.stdout
    assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
    assert (backend_uploads / "demo.pdf").exists()
    assert not (tmp_path / "backups").exists()


def test_cleanup_demo_data_confirm_backs_up_then_deletes_only_referenced_upload(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    root_uploads = tmp_path / "uploads"
    backend_uploads.mkdir(parents=True)
    root_uploads.mkdir()
    (backend_uploads / "demo.pdf").write_text("demo")
    (root_uploads / "demo-root.pdf").write_text("demo root")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(backend_uploads),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    command = [
        sys.executable,
        str(script),
        "--project-root",
        str(tmp_path),
        "--confirm",
    ]
    first = subprocess.run(
        command,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    second = subprocess.run(
        command,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert first.returncode == 0
    assert second.returncode == 0
    assert "backup complete" in first.stdout
    assert "DELETE CONFIRMED" in first.stdout

    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT email FROM users").fetchall() == [("real@example.com",)]
    assert connection.execute("SELECT title FROM jobs").fetchall() == [("Real Job",)]
    assert connection.execute("SELECT name_masked FROM candidates").fetchall() == [("Real Candidate",)]
    assert connection.execute("SELECT COUNT(*) FROM matches").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM pipeline_stages").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM interview_assignments").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM notifications").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM conversation_messages").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0] == 1
    connection.close()
    assert list(backend_uploads.glob("*")) == []
    assert [path.name for path in root_uploads.glob("*")] == ["demo-root.pdf"]
    assert list((tmp_path / "backups").glob("*"))


def test_small_team_sit_release_uses_safe_roles_manual_resume_and_clean_context():
    frontend_dockerfile = (ROOT / "readdy-frontend" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    sit_template = (ROOT / "backend" / "sit-team-trial.env.example").read_text(
        encoding="utf-8"
    )
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    dockerignore = (ROOT / ".dockerignore").read_text(encoding="utf-8")
    deployment = (ROOT / "DEPLOYMENT.md").read_text(encoding="utf-8")

    assert "ARG VITE_DEFAULT_ROLE=recruiter" in frontend_dockerfile
    assert "ARG VITE_GATEWAY_ROLE_MAP=" in frontend_dockerfile
    assert "VITE_GATEWAY_ROLE_MAP" in makefile
    assert "AUTH_GATEWAY_USER_ROLE=recruiter" in sit_template
    assert "AUTH_GATEWAY_ROLE_MAP=" in sit_template
    assert "RESUME_AI_ENABLED=false" in sit_template
    assert "DATABASE_URL=mysql+pymysql://" in sit_template
    assert "UPLOAD_FOLDER=/var/lib/zhipin/uploads" in sit_template
    assert "/diagrams/" in gitignore
    assert "/docs/acceptance-assets/" in gitignore
    assert "diagrams" in dockerignore
    assert "docs/acceptance-assets" in dockerignore
    assert "20260811_18" in deployment
    assert "AUTH_GATEWAY_ROLE_MAP" in deployment


def test_python_dependency_audit_is_pinned_and_not_in_runtime_image():
    audit_requirements = (
        ROOT / "backend" / "requirements-audit.txt"
    ).read_text(encoding="utf-8")
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert audit_requirements.strip() == "pip-audit==2.10.1"
    assert "requirements-audit.txt" not in dockerfile


def test_frontend_and_backend_images_receive_the_same_build_identity():
    frontend_dockerfile = (ROOT / "readdy-frontend" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    backend_dockerfile = (ROOT / "backend" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")

    for name in ("BUILD_VERSION", "BUILD_CHANNEL", "BUILD_TIME"):
        assert name in frontend_dockerfile
        assert name in backend_dockerfile
        assert name in makefile

    dry_run = subprocess.run(
        [
            "make",
            "-n",
            "build",
            "PKG_TAG=RC",
            "PKG_VERSION=identity-test",
            "BUILD_VERSION=abc123def456",
            "BUILD_TIME=2026-07-30T12:00:00Z",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )

    assert dry_run.returncode == 0
    assert dry_run.stdout.count("BUILD_VERSION=abc123def456") == 2
    assert dry_run.stdout.count("BUILD_CHANNEL=RC") == 2
    assert dry_run.stdout.count("BUILD_TIME=2026-07-30T12:00:00Z") == 2


def test_sit_release_gate_runs_required_checks_without_mutating_release_state():
    release_gate = (ROOT / "scripts" / "check-sit-release.sh").read_text(
        encoding="utf-8"
    )
    frontend_audit = (
        ROOT / "scripts" / "check-frontend-audit.mjs"
    ).read_text(encoding="utf-8")

    assert "set -euo pipefail" in release_gate
    for required in [
        "pytest backend/tests base_agent/tests",
        "npm run test:contract",
        "npm run type-check",
        "npm run lint",
        "npm run build",
        "check-frontend-audit.mjs",
        "pip_audit --local --strict",
        "alembic heads",
        "git diff --check",
        "make -n build",
    ]:
        assert required in release_gate
    for forbidden in [
        "git push",
        "git commit",
        "alembic upgrade",
        "npm audit fix",
        "rm -rf",
    ]:
        assert forbidden not in release_gate
    assert 'BUILD_TIME="${BUILD_TIME:-' in release_gate
    assert 'BUILD_TIME="2026-07-30T00:00:00Z"' not in release_gate
    assert "node --test tests/*.test.mjs" not in release_gate

    assert "GHSA-qwww-vcr4-c8h2" in frontend_audit
    assert "npm audit --json" in frontend_audit
    assert "blockedAdvisories" in frontend_audit
    assert "scanForRscEntrypoints" in frontend_audit


def test_gitlab_pipeline_declares_every_job_stage():
    pipeline = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    stages_block = re.search(r"^stages:\n(?P<body>(?:  - [^\n]+\n)+)", pipeline, re.MULTILINE)

    assert stages_block is not None, "GitLab CI 必须声明 stages"
    declared_stages = set(re.findall(r"^  - ([^\s]+)$", stages_block.group("body"), re.MULTILINE))
    used_stages = set(re.findall(r"^  stage: ([^\s]+)$", pipeline, re.MULTILINE))

    assert used_stages <= declared_stages, (
        f"GitLab CI job 使用了未声明的 stage: {sorted(used_stages - declared_stages)}"
    )


def test_gitlab_pipeline_uses_legacy_compatible_interruptible_jobs():
    pipeline = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")

    # 公司 GitLab 版本不支持 workflow.auto_cancel；保留 job 级 interruptible，
    # 由平台支持时再手动或平台侧配置取消过期任务，避免 CI 配置被直接拒绝。
    assert "workflow:" not in pipeline
    assert "auto_cancel:" not in pipeline
    for job_name in [
        "frontendQuality:",
        "backendCriticalBusiness:",
        "frontendBrowserSmoke:",
        "buildTest:",
    ]:
        job_start = pipeline.index(job_name)
        next_job = pipeline.find("\n\n", job_start)
        job_block = pipeline[job_start:] if next_job == -1 else pipeline[job_start:next_job]
        assert "interruptible: true" in job_block


def test_gitlab_pipeline_runs_core_trial_workflow():
    pipeline = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    job_start = pipeline.index("backendCriticalBusiness:")
    job_end = pipeline.index("\nfrontendBrowserSmoke:", job_start)
    job_block = pipeline[job_start:job_end]

    assert "backend/tests/test_core_trial_workflow.py" in job_block
    assert "workflow:" not in pipeline
    assert "auto_cancel:" not in pipeline


def test_gitlab_python_jobs_use_the_internal_python_312_image():
    pipeline = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    backend_start = pipeline.index("backendCriticalBusiness:")
    browser_start = pipeline.index("frontendBrowserSmoke:")
    build_start = pipeline.index("buildTest:")
    backend_job = pipeline[backend_start:browser_start]
    browser_job = pipeline[browser_start:build_start]

    for job in [backend_job, browser_job]:
        assert "scripts/ci-build-python-image.sh" in job
        assert 'PYTHON_BASE_IMAGE="registry.ymdd.tech/library/python:3.12-uv"' in job
        assert "command -v python3.12 || command -v python3" not in job
    assert "timeout: 30m" in backend_job
    assert '-v "$CI_PROJECT_DIR:/workspace"' in backend_job
    assert '-v "$CI_PROJECT_DIR:/workspace:ro"' not in backend_job
    assert "PYTHON_DOCKER_IMAGE" in browser_job
    assert "PLAYWRIGHT_DOCKER_IMAGE" in browser_job
    assert "timeout: 90m" in browser_job
    assert "timeout --kill-after=30s 900 bash scripts/ci-npm-install.sh readdy-frontend" in browser_job
    assert "timeout --kill-after=30s 1200 env" in browser_job
    assert "bash scripts/run-isolated-browser-smoke.sh" in browser_job
    assert 'NODE_BASE_IMAGE="registry.ymdd.tech/library/node:20-alpine"' in browser_job
    assert "scripts/ci-build-browser-image.sh" in browser_job
    assert "playwright install chromium" not in browser_job

    image_builder = (ROOT / "scripts" / "ci-build-python-image.sh").read_text(
        encoding="utf-8"
    )
    ci_dockerfile = (ROOT / "backend" / "Dockerfile.ci").read_text(
        encoding="utf-8"
    )
    browser_smoke = (ROOT / "scripts" / "run-isolated-browser-smoke.sh").read_text(
        encoding="utf-8"
    )
    browser_builder = (ROOT / "scripts" / "ci-build-browser-image.sh").read_text(
        encoding="utf-8"
    )
    python_builder = (ROOT / "scripts" / "ci-build-python-image.sh").read_text(
        encoding="utf-8"
    )
    browser_dockerfile = (
        ROOT / "readdy-frontend" / "Dockerfile.ci-browser"
    ).read_text(encoding="utf-8")
    for builder in [python_builder, browser_builder]:
        assert "timeout --kill-after=30s 1200 sudo docker build" in builder
        assert "timeout --kill-after=10s 120 sudo docker run" in builder
    playwright_config = (
        ROOT / "readdy-frontend" / "playwright.config.ts"
    ).read_text(encoding="utf-8")
    assert "timeout --kill-after=30s 1200 sudo docker build" in image_builder
    assert "timeout 900 pip install" in ci_dockerfile
    assert 'BACKEND_CONTAINER_NAME="zhipin-browser-smoke-${CI_JOB_ID:-$$}"' in browser_smoke
    assert 'rm -f "$BACKEND_CONTAINER_NAME"' in browser_smoke
    assert 'run -d --rm' in browser_smoke
    assert "wait_for_container_url" in browser_smoke
    assert "docker inspect" not in browser_smoke
    assert "inspect --format '{{.State.Running}}'" in browser_smoke
    assert "timeout --kill-after=30s 1200 sudo docker build" in browser_builder
    assert "registry.ymdd.tech/library/node:20-alpine" in browser_dockerfile
    assert "timeout 600 apk add --no-cache" in browser_dockerfile
    assert "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" in browser_dockerfile
    assert "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH" in browser_dockerfile
    assert "PLAYWRIGHT_OUTPUT_DIR=/artifacts/test-results/output" in browser_smoke
    assert "PLAYWRIGHT_HTML_REPORT_DIR=/artifacts/playwright-report/html" in browser_smoke
    assert 'test-results:/artifacts/test-results"' in browser_smoke
    assert 'playwright-report:/artifacts/playwright-report"' in browser_smoke
    assert "video: isolatedSmoke ? 'off' : 'retain-on-failure'" in playwright_config


def test_flask_static_fallback_targets_the_active_readdy_build():
    app_factory = (ROOT / "backend" / "app" / "__init__.py").read_text(
        encoding="utf-8"
    )

    assert '"readdy-frontend" / "out"' in app_factory
    assert '"frontend" / "dist"' not in app_factory
