"""Organization-level recruiting process standards.

These settings classify workflow blockers and Demand risk. They must not be
used to rank or score individual employees.
"""

from copy import deepcopy
from dataclasses import dataclass

from sqlalchemy import select

from .. import db
from ..middleware.events import record_event
from ..models import KpiStandard, User


DEFAULT_KPI_CONFIG = {
    "block_categories": [
        {"id": "requirements", "name": "用人部门需求模糊", "keywords": ["需求模糊"]},
        {"id": "feedback", "name": "面试官/用人部门响应慢", "keywords": ["未反馈", "拖延", "改期"]},
        {"id": "salary", "name": "薪资不匹配", "keywords": ["薪资"]},
        {"id": "candidate_withdrawal", "name": "候选人放弃", "keywords": ["放弃", "入职他司"]},
        {"id": "other", "name": "其他原因", "keywords": []},
    ],
    "risk_thresholds": {
        "high_if_status_paused_or_closed": True,
        "high_if_zero_fill_and_blocked": True,
        "attention_hc_gap_ratio": 0.5,
        "attention_if_blocked": True,
        "deadline_warning_days": 14,
    },
    "process_health_thresholds": {
        "green_threshold": 70,
        "yellow_threshold": 40,
    },
}


@dataclass
class KpiStandardError(Exception):
    message: str
    status_code: int
    code: str
    fields: dict | None = None

    def as_payload(self):
        payload = {"error": self.message, "code": self.code}
        if self.fields:
            payload["fields"] = self.fields
        return payload


def _payload(row):
    if row is None:
        return {
            "config": deepcopy(DEFAULT_KPI_CONFIG),
            "version": 0,
            "updated_by": None,
            "updated_by_name": None,
            "updated_at": None,
        }
    updater = db.session.get(User, row.updated_by)
    return {
        "config": deepcopy(row.config_json),
        "version": row.version,
        "updated_by": row.updated_by,
        "updated_by_name": updater.name if updater else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_kpi_standards(org_id):
    return _payload(KpiStandard.query.filter_by(org_id=org_id).first())


def _number(value, *, minimum, maximum, field, fields):
    if isinstance(value, bool):
        fields[field] = "必须是数字"
        return minimum
    try:
        number = float(value)
    except (TypeError, ValueError):
        fields[field] = "必须是数字"
        return minimum
    if number < minimum or number > maximum:
        fields[field] = f"必须在 {minimum} 到 {maximum} 之间"
    return number


def validate_kpi_config(config):
    fields = {}
    if not isinstance(config, dict):
        raise KpiStandardError(
            "口径配置格式不正确",
            400,
            "invalid_kpi_standards",
            {"config": "必须是对象"},
        )

    categories = config.get("block_categories")
    normalized_categories = []
    if not isinstance(categories, list) or not 1 <= len(categories) <= 20:
        fields["block_categories"] = "必须包含 1 到 20 个分类"
        categories = []
    seen_ids = set()
    for index, item in enumerate(categories):
        prefix = f"block_categories.{index}"
        if not isinstance(item, dict):
            fields[prefix] = "必须是对象"
            continue
        identifier = str(item.get("id") or "").strip()[:60]
        name = str(item.get("name") or "").strip()[:80]
        keywords = item.get("keywords")
        if not identifier:
            fields[f"{prefix}.id"] = "不能为空"
        elif identifier in seen_ids:
            fields[f"{prefix}.id"] = "分类 ID 不能重复"
        seen_ids.add(identifier)
        if not name:
            fields[f"{prefix}.name"] = "不能为空"
        if not isinstance(keywords, list):
            fields[f"{prefix}.keywords"] = "必须是关键词数组"
            keywords = []
        normalized_keywords = []
        for keyword in keywords[:30]:
            text = str(keyword or "").strip()[:60]
            if text and text not in normalized_keywords:
                normalized_keywords.append(text)
        normalized_categories.append(
            {"id": identifier, "name": name, "keywords": normalized_keywords}
        )

    risk = config.get("risk_thresholds")
    if not isinstance(risk, dict):
        fields["risk_thresholds"] = "必须是对象"
        risk = {}
    for key in (
        "high_if_status_paused_or_closed",
        "high_if_zero_fill_and_blocked",
        "attention_if_blocked",
    ):
        if not isinstance(risk.get(key), bool):
            fields[f"risk_thresholds.{key}"] = "必须是开关值"
    gap_ratio = _number(
        risk.get("attention_hc_gap_ratio"),
        minimum=0,
        maximum=1,
        field="risk_thresholds.attention_hc_gap_ratio",
        fields=fields,
    )
    warning_days = _number(
        risk.get("deadline_warning_days"),
        minimum=1,
        maximum=90,
        field="risk_thresholds.deadline_warning_days",
        fields=fields,
    )

    health = config.get("process_health_thresholds")
    if not isinstance(health, dict):
        fields["process_health_thresholds"] = "必须是对象"
        health = {}
    green = _number(
        health.get("green_threshold"),
        minimum=0,
        maximum=100,
        field="process_health_thresholds.green_threshold",
        fields=fields,
    )
    yellow = _number(
        health.get("yellow_threshold"),
        minimum=0,
        maximum=100,
        field="process_health_thresholds.yellow_threshold",
        fields=fields,
    )
    if green <= yellow:
        fields["process_health_thresholds.green_threshold"] = "绿色阈值必须大于黄色阈值"

    if fields:
        raise KpiStandardError(
            "口径配置校验失败",
            400,
            "invalid_kpi_standards",
            fields,
        )

    return {
        "block_categories": normalized_categories,
        "risk_thresholds": {
            "high_if_status_paused_or_closed": risk["high_if_status_paused_or_closed"],
            "high_if_zero_fill_and_blocked": risk["high_if_zero_fill_and_blocked"],
            "attention_hc_gap_ratio": gap_ratio,
            "attention_if_blocked": risk["attention_if_blocked"],
            "deadline_warning_days": int(warning_days),
        },
        "process_health_thresholds": {
            "green_threshold": int(green),
            "yellow_threshold": int(yellow),
        },
    }


def _lock_row(org_id):
    return db.session.execute(
        select(KpiStandard)
        .where(KpiStandard.org_id == org_id)
        .with_for_update()
    ).scalar_one_or_none()


def _require_version(expected_version, current_version):
    try:
        expected = int(expected_version)
    except (TypeError, ValueError):
        expected = -1
    if expected != current_version:
        raise KpiStandardError(
            "配置已被其他人更新，请刷新后重试",
            409,
            "kpi_standards_version_conflict",
        )


def save_kpi_standards(*, org_id, actor_id, expected_version, config, reset=False):
    try:
        row = _lock_row(org_id)
        current_version = row.version if row else 0
        _require_version(expected_version, current_version)
        normalized = validate_kpi_config(
            deepcopy(DEFAULT_KPI_CONFIG) if reset else config
        )
        if row is None:
            row = KpiStandard(
                org_id=org_id,
                config_json=normalized,
                version=1,
                updated_by=actor_id,
            )
            db.session.add(row)
            db.session.flush()
        else:
            row.config_json = normalized
            row.version += 1
            row.updated_by = actor_id
        record_event(
            "kpi_standards.reset" if reset else "kpi_standards.updated",
            entity_id=row.id,
            entity_type="kpi_standard",
            payload={"version": row.version},
            commit=False,
        )
        db.session.commit()
        return _payload(row)
    except Exception:
        db.session.rollback()
        raise
