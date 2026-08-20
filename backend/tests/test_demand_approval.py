from app import db
from app.models import Event, Job, Notification


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job(app):
    with app.app_context():
        job = Job(
            org_id=1,
            title="产品经理",
            city="上海",
            department="业务部",
            jd_text="负责产品规划和跨部门协作",
            status="active",
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def _create_business_demand(client, app, interviewer_token, hr_id, **overrides):
    payload = {
        "job_id": _seed_job(app),
        "owner_hr_id": hr_id,
        "city": "上海",
        "requester_department": "业务部",
        "hiring_manager_name": "业务负责人",
        "requested_at": "2026-07-24",
        "target_date": "2026-08-31",
        "headcount": 1,
        "status": "active",
    }
    payload.update(overrides)
    response = client.post(
        "/api/demands",
        headers=_auth(interviewer_token),
        json=payload,
    )
    assert response.status_code == 201
    return response.get_json()


def test_interviewer_submits_pending_demand(client, make_user, app):
    interviewer_id, token = make_user(
        "business@example.com", role="interviewer"
    )
    hr_id, _ = make_user("owner@example.com", role="recruiter")

    body = _create_business_demand(client, app, token, hr_id)

    assert body["status"] == "pending"
    assert body["approval_status"] == "pending"
    assert body["default_interviewer_id"] == interviewer_id
    assert body["submitted_at"]
    assert body["created_by"] == interviewer_id


def test_business_demand_submission_notifies_the_selected_recruiter(
    client, make_user, app
):
    _, interviewer_token = make_user(
        "business-notify@example.com", role="interviewer"
    )
    owner_id, owner_token = make_user("owner-notify@example.com", role="recruiter")

    demand = _create_business_demand(client, app, interviewer_token, owner_id)

    with app.app_context():
        notification = Notification.query.filter_by(
            user_id=owner_id,
            demand_id=demand["id"],
            type="demand_approval_requested",
        ).one()
        assert notification.title == "新的招聘需求待审核"
        assert f"demand={demand['id']}" in notification.link

    visible_notifications = client.get(
        "/api/notifications?active_only=true",
        headers=_auth(owner_token),
    )
    assert visible_notifications.status_code == 200
    assert [item["type"] for item in visible_notifications.get_json()["notifications"]] == [
        "demand_approval_requested"
    ]
    visible_unread = client.get(
        "/api/notifications/unread-count?active_only=true",
        headers=_auth(owner_token),
    )
    assert visible_unread.get_json()["unread_count"] == 1


def test_hr_created_active_demand_remains_approved(client, make_user, app):
    hr_id, token = make_user("hr-create@example.com", role="recruiter")
    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": _seed_job(app),
            "owner_hr_id": hr_id,
            "city": "上海",
            "requester_department": "业务部",
            "hiring_manager_name": "业务负责人",
            "requested_at": "2026-07-24",
            "target_date": "2026-08-31",
            "headcount": 1,
            "status": "active",
        },
    )

    assert response.status_code == 201
    assert response.get_json()["status"] == "active"
    assert response.get_json()["approval_status"] == "approved"


def test_manager_can_correct_demand_title_and_jd_snapshot(client, make_user, app):
    owner_id, owner_token = make_user("demand-title-owner@example.com", role="recruiter")
    _, manager_token = make_user("demand-title-manager@example.com", role="manager")
    created = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json={
            "job_id": _seed_job(app),
            "owner_hr_id": owner_id,
            "city": "上海",
            "requester_department": "业务部",
            "hiring_manager_name": "业务负责人",
            "requested_at": "2026-07-24",
            "target_date": "2026-08-31",
            "headcount": 1,
            "status": "active",
        },
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]

    updated = client.patch(
        f"/api/demands/{demand_id}",
        headers=_auth(manager_token),
        json={"job_title": "Java开发", "jd_text": "Java开发"},
    )

    assert updated.status_code == 200
    assert updated.get_json()["job_title"] == "Java开发"
    assert updated.get_json()["jd_text"] == "Java开发"


def test_reject_requires_reason(client, make_user, app):
    _, interviewer_token = make_user(
        "business-reject@example.com", role="interviewer"
    )
    hr_id, token = make_user("reviewer@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)

    response = client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(token),
        json={"reason": ""},
    )

    assert response.status_code == 400
    assert response.get_json()["fields"]["reason"]


def test_owner_hr_approves_pending_demand(client, make_user, app):
    _, interviewer_token = make_user(
        "business-approve@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-approve@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)

    response = client.post(
        f"/api/demands/{demand['id']}/approve",
        headers=_auth(hr_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["approval_status"] == "approved"
    assert body["status"] == "active"
    assert body["reviewed_by"] == hr_id
    assert body["reviewed_at"]
    with app.app_context():
        event = Event.query.filter_by(
            action="demand.approved", entity_id=demand["id"]
        ).one()
        assert event.actor_id == hr_id


def test_creator_resubmits_rejected_demand_and_history_is_audited(
    client, make_user, app
):
    creator_id, interviewer_token = make_user(
        "business-resubmit@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-resubmit@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)

    rejected = client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(hr_token),
        json={"reason": "请补充 HC 依据"},
    )
    assert rejected.status_code == 200
    assert rejected.get_json()["approval_status"] == "rejected"

    resubmitted = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(interviewer_token),
        json={"headcount": 2, "note": "已补充业务量说明"},
    )

    assert resubmitted.status_code == 200
    assert resubmitted.get_json()["approval_status"] == "pending"
    assert resubmitted.get_json()["review_reason"] == ""
    assert resubmitted.get_json()["headcount"] == 2
    assert resubmitted.get_json()["created_by"] == creator_id
    with app.app_context():
        event = Event.query.filter_by(
            action="demand.resubmitted", entity_id=demand["id"]
        ).one()
        assert event.actor_id == creator_id


def test_resubmitted_demand_notifies_the_selected_recruiter_again(
    client, make_user, app
):
    _, interviewer_token = make_user(
        "business-resubmit-notify@example.com", role="interviewer"
    )
    owner_id, owner_token = make_user(
        "owner-resubmit-notify@example.com", role="recruiter"
    )
    demand = _create_business_demand(client, app, interviewer_token, owner_id)
    assert client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(owner_token),
        json={"reason": "请补充业务背景"},
    ).status_code == 200

    resubmitted = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(interviewer_token),
        json={"note": "已补充业务背景"},
    )

    assert resubmitted.status_code == 200
    with app.app_context():
        notifications = Notification.query.filter_by(
            user_id=owner_id,
            demand_id=demand["id"],
            type="demand_approval_requested",
        ).order_by(Notification.id.asc()).all()
        assert len(notifications) == 2
        assert notifications[-1].body.endswith("已重新提交，请审核后开始招聘。")


def test_creator_resubmits_with_demand_jd_snapshot_without_changing_job_template(
    client, make_user, app
):
    _, interviewer_token = make_user(
        "business-resubmit-jd@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-resubmit-jd@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)
    with app.app_context():
        original_job_jd = db.session.get(Job, demand["job_id"]).jd_text

    rejected = client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(hr_token),
        json={"reason": "请把本次招聘的 JD 写具体"},
    )
    assert rejected.status_code == 200

    resubmitted = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(interviewer_token),
        json={"jd_text": "本次招聘重点负责 AI 招聘产品落地"},
    )

    assert resubmitted.status_code == 200
    assert resubmitted.get_json()["jd_text"] == "本次招聘重点负责 AI 招聘产品落地"
    refreshed = client.get(
        f"/api/demands/{demand['id']}", headers=_auth(interviewer_token)
    )
    assert refreshed.status_code == 200
    assert refreshed.get_json()["jd_text"] == "本次招聘重点负责 AI 招聘产品落地"
    with app.app_context():
        job = db.session.get(Job, demand["job_id"])
        assert job.jd_text == original_job_jd
        event = Event.query.filter_by(
            action="demand.resubmitted", entity_id=demand["id"]
        ).one()
        assert "jd_text" in event.payload["changed_fields"]


def test_creator_cannot_resubmit_with_empty_demand_jd(
    client, make_user, app
):
    _, interviewer_token = make_user(
        "business-empty-jd@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-empty-jd@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)
    client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(hr_token),
        json={"reason": "请补充 JD"},
    )

    response = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(interviewer_token),
        json={"jd_text": "   "},
    )

    assert response.status_code == 400
    assert response.get_json()["fields"]["jd_text"] == "完整 JD 不能为空"



def test_only_original_creator_can_resubmit(client, make_user, app):
    _, creator_token = make_user(
        "business-original@example.com", role="interviewer"
    )
    _, other_token = make_user("business-other@example.com", role="interviewer")
    hr_id, hr_token = make_user("hr-owner@example.com", role="recruiter")
    demand = _create_business_demand(client, app, creator_token, hr_id)
    client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(hr_token),
        json={"reason": "需要更多说明"},
    )

    response = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(other_token),
        json={"note": "不应允许"},
    )

    assert response.status_code == 403


def test_approval_state_transition_conflicts_are_409(client, make_user, app):
    _, interviewer_token = make_user(
        "business-conflict@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-conflict@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)
    approved = client.post(
        f"/api/demands/{demand['id']}/approve",
        headers=_auth(hr_token),
    )
    assert approved.status_code == 200

    repeated = client.post(
        f"/api/demands/{demand['id']}/approve",
        headers=_auth(hr_token),
    )

    assert repeated.status_code == 409
    assert repeated.get_json()["code"] == "demand_approval_state_conflict"


def test_interviewer_can_list_own_demands_and_recruiter_options(
    client, make_user, app
):
    _, interviewer_token = make_user(
        "business-options@example.com", role="interviewer"
    )
    hr_id, _ = make_user(
        "hr-options@example.com", role="recruiter", name="可选 HR"
    )
    demand = _create_business_demand(
        client, app, interviewer_token, hr_id, request_no="REQ-BUSINESS-OPTIONS"
    )

    listed = client.get("/api/demands", headers=_auth(interviewer_token))
    owners = client.get(
        "/api/candidates/owner-options", headers=_auth(interviewer_token)
    )

    assert listed.status_code == 200
    assert [item["id"] for item in listed.get_json()["items"]] == [demand["id"]]
    assert owners.status_code == 200
    assert any(item["id"] == hr_id for item in owners.get_json())


def test_recruiter_owner_options_only_return_current_recruiter(client, make_user):
    recruiter_id, recruiter_token = make_user(
        "self-owner-options@example.com", role="recruiter", name="当前招聘专员"
    )
    make_user("other-owner-options@example.com", role="recruiter", name="其他招聘专员")

    response = client.get(
        "/api/candidates/owner-options", headers=_auth(recruiter_token)
    )

    assert response.status_code == 200
    assert response.get_json() == [
        {
            "id": recruiter_id,
            "name": "当前招聘专员",
            "email": "self-owner-options@example.com",
        }
    ]


def test_interviewer_can_submit_custom_job_as_pending_demand(
    client, make_user, app
):
    interviewer_id, token = make_user(
        "business-custom-job@example.com", role="interviewer"
    )
    hr_id, _ = make_user("hr-custom-job@example.com", role="recruiter")

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_title": "海外履约产品经理",
            "jd_text": "负责海外履约产品设计与跨区域协同。",
            "owner_hr_id": hr_id,
            "city": "新加坡",
            "requester_department": "海外业务部",
            "hiring_manager_name": "业务负责人",
            "requested_at": "2026-08-05",
            "target_date": "2026-09-30",
            "headcount": 1,
        },
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["job_title"] == "海外履约产品经理"
    assert body["job_city"] == "新加坡"
    assert body["job_department"] == "海外业务部"
    assert body["approval_status"] == "pending"
    assert body["status"] == "pending"
    assert body["created_by"] == interviewer_id

    with app.app_context():
        job = db.session.get(Job, body["job_id"])
        assert job is not None
        assert job.title == "海外履约产品经理"
        assert job.jd_text == "负责海外履约产品设计与跨区域协同。"
        assert job.owner_hr_id == hr_id
