"""Persistent, organization-scoped settings for the admin surface.

Role permissions and core pipeline states are intentionally not mutable here:
they are enforced by server code and changing a checkbox must never pretend to
change authorization. This service stores only safe operational configuration.
"""

from copy import deepcopy

from sqlalchemy import select

from .. import db
from ..middleware.events import record_event
from ..models import OrganizationSetting, User


DEFAULT_SETTINGS = {
    "company_name": "",
    "system_name": "智聘",
    "default_recruitment_cycle_days": 30,
    "offer_validity_days": 14,
    "departments": [],
}


class SettingsError(Exception):
    def __init__(self, message, status_code, code, fields=None):
        self.message = message
        self.status_code = status_code
        self.code = code
        self.fields = fields or {}
        super().__init__(message)

    def as_payload(self):
        payload = {"error": self.message, "code": self.code}
        if self.fields:
            payload["fields"] = self.fields
        return payload


def _clean_text(value, limit):
    return str(value or "").strip()[:limit]


def _positive_number(value, *, field, minimum, maximum, fields):
    if isinstance(value, bool):
        fields[field] = "必须是数字"
        return minimum
    try:
        number = int(value)
    except (TypeError, ValueError):
        fields[field] = "必须是数字"
        return minimum
    if not minimum <= number <= maximum:
        fields[field] = f"必须在 {minimum} 到 {maximum} 之间"
    return number


def validate_settings(config):
    if not isinstance(config, dict):
        raise SettingsError("设置格式不正确", 400, "invalid_settings", {"config": "必须是对象"})
    fields = {}
    company_name = _clean_text(config.get("company_name"), 120)
    system_name = _clean_text(config.get("system_name"), 60) or "智聘"
    cycle_days = _positive_number(
        config.get("default_recruitment_cycle_days", 30),
        field="default_recruitment_cycle_days",
        minimum=1,
        maximum=365,
        fields=fields,
    )
    offer_days = _positive_number(
        config.get("offer_validity_days", 14),
        field="offer_validity_days",
        minimum=1,
        maximum=180,
        fields=fields,
    )
    raw_departments = config.get("departments", [])
    if not isinstance(raw_departments, list) or len(raw_departments) > 100:
        fields["departments"] = "必须是 0 到 100 个部门名称"
        raw_departments = []
    departments = []
    for item in raw_departments:
        name = _clean_text(item, 120)
        if name and name not in departments:
            departments.append(name)
    if fields:
        raise SettingsError("设置校验失败", 400, "invalid_settings", fields)
    return {
        "company_name": company_name,
        "system_name": system_name,
        "default_recruitment_cycle_days": cycle_days,
        "offer_validity_days": offer_days,
        "departments": departments,
    }


def _payload(row):
    if row is None:
        return {
            "config": deepcopy(DEFAULT_SETTINGS),
            "version": 0,
            "updated_by": None,
            "updated_by_name": None,
            "updated_at": None,
            "permission_mode": "server_enforced",
            "pipeline_mode": "server_enforced",
        }
    updater = db.session.get(User, row.updated_by)
    return {
        "config": validate_settings(row.config_json),
        "version": row.version,
        "updated_by": row.updated_by,
        "updated_by_name": updater.name if updater else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "permission_mode": "server_enforced",
        "pipeline_mode": "server_enforced",
    }


def get_settings(org_id):
    return _payload(OrganizationSetting.query.filter_by(org_id=org_id).first())


def save_settings(*, org_id, actor_id, expected_version, config):
    try:
        expected = int(expected_version)
    except (TypeError, ValueError):
        expected = -1
    try:
        row = db.session.execute(
            select(OrganizationSetting)
            .where(OrganizationSetting.org_id == org_id)
            .with_for_update()
        ).scalar_one_or_none()
        current_version = row.version if row else 0
        if expected != current_version:
            raise SettingsError("设置已被其他人更新，请刷新后重试", 409, "settings_version_conflict")
        normalized = validate_settings(config)
        if row is None:
            row = OrganizationSetting(
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
            "settings.updated",
            entity_id=row.id,
            entity_type="organization_setting",
            payload={"version": row.version},
            commit=False,
        )
        db.session.commit()
        return _payload(row)
    except Exception:
        db.session.rollback()
        raise
