"""简历抽取字段质量校验（在线简历导入、普通简历解析共用）。

AI 抽取结果可能存在文本错位、字段拼接错误、乱码等问题。
在入库前统一校验，防止脏数据进入业务表。
"""

import re

_SALARY_VALID_PATTERNS = (
    re.compile(r"^面议$"),
    re.compile(r"^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*[kKwW万]"),
    re.compile(r"^\d+(?:\.\d+)?\s*[kKwW万]\s*[×x*]\s*\d+\s*薪$"),
)


def looks_repeated(value: str) -> bool:
    return bool(
        re.search(r"([\u4e00-\u9fa5]{2,})\1", value)
        or re.search(r"([A-Za-z]{3,})\1", value)
    )


def invalid_salary_value(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if not any(pattern.match(stripped) for pattern in _SALARY_VALID_PATTERNS):
        return True
    match = re.match(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", stripped)
    if match:
        low = float(match.group(1))
        high = float(match.group(2))
        if high > low * 12 + 50:
            return True
    return False


def invalid_location_value(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if looks_repeated(stripped):
        return True
    return not re.fullmatch(r"[\u4e00-\u9fa5\-·（）()]{2,12}", stripped)


def invalid_target_position_value(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    if looks_repeated(stripped) or len(stripped) > 40:
        return True
    # 目标岗位里混入期望薪资（如 "上海Java行业不限23-27K"）——AI 抽取时字段拼接错误
    if re.search(r"\d+\s*[kKwW万]", stripped):
        return True
    return False


def check_extracted_quality(info: dict) -> list[str]:
    """检查抽取字段质量，返回异常字段标签列表（空列表表示无异常）。"""
    if not isinstance(info, dict):
        return ["structure"]
    issues: list[str] = []
    raw_target = info.get("target_position")
    if isinstance(raw_target, str) and invalid_target_position_value(raw_target):
        issues.append("target_position")
    raw_salary = info.get("salary_expectation") or info.get("expected_salary")
    if isinstance(raw_salary, str) and invalid_salary_value(raw_salary):
        issues.append("salary_expectation")
    raw_location = info.get("location") or info.get("city")
    if isinstance(raw_location, str) and invalid_location_value(raw_location):
        issues.append("location")
    return issues
