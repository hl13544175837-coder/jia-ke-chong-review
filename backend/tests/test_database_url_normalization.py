from sqlalchemy.engine import make_url

from database_urls import normalize_database_url


def test_common_database_urls_select_installed_sqlalchemy_drivers():
    assert make_url(
        normalize_database_url("postgresql://user:pass@db:5432/zhipin")
    ).drivername == "postgresql+psycopg"
    assert make_url(
        normalize_database_url("mysql://user:pass@db:3306/zhipin")
    ).drivername == "mysql+pymysql"


def test_explicit_driver_and_sqlite_urls_are_preserved():
    for value in (
        "postgresql+psycopg://user:pass@db:5432/zhipin",
        "mysql+pymysql://user:pass@db:3306/zhipin",
        "sqlite:////tmp/zhipin.db",
    ):
        assert normalize_database_url(value) == value
