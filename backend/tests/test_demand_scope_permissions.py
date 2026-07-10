from app import db
from app.models import Job, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _valid_payload(job_id, owner_hr_id, suffix, **overrides):
    payload = {
        "job_id": job_id,
        "owner_hr_id": owner_hr_id,
        "request_no": f"REQ-SCOPE-{suffix}",
        "requester_name": f"发起人{suffix}",
        "requester_department": f"部门{suffix}",
        "city": "上海",
        "hiring_manager_name": f"用人负责人{suffix}",
        "requested_at": "2026-07-10",
        "target_date": "2026-08-10",
        "headcount": 1,
        "status": "active",
    }
    payload.update(overrides)
    return payload


def test_same_job_supports_independent_demands_owned_by_different_recruiters(
    client, make_user, app
):
    first_owner_id, first_token = make_user(
        "demand-scope-first@example.com", role="recruiter", name="一号专员"
    )
    second_owner_id, second_token = make_user(
        "demand-scope-second@example.com", role="recruiter", name="二号专员"
    )
    _, manager_token = make_user(
        "demand-scope-manager@example.com", role="manager", name="招聘经理"
    )

    with app.app_context():
        job = Job(
            title="测试工程师",
            city="模板城市",
            department="模板部门",
            jd_text="负责测试平台建设",
            owner_hr_id=first_owner_id,
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    first = client.post(
        "/api/demands",
        headers=_auth(manager_token),
        json=_valid_payload(
            job_id,
            first_owner_id,
            "SH",
            city="上海",
            requester_department="科技部",
        ),
    )
    second = client.post(
        "/api/demands",
        headers=_auth(manager_token),
        json=_valid_payload(
            job_id,
            second_owner_id,
            "NB",
            city="宁波",
            requester_department="交付部",
        ),
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.get_json()["id"] != second.get_json()["id"]
    assert first.get_json()["job_id"] == second.get_json()["job_id"] == job_id
    assert first.get_json()["job_city"] == "上海"
    assert second.get_json()["job_city"] == "宁波"
    assert first.get_json()["job_department"] == "科技部"
    assert second.get_json()["job_department"] == "交付部"

    first_list = client.get("/api/demands", headers=_auth(first_token))
    second_list = client.get("/api/demands", headers=_auth(second_token))
    manager_list = client.get("/api/demands", headers=_auth(manager_token))

    assert [item["request_no"] for item in first_list.get_json()["items"]] == [
        "REQ-SCOPE-SH"
    ]
    assert [item["request_no"] for item in second_list.get_json()["items"]] == [
        "REQ-SCOPE-NB"
    ]
    assert manager_list.get_json()["total"] == 2

    sibling_detail = client.get(
        f"/api/demands/{second.get_json()['id']}", headers=_auth(first_token)
    )
    assert sibling_detail.status_code == 403


def test_job_template_owner_does_not_own_sibling_demand_process(
    client, make_user, app
):
    template_owner_id, template_owner_token = make_user(
        "template-owner@example.com", role="recruiter", name="画像维护人"
    )
    demand_owner_id, _ = make_user(
        "explicit-demand-owner@example.com", role="recruiter", name="需求负责人"
    )
    _, manager_token = make_user(
        "template-manager@example.com", role="manager", name="经理"
    )

    with app.app_context():
        job = Job(
            title="运营经理",
            city="杭州",
            department="运营部",
            jd_text="负责运营",
            owner_hr_id=template_owner_id,
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(manager_token),
        json=_valid_payload(job_id, demand_owner_id, "OWNER"),
    )
    assert created.status_code == 201

    hidden_from_template_owner = client.get(
        f"/api/demands/{created.get_json()['id']}",
        headers=_auth(template_owner_token),
    )
    assert hidden_from_template_owner.status_code == 403


def test_recruiter_can_reuse_an_active_same_org_job_template_owned_by_another_recruiter(
    client, make_user, app
):
    template_owner_id, _ = make_user(
        "reusable-template-owner@example.com", role="recruiter"
    )
    demand_owner_id, demand_owner_token = make_user(
        "reusable-demand-owner@example.com", role="recruiter"
    )

    with app.app_context():
        job = Job(
            title="仓配主管",
            city="苏州",
            department="供应链",
            jd_text="负责仓配运营",
            owner_hr_id=template_owner_id,
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(demand_owner_token),
        json=_valid_payload(job_id, demand_owner_id, "REUSE"),
    )

    assert created.status_code == 201
    assert created.get_json()["owner_hr_id"] == demand_owner_id
    with app.app_context():
        assert db.session.get(Job, job_id).owner_hr_id == template_owner_id


def test_cross_org_demand_owner_is_rejected_without_leaking_user(
    client, make_user, app
):
    _, manager_token = make_user(
        "scope-org1-manager@example.com", role="manager", org_id=1
    )
    foreign_owner_id, _ = make_user(
        "scope-org2-owner@example.com", role="recruiter", org_id=2
    )

    with app.app_context():
        job = Job(
            org_id=1,
            title="组织一岗位",
            city="上海",
            department="技术部",
            jd_text="组织隔离",
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    response = client.post(
        "/api/demands",
        headers=_auth(manager_token),
        json=_valid_payload(job_id, foreign_owner_id, "CROSS"),
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "validation_error"
    assert response.get_json()["fields"]["owner_hr_id"] == "请选择当前组织内启用的招聘专员"
    with app.app_context():
        assert RecruitmentDemand.query.count() == 0
