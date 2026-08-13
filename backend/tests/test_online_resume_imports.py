from datetime import datetime
from unittest.mock import Mock

from sqlalchemy import event


def _headers(token, key=None):
    headers = {"Authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _make_demand(app, owner_id, request_no="REQ-ONLINE-001", *, org_id=1):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand

        job = Job(
            org_id=org_id,
            title="Java开发",
            jd_text="Java",
            owner_hr_id=owner_id,
        )
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=org_id,
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

    for privileged_token in (manager_token, admin_token):
        assert client.patch(
            f"/api/online-resumes/{resume_id}",
            headers=_headers(privileged_token),
            json={"display_name": "管理者不应修改"},
        ).status_code == 403
        assert client.delete(
            f"/api/online-resumes/{resume_id}",
            headers=_headers(privileged_token),
        ).status_code == 403

    assert client.patch(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(owner_token),
        json={"display_name": "负责人可修改"},
    ).status_code == 200
    assert client.delete(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(owner_token),
    ).status_code == 200


def test_orphaned_legacy_demand_is_returned_as_unavailable_instead_of_crashing(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-orphan-demand@x.com")
    with app.app_context():
        from app import db
        from app.models import OnlineResume

        row = OnlineResume(
            org_id=1,
            owner_hr_id=owner_id,
            demand_id=999_999,
            external_record_id="legacy-orphan-demand",
            boss_account="legacy-account",
            source_platform="legacy",
            display_name="历史孤儿候选人",
            resume_json={"extracted_info": {"name": "历史孤儿候选人"}},
            chat_json=[],
        )
        db.session.add(row)
        db.session.commit()
        resume_id = row.id

    listing = client.get("/api/online-resumes", headers=_headers(token))
    detail = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
    )

    assert listing.status_code == 200
    assert listing.get_json()["items"][0]["demand"] is None
    assert detail.status_code == 200
    assert detail.get_json()["item"]["demand"] is None


def test_cross_org_legacy_demand_is_not_disclosed_by_online_resume(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-cross-org-owner@x.com", org_id=1)
    foreign_owner_id, _ = make_user("online-cross-org-foreign@x.com", org_id=2)
    foreign_demand_id = _make_demand(
        app,
        foreign_owner_id,
        "REQ-SECRET-ORG-2",
        org_id=2,
    )
    with app.app_context():
        from app import db
        from app.models import OnlineResume

        row = OnlineResume(
            org_id=1,
            owner_hr_id=owner_id,
            demand_id=foreign_demand_id,
            external_record_id="legacy-cross-org-demand",
            boss_account="legacy-account",
            source_platform="legacy",
            display_name="跨组织陈旧关联候选人",
            resume_json={"extracted_info": {"name": "跨组织陈旧关联候选人"}},
            chat_json=[],
        )
        db.session.add(row)
        db.session.commit()
        resume_id = row.id

    listing = client.get("/api/online-resumes", headers=_headers(token))
    detail = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
    )

    assert listing.status_code == 200
    assert listing.get_json()["items"][0]["demand"] is None
    assert detail.status_code == 200
    assert detail.get_json()["item"]["demand"] is None
    assert "REQ-SECRET-ORG-2" not in listing.get_data(as_text=True)
    assert "REQ-SECRET-ORG-2" not in detail.get_data(as_text=True)


def test_cross_org_job_title_is_not_disclosed_through_legacy_demand(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-cross-org-job-owner@x.com", org_id=1)
    with app.app_context():
        from app import db
        from app.models import Job, OnlineResume, RecruitmentDemand

        foreign_job = Job(
            org_id=2,
            title="ORG2-SECRET-JOB-TITLE",
            jd_text="其他组织机密 JD",
            owner_hr_id=owner_id,
        )
        db.session.add(foreign_job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=foreign_job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="",
            request_no="REQ-LOCAL-WITH-FOREIGN-JOB",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        row = OnlineResume(
            org_id=1,
            owner_hr_id=owner_id,
            demand_id=demand.id,
            external_record_id="legacy-cross-org-job",
            boss_account="legacy-account",
            source_platform="legacy",
            display_name="职位错链候选人",
            resume_json={"extracted_info": {"name": "职位错链候选人"}},
            chat_json=[],
        )
        db.session.add(row)
        db.session.commit()
        resume_id = row.id

    listing = client.get("/api/online-resumes", headers=_headers(token))
    detail = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
    )

    assert listing.status_code == 200
    assert listing.get_json()["items"][0]["demand"] is None
    assert detail.status_code == 200
    assert detail.get_json()["item"]["demand"] is None
    assert "ORG2-SECRET-JOB-TITLE" not in listing.get_data(as_text=True)
    assert "ORG2-SECRET-JOB-TITLE" not in detail.get_data(as_text=True)


def test_cross_org_legacy_owner_name_is_not_disclosed_to_manager(
    app,
    client,
    make_user,
):
    local_owner_id, _ = make_user("online-local-owner@x.com", org_id=1)
    foreign_owner_id, _ = make_user(
        "online-foreign-owner@x.com",
        name="其他组织负责人姓名",
        org_id=2,
    )
    _, manager_token = make_user(
        "online-local-manager@x.com",
        role="manager",
        org_id=1,
    )
    demand_id = _make_demand(app, local_owner_id, "REQ-LOCAL-OWNER")
    with app.app_context():
        from app import db
        from app.models import OnlineResume

        row = OnlineResume(
            org_id=1,
            owner_hr_id=foreign_owner_id,
            demand_id=demand_id,
            external_record_id="legacy-cross-org-owner",
            boss_account="legacy-account",
            source_platform="legacy",
            display_name="负责人错链候选人",
            resume_json={"extracted_info": {"name": "负责人错链候选人"}},
            chat_json=[],
        )
        db.session.add(row)
        db.session.commit()

    listing = client.get("/api/online-resumes", headers=_headers(manager_token))

    assert listing.status_code == 200
    assert listing.get_json()["items"][0]["owner_name"] == ""
    assert "其他组织负责人姓名" not in listing.get_data(as_text=True)


def test_online_resume_page_bulk_loads_jobs_without_n_plus_one(
    app,
    make_user,
):
    owner_id, _ = make_user("online-query-count@x.com", org_id=1)
    with app.app_context():
        from app import db
        from app.models import Job, OnlineResume, RecruitmentDemand
        from app.services.online_resume_service import OnlineResumeService

        rows = []
        for index in range(20):
            job = Job(
                org_id=1,
                title=f"批量岗位{index}",
                jd_text="批量查询测试",
                owner_hr_id=owner_id,
            )
            db.session.add(job)
            db.session.flush()
            demand = RecruitmentDemand(
                org_id=1,
                job_id=job.id,
                owner_hr_id=owner_id,
                job_title_snapshot="",
                request_no=f"REQ-BULK-{index}",
                status="active",
            )
            db.session.add(demand)
            db.session.flush()
            row = OnlineResume(
                org_id=1,
                owner_hr_id=owner_id,
                demand_id=demand.id,
                external_record_id=f"bulk-query-{index}",
                boss_account="bulk-account",
                source_platform="bulk-test",
                display_name=f"批量候选人{index}",
                resume_json={"extracted_info": {"name": f"批量候选人{index}"}},
                chat_json=[],
            )
            db.session.add(row)
            rows.append(row)
        db.session.commit()
        db.session.expire_all()
        loaded_rows = OnlineResume.query.order_by(OnlineResume.id).all()
        selects = []

        def record_select(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                selects.append(statement)

        event.listen(db.engine, "before_cursor_execute", record_select)
        try:
            payload = OnlineResumeService()._serialize_page(loaded_rows)
        finally:
            event.remove(db.engine, "before_cursor_execute", record_select)

    assert len(payload) == 20
    assert sum("FROM jobs" in statement for statement in selects) <= 1
    assert len(selects) <= 3


def test_recruiter_owner_filter_cannot_escape_self_scope(
    app,
    client,
    make_user,
):
    owner_id, owner_token = make_user("online-filter-owner@x.com")
    other_id, other_token = make_user("online-filter-other@x.com")
    owner_demand_id = _make_demand(app, owner_id, "REQ-ONLINE-FILTER-OWNER")
    other_demand_id = _make_demand(app, other_id, "REQ-ONLINE-FILTER-OTHER")
    assert _import_one(
        client,
        owner_token,
        _item(owner_demand_id, "owner-visible"),
    ).status_code == 200
    assert _import_one(
        client,
        other_token,
        _item(other_demand_id, "other-hidden"),
    ).status_code == 200

    escaped = client.get(
        f"/api/online-resumes?owner_hr_id={other_id}",
        headers=_headers(owner_token),
    )

    assert escaped.status_code == 200
    assert escaped.get_json()["items"] == []
    assert escaped.get_json()["total"] == 0


def test_manager_can_filter_online_resumes_by_owner(app, client, make_user):
    owner_id, owner_token = make_user("online-manager-filter-owner@x.com")
    other_id, other_token = make_user("online-manager-filter-other@x.com")
    _, manager_token = make_user("online-manager-filter@x.com", role="manager")
    owner_demand_id = _make_demand(app, owner_id, "REQ-ONLINE-MANAGER-OWNER")
    other_demand_id = _make_demand(app, other_id, "REQ-ONLINE-MANAGER-OTHER")
    assert _import_one(
        client,
        owner_token,
        _item(owner_demand_id, "manager-owner-result"),
    ).status_code == 200
    assert _import_one(
        client,
        other_token,
        _item(other_demand_id, "manager-other-result"),
    ).status_code == 200

    response = client.get(
        f"/api/online-resumes?owner_hr_id={other_id}",
        headers=_headers(manager_token),
    )

    assert response.status_code == 200
    assert response.get_json()["total"] == 1
    assert response.get_json()["items"][0]["owner_hr_id"] == other_id


def test_age_filter_excludes_resumes_without_a_parseable_age(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-age-filter@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-AGE")
    with_age = _item(demand_id, "age-known")
    with_age["resume_json"]["extracted_info"]["age"] = "30岁"
    without_age = _item(demand_id, "age-missing")
    assert _import_one(client, token, with_age).status_code == 200
    assert _import_one(client, token, without_age).status_code == 200

    response = client.get(
        "/api/online-resumes?age_to=35",
        headers=_headers(token),
    )

    assert response.status_code == 200
    assert response.get_json()["total"] == 1
    assert response.get_json()["items"][0]["external_record_id"] == "age-known"


def test_created_time_filter_uses_iso_time_boundaries(app, client, make_user):
    owner_id, token = make_user("online-created-filter@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-CREATED")
    assert _import_one(
        client,
        token,
        _item(demand_id, "created-old"),
    ).status_code == 200
    assert _import_one(
        client,
        token,
        _item(demand_id, "created-new"),
    ).status_code == 200

    with app.app_context():
        from app import db
        from app.models import OnlineResume

        OnlineResume.query.filter_by(external_record_id="created-old").one().created_at = (
            datetime(2026, 8, 5, 12, 0, 0)
        )
        OnlineResume.query.filter_by(external_record_id="created-new").one().created_at = (
            datetime(2026, 8, 7, 12, 0, 0)
        )
        db.session.commit()

    response = client.get(
        "/api/online-resumes?created_from=2026-08-07T00:00:00Z"
        "&created_to=2026-08-07T23:59:59Z",
        headers=_headers(token),
    )

    assert response.status_code == 200
    assert response.get_json()["total"] == 1
    assert response.get_json()["items"][0]["external_record_id"] == "created-new"


def test_invalid_online_resume_filter_ranges_return_public_400(
    client,
    make_user,
):
    _, token = make_user("online-invalid-filter@x.com")

    invalid_date = client.get(
        "/api/online-resumes?created_from=not-a-date",
        headers=_headers(token),
    )
    invalid_age_range = client.get(
        "/api/online-resumes?age_from=50&age_to=20",
        headers=_headers(token),
    )

    assert invalid_date.status_code == 400
    assert invalid_date.get_json() == {"error": "导入时间格式无效"}
    assert invalid_age_range.status_code == 400
    assert invalid_age_range.get_json() == {"error": "最小年龄不能大于最大年龄"}


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
        assert row.chat_json == [
            {
                "sender": "recruiter",
                "text": "你好，方便了解机会吗？",
                "sent_at": "2026-08-07T01:00:00Z",
            },
            {
                "sender": "candidate",
                "text": "可以的",
                "sent_at": "2026-08-07T01:02:00Z",
            },
            {
                "sender": "candidate",
                "text": "已发送新的聊天内容",
                "sent_at": "2026-08-07T01:05:00Z",
            },
        ]
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
        assert row.is_manually_edited is True


def test_agent_reimport_preserves_manual_profile_and_merges_chat_history(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-manual-priority@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-MANUAL-PRIORITY")
    first = _item(demand_id, "boss-chat-manual-priority")
    first["chat_json"] = [
        {
            "sender": "candidate",
            "text": "第二条",
            "sent_at": "2026-08-07T09:02:00+08:00",
        },
        {
            "sender": "recruiter",
            "text": "第一条",
            "sent_at": "2026-08-07T01:00:00Z",
        },
    ]
    assert _import_one(client, token, first).get_json()["created"] == 1

    with app.app_context():
        from app.models import OnlineResume

        resume_id = OnlineResume.query.one().id

    manual_resume = {"extracted_info": {"name": "HR人工版", "years": 8}}
    assert client.patch(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
        json={"display_name": "HR人工版", "resume_json": manual_resume},
    ).status_code == 200

    refreshed = _item(demand_id, "boss-chat-manual-priority")
    refreshed["display_name"] = "Agent再次同步"
    refreshed["resume_json"] = {"extracted_info": {"name": "Agent再次同步"}}
    refreshed["chat_json"] = [
        {
            "sender": "candidate",
            "text": "第三条",
            "sent_at": "2026-08-07T09:05:00+08:00",
        },
        {
            "sender": "recruiter",
            "text": "第一条",
            "sent_at": "2026-08-07T09:00:00+08:00",
        },
    ]
    assert _import_one(client, token, refreshed).get_json()["updated"] == 1

    empty_snapshot = _item(demand_id, "boss-chat-manual-priority")
    empty_snapshot["chat_json"] = []
    assert _import_one(client, token, empty_snapshot).get_json()["updated"] == 1

    with app.app_context():
        from app.models import OnlineResume

        row = OnlineResume.query.one()
        assert row.is_manually_edited is True
        assert row.display_name == "HR人工版"
        assert row.resume_json == manual_resume
        assert row.chat_json == [
            {
                "sender": "recruiter",
                "text": "第一条",
                "sent_at": "2026-08-07T01:00:00Z",
            },
            {
                "sender": "candidate",
                "text": "第二条",
                "sent_at": "2026-08-07T01:02:00Z",
            },
            {
                "sender": "candidate",
                "text": "第三条",
                "sent_at": "2026-08-07T01:05:00Z",
            },
        ]


def test_chat_times_must_be_timezone_aware_iso_and_are_sorted(app, client, make_user):
    owner_id, token = make_user("online-chat-time@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-CHAT-TIME")
    valid = _item(demand_id, "boss-chat-time-valid")
    valid["chat_json"] = [
        {
            "sender": "candidate",
            "text": "晚",
            "sent_at": "2026-08-07T10:00:00+08:00",
        },
        {
            "sender": "recruiter",
            "text": "早",
            "sent_at": "2026-08-07T01:00:00Z",
        },
    ]
    invalid = _item(demand_id, "boss-chat-time-invalid")
    invalid["chat_json"] = [
        {"sender": "candidate", "text": "错误时间", "sent_at": "2026-08-07 09:00:00"}
    ]

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={"items": [valid, invalid]},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["created"] == 1
    assert payload["failed"] == 1
    assert payload["results"][1]["error"] == "聊天时间必须是带时区的 ISO 时间"
    with app.app_context():
        from app.models import OnlineResume

        assert [message["text"] for message in OnlineResume.query.one().chat_json] == [
            "早",
            "晚",
        ]


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
        event = Event.query.filter_by(action="online_resume.imported").one()
        assert event.payload == {
            "source_platform": "BOSS直聘",
            "external_record_id": "boss-chat-001",
        }

    reimport = _import_one(client, token, _item(demand_id))
    assert reimport.status_code == 200
    assert reimport.get_json() == {
        "created": 0,
        "updated": 0,
        "skipped_deleted": 1,
        "failed": 0,
        "warnings": 0,
        "results": [
            {
                "external_record_id": "boss-chat-001",
                "status": "skipped_deleted",
            }
        ],
    }, reimport.get_json()

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
    make_user("online-interviewer@x.com", role="interviewer")
    login = client.post(
        "/api/auth/login",
        json={"email": "online-interviewer@x.com", "password": "pw123456"},
    )
    assert login.status_code == 200
    interviewer_token = login.get_json()["token"]
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
    assert response.get_json()["results"][0]["error"] == (
        "需求(1)不可用或无权导入，请选择当前账号可管理的招聘需求"
    )

    with app.app_context():
        from app.models import OnlineResume

        assert OnlineResume.query.count() == 0


def test_online_resume_import_requires_an_explicit_demand(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-explicit-demand@x.com")
    _make_demand(app, owner_id, "REQ-ONLINE-EXPLICIT")
    item = _item(None, "missing-explicit-demand")
    item.pop("demand_id")

    response = _import_one(client, token, item)

    assert response.status_code == 200
    assert response.get_json()["created"] == 0
    assert response.get_json()["failed"] == 1
    assert response.get_json()["results"][0]["error"] == (
        "在线简历导入必须指定明确的招聘需求"
    )
    with app.app_context():
        from app.models import OnlineResume

        assert OnlineResume.query.count() == 0


def test_invalid_demand_never_falls_back_to_another_manageable_demand(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-no-demand-fallback@x.com")
    _make_demand(app, owner_id, "REQ-ONLINE-OWN")
    foreign_owner_id, _ = make_user("online-no-demand-fallback-foreign@x.com")
    foreign_demand_id = _make_demand(
        app,
        foreign_owner_id,
        "REQ-ONLINE-FOREIGN-EXPLICIT",
    )

    response = _import_one(
        client,
        token,
        _item(foreign_demand_id, "foreign-demand-must-fail"),
    )

    assert response.status_code == 200
    assert response.get_json()["created"] == 0
    assert response.get_json()["failed"] == 1
    assert response.get_json()["results"][0]["error"] == (
        f"需求({foreign_demand_id})不可用或无权导入，请选择当前账号可管理的招聘需求"
    )
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


def test_import_rejects_oversized_resume_and_chat_snapshots(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-size@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-SIZE")
    oversized_resume = _item(demand_id, "boss-chat-resume-too-large")
    oversized_resume["resume_json"] = {"content": "x" * (1024 * 1024 + 1)}
    oversized_chat = _item(demand_id, "boss-chat-chat-too-large")
    oversized_chat["chat_json"] = [
        {
            "sender": "candidate",
            "text": "x" * 20000,
            "sent_at": "2026-08-07T09:02:00+08:00",
        }
        for _ in range(210)
    ]

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={"items": [oversized_resume, oversized_chat]},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["created"] == 0, payload
    assert payload["failed"] == 2, payload
    assert [item["error"] for item in payload["results"]] == [
        "结构化简历内容不能超过 1MB",
        "完整聊天记录不能超过 4MB",
    ], payload


def test_import_rejects_chat_count_and_field_length_limits(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-chat-limits@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-CHAT-LIMITS")
    too_many = _item(demand_id, "boss-chat-too-many")
    too_many["chat_json"] = [
        {"sender": "candidate", "text": "ok", "sent_at": "2026-08-07"}
        for _ in range(10001)
    ]
    sender_too_long = _item(demand_id, "boss-chat-sender-too-long")
    sender_too_long["chat_json"][0]["sender"] = "s" * 41
    text_too_long = _item(demand_id, "boss-chat-text-too-long")
    text_too_long["chat_json"][0]["text"] = "x" * 20001
    sent_at_too_long = _item(demand_id, "boss-chat-sent-at-too-long")
    sent_at_too_long["chat_json"][0]["sent_at"] = "2" * 81

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={
            "items": [
                too_many,
                sender_too_long,
                text_too_long,
                sent_at_too_long,
            ]
        },
    )

    assert response.status_code == 200
    assert [item["error"] for item in response.get_json()["results"]] == [
        "完整聊天记录最多 10000 条",
        "聊天发送方长度不能超过 40 个字符",
        "单条聊天内容长度不能超过 20000 个字符",
        "聊天时间长度不能超过 80 个字符",
    ]


def test_import_rejects_invalid_or_oversized_source_url(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-url@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-URL")
    invalid_scheme = _item(demand_id, "boss-chat-bad-url")
    invalid_scheme["source_url"] = "javascript:alert(1)"
    oversized_url = _item(demand_id, "boss-chat-long-url")
    oversized_url["source_url"] = "https://example.com/" + ("x" * 1981)
    missing_host = _item(demand_id, "boss-chat-missing-host")
    missing_host["source_url"] = "https:///chat/123"
    control_character = _item(demand_id, "boss-chat-control-character")
    control_character["source_url"] = "https://example.com/chat\njavascript:alert(1)"
    backslash_confusion = _item(demand_id, "boss-chat-backslash")
    backslash_confusion["source_url"] = "https://trusted.example\\@evil.example/chat"

    response = client.post(
        "/api/agent-imports/online-resumes",
        headers=_headers(token),
        json={
            "items": [
                invalid_scheme,
                oversized_url,
                missing_host,
                control_character,
                backslash_confusion,
            ]
        },
    )

    assert response.status_code == 200
    assert [item["error"] for item in response.get_json()["results"]] == [
        "来源链接必须以 http:// 或 https:// 开头",
        "来源链接长度不能超过 2000 个字符",
        "来源链接格式无效",
        "来源链接格式无效",
        "来源链接格式无效",
    ]


def test_detail_does_not_return_unsafe_legacy_source_url(
    app,
    client,
    make_user,
):
    owner_id, token = make_user("online-legacy-url@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-LEGACY-URL")
    with app.app_context():
        from app import db
        from app.models import OnlineResume

        row = OnlineResume(
            org_id=1,
            owner_hr_id=owner_id,
            demand_id=demand_id,
            external_record_id="legacy-unsafe-url",
            boss_account="legacy-account",
            source_platform="legacy",
            display_name="历史候选人",
            resume_json={"extracted_info": {"name": "历史候选人"}},
            chat_json=[],
            source_url="javascript:alert(1)",
        )
        db.session.add(row)
        db.session.commit()
        resume_id = row.id

    response = client.get(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
    )

    assert response.status_code == 200
    assert response.get_json()["item"]["source_url"] is None


def test_patch_rejects_oversized_resume_json(app, client, make_user):
    owner_id, token = make_user("online-patch-size@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-PATCH-SIZE")
    assert _import_one(client, token, _item(demand_id)).status_code == 200

    with app.app_context():
        from app.models import OnlineResume

        resume_id = OnlineResume.query.one().id

    response = client.patch(
        f"/api/online-resumes/{resume_id}",
        headers=_headers(token),
        json={"resume_json": {"content": "x" * (1024 * 1024)}},
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "结构化简历内容不能超过 1MB"}


def test_unexpected_import_error_is_logged_and_hidden(
    app,
    client,
    make_user,
    monkeypatch,
):
    from app.services.online_resume_service import OnlineResumeService

    owner_id, token = make_user("online-log-error@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-LOG-ERROR")
    logged_exception = Mock()
    monkeypatch.setattr(app.logger, "exception", logged_exception)

    def fail_upsert(*args, **kwargs):
        raise RuntimeError("internal database detail")

    monkeypatch.setattr(OnlineResumeService, "_upsert_item", fail_upsert)
    response = _import_one(client, token, _item(demand_id))

    assert response.status_code == 200
    assert response.get_json()["results"][0]["error"] == "导入失败，请稍后重试"
    logged_exception.assert_called_once_with("在线简历单项导入发生未处理异常")


def test_import_rejects_garbled_target_position(app, client, make_user):
    owner_id, token = make_user("online-quality-target@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-QUALITY-TARGET")
    item = _item(demand_id, "garbled-target")
    item["resume_json"]["extracted_info"]["target_position"] = (
        "上海上海JavaJava行业不行限业不限21-2251K-2"
    )

    response = _import_one(client, token, item)

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["failed"] == 1
    assert "目标岗位" in payload["results"][0]["error"]


def test_import_rejects_invalid_salary_format(app, client, make_user):
    owner_id, token = make_user("online-quality-salary@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-QUALITY-SALARY")
    item = _item(demand_id, "bad-salary")
    item["resume_json"]["extracted_info"]["salary_expectation"] = "30-4350K"

    response = _import_one(client, token, item)

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["failed"] == 1
    assert "期望薪资" in payload["results"][0]["error"]


def test_import_rejects_garbled_location(app, client, make_user):
    owner_id, token = make_user("online-quality-location@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-QUALITY-LOCATION")
    item = _item(demand_id, "garbled-location")
    item["resume_json"]["extracted_info"]["location"] = "上海上海"

    response = _import_one(client, token, item)

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["failed"] == 1
    assert "所在地" in payload["results"][0]["error"]


def test_import_accepts_normal_structured_fields(app, client, make_user):
    owner_id, token = make_user("online-quality-clean@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-QUALITY-CLEAN")
    item = _item(demand_id, "clean-fields")
    item["resume_json"]["extracted_info"].update({
        "target_position": "Java 开发工程师",
        "salary_expectation": "20-30K",
        "location": "上海",
    })

    response = _import_one(client, token, item)

    assert response.status_code == 200
    assert response.get_json()["created"] == 1


def test_import_accepts_boss_salary_unit_before_separator(
    app, client, make_user
):
    owner_id, token = make_user("online-quality-boss-salary@x.com")
    demand_id = _make_demand(app, owner_id, "REQ-ONLINE-QUALITY-BOSS-SALARY")
    item = _item(demand_id, "boss-salary")
    item["resume_json"]["extracted_info"].update({
        "target_position": "Python工程师",
        "salary_expectation": "25K-35K",
        "location": "北京",
    })

    response = _import_one(client, token, item)

    assert response.status_code == 200
    assert response.get_json()["created"] == 1
