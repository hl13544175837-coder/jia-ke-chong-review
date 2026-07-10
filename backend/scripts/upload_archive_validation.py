from pathlib import PurePosixPath


def validated_upload_member_parts(member):
    """Validate one tar member against the portable restore contract."""
    posix = PurePosixPath(member.name)
    if (
        posix.is_absolute()
        or ".." in posix.parts
        or ":" in member.name
        or "\\" in member.name
    ):
        raise SystemExit(f"不安全的 uploads 备份路径: {member.name}")
    if not member.isdir() and not member.isfile():
        raise SystemExit(f"不安全的 uploads 备份类型: {member.name}")

    parts = list(posix.parts)
    if parts and parts[0] == "uploads":
        parts = parts[1:]
    return parts
