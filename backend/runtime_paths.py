"""Single source of truth for runtime filesystem paths.

Local development may use the writable temporary upload default. Pilot and
production entry points must opt in to an explicit absolute path that is
backed by persistent storage.
"""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_UPLOAD_FOLDER = Path("/tmp/zhipin_uploads")
_TEMPORARY_ROOTS = tuple(
    {
        Path("/tmp").resolve(strict=False),
        Path("/private/tmp").resolve(strict=False),
        Path("/var/tmp").resolve(strict=False),
    }
)


class RuntimePathError(ValueError):
    """Raised when a runtime path cannot satisfy the requested safety level."""


def requires_persistent_uploads(flask_debug: str | bool | None) -> bool:
    """Return whether runtime upload storage must pass production gates."""

    if isinstance(flask_debug, bool):
        return not flask_debug
    return str(flask_debug or "false").strip().lower() != "true"


def _is_within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def resolve_upload_folder(
    raw_value: str | None,
    *,
    project_root: Path = PROJECT_ROOT,
    require_persistent: bool = False,
) -> Path:
    """Resolve ``UPLOAD_FOLDER`` consistently for app and maintenance tools.

    Relative paths are anchored at the repository root for local development,
    never at the process working directory. Persistent mode rejects missing,
    relative, root-level and temporary locations.
    """

    raw = str(raw_value or "").strip()
    if not raw:
        if require_persistent:
            raise RuntimePathError(
                "UPLOAD_FOLDER must be explicitly configured as an absolute persistent path"
            )
        candidate = DEFAULT_UPLOAD_FOLDER
    else:
        candidate = Path(raw).expanduser()
        if require_persistent and not candidate.is_absolute():
            raise RuntimePathError(
                "UPLOAD_FOLDER must be an absolute persistent path"
            )
        if not candidate.is_absolute():
            candidate = Path(project_root) / candidate

    lexical = candidate.absolute()
    if not require_persistent:
        return lexical

    resolved = lexical.resolve(strict=False)
    if resolved == Path(resolved.anchor):
        raise RuntimePathError("UPLOAD_FOLDER cannot be the filesystem root")
    if any(_is_within(resolved, temporary_root) for temporary_root in _TEMPORARY_ROOTS):
        raise RuntimePathError(
            "UPLOAD_FOLDER must use persistent storage, not a temporary directory"
        )
    return lexical


def resolve_stored_upload_path(raw_path: str | Path, upload_folder: str | Path) -> Path:
    """Resolve a database upload reference without allowing root escape.

    New restores store portable relative references, while existing rows may
    still contain absolute paths. Both forms are accepted only when the final
    path remains inside the configured upload root.
    """

    upload_root = Path(upload_folder or DEFAULT_UPLOAD_FOLDER).expanduser().resolve()
    stored = Path(raw_path).expanduser()
    resolved = (stored if stored.is_absolute() else upload_root / stored).resolve()
    if not _is_within(resolved, upload_root):
        raise RuntimePathError("stored upload path is outside UPLOAD_FOLDER")
    return resolved
