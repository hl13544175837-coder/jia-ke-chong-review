"""Public, non-secret build identity for release verification."""

import os


EXPECTED_SCHEMA_REVISION = "20260811_18"


def _public_value(name: str, fallback: str) -> str:
    value = os.environ.get(name, "").strip()
    return value or fallback


def public_build_info() -> dict[str, str]:
    return {
        "name": "zhipin-server",
        "description": "智聘 · AI 招聘管理系统",
        "version": _public_value("BUILD_VERSION", "local"),
        "channel": _public_value("BUILD_CHANNEL", "local"),
        "build_time": _public_value("BUILD_TIME", "unknown"),
        "schema": EXPECTED_SCHEMA_REVISION,
    }
