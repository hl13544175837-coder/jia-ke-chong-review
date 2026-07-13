from datetime import UTC, datetime, timedelta

from app import db
from app.models import Candidate, CandidateDemandFlow, Job, PipelineStage, RecruitmentDemand


def _auth(token, idempotency_key=None):
    headers = {"Authorization": f"Bearer {token}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def _valid_payload(job_id, owner_hr_id, suffix, **overrides):
    payload = {
        "job_id": job_id,
        "owner_hr_id": owner_hr_id,
        "request_no": f"REQ-P0-{suffix}",
        "requester_name": f"发起人{suffix}",
        "requester_department": "科技部",
        "city": "上海",
        "hiring_manager_name": "用人负责人",
        "requested_at": "2026-07-10",
        "target_date": "2026-08-10",
        "headcount": 1,
        "status": "active",
    }
    payload.update(overrides)
    return payload


def _make_job(app, owner_hr_id=None):
    with app.app_context():
        job = Job(
            title="需求测试岗位",
            city="模板城市",
            department="模板部门",
            jd_text="用于测试需求事实归属",
            owner_hr_id=owner_hr_id,
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def test_create_demand_rejects_missing_confirmed_required_fields(
    client, make_user, app
):
    owner_id, token = make_user("required-demand@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={"job_id": job_id},
    )

    assert response.status_code == 400
    body = response.get_json()
    assert body["code"] == "validation_error"
    assert set(body["fields"]) == {
        "city",
        "requester_department",
        "headcount",
        "requested_at",
        "hiring_manager_name",
        "owner_hr_id",
        "target_date",
    }


def test_demand_list_is_paginated_filterable_and_newest_first(
    client, make_user, app
):
    owner_id, token = make_user("demand-list-p0@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    created_ids = []
    for suffix, city, status in [
        ("OLD", "上海", "active"),
        ("MID", "宁波", "paused"),
        ("NEW", "上海", "active"),
    ]:
        created = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(
                job_id,
                owner_id,
                suffix,
                city=city,
                status=status,
                close_reason="业务暂缓" if status == "paused" else "",
                requester_department=f"{suffix}部门",
            ),
        )
        assert created.status_code == 201
        created_ids.append(created.get_json()["id"])

    first_page = client.get(
        "/api/demands?page=1&page_size=2", headers=_auth(token)
    )
    assert first_page.status_code == 200
    body = first_page.get_json()
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] == 3
    assert body["pages"] == 2
    assert [item["id"] for item in body["items"]] == list(
        reversed(created_ids)
    )[:2]

    filtered = client.get(
        "/api/demands?status=active&city=%E4%B8%8A%E6%B5%B7&q=NEW&page=1&page_size=20",
        headers=_auth(token),
    )
    assert filtered.status_code == 200
    assert [item["request_no"] for item in filtered.get_json()["items"]] == [
        "REQ-P0-NEW"
    ]


def test_demand_snapshots_do_not_drift_when_job_template_changes(
    client, make_user, app
):
    owner_id, token = make_user("demand-snapshot@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(
            job_id,
            owner_id,
            "SNAP",
            city="南京",
            requester_department="增长部",
        ),
    )
    assert created.status_code == 201

    with app.app_context():
        job = db.session.get(Job, job_id)
        job.title = "已修改模板标题"
        job.city = "北京"
        job.department = "模板新部门"
        job.jd_text = "模板已经被后续修改"
        db.session.commit()

    detail = client.get(
        f"/api/demands/{created.get_json()['id']}", headers=_auth(token)
    )
    assert detail.status_code == 200
    body = detail.get_json()
    assert body["job_title"] == "需求测试岗位"
    assert body["job_city"] == "南京"
    assert body["job_department"] == "增长部"
    assert body["jd_text"] == "用于测试需求事实归属"


def test_demand_metrics_do_not_mix_sibling_demands_and_prompt_at_hc(
    client, make_user, app
):
    owner_id, token = make_user("demand-metrics-p0@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    first = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(job_id, owner_id, "METRIC-A", headcount=1),
    )
    second = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(job_id, owner_id, "METRIC-B", headcount=2),
    )
    assert first.status_code == second.status_code == 201
    first_id = first.get_json()["id"]
    second_id = second.get_json()["id"]

    with app.app_context():
        first_candidate = Candidate(
            owner_hr_id=owner_id, name_masked="已入职", resume_json={}
        )
        second_candidate = Candidate(
            owner_hr_id=owner_id, name_masked="面试中", resume_json={}
        )
        db.session.add_all([first_candidate, second_candidate])
        db.session.flush()
        db.session.add_all(
            [
                PipelineStage(
                    candidate_id=first_candidate.id,
                    job_id=job_id,
                    demand_id=first_id,
                    stage="onboarded",
                    updated_by=owner_id,
                ),
                PipelineStage(
                    candidate_id=second_candidate.id,
                    job_id=job_id,
                    demand_id=second_id,
                    stage="interview",
                    updated_by=owner_id,
                ),
            ]
        )
        db.session.commit()

    first_detail = client.get(f"/api/demands/{first_id}", headers=_auth(token))
    second_detail = client.get(f"/api/demands/{second_id}", headers=_auth(token))

    assert first_detail.get_json()["metrics"]["recommended_count"] == 1
    assert first_detail.get_json()["metrics"]["onboarded_count"] == 1
    assert first_detail.get_json()["completion_suggested"] is True
    assert first_detail.get_json()["status"] == "active"
    assert second_detail.get_json()["metrics"]["recommended_count"] == 1
    assert second_detail.get_json()["metrics"]["interview_count"] == 1
    assert second_detail.get_json()["metrics"]["onboarded_count"] == 0
    assert second_detail.get_json()["completion_suggested"] is False


def test_pause_cancel_close_and_restore_require_reason_without_changing_job(
    client, make_user, app
):
    owner_id, token = make_user("demand-close-p0@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)
    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(job_id, owner_id, "CLOSE"),
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]

    missing_reason = client.post(
        f"/api/demands/{demand_id}/close",
        headers=_auth(token),
        json={"status": "paused"},
    )
    assert missing_reason.status_code == 400
    assert missing_reason.get_json()["fields"]["close_reason"]

    paused = client.post(
        f"/api/demands/{demand_id}/close",
        headers=_auth(token),
        json={"status": "paused", "close_reason": "业务暂缓"},
    )
    assert paused.status_code == 200

    restore_without_reason = client.post(
        f"/api/demands/{demand_id}/restore",
        headers=_auth(token),
        json={},
    )
    assert restore_without_reason.status_code == 400

    restored = client.post(
        f"/api/demands/{demand_id}/restore",
        headers=_auth(token),
        json={"note": "业务重新启动"},
    )
    assert restored.status_code == 200
    with app.app_context():
        assert db.session.get(Job, job_id).status == "active"


def test_demand_create_replays_same_idempotency_key_without_duplicate(
    client, make_user, app
):
    owner_id, token = make_user("demand-idem-p0@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)
    payload = _valid_payload(job_id, owner_id, "IDEMPOTENT")
    headers = _auth(token, "demand-create:fixed-click")

    first = client.post("/api/demands", headers=headers, json=payload)
    second = client.post("/api/demands", headers=headers, json=payload)

    assert first.status_code == second.status_code == 201
    assert second.headers["X-Idempotent-Replay"] == "true"
    assert first.get_json()["id"] == second.get_json()["id"]
    with app.app_context():
        assert RecruitmentDemand.query.count() == 1


def test_demand_list_filters_by_owner_department_and_created_date(
    client, make_user, app
):
    first_owner_id, _ = make_user("filter-first@example.com", role="recruiter")
    second_owner_id, _ = make_user("filter-second@example.com", role="recruiter")
    _, manager_token = make_user("filter-manager@example.com", role="manager")
    job_id = _make_job(app, first_owner_id)

    created_ids = {}
    for owner_id, suffix, department in [
        (first_owner_id, "FIRST", "科技部"),
        (second_owner_id, "SECOND", "运营部"),
        (second_owner_id, "SECOND-OUTSIDE", "运营部"),
    ]:
        response = client.post(
            "/api/demands",
            headers=_auth(manager_token),
            json=_valid_payload(
                job_id,
                owner_id,
                suffix,
                requester_department=department,
            ),
        )
        assert response.status_code == 201
        created_ids[suffix] = response.get_json()["id"]

    with app.app_context():
        db.session.get(RecruitmentDemand, created_ids["FIRST"]).created_at = datetime(
            2026, 7, 10, 9, 0, 0
        )
        db.session.get(RecruitmentDemand, created_ids["SECOND"]).created_at = datetime(
            2026, 7, 10, 12, 0, 0
        )
        db.session.get(
            RecruitmentDemand,
            created_ids["SECOND-OUTSIDE"],
        ).created_at = datetime(2026, 7, 12, 12, 0, 0)
        db.session.commit()

    response = client.get(
        (
            "/api/demands?owner_hr_id="
            f"{second_owner_id}&department=%E8%BF%90%E8%90%A5%E9%83%A8"
            "&created_from=2026-07-09&created_to=2026-07-11"
        ),
        headers=_auth(manager_token),
    )

    assert response.status_code == 200
    assert [item["request_no"] for item in response.get_json()["items"]] == [
        "REQ-P0-SECOND"
    ]


def test_current_candidate_owner_cannot_be_changed_outside_demand_transfer(
    client, make_user, app
):
    owner_id, _ = make_user("owner-source@example.com", role="recruiter")
    target_id, _ = make_user("owner-target@example.com", role="recruiter")
    _, manager_token = make_user("owner-manager@example.com", role="manager")
    job_id = _make_job(app, owner_id)

    with app.app_context():
        demand = RecruitmentDemand(
            job_id=job_id,
            owner_hr_id=owner_id,
            request_no="REQ-OWNER-SOURCE",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateDemandFlow(
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        ))
        db.session.commit()
        candidate_id = candidate.id
        demand_id = demand.id

    blocked = client.patch(
        f"/api/candidates/{candidate_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": target_id, "reason": "不应绕过需求转派"},
    )

    assert blocked.status_code == 409
    assert blocked.get_json()["code"] == "owner_managed_by_demand"
    assert blocked.get_json()["demand_id"] == demand_id
    with app.app_context():
        assert db.session.get(Candidate, candidate_id).owner_hr_id == owner_id
