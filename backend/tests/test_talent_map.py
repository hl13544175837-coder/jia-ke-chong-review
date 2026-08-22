import pytest

from app import db
from app.models import Candidate, Job, TalentMap, TalentMapCompany, TalentMapContactLog, TalentMapPerson


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_talent_map_can_save_companies_people_and_filter_by_company(client, make_user, app):
    hr_id, token = make_user("talent-map-hr@example.com", role="recruiter", name="地图HR")

    with app.app_context():
        job = Job(
            title="省总经理",
            city="广东",
            department="销售中心",
            jd_text="负责省区销售团队管理",
            owner_hr_id=hr_id,
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/talent-maps",
        headers=_auth(token),
        json={
            "name": "省总人才地图",
            "job_id": job_id,
            "department": "销售中心",
            "board_json": {"columns": ["目标公司", "潜在人选", "重点关注"]},
        },
    )
    assert created.status_code == 201
    talent_map = created.get_json()
    assert talent_map["name"] == "省总人才地图"
    assert talent_map["job_id"] == job_id
    assert talent_map["job_title"] == "省总经理"
    assert talent_map["board_json"]["columns"] == ["目标公司", "潜在人选", "重点关注"]

    company = client.post(
        f"/api/talent-maps/{talent_map['id']}/companies",
        headers=_auth(token),
        json={
            "company_name": "竞品科技",
            "city": "深圳",
            "region": "华南",
            "industry": "企业服务",
            "priority": "high",
            "note": "销售团队规模大",
        },
    )
    assert company.status_code == 201
    company_body = company.get_json()
    assert company_body["company_name"] == "竞品科技"

    other_company = client.post(
        f"/api/talent-maps/{talent_map['id']}/companies",
        headers=_auth(token),
        json={"company_name": "标杆集团", "city": "广州", "priority": "medium"},
    )
    assert other_company.status_code == 201

    person = client.post(
        f"/api/talent-maps/{talent_map['id']}/people",
        headers=_auth(token),
        json={
            "company_id": company_body["id"],
            "name": "张三",
            "title": "省区负责人",
            "city": "深圳",
            "tags": ["大客户销售", "团队管理"],
            "salary_range": "40-60万",
            "contact_status": "重点关注",
            "evaluation": "高匹配",
            "source": "业务推荐",
            "next_follow_at": "2026-07-01",
            "note": "优先接触",
        },
    )
    assert person.status_code == 201
    person_body = person.get_json()
    assert person_body["company_name"] == "竞品科技"
    assert person_body["tags"] == ["大客户销售", "团队管理"]

    client.post(
        f"/api/talent-maps/{talent_map['id']}/people",
        headers=_auth(token),
        json={
            "company_id": other_company.get_json()["id"],
            "name": "李四",
            "title": "区域经理",
            "city": "广州",
            "contact_status": "未接触",
        },
    )

    updated = client.patch(
        f"/api/talent-maps/{talent_map['id']}",
        headers=_auth(token),
        json={
            "board_json": {
                "columns": ["目标公司", "潜在人选", "重点关注", "已接触"],
                "cards": [{"type": "person", "id": person_body["id"], "column": "重点关注"}],
            }
        },
    )
    assert updated.status_code == 200
    assert updated.get_json()["board_json"]["cards"][0]["column"] == "重点关注"

    filtered = client.get(
        f"/api/talent-maps/{talent_map['id']}?company=竞品科技",
        headers=_auth(token),
    )
    assert filtered.status_code == 200
    filtered_body = filtered.get_json()
    assert filtered_body["people_count"] == 1
    assert [item["name"] for item in filtered_body["people"]] == ["张三"]
    assert filtered_body["people"][0]["company_name"] == "竞品科技"

    updated_company = client.patch(
        f"/api/talent-map-companies/{company_body['id']}",
        headers=_auth(token),
        json={"note": "刷新后仍应保留的公司说明"},
    )
    assert updated_company.status_code == 200

    updated_person = client.patch(
        f"/api/talent-map-people/{person_body['id']}",
        headers=_auth(token),
        json={"title": "高级省区负责人", "contact_status": "已确认"},
    )
    assert updated_person.status_code == 200

    refreshed = client.get(
        f"/api/talent-maps/{talent_map['id']}",
        headers=_auth(token),
    )
    assert refreshed.status_code == 200
    refreshed_body = refreshed.get_json()
    assert refreshed_body["companies"][0]["note"] == "刷新后仍应保留的公司说明"
    assert next(item for item in refreshed_body["people"] if item["id"] == person_body["id"])[
        "title"
    ] == "高级省区负责人"

    listed = client.get("/api/talent-maps", headers=_auth(token))
    assert listed.status_code == 200
    assert listed.get_json()[0]["id"] == talent_map["id"]


def test_talent_map_filters_treat_sql_like_wildcards_as_literal_text(
    client, make_user, app
):
    hr_id, token = make_user(
        "talent-map-like-escape@example.com",
        role="recruiter",
        name="地图HR",
    )
    with app.app_context():
        talent_map = TalentMap(org_id=1, name="通配符地图", owner_hr_id=hr_id)
        db.session.add(talent_map)
        db.session.flush()
        literal_company = TalentMapCompany(
            org_id=1,
            map_id=talent_map.id,
            company_name="增长100%公司",
        )
        ordinary_company = TalentMapCompany(
            org_id=1,
            map_id=talent_map.id,
            company_name="增长100X公司",
        )
        db.session.add_all([literal_company, ordinary_company])
        db.session.flush()
        db.session.add_all([
            TalentMapPerson(
                org_id=1,
                map_id=talent_map.id,
                company_id=literal_company.id,
                owner_hr_id=hr_id,
                name="百分号候选人",
                tags=[],
            ),
            TalentMapPerson(
                org_id=1,
                map_id=talent_map.id,
                company_id=ordinary_company.id,
                owner_hr_id=hr_id,
                name="普通候选人",
                tags=[],
            ),
        ])
        db.session.commit()
        map_id = talent_map.id

    response = client.get(
        f"/api/talent-maps/{map_id}",
        query_string={"company": "%"},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert [item["name"] for item in response.get_json()["people"]] == [
        "百分号候选人"
    ]


def test_talent_maps_are_scoped_to_owner_unless_manager_or_admin(client, make_user, app):
    owner_id, owner_token = make_user("talent-owner@example.com", role="recruiter", name="地图负责人")
    _, other_token = make_user("talent-other@example.com", role="recruiter", name="其他HR")
    _, manager_token = make_user("talent-manager@example.com", role="manager", name="招聘经理")

    with app.app_context():
        job = Job(title="销售总监", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/talent-maps",
        headers=_auth(owner_token),
        json={"name": "销售总监人才地图", "job_id": job_id},
    )
    assert created.status_code == 201
    talent_map_id = created.get_json()["id"]

    forbidden = client.get(f"/api/talent-maps/{talent_map_id}", headers=_auth(other_token))
    assert forbidden.status_code == 403

    forbidden_company = client.post(
        f"/api/talent-maps/{talent_map_id}/companies",
        headers=_auth(other_token),
        json={"company_name": "不可写公司"},
    )
    assert forbidden_company.status_code == 403

    manager_detail = client.get(f"/api/talent-maps/{talent_map_id}", headers=_auth(manager_token))
    assert manager_detail.status_code == 200
    assert manager_detail.get_json()["name"] == "销售总监人才地图"


def test_talent_map_write_rolls_back_when_audit_event_fails(
    client, make_user, app, monkeypatch
):
    _, token = make_user("talent-audit@example.com", role="recruiter")

    def fail_audit(*_args, **_kwargs):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr("app.api.talent_maps.record_event", fail_audit)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        client.post(
            "/api/talent-maps",
            headers=_auth(token),
            json={"name": "不应半提交的人才地图"},
        )

    with app.app_context():
        assert TalentMap.query.count() == 0


def test_ai_import_preview_only_matches_companies_in_the_current_talent_map(
    client, make_user, app
):
    hr_id, token = make_user("talent-import-scope@example.com", role="recruiter")

    with app.app_context():
        other_map = TalentMap(org_id=1, name="其他岗位地图", owner_hr_id=hr_id)
        current_map = TalentMap(org_id=1, name="当前岗位地图", owner_hr_id=hr_id)
        db.session.add_all([other_map, current_map])
        db.session.flush()
        db.session.add(TalentMapCompany(
            org_id=1,
            map_id=other_map.id,
            company_name="跨图竞品科技",
        ))
        candidate = Candidate(
            org_id=1,
            owner_hr_id=hr_id,
            name_masked="跨图候选人",
            resume_json={
                "name": "跨图候选人",
                "experience": [{"company": "跨图竞品科技", "position": "产品总监"}],
            },
        )
        db.session.add(candidate)
        db.session.commit()
        current_map_id = current_map.id
        candidate_id = candidate.id

    preview = client.post(
        f"/api/talent-maps/{current_map_id}/import/preview",
        headers=_auth(token),
        json={"candidate_ids": [candidate_id]},
    )

    assert preview.status_code == 200
    body = preview.get_json()
    assert body["match"] == []
    assert [item["candidate_id"] for item in body["unmatch"]] == [candidate_id]


def test_recruiter_cannot_read_contact_logs_from_another_recruiters_map(
    client, make_user, app
):
    owner_id, owner_token = make_user("talent-contact-owner@example.com", role="recruiter")
    _, other_token = make_user("talent-contact-other@example.com", role="recruiter")

    with app.app_context():
        talent_map = TalentMap(org_id=1, name="联系人地图", owner_hr_id=owner_id)
        db.session.add(talent_map)
        db.session.flush()
        company = TalentMapCompany(org_id=1, map_id=talent_map.id, company_name="隐私公司")
        db.session.add(company)
        db.session.flush()
        person = TalentMapPerson(
            org_id=1,
            map_id=talent_map.id,
            company_id=company.id,
            owner_hr_id=owner_id,
            name="隐私候选人",
            tags=[],
        )
        db.session.add(person)
        db.session.flush()
        db.session.add(TalentMapContactLog(
            org_id=1,
            person_id=person.id,
            content="仅地图负责人可见的联系内容",
            created_by=owner_id,
        ))
        db.session.commit()
        person_id = person.id

    owner_response = client.get(
        f"/api/talent-map-people/{person_id}/contact-logs",
        headers=_auth(owner_token),
    )
    assert owner_response.status_code == 200

    forbidden = client.get(
        f"/api/talent-map-people/{person_id}/contact-logs",
        headers=_auth(other_token),
    )
    assert forbidden.status_code == 403


def test_talent_map_organization_can_keep_empty_roles_and_rename_existing_people(
    client, make_user, app
):
    hr_id, token = make_user("talent-organization@example.com", role="recruiter")

    with app.app_context():
        talent_map = TalentMap(org_id=1, name="组织可编辑地图", owner_hr_id=hr_id, board_json={})
        db.session.add(talent_map)
        db.session.flush()
        company = TalentMapCompany(org_id=1, map_id=talent_map.id, company_name="示例公司")
        db.session.add(company)
        db.session.flush()
        db.session.add(TalentMapPerson(
            org_id=1,
            map_id=talent_map.id,
            company_id=company.id,
            owner_hr_id=hr_id,
            name="张征",
            department="产品",
            title="产品经理",
            tags=[],
        ))
        db.session.commit()
        map_id, company_id = talent_map.id, company.id

    updated = client.patch(
        f"/api/talent-maps/{map_id}/organization",
        headers=_auth(token),
        json={
            "company_id": company_id,
            "departments": [{
                "source_name": "产品",
                "name": "产品研发",
                "roles": [
                    {"source_title": "产品经理", "title": "高级产品经理"},
                    {"title": "产品运营"},
                ],
            }],
        },
    )

    assert updated.status_code == 200
    body = updated.get_json()
    assert body["people"][0]["department"] == "产品研发"
    assert body["people"][0]["title"] == "高级产品经理"
    assert body["board_json"]["organization"][str(company_id)]["departments"] == [{
        "name": "产品研发",
        "roles": ["高级产品经理", "产品运营"],
    }]


def test_talent_map_organization_supports_nested_departments(client, make_user, app):
    """多级部门（children）保存：跨层改名同步人才，旧格式（无 children）保持原样。"""
    hr_id, token = make_user("talent-org-nested@example.com", role="recruiter")

    with app.app_context():
        talent_map = TalentMap(org_id=1, name="多级组织地图", owner_hr_id=hr_id, board_json={})
        db.session.add(talent_map)
        db.session.flush()
        company = TalentMapCompany(org_id=1, map_id=talent_map.id, company_name="示例公司")
        db.session.add(company)
        db.session.flush()
        db.session.add(TalentMapPerson(
            org_id=1,
            map_id=talent_map.id,
            company_id=company.id,
            owner_hr_id=hr_id,
            name="赵六",
            department="采购一组",
            title="采购经理",
            tags=[],
        ))
        db.session.commit()
        map_id, company_id = talent_map.id, company.id

    updated = client.patch(
        f"/api/talent-maps/{map_id}/organization",
        headers=_auth(token),
        json={
            "company_id": company_id,
            "departments": [{
                "source_name": "供应链",
                "name": "供应链中心",
                "roles": [],
                "children": [{
                    "source_name": "采购一组",
                    "name": "采购二组",
                    "roles": [{"source_title": "采购经理", "title": "高级采购经理"}],
                }],
            }],
        },
    )

    assert updated.status_code == 200
    body = updated.get_json()
    assert body["people"][0]["department"] == "采购二组"
    assert body["people"][0]["title"] == "高级采购经理"
    assert body["board_json"]["organization"][str(company_id)]["departments"] == [{
        "name": "供应链中心",
        "roles": [],
        "children": [{"name": "采购二组", "roles": ["高级采购经理"]}],
    }]


def test_talent_map_company_rename_keeps_people_linked(client, make_user, app):
    hr_id, token = make_user("talent-company-rename@example.com", role="recruiter")

    with app.app_context():
        talent_map = TalentMap(org_id=1, name="公司改名地图", owner_hr_id=hr_id, board_json={})
        db.session.add(talent_map)
        db.session.flush()
        company = TalentMapCompany(org_id=1, map_id=talent_map.id, company_name="旧公司名")
        db.session.add(company)
        db.session.flush()
        db.session.add(TalentMapPerson(
            org_id=1,
            map_id=talent_map.id,
            company_id=company.id,
            owner_hr_id=hr_id,
            name="张三",
            tags=[],
        ))
        db.session.commit()
        map_id, company_id = talent_map.id, company.id

    renamed = client.patch(
        f"/api/talent-map-companies/{company_id}",
        headers=_auth(token),
        json={"company_name": "新公司名"},
    )
    assert renamed.status_code == 200
    assert renamed.get_json()["company_name"] == "新公司名"

    detail = client.get(f"/api/talent-maps/{map_id}", headers=_auth(token))
    assert detail.status_code == 200
    body = detail.get_json()
    assert body["companies"][0]["company_name"] == "新公司名"
    assert body["people"][0]["company_id"] == company_id
    assert body["people"][0]["company_name"] == "新公司名"
