"""Small helpers for keeping user-controlled SQL patterns literal."""


LIKE_ESCAPE_CHAR = "\\"


def escape_like_literal(value: str) -> str:
    """Escape SQL LIKE metacharacters so text searches stay literal."""
    return (
        str(value)
        .replace(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR * 2)
        .replace("%", f"{LIKE_ESCAPE_CHAR}%")
        .replace("_", f"{LIKE_ESCAPE_CHAR}_")
    )
