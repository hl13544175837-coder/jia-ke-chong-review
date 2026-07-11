#!/usr/bin/env python3
"""Validate and extract portable uploads backup archives.

Archives use one top-level ``uploads/`` directory and may contain regular
files and directories only. Links, devices, FIFOs and non-portable paths are
rejected before any restore target is changed.
"""

import os
import shutil
import tarfile
from pathlib import Path, PurePosixPath


class UploadArchiveError(ValueError):
    """Raised when an uploads archive is unsafe or malformed."""


def _member_relative_path(member):
    name = member.name
    if not name or "\x00" in name or "\\" in name or ":" in name:
        raise UploadArchiveError(f"不安全或不可移植的路径: {name!r}")

    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise UploadArchiveError(f"不安全的路径: {name}")
    if not path.parts or path.parts[0] != "uploads":
        raise UploadArchiveError(f"备份成员必须位于 uploads/ 下: {name}")

    relative_parts = path.parts[1:]
    if member.isdir():
        return PurePosixPath(*relative_parts) if relative_parts else PurePosixPath(".")
    if not member.isfile():
        raise UploadArchiveError(f"不安全的归档成员类型: {name}")
    if not relative_parts:
        raise UploadArchiveError("uploads 根节点不能是普通文件")
    return PurePosixPath(*relative_parts)


def _validated_members(archive):
    planned = []
    seen = set()
    regular_files = set()

    for member in archive.getmembers():
        relative = _member_relative_path(member)
        key = relative.as_posix()
        if key in seen:
            raise UploadArchiveError(f"备份中存在重复路径: {member.name}")

        ancestors = list(relative.parents)
        if any(parent.as_posix() in regular_files for parent in ancestors):
            raise UploadArchiveError(f"普通文件不能作为目录: {member.name}")
        if member.isfile():
            prefix = key.rstrip("/") + "/"
            if any(existing.startswith(prefix) for existing in seen):
                raise UploadArchiveError(f"普通文件覆盖了已声明的目录: {member.name}")
            regular_files.add(key)

        seen.add(key)
        planned.append((member, relative))

    if "." not in seen:
        raise UploadArchiveError("备份缺少 uploads/ 根目录")
    return planned


def validate_upload_archive(archive_path):
    """Validate an archive without extracting it."""

    archive_path = Path(archive_path)
    if not archive_path.is_file():
        raise UploadArchiveError(f"找不到 uploads 备份文件: {archive_path}")
    try:
        with tarfile.open(archive_path, "r:*") as archive:
            _validated_members(archive)
    except (tarfile.TarError, OSError) as exc:
        raise UploadArchiveError(f"无法读取 uploads 备份: {exc}") from exc


def extract_upload_archive(archive_path, destination):
    """Extract a validated archive into an empty staging directory."""

    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    os.chmod(destination, 0o700)
    if any(destination.iterdir()):
        raise UploadArchiveError(f"恢复临时目录必须为空: {destination}")

    try:
        with tarfile.open(archive_path, "r:*") as archive:
            planned = _validated_members(archive)
            for member, relative in planned:
                target = destination if relative.as_posix() == "." else destination.joinpath(*relative.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    os.chmod(target, 0o700)
                    continue

                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    raise UploadArchiveError(f"无法读取备份成员: {member.name}")
                with source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                os.chmod(target, 0o600)
    except UploadArchiveError:
        raise
    except (tarfile.TarError, OSError) as exc:
        raise UploadArchiveError(f"无法解压 uploads 备份: {exc}") from exc
