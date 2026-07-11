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
    for index, candidate in enumerate(candidates, start=1):
        origin = str(candidate or "").strip()
        if not origin:
            continue
        reasons = []
        parsed = None
        port = None
        try:
            parsed = urlsplit(origin)
            # Accessing ``port`` also validates malformed/non-numeric ports.
            port = parsed.port
        except ValueError:
            reasons.append("malformed URL or port")

        if origin.lower() == "null" or origin == "*":
            reasons.append("wildcard/null origin is forbidden")
        if parsed is not None:
            if parsed.scheme.lower() not in {"http", "https"}:
                reasons.append("scheme must be http or https")
            if not parsed.hostname:
                reasons.append("host is missing")
            if parsed.username is not None or parsed.password is not None:
                reasons.append("userinfo credentials are forbidden")
            if parsed.path:
                reasons.append("path is forbidden")
            if parsed.query:
                reasons.append("query is forbidden")
            if parsed.fragment:
                reasons.append("fragment is forbidden")
            if any(character.isspace() for character in origin):
                reasons.append("whitespace is forbidden")
            if not reasons and origin != f"{parsed.scheme}://{parsed.netloc}":
                reasons.append("origin is not canonical")

        valid = not reasons
        if valid:
            normalized.append(origin)
        else:
            scheme = (parsed.scheme.lower() if parsed is not None else "") or "<missing-scheme>"
            try:
                host = parsed.hostname if parsed is not None else None
            except ValueError:
                host = None
            host = host or "<missing-host>"
            if ":" in host and not host.startswith("["):
                host = f"[{host}]"
            authority = host + (f":{port}" if port is not None else "")
            invalid.append(f"#{index} {scheme}://{authority} ({'; '.join(reasons)})")

    if invalid:
        raise ValueError(
            "CORS_ORIGINS 仅允许无路径、query、fragment 和用户凭据的 http(s) origin；"
            "非法项（已脱敏）：" + ", ".join(invalid)
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
