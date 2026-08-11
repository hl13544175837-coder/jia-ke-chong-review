from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import (
    Candidate,
    Job,
    OnlineResume,
    TalentMap,
    TalentMapCompany,
    TalentMapContactLog,
    TalentMapPerson,
)
from .access import can_manage_job, same_org

bp = Blueprint("talent_maps", __name__)


def _clean(value, limit):
    return str(value or "").strip()[:limit]


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _clean_tags(value):
    if isinstance(value, list):
        return [_clean(item, 40) for item in value if _clean(item, 40)][:12]
    if isinstance(value, str):
        return [_clean(item, 40) for item in value.split(",") if _clean(item, 40)][:12]
    return []


def _can_manage_map(talent_map):
    if not same_org(talent_map, g.org_id):
        return False
    if g.role in ("manager", "admin", "hr_director"):
        return True
    return talent_map.owner_hr_id == g.user_id


def _commit_with_event(action, *, entity_id, entity_type):
    try:
        record_event(
            action,
            entity_id=entity_id,
            entity_type=entity_type,
            commit=False,
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise


def _map_query_for_current_user():
    query = TalentMap.query.filter(TalentMap.org_id == g.org_id)
    if g.role == "recruiter":
        query = query.filter(TalentMap.owner_hr_id == g.user_id)
    return query


def _map_payload(talent_map, people=None):
    people_items = people if people is not None else talent_map.people
    return {
        "id": talent_map.id,
        "name": talent_map.name,
        "job_id": talent_map.job_id,
        "job_title": talent_map.job.title if talent_map.job else "",
        "department": talent_map.department or "",
        "owner_hr_id": talent_map.owner_hr_id,
        "board_json": talent_map.board_json or {},
        "companies_count": len(talent_map.companies),
        "people_count": len(people_items),
        "companies": [_company_payload(item) for item in talent_map.companies],
        "people": [_person_payload(item) for item in people_items],
        "created_at": talent_map.created_at.isoformat() if talent_map.created_at else None,
        "updated_at": talent_map.updated_at.isoformat() if talent_map.updated_at else None,
    }


def _map_summary_payload(talent_map):
    return {
        "id": talent_map.id,
        "name": talent_map.name,
        "job_id": talent_map.job_id,
        "job_title": talent_map.job.title if talent_map.job else "",
        "department": talent_map.department or "",
        "owner_hr_id": talent_map.owner_hr_id,
        "companies_count": len(talent_map.companies),
        "people_count": len(talent_map.people),
        "updated_at": talent_map.updated_at.isoformat() if talent_map.updated_at else None,
    }


def _company_payload(company):
    return {
        "id": company.id,
        "map_id": company.map_id,
        "company_name": company.company_name,
        "city": company.city or "",
        "region": company.region or "",
        "industry": company.industry or "",
        "priority": company.priority or "medium",
        "note": company.note or "",
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


def _contact_log_payload(log):
    return {
        "id": log.id,
        "person_id": log.person_id,
        "content": log.content or "",
        "contact_at": log.contact_at.isoformat() if log.contact_at else None,
        "created_by_name": log.creator.name if log.creator else "",
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def _person_payload(person):
    return {
        "id": person.id,
        "map_id": person.map_id,
        "company_id": person.company_id,
        "company_name": person.company.company_name if person.company else "",
        "name": person.name,
        "department": person.department or "",
        "title": person.title or "",
        "level": person.level or "",
        "module": person.module or "",
        "phone": person.phone or "",
        "city": person.city or "",
        "tags": person.tags or [],
        "salary_range": person.salary_range or "",
        "contact_status": person.contact_status or "未接触",
        "evaluation": person.evaluation or "",
        "source": person.source or "",
        "owner_hr_id": person.owner_hr_id,
        "owner_name": person.owner.name if person.owner else "",
        "next_follow_at": person.next_follow_at.isoformat() if person.next_follow_at else None,
        "note": person.note or "",
        "created_at": person.created_at.isoformat() if person.created_at else None,
        "updated_at": person.updated_at.isoformat() if person.updated_at else None,
        "contact_logs": [
            _contact_log_payload(log)
            for log in TalentMapContactLog.query.filter_by(person_id=person.id)
            .order_by(TalentMapContactLog.contact_at.desc())
            .limit(10)
            .all()
        ],
    }


def _apply_map_fields(talent_map, data):
    if "name" in data:
        talent_map.name = _clean(data.get("name"), 200) or talent_map.name
    if "department" in data:
        talent_map.department = _clean(data.get("department"), 120)
    if "board_json" in data:
        talent_map.board_json = data.get("board_json") if isinstance(data.get("board_json"), dict) else {}
    if "job_id" in data:
        job_id = data.get("job_id")
        if job_id in ("", None):
            talent_map.job_id = None
        else:
            job = db.session.get(Job, job_id)
            if job is None or not same_org(job, g.org_id):
                return "岗位不存在"
            if not can_manage_job(g.user_id, g.role, job):
                return "无权关联该岗位"
            talent_map.job_id = job.id
    return None


def _apply_company_fields(company, data):
    if "company_name" in data:
        company.company_name = _clean(data.get("company_name"), 200) or company.company_name
    if "city" in data:
        company.city = _clean(data.get("city"), 80)
    if "region" in data:
        company.region = _clean(data.get("region"), 80)
    if "industry" in data:
        company.industry = _clean(data.get("industry"), 120)
    if "priority" in data:
        company.priority = _clean(data.get("priority"), 40) or "medium"
    if "note" in data:
        company.note = _clean(data.get("note"), 2000)


def _apply_person_fields(person, data):
    if "company_id" in data:
        company_id = data.get("company_id")
        if company_id in ("", None):
            person.company_id = None
        else:
            company = TalentMapCompany.query.filter_by(
                id=company_id,
                map_id=person.map_id,
                org_id=g.org_id,
            ).first()
            if company is None:
                return "目标公司不存在"
            person.company_id = company.id
    if "name" in data:
        person.name = _clean(data.get("name"), 120) or person.name
    if "department" in data:
        person.department = _clean(data.get("department"), 120)
    if "title" in data:
        person.title = _clean(data.get("title"), 160)
    if "level" in data:
        person.level = _clean(data.get("level"), 80)
    if "module" in data:
        person.module = _clean(data.get("module"), 120)
    if "phone" in data:
        person.phone = _clean(data.get("phone"), 60)
    if "city" in data:
        person.city = _clean(data.get("city"), 80)
    if "tags" in data:
        person.tags = _clean_tags(data.get("tags"))
    if "salary_range" in data:
        person.salary_range = _clean(data.get("salary_range"), 120)
    if "contact_status" in data:
        person.contact_status = _clean(data.get("contact_status"), 80) or "未接触"
    if "evaluation" in data:
        person.evaluation = _clean(data.get("evaluation"), 120)
    if "source" in data:
        person.source = _clean(data.get("source"), 160)
    if "next_follow_at" in data:
        person.next_follow_at = _parse_date(data.get("next_follow_at"))
    if "note" in data:
        person.note = _clean(data.get("note"), 2000)
    return None


def _filtered_people_query(talent_map):
    query = TalentMapPerson.query.filter_by(map_id=talent_map.id, org_id=g.org_id).outerjoin(TalentMapCompany)
    company = _clean(request.args.get("company"), 200)
    city = _clean(request.args.get("city"), 80)
    status = _clean(request.args.get("status"), 80)
    keyword = _clean(request.args.get("keyword"), 120)
    if company:
        query = query.filter(TalentMapCompany.company_name.ilike(f"%{company}%"))
    if city:
        query = query.filter(TalentMapPerson.city.ilike(f"%{city}%"))
    if status:
        query = query.filter(TalentMapPerson.contact_status == status)
    if keyword:
        query = query.filter(
            db.or_(
                TalentMapPerson.name.ilike(f"%{keyword}%"),
                TalentMapPerson.title.ilike(f"%{keyword}%"),
                TalentMapPerson.evaluation.ilike(f"%{keyword}%"),
            )
        )
    return query.order_by(TalentMapPerson.updated_at.desc(), TalentMapPerson.id.desc())


@bp.get("/talent-maps")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def list_talent_maps():
    maps = _map_query_for_current_user().order_by(TalentMap.updated_at.desc(), TalentMap.id.desc()).all()
    return jsonify([_map_summary_payload(item) for item in maps])


@bp.post("/talent-maps")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def create_talent_map():
    data = request.get_json() or {}
    name = _clean(data.get("name"), 200)
    if not name:
        return jsonify({"error": "name required"}), 400
    talent_map = TalentMap(org_id=g.org_id, name=name, owner_hr_id=g.user_id, board_json={})
    error = _apply_map_fields(talent_map, data)
    if error:
        return jsonify({"error": error}), 403 if "无权" in error else 404
    db.session.add(talent_map)
    db.session.flush()
    _commit_with_event(
        "talent_map.created",
        entity_id=talent_map.id,
        entity_type="talent_map",
    )
    return jsonify(_map_payload(talent_map)), 201


@bp.get("/talent-maps/<int:map_id>")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def get_talent_map(map_id):
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    people = _filtered_people_query(talent_map).all()
    return jsonify(_map_payload(talent_map, people=people))


@bp.patch("/talent-maps/<int:map_id>")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def update_talent_map(map_id):
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    error = _apply_map_fields(talent_map, request.get_json() or {})
    if error:
        return jsonify({"error": error}), 403 if "无权" in error else 404
    _commit_with_event(
        "talent_map.updated",
        entity_id=talent_map.id,
        entity_type="talent_map",
    )
    return jsonify(_map_payload(talent_map))


@bp.post("/talent-maps/<int:map_id>/companies")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def create_talent_map_company(map_id):
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    company_name = _clean(data.get("company_name"), 200)
    if not company_name:
        return jsonify({"error": "company_name required"}), 400
    company = TalentMapCompany(org_id=g.org_id, map_id=talent_map.id, company_name=company_name)
    _apply_company_fields(company, data)
    db.session.add(company)
    db.session.flush()
    _commit_with_event(
        "talent_map_company.created",
        entity_id=company.id,
        entity_type="talent_map_company",
    )
    return jsonify(_company_payload(company)), 201


@bp.post("/talent-maps/<int:map_id>/companies/bulk")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def bulk_create_talent_map_companies(map_id):
    """批量创建目标公司：每项 {company_name, industry?, note?}，同名自动跳过。"""
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        return jsonify({"error": "items required"}), 400

    existing = {company.company_name for company in talent_map.companies}
    created, skipped = [], 0
    for raw in items:
        if not isinstance(raw, dict):
            continue
        company_name = _clean(raw.get("company_name") or raw.get("name"), 200)
        if not company_name:
            continue
        if company_name in existing:
            skipped += 1
            continue
        company = TalentMapCompany(
            org_id=g.org_id,
            map_id=talent_map.id,
            company_name=company_name,
        )
        _apply_company_fields(company, {
            "industry": raw.get("industry"),
            "city": raw.get("city"),
            "note": raw.get("note"),
        })
        db.session.add(company)
        db.session.flush()
        existing.add(company_name)
        created.append(_company_payload(company))

    _commit_with_event(
        "talent_map_company.bulk_created",
        entity_id=talent_map.id,
        entity_type="talent_map",
    )
    return jsonify({"created": created, "count": len(created), "skipped": skipped}), 201


@bp.patch("/talent-map-companies/<int:company_id>")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def update_talent_map_company(company_id):
    company = db.get_or_404(TalentMapCompany, company_id)
    if not same_org(company, g.org_id):
        return jsonify({"error": "目标公司不存在"}), 404
    if not _can_manage_map(company.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    _apply_company_fields(company, request.get_json() or {})
    _commit_with_event(
        "talent_map_company.updated",
        entity_id=company.id,
        entity_type="talent_map_company",
    )
    return jsonify(_company_payload(company))


@bp.patch("/talent-maps/<int:map_id>/organization")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def update_talent_map_organization(map_id):
    """一次保存某公司下的部门/岗位组织结构。

    空部门/空岗位（还没有人才）也会保存；部门/岗位改名会同步到该公司已有人员字段。
    前端按“部门 source_name/岗位 source_title”识别改名，未列入配置的既有岗位保持原名。
    """
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}

    company_id = data.get("company_id")
    try:
        company_id = int(company_id) if company_id not in (None, "") else None
    except (TypeError, ValueError):
        company_id = None
    if company_id is None:
        return jsonify({"error": "company_id required"}), 400
    company = TalentMapCompany.query.filter_by(
        id=company_id,
        map_id=talent_map.id,
        org_id=g.org_id,
    ).first()
    if company is None:
        return jsonify({"error": "目标公司不存在"}), 404

    raw_departments = data.get("departments")
    if not isinstance(raw_departments, list):
        return jsonify({"error": "departments required"}), 400

    # 1) 规范化配置：名称去重、去空，岗位保持顺序
    departments = []
    seen_departments = set()
    for raw in raw_departments:
        if not isinstance(raw, dict):
            continue
        name = _clean(raw.get("name"), 120)
        if not name or name in seen_departments:
            continue
        roles = []
        for role in raw.get("roles") or []:
            if isinstance(role, dict):
                title = _clean(role.get("title"), 160)
            elif isinstance(role, str):
                title = _clean(role, 160)
            else:
                title = ""
            if title and title not in roles:
                roles.append(title)
        seen_departments.add(name)
        departments.append({"name": name, "roles": roles})

    board_json = dict(talent_map.board_json) if isinstance(talent_map.board_json, dict) else {}
    organization = board_json.get("organization") if isinstance(board_json.get("organization"), dict) else {}
    organization = dict(organization)
    organization[str(company.id)] = {"departments": departments}
    board_json["organization"] = organization
    talent_map.board_json = board_json

    # 2) 改名同步：部门 source_name -> name，岗位 source_title -> title
    department_renames = {}
    role_renames_by_department = {}
    for raw in raw_departments:
        if not isinstance(raw, dict):
            continue
        new_name = _clean(raw.get("name"), 120)
        if not new_name:
            continue
        source_name = _clean(raw.get("source_name"), 120) or new_name
        department_renames[source_name] = new_name
        role_renames = {}
        for role in raw.get("roles") or []:
            if not isinstance(role, dict):
                continue
            new_title = _clean(role.get("title"), 160)
            if not new_title:
                continue
            source_title = _clean(role.get("source_title"), 160) or new_title
            role_renames[source_title] = new_title
        role_renames_by_department[source_name] = role_renames

    people = TalentMapPerson.query.filter_by(
        map_id=talent_map.id,
        org_id=g.org_id,
        company_id=company.id,
    ).all()
    for person in people:
        old_department = person.department or ""
        old_title = person.title or ""
        new_department = department_renames.get(old_department)
        if new_department:
            person.department = new_department
        role_renames = role_renames_by_department.get(old_department, {})
        new_title = role_renames.get(old_title)
        if new_title:
            person.title = new_title

    _commit_with_event(
        "talent_map_organization.updated",
        entity_id=talent_map.id,
        entity_type="talent_map",
    )
    return jsonify(_map_payload(talent_map))


@bp.post("/talent-maps/<int:map_id>/people")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def create_talent_map_person(map_id):
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    name = _clean(data.get("name"), 120)
    if not name:
        return jsonify({"error": "name required"}), 400
    company_id = data.get("company_id")
    company = None
    if company_id not in (None, ""):
        company = TalentMapCompany.query.filter_by(
            id=company_id,
            map_id=talent_map.id,
            org_id=g.org_id,
        ).first()
    # 防重复：同一地图内 同名 + 同目标公司 的人才不允许重复录入
    duplicate = TalentMapPerson.query.filter_by(
        map_id=talent_map.id,
        org_id=g.org_id,
        name=name,
        company_id=company.id if company else None,
    ).first()
    if duplicate:
        return jsonify({"error": "该公司下已存在同名人才，请确认是否重复录入"}), 400
    person = TalentMapPerson(
        org_id=g.org_id,
        map_id=talent_map.id,
        name=name,
        company_id=company.id if company else None,
        tags=[],
        owner_hr_id=g.user_id,
    )
    if not _clean(data.get("source"), 160):
        person.source = "人工录入"
    error = _apply_person_fields(person, data)
    if error:
        return jsonify({"error": error}), 404
    db.session.add(person)
    db.session.flush()
    _commit_with_event(
        "talent_map_person.created",
        entity_id=person.id,
        entity_type="talent_map_person",
    )
    return jsonify(_person_payload(person)), 201


@bp.patch("/talent-map-people/<int:person_id>")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def update_talent_map_person(person_id):
    person = db.get_or_404(TalentMapPerson, person_id)
    if not same_org(person, g.org_id):
        return jsonify({"error": "目标人才不存在"}), 404
    if not _can_manage_map(person.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    error = _apply_person_fields(person, request.get_json() or {})
    if error:
        return jsonify({"error": error}), 404
    _commit_with_event(
        "talent_map_person.updated",
        entity_id=person.id,
        entity_type="talent_map_person",
    )
    return jsonify(_person_payload(person))


@bp.get("/talent-map-people/<int:person_id>/contact-logs")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def list_talent_map_contact_logs(person_id):
    """人才联系记录时间线（按联系时间倒序）。"""
    person = db.get_or_404(TalentMapPerson, person_id)
    if not same_org(person, g.org_id):
        return jsonify({"error": "目标人才不存在"}), 404
    if not _can_manage_map(person.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    logs = (
        TalentMapContactLog.query.filter_by(person_id=person.id)
        .order_by(TalentMapContactLog.contact_at.desc())
        .all()
    )
    return jsonify([_contact_log_payload(log) for log in logs])


@bp.post("/talent-map-people/<int:person_id>/contact-logs")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def create_talent_map_contact_log(person_id):
    """新增一条联系记录；可同时更新下次跟进时间 next_follow_at。"""
    person = db.get_or_404(TalentMapPerson, person_id)
    if not same_org(person, g.org_id):
        return jsonify({"error": "目标人才不存在"}), 404
    if not _can_manage_map(person.talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json(silent=True) or {}
    content = _clean(data.get("content"), 2000)
    if not content:
        return jsonify({"error": "content required"}), 400
    log = TalentMapContactLog(
        org_id=g.org_id,
        person_id=person.id,
        content=content,
        created_by=g.user_id,
    )
    contact_at = _parse_datetime(data.get("contact_at"))
    if contact_at is not None:
        log.contact_at = contact_at
    db.session.add(log)
    next_follow = _parse_date(data.get("next_follow_at"))
    if next_follow is not None:
        person.next_follow_at = next_follow
    _commit_with_event(
        "talent_map_person.contact_logged",
        entity_id=person.id,
        entity_type="talent_map_person",
    )
    return jsonify(_person_payload(person)), 201


# ---------------------------------------------------------------------------
# AI 从简历库导入（冷启动：第一批数据从简历库批量灌入）
# ---------------------------------------------------------------------------

def _resume_lib_items(keyword=""):
    """遍历简历库（Candidate + OnlineResume），提取最近一份工作任职信息。"""
    from ..services.candidate_library_service import latest_experience, resume_info

    items = []
    seen = set()
    keyword = _clean(keyword, 120)

    def _push(source_type, source_id, info):
        if source_id in seen:
            return
        exp = latest_experience(info)
        if not exp or not exp.get("company"):
            return
        name = _clean(info.get("name") or info.get("display_name") or info.get("candidate_name"), 120)
        if not name:
            return
        phone = _clean(
            info.get("phone") or info.get("mobile") or info.get("contact_phone"),
            60,
        )
        text = " ".join([name, exp["company"], exp["position"], str(info.get("target_position") or "")])
        if keyword and keyword not in text:
            return
        seen.add(source_id)
        items.append({
            "candidate_id": source_id,
            "source_type": source_type,
            "name": name,
            "company": exp["company"],
            "position": exp["position"] or "",
            "duration": exp["duration"] or "",
            "phone": phone,
        })

    candidates = (
        Candidate.query.filter(
            Candidate.org_id == g.org_id,
            Candidate.deleted_at.is_(None),
        )
        .order_by(Candidate.id.desc())
        .limit(500)
        .all()
    )
    for cand in candidates:
        try:
            _push("resume", cand.id, resume_info(cand))
        except Exception:
            continue

    online = (
        OnlineResume.query.filter(OnlineResume.org_id == g.org_id)
        .order_by(OnlineResume.id.desc())
        .limit(300)
        .all()
    )
    for item in online:
        try:
            _push("online", item.id, item.resume_json or {})
        except Exception:
            continue

    return items


# 常见公司别名（英文/简称/别称 → 规范中文名），用于简历公司名与目标公司匹配
COMPANY_ALIASES = {
    "shein": "广州希音",
    "shein广州": "广州希音",
    "bytedance": "字节跳动",
    "byte": "字节跳动",
    "douyin": "字节跳动",
    "tencent": "腾讯",
    "wechat": "腾讯",
    "alibaba": "阿里巴巴",
    "taobao": "阿里巴巴",
    "alipay": "蚂蚁集团",
    "meituan": "美团",
    "kuaishou": "快手",
    "pdd": "拼多多",
    "huawei": "华为",
    "byd": "比亚迪",
    "catl": "宁德时代",
    "cmb": "招商银行",
    "pingan": "平安科技",
    "iflytek": "科大讯飞",
    "sensetime": "商汤科技",
    "xiaohongshu": "小红书",
    "rednote": "小红书",
    "xiaomi": "小米",
    "jd": "京东",
    "netease": "网易",
    "baidu": "百度",
    "bilibili": "哔哩哔哩",
    "oppo": "OPPO",
}


def _normalize_company_name(value):
    """公司名归一化：去空格/统一小写，命中别名表时换成规范名，便于匹配。"""
    cleaned = _clean(value, 200)
    if not cleaned:
        return ""
    key = cleaned.replace(" ", "").replace("\u3000", "").lower()
    if key in COMPANY_ALIASES:
        return COMPANY_ALIASES[key]
    # 去掉常见后缀后再比对一次（如 "SHEIN 广州有限公司"）
    stripped = (
        key.replace("有限公司", "")
        .replace("股份有限公司", "")
        .replace("集团", "")
        .replace("控股", "")
    )
    if stripped in COMPANY_ALIASES:
        return COMPANY_ALIASES[stripped]
    return cleaned


def _match_company(talent_map, company_name):
    """在当前人才地图内按公司名匹配目标公司（精确优先，再包含）。"""
    name = _normalize_company_name(company_name)
    if not name:
        return None
    companies = TalentMapCompany.query.filter_by(
        org_id=g.org_id,
        map_id=talent_map.id,
    )
    exact = companies.filter_by(company_name=name).first()
    if exact:
        return exact
    for company in companies.all():
        target = _normalize_company_name(company.company_name)
        if not target:
            continue
        if name in target or target in name:
            return company
    return None


@bp.get("/talent-maps/<int:map_id>/resume-candidates")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def talent_map_resume_candidates(map_id):
    """简历库候选人列表（带最近一份工作任职信息），供 AI 导入向导勾选。"""
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    keyword = _clean(request.args.get("keyword"), 120)
    items = _resume_lib_items(keyword)
    return jsonify({"items": items, "total": len(items)})


@bp.post("/talent-maps/<int:map_id>/import/preview")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def talent_map_import_preview(map_id):
    """AI 匹配预览：简历库候选 → 目标公司/岗位，返回建议导入 + 待确认。"""
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    ids = data.get("candidate_ids") or []
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "candidate_ids required"}), 400

    lib = {str(item["candidate_id"]): item for item in _resume_lib_items()}
    match, unmatch = [], []
    for cid in ids:
        item = lib.get(str(cid))
        if not item:
            continue
        company = _match_company(talent_map, item["company"])
        if company:
            match.append({
                **item,
                "matched_company_id": company.id,
                "matched_company_name": company.company_name,
                "industry": company.industry or "",
            })
        else:
            unmatch.append(item)
    return jsonify({"match": match, "unmatch": unmatch, "map_companies": [
        {"id": c.id, "company_name": c.company_name, "industry": c.industry or ""}
        for c in talent_map.companies
    ]})


@bp.post("/talent-maps/<int:map_id>/import/confirm")
@require_auth
@require_role("recruiter", "manager", "admin", "hr_director")
def talent_map_import_confirm(map_id):
    """确认入库：把确认的人才批量写入人才地图（归属当前用户，来源=AI导入）。"""
    talent_map = db.get_or_404(TalentMap, map_id)
    if not same_org(talent_map, g.org_id):
        return jsonify({"error": "人才地图不存在"}), 404
    if not _can_manage_map(talent_map):
        return jsonify({"error": "Forbidden"}), 403
    data = request.get_json() or {}
    items = data.get("items") or []
    if not isinstance(items, list) or not items:
        return jsonify({"error": "items required"}), 400

    created = []
    skipped = 0
    for raw in items:
        if not isinstance(raw, dict):
            continue
        name = _clean(raw.get("name"), 120)
        if not name:
            continue
        company_id = raw.get("company_id")
        company = None
        if company_id not in (None, ""):
            company = TalentMapCompany.query.filter_by(
                id=company_id,
                map_id=talent_map.id,
                org_id=g.org_id,
            ).first()
        # 待确认闭环：未指定现有公司但给了 create_company_name → 按简历公司名新建目标公司（同名复用）
        create_company_name = _clean(raw.get("create_company_name"), 200)
        if company is None and create_company_name:
            company = TalentMapCompany.query.filter_by(
                map_id=talent_map.id,
                org_id=g.org_id,
                company_name=create_company_name,
            ).first()
            if company is None:
                company = TalentMapCompany(
                    org_id=g.org_id,
                    map_id=talent_map.id,
                    company_name=create_company_name,
                )
                _apply_company_fields(company, {"industry": raw.get("industry")})
                db.session.add(company)
                db.session.flush()
        # 防重复：同一地图内 同名 + 同目标公司 的人才跳过，避免重复导入
        duplicate = TalentMapPerson.query.filter_by(
            map_id=talent_map.id,
            org_id=g.org_id,
            name=name,
            company_id=company.id if company else None,
        ).first()
        if duplicate:
            skipped += 1
            continue
        person = TalentMapPerson(
            org_id=g.org_id,
            map_id=talent_map.id,
            company_id=company.id if company else None,
            owner_hr_id=g.user_id,
            name=name,
            tags=[],
        )
        payload = {
            "department": raw.get("department"),
            "title": raw.get("title") or raw.get("position"),
            "level": raw.get("level"),
            "module": raw.get("module"),
            "phone": raw.get("phone"),
            "city": raw.get("city"),
            "contact_status": raw.get("contact_status"),
            "note": raw.get("note"),
            "source": raw.get("source"),
        }
        if not _clean(payload["source"], 160):
            payload["source"] = "AI导入"
        error = _apply_person_fields(person, payload)
        if error:
            continue
        db.session.add(person)
        db.session.flush()
        created.append(_person_payload(person))

    _commit_with_event(
        "talent_map_import.confirmed",
        entity_id=talent_map.id,
        entity_type="talent_map",
    )
    return jsonify({"created": created, "count": len(created), "skipped": skipped}), 201
