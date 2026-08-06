"""Prevent spreadsheet applications from executing exported text as formulas."""

FORMULA_PREFIXES = ("=", "+", "-", "@")


def safe_csv_cell(value):
    if not isinstance(value, str):
        return value
    cleaned = value.lstrip(" \t\r\n")
    if cleaned.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value
