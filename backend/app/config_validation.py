"""Shared validation and safe display helpers for runtime configuration."""

from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def validate_cors_origins(origins) -> list[str]:
    """Return normalized HTTP origins or raise without accepting wildcard forms."""
    if isinstance(origins, str):
        candidates = origins.split(",")
    else:
        candidates = list(origins or [])

    normalized = []
    invalid = []
    for candidate in candidates:
        origin = str(candidate or "").strip()
        if not origin:
            continue
        try:
            parsed = urlsplit(origin)
            # Accessing ``port`` also validates malformed/non-numeric ports.
            _ = parsed.port
            valid = (
                origin.lower() != "null"
                and origin != "*"
                and parsed.scheme.lower() in {"http", "https"}
                and bool(parsed.hostname)
                and parsed.username is None
                and parsed.password is None
                and not parsed.path
                and not parsed.query
                and not parsed.fragment
                and not any(character.isspace() for character in origin)
                and origin == f"{parsed.scheme}://{parsed.netloc}"
            )
        except ValueError:
            valid = False
        if valid:
            normalized.append(origin)
        else:
            invalid.append(origin or "<empty>")

    if invalid:
        raise ValueError(
            "CORS_ORIGINS 仅允许无路径、query、fragment 和用户凭据的 http(s) origin；"
            "非法项：" + ", ".join(invalid)
        )
    return normalized


def safe_database_label(database_url: str) -> str:
    """Render only driver, host/port and database; never credentials or query."""
    try:
        url = make_url(str(database_url or ""))
    except (ArgumentError, TypeError, ValueError):
        return "database://invalid"

    driver = url.drivername or "database"
    database = str(url.database or "")
    if driver.startswith("sqlite"):
        name = Path(database).name if database and database != ":memory:" else database
        return f"{driver}:///{name}"

    host = url.host or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    authority = host
    if url.port is not None:
        authority = f"{authority}:{url.port}"
    return f"{driver}://{authority}/{database.lstrip('/')}"
