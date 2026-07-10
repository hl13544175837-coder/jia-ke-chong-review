import importlib.util
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parents[2]


def _load_script_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_dockerignore_excludes_secrets_runtime_data_and_local_tooling():
    dockerignore = ROOT / ".dockerignore"
    assert dockerignore.exists()

    patterns = {
        line.strip()
        for line in dockerignore.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    assert {
        ".git",
        "**/.env",
        "**/.env*",
        "**/*.env",
        "**/*.env*",
        "**/*.db",
        "**/*.db-*",
        "**/*.sqlite",
        "**/*.sqlite-*",
        "**/*.sqlite3",
        "**/*.sqlite3-*",
        "**/uploads",
        "backups",
        "**/*.log",
        "**/__pycache__",
        "**/.pytest_cache",
        "**/.vite",
        "frontend/node_modules",
        "frontend/dist",
        ".workbuddy",
        ".codex_tmp",
        "minutes",
        "outputs",
    }.issubset(patterns)


def test_run_entrypoint_prints_sanitized_database_summary():
    script = ROOT / "backend" / "run.py"
    database_url = "postgresql://release_user:release_password@db.internal:5432/zhipin?sslmode=require"
    fake_app_code = f"""
import runpy
import sys
import types

sys.path.insert(0, {str(ROOT / 'backend')!r})
fake_app = types.ModuleType('app')

class FakeFlaskApp:
    def run(self, **kwargs):
        return None

fake_app.create_app = lambda: FakeFlaskApp()
sys.modules['app'] = fake_app
runpy.run_path({str(script)!r}, run_name='__main__')
"""
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": database_url,
        "FLASK_DEBUG": "false",
    })

    result = subprocess.run(
        [sys.executable, "-c", fake_app_code],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "postgresql@db.internal:5432/zhipin" in result.stdout
    assert "release_user" not in result.stdout
    assert "release_password" not in result.stdout
    assert database_url not in result.stdout


def test_cleanup_dry_run_prints_sanitized_database_summary(tmp_path, monkeypatch, capsys):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    module = _load_script_module(script, "cleanup_demo_data_for_log_test")
    database_url = "postgresql://cleanup_user:cleanup_password@db.internal:5432/zhipin"
    fake_engine = SimpleNamespace(begin=lambda: nullcontext(SimpleNamespace()))

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setattr(module, "create_engine", lambda _url: fake_engine)
    monkeypatch.setattr(module, "inspect", lambda _engine: SimpleNamespace(get_table_names=lambda: []))
    monkeypatch.setattr(module, "_load_tables", lambda _engine: {})
    monkeypatch.setattr(
        sys,
        "argv",
        [str(script), "--project-root", str(tmp_path), "--dry-run"],
    )

    module.main()
    output = capsys.readouterr().out

    assert "postgresql@db.internal:5432/zhipin" in output
    assert "cleanup_user" not in output
    assert "cleanup_password" not in output
    assert database_url not in output


def test_database_summary_fails_closed_for_malformed_url():
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    module = _load_script_module(script, "backup_pilot_data_for_summary_test")
    malformed = "summary_user:summary_password@db.internal/zhipin"

    summary = module.database_url_summary(malformed)

    assert summary == "database@unknown/default"
    assert "summary_user" not in summary
    assert "summary_password" not in summary

    malformed_supported_scheme = "postgresql:summary_user:summary_password@db.internal/zhipin"
    supported_summary = module.database_url_summary(malformed_supported_scheme)
    assert supported_summary == "database@unknown/default"
    assert "summary_user" not in supported_summary
    assert "summary_password" not in supported_summary


def test_backup_rejects_snapshot_paths_overlapping_uploads_or_sqlite(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    module = _load_script_module(script, "backup_pilot_data_for_path_guard_test")
    upload_folder = tmp_path / "data" / "uploads"
    upload_folder.mkdir(parents=True)
    db_path = tmp_path / "database" / "pilot.sqlite"
    db_path.parent.mkdir()
    sqlite3.connect(db_path).close()

    with pytest.raises(SystemExit, match="unsafe backup path"):
        module._validate_backup_paths(
            "sqlite:///" + str(db_path),
            upload_folder / "backups",
            upload_folder,
        )
    with pytest.raises(SystemExit, match="unsafe backup path"):
        module._validate_backup_paths(
            "sqlite:///" + str(db_path),
            db_path.parent,
            upload_folder,
        )


def test_cleanup_confirm_refuses_mysql_before_connecting(monkeypatch):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    module = _load_script_module(script, "cleanup_demo_data_for_mysql_guard_test")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://user:password@db:3306/zhipin")
    monkeypatch.setattr(
        module,
        "create_engine",
        lambda _url: pytest.fail("confirmed MySQL cleanup must fail before connecting"),
    )
    monkeypatch.setattr(sys, "argv", [str(script), "--confirm"])

    with pytest.raises(SystemExit, match="MySQL.*disabled"):
        module.main()


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


def test_backup_script_fails_when_sqlite_source_is_missing(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(tmp_path / "missing.sqlite"),
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })

    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "SQLite" in (result.stderr + result.stdout)
    assert "backup complete" not in result.stdout


def test_backup_snapshot_directories_are_unique_without_overwriting(tmp_path, monkeypatch):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    module = _load_script_module(script, "backup_pilot_data_for_snapshot_test")
    monkeypatch.setattr(module, "_timestamp", lambda: "20260710-120000")

    first = module._create_snapshot_dir(tmp_path, suffix="-cleanup-demo-data")
    marker = first / "marker.txt"
    marker.write_text("first snapshot", encoding="utf-8")
    second = module._create_snapshot_dir(tmp_path, suffix="-cleanup-demo-data")

    assert first != second
    assert marker.read_text(encoding="utf-8") == "first snapshot"
    assert first.is_dir()
    assert second.is_dir()


def test_backup_script_captures_committed_sqlite_wal_rows(tmp_path):
    script = ROOT / "backend" / "scripts" / "backup_pilot_data.py"
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    backup_root = tmp_path / "backups"
    upload_folder.mkdir()
    connection = sqlite3.connect(db_path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA wal_autocheckpoint=0")
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.commit()
    connection.execute("INSERT INTO restore_guard (value) VALUES ('committed in wal')")
    connection.commit()
    assert Path(str(db_path) + "-wal").is_file()

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
        "BACKUP_DIR": str(backup_root),
    })
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        connection.close()

    assert result.returncode == 0
    snapshot = next(backup_root.iterdir())
    backup_connection = sqlite3.connect(snapshot / "database.sqlite")
    assert backup_connection.execute("SELECT value FROM restore_guard").fetchone() == (
        "committed in wal",
    )
    backup_connection.close()


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
    assert "short-secret" not in result.stdout


def test_pilot_readiness_check_passes_with_production_env(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=/var/backups/zhipin",
            "ALLOW_PUBLIC_REGISTRATION=false",
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


def test_pilot_readiness_check_requires_ai_compliance_flags(tmp_path):
    script = ROOT / "backend" / "scripts" / "check_pilot_readiness.py"
    env_file = tmp_path / "backend" / ".env"
    env_file.parent.mkdir()
    env_file.write_text(
        "\n".join([
            "JWT_SECRET=" + "x" * 48,
            "JWT_EXPIRY_HOURS=8",
            "FLASK_DEBUG=false",
            "DATABASE_URL=postgresql://user:pass@db:5432/zhipin",
            "CORS_ORIGINS=https://zhipin.example.com",
            "SECURITY_HEADERS_ENABLED=true",
            "RATE_LIMIT_ENABLED=true",
            "RATE_LIMIT_LOGIN=10",
            "RATE_LIMIT_AGENT_CHAT=20",
            "RATE_LIMIT_RESUME_UPLOAD=8",
            "BACKUP_DIR=/var/backups/zhipin",
            "ALLOW_PUBLIC_REGISTRATION=false",
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
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('original')")
    connection.commit()
    connection.close()

    backup_db_path = tmp_path / "backup.sqlite"
    connection = sqlite3.connect(backup_db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('backup')")
    connection.commit()
    connection.close()
    shutil.copy2(backup_db_path, backup_path / db_path.name)
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
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT value FROM restore_guard").fetchone() == ("original",)
    connection.close()


def test_restore_missing_upload_archive_does_not_overwrite_database(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"

    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('original')")
    connection.commit()
    connection.close()

    backup_db_path = backup_path / db_path.name
    connection = sqlite3.connect(backup_db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('backup')")
    connection.commit()
    connection.close()

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
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
    assert "uploads" in (result.stderr + result.stdout)
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT value FROM restore_guard").fetchone() == ("original",)
    connection.close()


def test_restore_rejects_upload_destination_overlapping_backup_or_project(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"
    sqlite3.connect(db_path).close()
    shutil.copy2(db_path, backup_path / db_path.name)
    archived_uploads = tmp_path / "archived_uploads"
    archived_uploads.mkdir()
    with tarfile.open(backup_path / "uploads.tar.gz", "w:gz") as archive:
        archive.add(archived_uploads, arcname="uploads")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(backup_path),
    })
    result = subprocess.run(
        [sys.executable, str(restore_script), "--backup-path", str(backup_path), "--dry-run"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "unsafe restore path" in (result.stderr + result.stdout)
    assert (backup_path / db_path.name).is_file()
    assert (backup_path / "uploads.tar.gz").is_file()

    monkeypatch_module_path = str(restore_script.parent)
    original_sys_path = list(sys.path)
    try:
        sys.path.insert(0, monkeypatch_module_path)
        module = _load_script_module(restore_script, "restore_pilot_data_for_path_guard_test")
        with pytest.raises(SystemExit, match="unsafe restore path"):
            module._validate_restore_paths(backup_path, ROOT, "sqlite:///" + str(db_path))
        with pytest.raises(SystemExit, match="unsafe restore path"):
            module._validate_restore_paths(backup_path, ROOT.parent, "sqlite:///" + str(db_path))
        with pytest.raises(SystemExit, match="unsafe restore path"):
            module._validate_restore_paths(
                backup_path,
                tmp_path / "safe_uploads",
                "sqlite:///" + str(backup_path / "live.sqlite"),
            )
    finally:
        sys.path[:] = original_sys_path


def test_restore_rejects_corrupt_sqlite_artifact_before_overwrite(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('original')")
    connection.commit()
    connection.close()
    (backup_path / "database.sqlite").write_bytes(b"not a sqlite database")
    archived_uploads = tmp_path / "archived_uploads"
    archived_uploads.mkdir()
    with tarfile.open(backup_path / "uploads.tar.gz", "w:gz") as archive:
        archive.add(archived_uploads, arcname="uploads")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
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
    assert "SQLite" in (result.stderr + result.stdout)
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT value FROM restore_guard").fetchone() == ("original",)
    connection.close()


def test_restore_rejects_unrelated_sqlite_artifact_in_backup_directory(tmp_path):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    db_path = tmp_path / "pilot.sqlite"

    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('original')")
    connection.commit()
    connection.close()

    unrelated_db = backup_path / "unrelated.db"
    connection = sqlite3.connect(unrelated_db)
    connection.execute("CREATE TABLE restore_guard (value TEXT)")
    connection.execute("INSERT INTO restore_guard (value) VALUES ('wrong backup')")
    connection.commit()
    connection.close()
    archived_uploads = tmp_path / "archived_uploads"
    archived_uploads.mkdir()
    with tarfile.open(backup_path / "uploads.tar.gz", "w:gz") as archive:
        archive.add(archived_uploads, arcname="uploads")

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(tmp_path / "uploads"),
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
    assert "SQLite" in (result.stderr + result.stdout)
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT value FROM restore_guard").fetchone() == ("original",)
    connection.close()


def test_restore_does_not_fail_after_upload_swap_when_old_directory_cleanup_fails(
    tmp_path,
    monkeypatch,
):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    monkeypatch.syspath_prepend(str(restore_script.parent))
    module = _load_script_module(restore_script, "restore_pilot_data_for_swap_test")
    upload_folder = tmp_path / "uploads"
    staging = tmp_path / "staging"
    upload_folder.mkdir()
    staging.mkdir()
    (upload_folder / "old.pdf").write_text("old", encoding="utf-8")
    (staging / "new.pdf").write_text("new", encoding="utf-8")
    real_rmtree = module.shutil.rmtree

    def fail_unless_best_effort(path, ignore_errors=False):
        if not ignore_errors:
            raise OSError("simulated cleanup failure")
        return real_rmtree(path, ignore_errors=True)

    monkeypatch.setattr(module.shutil, "rmtree", fail_unless_best_effort)

    module._replace_upload_directory(staging, upload_folder)

    assert (upload_folder / "new.pdf").read_text(encoding="utf-8") == "new"
    assert not (upload_folder / "old.pdf").exists()


def test_restore_upload_swap_failure_restores_previous_upload_directory(tmp_path, monkeypatch):
    restore_script = ROOT / "backend" / "scripts" / "restore_pilot_data.py"
    monkeypatch.syspath_prepend(str(restore_script.parent))
    module = _load_script_module(restore_script, "restore_pilot_data_for_swap_rollback_test")
    upload_folder = tmp_path / "uploads"
    staging = tmp_path / "staging"
    upload_folder.mkdir()
    staging.mkdir()
    (upload_folder / "old.pdf").write_text("old", encoding="utf-8")
    (staging / "new.pdf").write_text("new", encoding="utf-8")
    real_replace = module.os.replace
    calls = 0

    def fail_install(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated upload install failure")
        return real_replace(source, destination)

    monkeypatch.setattr(module.os, "replace", fail_install)

    with pytest.raises(OSError, match="simulated upload install failure"):
        module._replace_upload_directory(staging, upload_folder)

    assert (upload_folder / "old.pdf").read_text(encoding="utf-8") == "old"
    assert not (upload_folder / "new.pdf").exists()


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
    (backend_uploads / "real.pdf").write_text("real")
    (backend_uploads / "unrelated.pdf").write_text("unrelated")
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
    assert "demo upload files: 1" in result.stdout
    assert sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
    assert (backend_uploads / "demo.pdf").exists()
    assert (backend_uploads / "real.pdf").exists()
    assert (backend_uploads / "unrelated.pdf").exists()
    assert (root_uploads / "demo-root.pdf").exists()
    assert not (tmp_path / "backups").exists()


def test_cleanup_demo_data_confirm_backs_up_then_deletes_demo_rows_and_uploads(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    root_uploads = tmp_path / "uploads"
    backend_uploads.mkdir(parents=True)
    root_uploads.mkdir()
    (backend_uploads / "demo.pdf").write_text("demo")
    (backend_uploads / "real.pdf").write_text("real")
    (backend_uploads / "unrelated.pdf").write_text("unrelated")
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

    assert first.returncode == 0
    assert "backup complete" in first.stdout
    assert "DELETE CONFIRMED" in first.stdout
    snapshots = list((tmp_path / "backups").iterdir())
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert (snapshot / "uploads.tar.gz").is_file()
    assert (snapshot / "database.sqlite").is_file()
    assert not (snapshot / "backend_uploads").exists()
    first_snapshot_database = (snapshot / "database.sqlite").read_bytes()
    first_snapshot_uploads = (snapshot / "uploads.tar.gz").read_bytes()

    restored_db = tmp_path / "restored.sqlite"
    restored_uploads = tmp_path / "restored_uploads"
    restore = subprocess.run(
        [
            sys.executable,
            str(ROOT / "backend" / "scripts" / "restore_pilot_data.py"),
            "--backup-path",
            str(snapshot),
            "--confirm",
        ],
        cwd=str(ROOT),
        env=env | {
            "DATABASE_URL": "sqlite:///" + str(restored_db),
            "UPLOAD_FOLDER": str(restored_uploads),
        },
        capture_output=True,
        text=True,
        check=False,
    )
    assert restore.returncode == 0
    connection = sqlite3.connect(restored_db)
    assert connection.execute("SELECT email FROM users ORDER BY id").fetchall() == [
        ("hr01@mvp.local",),
        ("real@example.com",),
    ]
    connection.close()
    assert (restored_uploads / "demo.pdf").read_text() == "demo"

    second = subprocess.run(
        command,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert second.returncode == 0
    snapshots_after_second_cleanup = list((tmp_path / "backups").iterdir())
    assert len(snapshots_after_second_cleanup) == 2
    assert (snapshot / "database.sqlite").read_bytes() == first_snapshot_database
    assert (snapshot / "uploads.tar.gz").read_bytes() == first_snapshot_uploads

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
    assert not (backend_uploads / "demo.pdf").exists()
    assert (backend_uploads / "real.pdf").read_text() == "real"
    assert (backend_uploads / "unrelated.pdf").read_text() == "unrelated"
    assert (root_uploads / "demo-root.pdf").read_text() == "demo root"
    assert list((tmp_path / "backups").glob("*"))


def test_cleanup_demo_data_skips_candidate_file_outside_allowed_upload_dirs(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    backend_uploads = tmp_path / "backend" / "uploads"
    backend_uploads.mkdir(parents=True)
    outside_file = tmp_path.parent / f"{tmp_path.name}-outside.pdf"
    outside_file.write_text("must survive", encoding="utf-8")
    _seed_cleanup_database(db_path)
    connection = sqlite3.connect(db_path)
    connection.execute(
        "UPDATE candidates SET raw_file_path=? WHERE id=1000",
        (str(outside_file),),
    )
    connection.commit()
    connection.close()

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(backend_uploads),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--project-root", str(tmp_path), "--confirm"],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0
        assert "skipped unsafe demo file references: 1" in result.stdout
        assert outside_file.read_text(encoding="utf-8") == "must survive"
    finally:
        outside_file.unlink(missing_ok=True)


def test_cleanup_demo_data_refuses_filesystem_root_as_upload_folder(tmp_path, monkeypatch):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    module = _load_script_module(script, "cleanup_demo_data_for_upload_root_test")
    for unsafe_folder in (Path(tmp_path.anchor), tmp_path.parent, tmp_path):
        monkeypatch.setenv("UPLOAD_FOLDER", str(unsafe_folder))
        with pytest.raises(SystemExit, match="unsafe upload folder"):
            module._safe_upload_dirs(tmp_path)


def test_cleanup_rejects_backup_or_database_overlap_with_upload_folder(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)

    for db_path, backup_dir in (
        (tmp_path / "hireinsight.db", upload_folder / "backups"),
        (upload_folder / "hireinsight.db", tmp_path / "backups"),
    ):
        _seed_cleanup_database(db_path)
        env = os.environ.copy()
        env.update({
            "DATABASE_URL": "sqlite:///" + str(db_path),
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(backup_dir),
        })
        result = subprocess.run(
            [sys.executable, str(script), "--project-root", str(tmp_path), "--dry-run"],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0
        assert "unsafe cleanup path" in (result.stderr + result.stdout)
        db_path.unlink()


def test_cleanup_aborts_before_deletion_when_upload_snapshot_contains_symlink(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    (upload_folder / "demo.pdf").write_text("demo", encoding="utf-8")
    (upload_folder / "real.pdf").write_text("real", encoding="utf-8")
    (upload_folder / "link.pdf").symlink_to(upload_folder / "real.pdf")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [sys.executable, str(script), "--project-root", str(tmp_path), "--confirm"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "symbolic link" in (result.stderr + result.stdout)
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT COUNT(*) FROM users").fetchone() == (2,)
    assert connection.execute("SELECT COUNT(*) FROM candidates").fetchone() == (2,)
    connection.close()
    assert (upload_folder / "demo.pdf").read_text(encoding="utf-8") == "demo"


def test_cleanup_aborts_before_deletion_when_upload_name_cannot_be_restored(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    db_path = tmp_path / "hireinsight.db"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    (upload_folder / "demo.pdf").write_text("demo", encoding="utf-8")
    (upload_folder / "real.pdf").write_text("real", encoding="utf-8")
    (upload_folder / "resume:colon.pdf").write_text("not portable", encoding="utf-8")
    _seed_cleanup_database(db_path)

    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///" + str(db_path),
        "UPLOAD_FOLDER": str(upload_folder),
        "BACKUP_DIR": str(tmp_path / "backups"),
    })
    result = subprocess.run(
        [sys.executable, str(script), "--project-root", str(tmp_path), "--confirm"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "不安全的 uploads 备份路径" in (result.stderr + result.stdout)
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT COUNT(*) FROM users").fetchone() == (2,)
    connection.close()
    assert (upload_folder / "demo.pdf").is_file()


def test_cleanup_deletes_only_primary_keys_frozen_before_backup(tmp_path):
    script = ROOT / "backend" / "scripts" / "cleanup_demo_data.py"
    module = _load_script_module(script, "cleanup_demo_data_for_frozen_plan_test")
    db_path = tmp_path / "hireinsight.db"
    _seed_cleanup_database(db_path)
    engine = module.create_engine("sqlite:///" + str(db_path))

    with engine.begin() as connection:
        tables = module._load_tables(engine)
        plan = module._collect_plan(connection, tables, "@mvp.local")
        counts = []
        for table_name, condition in plan:
            table = tables[table_name]
            rows = connection.execute(module.select(table.c.id).where(condition)).fetchall()
            counts.append((table_name, rows))

        connection.execute(tables["notifications"].insert().values(
            id=3,
            user_id=1,
            type="concurrent",
            title="created after backup",
        ))
        module._delete_counted_rows(connection, tables, counts)

    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT id FROM notifications ORDER BY id").fetchall() == [(2,), (3,)]
    connection.close()
