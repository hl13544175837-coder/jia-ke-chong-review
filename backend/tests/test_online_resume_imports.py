from datetime import datetime


def _headers(token, key=None):
    headers = {"Authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _make_demand(app, owner_id, request_no="REQ-ONLINE-001"):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        job = Job(
            org_id=1,
            title="Java开发",
            jd_text="Java",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="Java开发",
            request_no=request_no,
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        return demand.id


def _item(demand_id, external_id="boss-chat-001"):
    return {
        "external_record_id": external_id,
        "demand_id": demand_id,
        "boss_account": "何龙-BOSS账号",
        "source_platform": "BOSS直聘",
        "display_name": "在线候选人甲",
        "source_url": "https://www.zhipin.com/web/chat/index",
        "resume_json": {
            "extracted_info": {
                "name": "在线候选人甲",
                "target_position": "Java",
            },
            "skills": [{"tag": "Spring Boot", "score": 1}],
        },
        "chat_json": [
            {
                "sender": "recruiter",
                "text": "你好，方便了解机会吗？",
                "sent_at": "2026-08-07T09:00:00+08:00",
            },
            {
                "sender": "candidate",
                "text": "可以的",
                "sent_at": "2026-08-07T09:02:00+08:00",
            },
        ],
    }


def _import_one(client, token, item):
    return client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={"items": [item]},
    )


def test_recruiter_imports_and_reads_only_their_online_resumes(
    app,
    client,
    make_user,
):
    owner_id, owner_token = make_user("online-owner@x.com")
    other_id, other_token = make_user("online-other@x.com")
    demand_id = _make_demand(app, owner_id)

    imported_item = _item(demand_id)
    imported_item["owner_hr_id"] = other_id
    response = _import_one(client, owner_token, imported_item)
    assert response.status_code == 200
    assert response.get_json()["created"] == 1

    owner_list = client.get("/api/online-resumes", headers=_headers(owner_token))
    assert owner_list.status_code == 200
    owner_payload = owner_list.get_json()
    assert owner_payload["total"] == 1
    resume_id = owner_payload["items"][0]["id"]
    assert owner_payload["items"][0]["owner_hr_id"] == owner_id
    assert owner_payload["items"][0]["demand"] == {
        "id": demand_id,
        "request_no": "REQ-ONLINE-001",
        "title": "Java开发",
    }
    assert owner_payload["items"][0]["latest_chat"]["text"] == "可以的"

    owner_detail = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(owner_token),
    )
    assert owner_detail.status_code == 200
    assert len(owner_detail.get_json()["item"]["chat_json"]) == 2

    other_list = client.get("/api/online-resumes", headers=_headers(other_token))
    assert other_list.status_code == 200
    assert other_list.get_json()["items"] == []
    hidden_detail = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(other_token),
    )
    assert hidden_detail.status_code == 404
    assert hidden_detail.get_json() == {"error": "在线简历不存在"}


def test_manager_and_admin_can_read_online_resumes_in_their_org(
    app,
    client,
    make_user,
):
    owner_id, owner_token = make_user("online-managed@x.com")
    _, manager_token = make_user("online-manager@x.com", role="manager")
    _, admin_token = make_user("online-admin@x.com", role="admin")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-MANAGED")
    assert _import_one(client, owner_token, _item(demand_id)).status_code == 200

    manager_list = client.get("/api/online-resumes", headers=_headers(manager_token))
    assert manager_list.status_code == 200
    resume_id = manager_list.get_json()["items"][0]["id"]
    assert manager_list.get_json()["total"] == 1
    assert client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(admin_token),
    ).status_code == 200


def test_reimport_replaces_snapshots_without_duplicate_row_or_import_event(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-retry@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-RETRY")
    first = _item(demand_id)
    assert _import_one(client, token, first).get_json()["created"] == 1

    with app.app_context():
        from app import db
        from app.models import OnlineResume

        row = OnlineResume.query.one()
        row.updated_at = datetime(2020, 1, 1)
        db.session.commit()

    updated_item = _item(demand_id)
    updated_item["display_name"] = "在线候选人甲-已更新"
    updated_item["resume_json"] = {
        "extracted_info": {"name": "在线候选人甲", "years": 6}
    }
    updated_item["chat_json"].append(
        {
            "sender": "candidate",
            "text": "已发送新的聊天内容",
            "sent_at": "2026-08-07T09:05:00+08:00",
        }
    )
    response = _import_one(client, token, updated_item)
    assert response.status_code == 200
    assert response.get_json()["updated"] == 1

    with app.app_context():
        from app.models import Event, OnlineResume

        assert OnlineResume.query.count() == 1
        row = OnlineResume.query.one()
        assert row.owner_hr_id == owner_id
        assert row.display_name == "在线候选人甲-已更新"
        assert row.resume_json == updated_item["resume_json"]
        assert row.chat_json == updated_item["chat_json"]
        assert row.updated_at > datetime(2020, 1, 1)
        assert Event.query.filter_by(action="online_resume.imported").count() == 1


def test_patch_changes_only_editable_profile_fields(app, client, make_user):
    owner_id, token = make_user("online-edit@x.com")
    other_id, _ = make_user("online-edit-other@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-EDIT")
    assert _import_one(client, token, _item(demand_id)).status_code == 200

    with app.app_context():
        from app.models import OnlineResume

        row = OnlineResume.query.one()
        resume_id = row.id
        original_chat = row.chat_json

    replacement_resume = {"extracted_info": {"name": "人工修改后"}}
    response = client.patch(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
        json={
            "display_name": "人工修改后",
            "resume_json": replacement_resume,
            "owner_hr_id": other_id,
            "boss_account": "不允许修改的账号",
            "demand_id": 999999,
            "chat_json": [],
        },
    )
    assert response.status_code == 200

    with app.app_context():
        from app.models import OnlineResume

        row = OnlineResume.query.one()
        assert row.display_name == "人工修改后"
        assert row.resume_json == replacement_resume
        assert row.owner_hr_id == owner_id
        assert row.boss_account == "何龙-BOSS账号"
        assert row.demand_id == demand_id
        assert row.chat_json == original_chat


def test_delete_hard_deletes_content_but_keeps_import_event(app, client, make_user):
    owner_id, token = make_user("online-delete@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-DELETE")
    assert _import_one(client, token, _item(demand_id)).status_code == 200

    with app.app_context():
        from app.models import OnlineResume

        resume_id = OnlineResume.query.one().id

    response = client.delete(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
    )
    assert response.status_code == 200
    assert response.get_json() == {"ok": True}

    with app.app_context():
        from app.models import Event, OnlineResume

        assert OnlineResume.query.count() == 0
        assert Event.query.filter_by(action="online_resume.imported").count() == 1


def test_interviewer_is_forbidden_from_all_online_resume_endpoints(
    app,
    client,
    make_user,
):
    owner_id, owner_token = make_user("online-role-owner@x.com")
    _, interviewer_token = make_user("online-interviewer@x.com", role="interviewer")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-ROLE")
    assert _import_one(client, owner_token, _item(demand_id)).status_code == 200

    with app.app_context():
        from app.models import OnlineResume

        resume_id = OnlineResume.query.one().id

    requests = [
        client.post(
            "/api/agent-imports/online-resumes",
            headers=_headers(interviewer_token),
            json={"items": [_item(demand_id, "forbidden-import")]},
        ),
        client.get("/api/online-resumes", headers=_headers(interviewer_token)),
        client.get(
            f"/api/online-resumes/{resume_id}",
            headers=_headers(interviewer_token),
        ),
        client.patch(
            f"/api/online-resumes/{resume_id}",
            headers=_headers(interviewer_token),
            json={"display_name": "不允许"},
        ),
        client.delete(
            f"/api/online-resumes/{resume_id}",
            headers=_headers(interviewer_token),
        ),
    ]
    assert [response.status_code for response in requests] == [403, 403, 403, 403, 403]


def test_recruiter_cannot_import_into_another_recruiters_demand(
    app,
    client,
    make_user,
):
    owner_id, _ = make_user("online-demand-owner@x.com")
    _, other_token = make_user("online-demand-other@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-FOREIGN")

    response = _import_one(client, other_token, _item(demand_id))
    assert response.status_code == 200
    assert response.get_json()["failed"] == 1
    assert response.get_json()["results"][0]["error"] == "无权导入到该招聘需求"

    with app.app_context():
        from app.models import OnlineResume

        assert OnlineResume.query.count() == 0


def test_batch_commits_valid_items_and_returns_public_error_for_invalid_item(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-batch@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-BATCH")
    invalid = _item(demand_id, "boss-chat-invalid")
    invalid["chat_json"] = [{"sender": "candidate", "text": "缺少时间"}]

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={
            "items": [
                _item(demand_id, "boss-chat-valid"),
                invalid,
            ]
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["created"] == 1
    assert payload["updated"] == 0
    assert payload["failed"] == 1
    assert payload["results"][0]["status"] == "created"
    assert payload["results"][1] == {
        "external_record_id": "boss-chat-invalid",
        "status": "error",
        "error": "聊天记录缺少 sender、text 或 sent_at",
    }

    with app.app_context():
        from app.models import Event, OnlineResume

        assert OnlineResume.query.count() == 1
        assert Event.query.filter_by(action="online_resume.imported").count() == 1
