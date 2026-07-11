import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "backend" / "scripts"


def _load_script(name):
    scripts_path = str(SCRIPTS)
    if scripts_path not in sys.path:
        sys.path.insert(0, scripts_path)
    spec = importlib.util.spec_from_file_location(f"pilot_recovery_{name}", SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _run(script_name, *args, env):
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script_name), *map(str, args)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _create_upload_archive(path, files=None):
    files = files or {"resume.pdf": b"resume"}
    with tarfile.open(path, "w:gz") as archive:
        root = tarfile.TarInfo("uploads")
        root.type = tarfile.DIRTYPE
        root.mode = 0o755
        archive.addfile(root)
        for name, content in files.items():
            info = tarfile.TarInfo(f"uploads/{name}")
            info.size = len(content)
            info.mode = 0o600
            archive.addfile(info, io.BytesIO(content))


def _create_marker_database(path, value):
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE marker (value TEXT NOT NULL)")
    connection.execute("INSERT INTO marker (value) VALUES (?)", (value,))
    connection.commit()
    connection.close()


def _create_candidate_path_database(path, raw_file_path):
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE TABLE candidates (id INTEGER PRIMARY KEY, raw_file_path TEXT)"
    )
    connection.execute(
        "INSERT INTO candidates (id, raw_file_path) VALUES (1, ?)",
        (str(raw_file_path),),
    )
    connection.commit()
    connection.close()


def _read_marker(path):
    connection = sqlite3.connect(path)
    try:
        return connection.execute("SELECT value FROM marker").fetchone()[0]
    finally:
        connection.close()


def test_recovery_scripts_are_importable_from_backend_package():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from scripts import backup_pilot_data, restore_pilot_data, cleanup_demo_data",
        ],
        cwd=str(ROOT / "backend"),
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr


def test_backup_and_restore_require_explicit_absolute_persistent_upload_folder(
    tmp_path,
    monkeypatch,
):
    backup = _load_script("backup_pilot_data")
    restore = _load_script("restore_pilot_data")

    for module in (backup, restore):
        monkeypatch.delenv("FLASK_DEBUG", raising=False)
        monkeypatch.delenv("UPLOAD_FOLDER", raising=False)
        with pytest.raises(SystemExit, match="UPLOAD_FOLDER"):
            module._upload_folder()

        monkeypatch.setenv("UPLOAD_FOLDER", "backend/uploads")
        with pytest.raises(SystemExit, match="absolute|\u7edd\u5bf9"):
            module._upload_folder()

        monkeypatch.setenv("UPLOAD_FOLDER", str(tmp_path / "persistent-uploads"))
        assert module._upload_folder() == (tmp_path / "persistent-uploads").resolve()


def test_local_debug_recovery_tools_resolve_relative_upload_folder_from_project_root(
    monkeypatch,
):
    backup = _load_script("backup_pilot_data")
    monkeypatch.setenv("FLASK_DEBUG", "true")
    monkeypatch.setenv("UPLOAD_FOLDER", "backend/uploads")

    assert backup._upload_folder() == (ROOT / "backend" / "uploads").absolute()


def test_database_label_redacts_user_password_and_query():
    backup = _load_script("backup_pilot_data")

    assert hasattr(backup, "_safe_database_label")
    label = backup._safe_database_label(
        "mysql+pymysql://pilot-user:unit-secret@db.internal:3306/zhipin?token=unit-token"
    )

    assert label == "mysql+pymysql://db.internal:3306/zhipin"
    assert "pilot-user" not in label
    assert "unit-secret" not in label
    assert "unit-token" not in label


def test_cleanup_dry_run_does_not_print_sqlite_query_secrets(tmp_path):
    db_path = tmp_path / "pilot.db"
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)")
    connection.commit()
    connection.close()
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}?password=unit-secret&token=unit-token",
            "BACKUP_DIR": str(tmp_path / "backups"),
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--dry-run",
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert "unit-secret" not in result.stdout
    assert "unit-token" not in result.stdout


def test_snapshot_directory_reservation_never_reuses_same_timestamp(tmp_path):
    backup = _load_script("backup_pilot_data")

    assert hasattr(backup, "_reserve_snapshot_dir")
    first = backup._reserve_snapshot_dir(tmp_path, "20260711-010203")
    second = backup._reserve_snapshot_dir(tmp_path, "20260711-010203")

    assert first != second
    assert first.is_dir()
    assert second.is_dir()


def test_sqlite_backup_captures_committed_wal_and_writes_complete_manifest(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    backup_root = tmp_path / "backups"
    upload_folder.mkdir()
    (upload_folder / "resume.pdf").write_bytes(b"resume")

    writer = sqlite3.connect(db_path)
    assert writer.execute("PRAGMA journal_mode=WAL").fetchone()[0].lower() == "wal"
    writer.execute("PRAGMA wal_autocheckpoint=0")
    writer.execute("CREATE TABLE candidates (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
    writer.commit()
    writer.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    writer.execute("INSERT INTO candidates (id, name) VALUES (1, 'WAL candidate')")
    writer.commit()
    assert Path(str(db_path) + "-wal").exists()

    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(backup_root),
        }
    )
    result = _run("backup_pilot_data.py", env=env)
    writer.close()

    assert result.returncode == 0, result.stderr
    snapshots = list(backup_root.iterdir())
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    copied_db = snapshot / db_path.name
    copied = sqlite3.connect(copied_db)
    try:
        assert copied.execute("SELECT name FROM candidates WHERE id=1").fetchone() == ("WAL candidate",)
    finally:
        copied.close()

    manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["format_version"] == 1
    assert manifest["status"] == "complete"
    assert manifest["database"]["artifact"] == db_path.name
    assert manifest["uploads"]["artifact"] == "uploads.tar.gz"
    assert manifest["uploads"]["source_root"] == str(upload_folder.resolve())
    assert manifest["database"]["sha256"]
    assert manifest["uploads"]["sha256"]
    assert snapshot.stat().st_mode & 0o077 == 0
    for artifact in (copied_db, snapshot / "uploads.tar.gz", snapshot / "manifest.json"):
        assert artifact.stat().st_mode & 0o077 == 0


def test_backup_rejects_upload_symlinks(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    sqlite3.connect(db_path).close()
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")
    (upload_folder / "resume-link").symlink_to(outside)
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run("backup_pilot_data.py", env=env)

    assert result.returncode != 0
    assert "符号链接" in (result.stdout + result.stderr)


def test_backup_dry_run_also_rejects_upload_symlinks(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    sqlite3.connect(db_path).close()
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")
    (upload_folder / "resume-link").symlink_to(outside)
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run("backup_pilot_data.py", "--dry-run", env=env)

    assert result.returncode != 0
    assert "符号链接" in (result.stdout + result.stderr)


def test_backup_rejects_symlink_as_upload_folder(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    sqlite3.connect(db_path).close()
    real_uploads = tmp_path / "real-uploads"
    real_uploads.mkdir()
    (real_uploads / "resume.pdf").write_bytes(b"resume")
    upload_link = tmp_path / "uploads"
    upload_link.symlink_to(real_uploads, target_is_directory=True)
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_link),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run("backup_pilot_data.py", env=env)

    assert result.returncode != 0
    assert "符号链接" in (result.stdout + result.stderr)


def test_backup_rejects_backup_directory_nested_inside_uploads(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    sqlite3.connect(db_path).close()
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    (upload_folder / "resume.pdf").write_bytes(b"resume")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(upload_folder / "backups"),
        }
    )

    result = _run("backup_pilot_data.py", env=env)

    assert result.returncode != 0
    assert "overlap" in (result.stdout + result.stderr).lower()


@pytest.mark.parametrize(
    ("member_type", "linkname"),
    [
        (tarfile.SYMTYPE, "../outside"),
        (tarfile.LNKTYPE, "uploads/other"),
        (tarfile.FIFOTYPE, ""),
    ],
)
def test_restore_rejects_links_and_special_archive_members_before_database_change(
    tmp_path,
    member_type,
    linkname,
):
    target_db = tmp_path / "target.sqlite"
    _create_marker_database(target_db, "old")
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    backup_db = backup_path / "source.sqlite"
    _create_marker_database(backup_db, "new")
    archive_path = backup_path / "uploads.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        root = tarfile.TarInfo("uploads")
        root.type = tarfile.DIRTYPE
        archive.addfile(root)
        member = tarfile.TarInfo("uploads/unsafe")
        member.type = member_type
        member.linkname = linkname
        archive.addfile(member)

    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    (upload_folder / "old.txt").write_text("old", encoding="utf-8")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "不安全" in (result.stdout + result.stderr)
    assert _read_marker(target_db) == "old"
    assert (upload_folder / "old.txt").read_text(encoding="utf-8") == "old"


def test_restore_rolls_back_existing_uploads_when_atomic_switch_fails(tmp_path, monkeypatch):
    restore = _load_script("restore_pilot_data")
    assert hasattr(restore, "_swap_upload_directory")
    assert hasattr(restore, "os")

    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    (upload_folder / "old.txt").write_text("old", encoding="utf-8")
    prepared = tmp_path / ".uploads-prepared"
    prepared.mkdir()
    (prepared / "new.txt").write_text("new", encoding="utf-8")

    real_replace = os.replace
    calls = 0

    def fail_install(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated install failure")
        return real_replace(source, destination)

    monkeypatch.setattr(restore.os, "replace", fail_install)

    with pytest.raises(OSError, match="simulated install failure"):
        restore._swap_upload_directory(prepared, upload_folder)

    assert (upload_folder / "old.txt").read_text(encoding="utf-8") == "old"
    assert not (upload_folder / "new.txt").exists()


def test_restore_rejects_backup_directory_nested_inside_upload_target(tmp_path):
    upload_folder = tmp_path / "uploads"
    backup_path = upload_folder / "snapshot"
    backup_path.mkdir(parents=True)
    target_db = tmp_path / "target.sqlite"
    _create_marker_database(target_db, "old")
    backup_db = backup_path / "source.sqlite"
    _create_marker_database(backup_db, "new")
    _create_upload_archive(backup_path / "uploads.tar.gz")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "overlap" in (result.stdout + result.stderr).lower()
    assert _read_marker(target_db) == "old"
    assert backup_path.is_dir()


def test_legacy_sqlite_restore_restricts_database_and_upload_permissions(tmp_path):
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    source_db = backup_path / "source.sqlite"
    _create_marker_database(source_db, "new")
    source_db.chmod(0o644)
    _create_upload_archive(backup_path / "uploads.tar.gz")
    target_db = tmp_path / "target.sqlite"
    upload_folder = tmp_path / "uploads"
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--confirm",
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert target_db.stat().st_mode & 0o077 == 0
    assert upload_folder.stat().st_mode & 0o077 == 0


def test_legacy_sqlite_restore_rebases_paths_when_upload_root_is_unchanged(tmp_path):
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    upload_folder = tmp_path / "uploads"
    source_db = backup_path / "source.sqlite"
    _create_candidate_path_database(source_db, upload_folder / "resume.pdf")
    _create_upload_archive(backup_path / "uploads.tar.gz")
    target_db = tmp_path / "target.sqlite"
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--confirm",
        env=env,
    )

    assert result.returncode == 0, result.stderr
    restored = sqlite3.connect(target_db)
    try:
        assert restored.execute("SELECT raw_file_path FROM candidates").fetchone() == (
            "resume.pdf",
        )
    finally:
        restored.close()
    assert (upload_folder / "resume.pdf").read_bytes() == b"resume"


def test_legacy_sqlite_restore_rejects_relocated_upload_root_before_database_change(tmp_path):
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    source_uploads = tmp_path / "source-uploads"
    source_db = backup_path / "source.sqlite"
    _create_candidate_path_database(source_db, source_uploads / "resume.pdf")
    _create_upload_archive(backup_path / "uploads.tar.gz")
    target_db = tmp_path / "target.sqlite"
    _create_marker_database(target_db, "old")
    target_uploads = tmp_path / "target-uploads"
    target_uploads.mkdir()
    (target_uploads / "old.txt").write_text("old", encoding="utf-8")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(target_uploads),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "uploads.source_root" in (result.stdout + result.stderr)
    assert _read_marker(target_db) == "old"
    assert (target_uploads / "old.txt").read_text(encoding="utf-8") == "old"


def test_restore_rejects_manifest_checksum_mismatch_before_database_change(tmp_path):
    source_db = tmp_path / "source.sqlite"
    _create_marker_database(source_db, "new")
    source_uploads = tmp_path / "source-uploads"
    source_uploads.mkdir()
    (source_uploads / "resume.pdf").write_bytes(b"resume")
    backup_root = tmp_path / "backups"
    backup_env = os.environ.copy()
    backup_env.update(
        {
            "DATABASE_URL": f"sqlite:///{source_db}",
            "UPLOAD_FOLDER": str(source_uploads),
            "BACKUP_DIR": str(backup_root),
        }
    )
    backup = _run("backup_pilot_data.py", env=backup_env)
    assert backup.returncode == 0, backup.stderr
    snapshot = next(backup_root.iterdir())
    with (snapshot / "uploads.tar.gz").open("ab") as archive:
        archive.write(b"tampered")

    target_db = tmp_path / "target.sqlite"
    _create_marker_database(target_db, "old")
    upload_folder = tmp_path / "target-uploads"
    upload_folder.mkdir()
    (upload_folder / "old.txt").write_text("old", encoding="utf-8")
    restore_env = os.environ.copy()
    restore_env.update(
        {
            "DATABASE_URL": f"sqlite:///{target_db}",
            "UPLOAD_FOLDER": str(upload_folder),
        }
    )

    restore = _run(
        "restore_pilot_data.py",
        "--backup-path",
        snapshot,
        "--confirm",
        env=restore_env,
    )

    assert restore.returncode != 0
    assert "校验" in (restore.stdout + restore.stderr)
    assert _read_marker(target_db) == "old"
    assert (upload_folder / "old.txt").read_text(encoding="utf-8") == "old"


def test_restore_dry_run_rejects_corrupt_legacy_sqlite_artifact(tmp_path):
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    (backup_path / "source.sqlite").write_bytes(b"not a sqlite database")
    _create_upload_archive(backup_path / "uploads.tar.gz")
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{tmp_path / 'target.sqlite'}",
            "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        }
    )

    result = _run(
        "restore_pilot_data.py",
        "--backup-path",
        backup_path,
        "--dry-run",
        env=env,
    )

    assert result.returncode != 0
    assert "SQLite" in (result.stdout + result.stderr)
    assert "校验" in (result.stdout + result.stderr)


def test_mysql_restore_dry_run_is_safe_but_confirm_fails_before_subprocess(tmp_path, monkeypatch, capsys):
    restore = _load_script("restore_pilot_data")
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    (backup_path / "database.sql").write_text("SELECT 1;", encoding="utf-8")
    database_url = "mysql+pymysql://pilot:unit-secret@unreachable.invalid:3306/zhipin?token=unit-token"
    called = False

    def unexpected_subprocess(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("MySQL confirm must fail before launching a client")

    monkeypatch.setattr(restore.subprocess, "run", unexpected_subprocess)

    restore._restore_database(database_url, backup_path, dry_run=True)
    output = capsys.readouterr().out
    assert "MySQL" in output
    assert "unit-secret" not in output
    assert "unit-token" not in output

    with pytest.raises(SystemExit, match="MySQL.*未实现"):
        restore._restore_database(database_url, backup_path, dry_run=False)
    assert called is False


def test_mysql_backup_failure_does_not_echo_database_username(tmp_path, monkeypatch):
    backup = _load_script("backup_pilot_data")
    target = tmp_path / "snapshot"
    target.mkdir()

    def fail_dump(command, **kwargs):
        raise subprocess.CalledProcessError(2, command)

    monkeypatch.setattr(backup.subprocess, "run", fail_dump)

    with pytest.raises(SystemExit) as error:
        backup._backup_database(
            "mysql+pymysql://pilot-user:unit-secret@db.internal:3306/zhipin",
            target,
            dry_run=False,
        )

    message = str(error.value)
    assert "pilot-user" not in message
    assert "unit-secret" not in message
    assert "mysql+pymysql://db.internal:3306/zhipin" in message


def test_postgres_restore_uses_single_transaction(tmp_path, capsys):
    restore = _load_script("restore_pilot_data")
    backup_path = tmp_path / "backup"
    backup_path.mkdir()
    (backup_path / "database.dump").write_bytes(b"dump")

    restore._restore_database(
        "postgresql://pilot:unit-secret@db.internal:5432/zhipin",
        backup_path,
        dry_run=True,
    )

    assert "--single-transaction" in capsys.readouterr().out


def test_cleanup_mysql_confirm_fails_before_connecting(tmp_path):
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": "mysql+pymysql://pilot:unit-secret@127.0.0.1:1/zhipin",
            "UPLOAD_FOLDER": str(tmp_path / "uploads"),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "MySQL" in combined
    assert "disabled" in combined.lower() or "禁用" in combined
    assert "OperationalError" not in combined
    assert "unit-secret" not in combined


def test_cleanup_connection_failure_does_not_echo_database_credentials(tmp_path):
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": "mysql+pymysql://pilot-user:unit-secret@127.0.0.1:1/zhipin",
            "UPLOAD_FOLDER": str(tmp_path / "uploads"),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--dry-run",
        env=env,
    )

    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "pilot-user" not in combined
    assert "unit-secret" not in combined
    assert "mysql+pymysql://127.0.0.1:1/zhipin" in combined
    assert "Traceback" not in combined


def _seed_demand_cleanup_database(db_path, demo_file, real_file):
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            email TEXT NOT NULL
        );
        CREATE TABLE jobs (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER
        );
        CREATE TABLE recruitment_demands (
            id INTEGER PRIMARY KEY,
            job_id INTEGER NOT NULL,
            owner_hr_id INTEGER,
            created_by INTEGER
        );
        CREATE TABLE upload_batches (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            target_job_id INTEGER,
            demand_id INTEGER
        );
        CREATE TABLE candidates (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            upload_batch_id INTEGER,
            current_demand_id INTEGER,
            raw_file_path TEXT
        );
        CREATE TABLE candidate_demand_flows (
            id INTEGER PRIMARY KEY,
            candidate_id INTEGER NOT NULL,
            demand_id INTEGER NOT NULL,
            owner_hr_id INTEGER,
            transfer_from_demand_id INTEGER
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            entity_type TEXT,
            entity_id INTEGER
        );
        INSERT INTO users (id, email) VALUES
            (1, 'demo@mvp.local'),
            (2, 'real@example.com');
        INSERT INTO jobs (id, owner_hr_id) VALUES
            (10, 1),
            (20, 2);
        INSERT INTO recruitment_demands (id, job_id, owner_hr_id, created_by) VALUES
            (100, 10, 1, 1),
            (200, 20, 2, 2);
        INSERT INTO upload_batches (id, owner_hr_id, target_job_id, demand_id) VALUES
            (1000, 1, 10, 100),
            (2000, 2, 20, 200);
        INSERT INTO events (id, entity_type, entity_id) VALUES
            (1, 'recruitment_demand', 100),
            (2, 'recruitment_demand', 200);
        """
    )
    connection.execute(
        "INSERT INTO candidates "
        "(id, owner_hr_id, upload_batch_id, current_demand_id, raw_file_path) VALUES (?, ?, ?, ?, ?)",
        (10000, 1, 1000, 100, str(demo_file)),
    )
    connection.execute(
        "INSERT INTO candidates "
        "(id, owner_hr_id, upload_batch_id, current_demand_id, raw_file_path) VALUES (?, ?, ?, ?, ?)",
        (20000, 2, 2000, 200, str(real_file)),
    )
    connection.executemany(
        "INSERT INTO candidate_demand_flows "
        "(id, candidate_id, demand_id, owner_hr_id, transfer_from_demand_id) VALUES (?, ?, ?, ?, ?)",
        [
            (1, 10000, 100, 1, None),
            (2, 20000, 200, 2, None),
        ],
    )
    connection.commit()
    connection.close()


@pytest.mark.parametrize(
    ("case_name", "mutation_sql", "probe_sql"),
    [
        (
            "pipeline_stage_updated_by_demo",
            """
            CREATE TABLE pipeline_stages (
                id INTEGER PRIMARY KEY,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                updated_by INTEGER
            );
            INSERT INTO pipeline_stages
                (id, candidate_id, job_id, demand_id, updated_by)
            VALUES (901, 20000, 20, 200, 1);
            """,
            "SELECT * FROM pipeline_stages ORDER BY id",
        ),
        (
            "assignment_interviewer_demo",
            """
            CREATE TABLE interview_assignments (
                id INTEGER PRIMARY KEY,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                interviewer_id INTEGER,
                created_by INTEGER
            );
            INSERT INTO interview_assignments
                (id, candidate_id, job_id, demand_id, interviewer_id, created_by)
            VALUES (902, 20000, 20, 200, 1, 2);
            """,
            "SELECT * FROM interview_assignments ORDER BY id",
        ),
        (
            "assignment_created_by_demo",
            """
            CREATE TABLE interview_assignments (
                id INTEGER PRIMARY KEY,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                interviewer_id INTEGER,
                created_by INTEGER
            );
            INSERT INTO interview_assignments
                (id, candidate_id, job_id, demand_id, interviewer_id, created_by)
            VALUES (903, 20000, 20, 200, 2, 1);
            """,
            "SELECT * FROM interview_assignments ORDER BY id",
        ),
        (
            "feedback_interviewer_demo",
            """
            CREATE TABLE interview_feedback (
                id INTEGER PRIMARY KEY,
                assignment_id INTEGER,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                interviewer_id INTEGER
            );
            INSERT INTO interview_feedback
                (id, assignment_id, candidate_id, job_id, demand_id, interviewer_id)
            VALUES (904, NULL, 20000, 20, 200, 1);
            """,
            "SELECT * FROM interview_feedback ORDER BY id",
        ),
        (
            "offer_created_by_demo",
            """
            CREATE TABLE offer_records (
                id INTEGER PRIMARY KEY,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                created_by INTEGER
            );
            INSERT INTO offer_records
                (id, candidate_id, job_id, demand_id, created_by)
            VALUES (905, 20000, 20, 200, 1);
            """,
            "SELECT * FROM offer_records ORDER BY id",
        ),
        (
            "disposition_created_by_demo",
            """
            CREATE TABLE candidate_dispositions (
                id INTEGER PRIMARY KEY,
                candidate_id INTEGER,
                job_id INTEGER,
                demand_id INTEGER,
                created_by INTEGER
            );
            INSERT INTO candidate_dispositions
                (id, candidate_id, job_id, demand_id, created_by)
            VALUES (906, 20000, 20, 200, 1);
            """,
            "SELECT * FROM candidate_dispositions ORDER BY id",
        ),
        (
            "event_actor_demo_real_demand",
            """
            ALTER TABLE events ADD COLUMN actor_id INTEGER;
            ALTER TABLE events ADD COLUMN demand_id INTEGER;
            UPDATE events SET actor_id = 1, demand_id = 200 WHERE id = 2;
            """,
            "SELECT * FROM events ORDER BY id",
        ),
        (
            "agent_tool_mixed_typed_targets",
            """
            ALTER TABLE events ADD COLUMN actor_id INTEGER;
            ALTER TABLE events ADD COLUMN demand_id INTEGER;
            ALTER TABLE events ADD COLUMN payload TEXT;
            UPDATE events
            SET entity_type = 'agent_tool',
                entity_id = 10,
                actor_id = 1,
                payload = '{"tool":"run_match","target_ids":{"job_id":10,"candidate_id":20000}}'
            WHERE id = 2;
            """,
            "SELECT * FROM events ORDER BY id",
        ),
        (
            "audit_actor_demo_real_target",
            """
            CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY,
                actor_id INTEGER,
                target_table TEXT,
                target_id INTEGER
            );
            INSERT INTO audit_logs (id, actor_id, target_table, target_id)
            VALUES (907, 1, 'recruitment_demands', 200);
            """,
            "SELECT * FROM audit_logs ORDER BY id",
        ),
        (
            "real_demand_created_by_demo",
            "UPDATE recruitment_demands SET created_by = 1 WHERE id = 200;",
            "SELECT * FROM recruitment_demands ORDER BY id",
        ),
        (
            "real_demand_references_demo_job",
            "UPDATE recruitment_demands SET job_id = 10 WHERE id = 200;",
            "SELECT * FROM recruitment_demands ORDER BY id",
        ),
        (
            "historical_real_flow_owned_by_demo",
            """
            UPDATE candidates SET current_demand_id = NULL WHERE id = 20000;
            UPDATE candidate_demand_flows SET owner_hr_id = 1 WHERE id = 2;
            """,
            "SELECT * FROM candidate_demand_flows ORDER BY id",
        ),
        (
            "historical_flow_crosses_real_candidate_and_demo_demand",
            """
            INSERT INTO candidate_demand_flows
                (id, candidate_id, demand_id, owner_hr_id, transfer_from_demand_id)
            VALUES (3, 20000, 100, 2, NULL);
            """,
            "SELECT * FROM candidate_demand_flows ORDER BY id",
        ),
    ],
)
def test_cleanup_fails_closed_for_actor_only_or_cross_scope_business_rows(
    tmp_path,
    case_name,
    mutation_sql,
    probe_sql,
):
    db_path = tmp_path / f"{case_name}.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)
    connection = sqlite3.connect(db_path)
    connection.executescript(mutation_sql)
    expected_rows = connection.execute(probe_sql).fetchall()
    connection.commit()
    connection.close()
    backup_root = tmp_path / "backups"
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(backup_root),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0, case_name
    assert "mixed demo/real ownership" in (result.stdout + result.stderr)
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute(probe_sql).fetchall() == expected_rows
        assert connection.execute("SELECT id FROM users ORDER BY id").fetchall() == [
            (1,),
            (2,),
        ]
    finally:
        connection.close()
    assert demo_file.read_bytes() == b"demo"
    assert real_file.read_bytes() == b"real"
    assert not backup_root.exists()


def test_cleanup_allows_demo_actor_events_without_a_business_target(tmp_path):
    db_path = tmp_path / "actor-private-events.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        ALTER TABLE events ADD COLUMN actor_id INTEGER;
        ALTER TABLE events ADD COLUMN demand_id INTEGER;
        ALTER TABLE events ADD COLUMN payload TEXT;
        INSERT INTO events (id, entity_type, entity_id, actor_id, demand_id)
        VALUES (3, NULL, NULL, 1, NULL);
        INSERT INTO events (id, entity_type, entity_id, actor_id, demand_id, payload)
        VALUES (
            4,
            'agent_tool',
            10,
            1,
            NULL,
            '{"tool":"run_match","target_ids":{"job_id":10}}'
        );
        CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY,
            actor_id INTEGER,
            target_table TEXT,
            target_id INTEGER
        );
        INSERT INTO audit_logs (id, actor_id, target_table, target_id)
        VALUES (908, 1, NULL, NULL);
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            demand_id INTEGER
        );
        INSERT INTO notifications (id, user_id, demand_id) VALUES
            (909, 1, 200),
            (910, 2, 200);
        CREATE TABLE idempotency_records (
            id INTEGER PRIMARY KEY,
            actor_scope TEXT
        );
        INSERT INTO idempotency_records (id, actor_scope) VALUES
            (911, 'user:1'),
            (912, 'user:2');
        """
    )
    connection.commit()
    connection.close()
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode == 0, result.stderr
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT id FROM events ORDER BY id").fetchall() == [(2,)]
        assert connection.execute("SELECT id FROM audit_logs ORDER BY id").fetchall() == []
        assert connection.execute("SELECT id FROM notifications ORDER BY id").fetchall() == [
            (910,)
        ]
        assert connection.execute(
            "SELECT id FROM idempotency_records ORDER BY id"
        ).fetchall() == [(912,)]
    finally:
        connection.close()


def test_cleanup_blocks_talent_person_crossing_demo_company_and_real_map(tmp_path):
    db_path = tmp_path / "mixed-talent-person.sqlite"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);
        CREATE TABLE talent_maps (
            id INTEGER PRIMARY KEY,
            owner_hr_id INTEGER,
            job_id INTEGER
        );
        CREATE TABLE talent_map_companies (
            id INTEGER PRIMARY KEY,
            map_id INTEGER
        );
        CREATE TABLE talent_map_people (
            id INTEGER PRIMARY KEY,
            map_id INTEGER,
            company_id INTEGER
        );
        INSERT INTO users (id, email) VALUES
            (1, 'demo@mvp.local'),
            (2, 'real@example.com');
        INSERT INTO talent_maps (id, owner_hr_id, job_id) VALUES
            (10, 1, NULL),
            (20, 2, NULL);
        INSERT INTO talent_map_companies (id, map_id) VALUES (100, 10);
        INSERT INTO talent_map_people (id, map_id, company_id) VALUES
            (1000, 10, 100),
            (2000, 20, 100);
        """
    )
    connection.commit()
    connection.close()
    cleanup = _load_script("cleanup_demo_data")
    engine = cleanup.create_engine(f"sqlite:///{db_path}")

    with engine.begin() as sql_connection:
        tables = cleanup._load_tables(engine)
        with pytest.raises(SystemExit, match="talent_map_people"):
            cleanup._collect_plan(sql_connection, tables, "@mvp.local")

    remaining = sqlite3.connect(db_path).execute(
        "SELECT id FROM talent_map_people ORDER BY id"
    ).fetchall()
    assert remaining == [(1000,), (2000,)]


def test_cleanup_plan_deletes_candidate_and_batch_before_referenced_demand(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "uploads"
    upload_folder.mkdir()
    _seed_demand_cleanup_database(
        db_path,
        upload_folder / "demo.pdf",
        upload_folder / "real.pdf",
    )
    cleanup = _load_script("cleanup_demo_data")
    engine = cleanup.create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        tables = cleanup._load_tables(engine)
        plan = cleanup._collect_plan(connection, tables, "@mvp.local")
    names = [name for name, _condition in plan.deletions]

    assert names.index("candidate_demand_flows") < names.index("recruitment_demands")
    assert names.index("candidates") < names.index("recruitment_demands")
    assert names.index("upload_batches") < names.index("recruitment_demands")


def test_cleanup_deletes_only_the_frozen_row_ids(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    connection = sqlite3.connect(db_path)
    connection.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT)")
    connection.executemany(
        "INSERT INTO events (id, value) VALUES (?, ?)",
        [(1, "planned"), (2, "unplanned"), (3, "real")],
    )
    connection.commit()
    connection.close()
    cleanup = _load_script("cleanup_demo_data")
    engine = cleanup.create_engine(f"sqlite:///{db_path}")
    with engine.begin() as sql_connection:
        tables = cleanup._load_tables(engine)
        assert hasattr(cleanup, "_delete_frozen_rows")
        cleanup._delete_frozen_rows(sql_connection, tables, [("events", [(1,)])])

    remaining = sqlite3.connect(db_path).execute("SELECT id FROM events ORDER BY id").fetchall()
    assert remaining == [(2,), (3,)]


def test_cleanup_rejects_relative_upload_folder(tmp_path, monkeypatch):
    cleanup = _load_script("cleanup_demo_data")
    monkeypatch.delenv("FLASK_DEBUG", raising=False)
    monkeypatch.setenv("UPLOAD_FOLDER", "backend/uploads")

    with pytest.raises(SystemExit, match="absolute|\u7edd\u5bf9"):
        cleanup._configured_upload_folder(tmp_path)


def test_local_debug_cleanup_resolves_relative_upload_folder_from_project_root(
    tmp_path,
    monkeypatch,
):
    cleanup = _load_script("cleanup_demo_data")
    monkeypatch.setenv("FLASK_DEBUG", "true")
    monkeypatch.setenv("UPLOAD_FOLDER", "backend/uploads")

    assert cleanup._configured_upload_folder(tmp_path) == (
        tmp_path / "backend" / "uploads"
    ).absolute()


def test_cleanup_rejects_ambiguous_legacy_and_portable_upload_reference(tmp_path):
    cleanup = _load_script("cleanup_demo_data")
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    legacy_target = upload_folder / "demo.pdf"
    portable_target = upload_folder / "backend" / "uploads" / "demo.pdf"
    portable_target.parent.mkdir(parents=True)
    legacy_target.write_bytes(b"legacy")
    portable_target.write_bytes(b"portable")

    with pytest.raises(SystemExit, match="歧义"):
        cleanup._resolve_demo_uploads(
            ("backend/uploads/demo.pdf",),
            (),
            tmp_path,
            upload_folder,
        )


def test_cleanup_removes_demo_demand_flows_preserves_other_uploads_and_creates_restorable_snapshot(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    unrelated_file = upload_folder / "unrelated.txt"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    unrelated_file.write_bytes(b"unrelated")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)

    backup_root = tmp_path / "backups"
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(backup_root),
        }
    )
    cleanup = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert cleanup.returncode == 0, cleanup.stderr
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT id FROM candidate_demand_flows ORDER BY id").fetchall() == [(2,)]
        assert connection.execute("SELECT id FROM recruitment_demands ORDER BY id").fetchall() == [(200,)]
        assert connection.execute("SELECT id FROM candidates ORDER BY id").fetchall() == [(20000,)]
        assert connection.execute("SELECT id FROM events ORDER BY id").fetchall() == [(2,)]
    finally:
        connection.close()
    assert not demo_file.exists()
    assert real_file.read_bytes() == b"real"
    assert unrelated_file.read_bytes() == b"unrelated"

    snapshots = list(backup_root.iterdir())
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert (snapshot / "manifest.json").is_file()
    assert (snapshot / "uploads.tar.gz").is_file()
    assert (snapshot / db_path.name).is_file()

    restored_db = tmp_path / "restored.sqlite"
    restored_uploads = tmp_path / "restored-uploads"
    restore_env = os.environ.copy()
    restore_env.update(
        {
            "DATABASE_URL": f"sqlite:///{restored_db}",
            "UPLOAD_FOLDER": str(restored_uploads),
        }
    )
    restore = _run(
        "restore_pilot_data.py",
        "--backup-path",
        snapshot,
        "--confirm",
        env=restore_env,
    )

    assert restore.returncode == 0, restore.stderr
    restored = sqlite3.connect(restored_db)
    try:
        assert restored.execute("SELECT id FROM candidate_demand_flows ORDER BY id").fetchall() == [(1,), (2,)]
        assert restored.execute("SELECT id FROM candidates ORDER BY id").fetchall() == [(10000,), (20000,)]
        assert restored.execute(
            "SELECT id, raw_file_path FROM candidates ORDER BY id"
        ).fetchall() == [(10000, "demo.pdf"), (20000, "real.pdf")]
    finally:
        restored.close()
    assert (restored_uploads / "demo.pdf").read_bytes() == b"demo"
    assert (restored_uploads / "real.pdf").read_bytes() == b"real"
    assert (restored_uploads / "unrelated.txt").read_bytes() == b"unrelated"


def test_cleanup_preserves_file_still_referenced_by_real_candidate(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    shared_file = upload_folder / "shared.pdf"
    demo_file.write_bytes(b"demo")
    shared_file.write_bytes(b"shared")
    _seed_demand_cleanup_database(db_path, demo_file, shared_file)
    connection = sqlite3.connect(db_path)
    connection.execute(
        "UPDATE candidates SET raw_file_path = ? WHERE id = 20000",
        ("shared.pdf",),
    )
    connection.execute(
        "INSERT INTO candidates "
        "(id, owner_hr_id, upload_batch_id, current_demand_id, raw_file_path) VALUES (?, ?, ?, ?, ?)",
        (10001, 1, 1000, 100, str(shared_file)),
    )
    connection.commit()
    connection.close()

    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )
    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode == 0, result.stderr
    assert not demo_file.exists()
    assert shared_file.read_bytes() == b"shared"


def test_cleanup_fails_closed_instead_of_deleting_real_candidate_linked_to_demo_demand(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    cross_scope_file = upload_folder / "cross-scope.pdf"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    cross_scope_file.write_bytes(b"cross-scope")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)
    connection = sqlite3.connect(db_path)
    connection.execute(
        "INSERT INTO candidates "
        "(id, owner_hr_id, upload_batch_id, current_demand_id, raw_file_path) VALUES (?, ?, ?, ?, ?)",
        (30000, 2, 2000, 100, str(cross_scope_file)),
    )
    connection.commit()
    connection.close()
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "surviving candidates" in (result.stdout + result.stderr)
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT id FROM candidates ORDER BY id").fetchall() == [
            (10000,),
            (20000,),
            (30000,),
        ]
    finally:
        connection.close()
    assert cross_scope_file.read_bytes() == b"cross-scope"
    assert not (tmp_path / "backups").exists()


def test_cleanup_fails_closed_for_real_batch_targeting_demo_job(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    cross_scope_file = upload_folder / "real-on-demo-job.pdf"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    cross_scope_file.write_bytes(b"real-on-demo-job")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)
    connection = sqlite3.connect(db_path)
    connection.execute(
        "INSERT INTO upload_batches "
        "(id, owner_hr_id, target_job_id, demand_id) VALUES (3000, 2, 10, 200)"
    )
    connection.execute(
        "INSERT INTO candidates "
        "(id, owner_hr_id, upload_batch_id, current_demand_id, raw_file_path) "
        "VALUES (30000, 2, 3000, 200, ?)",
        (str(cross_scope_file),),
    )
    connection.commit()
    connection.close()
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "surviving upload batches" in (result.stdout + result.stderr)
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute(
            "SELECT id FROM upload_batches ORDER BY id"
        ).fetchall() == [(1000,), (2000,), (3000,)]
        assert connection.execute(
            "SELECT id FROM candidates ORDER BY id"
        ).fetchall() == [(10000,), (20000,), (30000,)]
    finally:
        connection.close()
    assert cross_scope_file.read_bytes() == b"real-on-demo-job"
    assert not (tmp_path / "backups").exists()


def test_cleanup_fails_closed_when_selected_demo_flow_is_current_for_real_candidate(tmp_path):
    db_path = tmp_path / "pilot.sqlite"
    upload_folder = tmp_path / "backend" / "uploads"
    upload_folder.mkdir(parents=True)
    demo_file = upload_folder / "demo.pdf"
    real_file = upload_folder / "real.pdf"
    demo_file.write_bytes(b"demo")
    real_file.write_bytes(b"real")
    _seed_demand_cleanup_database(db_path, demo_file, real_file)
    connection = sqlite3.connect(db_path)
    connection.execute("UPDATE candidate_demand_flows SET owner_hr_id=1 WHERE id=2")
    connection.commit()
    connection.close()
    env = os.environ.copy()
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "UPLOAD_FOLDER": str(upload_folder),
            "BACKUP_DIR": str(tmp_path / "backups"),
        }
    )

    result = _run(
        "cleanup_demo_data.py",
        "--project-root",
        tmp_path,
        "--confirm",
        env=env,
    )

    assert result.returncode != 0
    assert "selected demo flows" in (result.stdout + result.stderr)
    connection = sqlite3.connect(db_path)
    try:
        assert connection.execute("SELECT id FROM candidate_demand_flows ORDER BY id").fetchall() == [
            (1,),
            (2,),
        ]
    finally:
        connection.close()
    assert real_file.read_bytes() == b"real"
