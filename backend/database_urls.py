"""Canonical SQLAlchemy driver URLs for every runtime and lifecycle entry point."""


def normalize_database_url(url: str) -> str:
    """Select the installed psycopg3/PyMySQL drivers for common bare URLs."""

    value = str(url or "")
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://"):]
    if value.startswith("mysql://"):
        return "mysql+pymysql://" + value[len("mysql://"):]
    return value
