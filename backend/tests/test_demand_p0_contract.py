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


def _make_job(app, owner_hr_id=None, title="需求测试岗位"):
    with app.app_context():
        job = Job(
            title=title,
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


def test_create_demand_rejects_non_positive_headcount(client, make_user, app):
    owner_id, token = make_user("invalid-hc-demand@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    for suffix, headcount in [("ZERO", 0), ("NEGATIVE", -1)]:
        response = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(
                job_id,
                owner_id,
                suffix,
                headcount=headcount,
            ),
        )

        assert response.status_code == 400
        assert response.get_json()["fields"]["headcount"] == "HC 必须是大于 0 的整数"


def test_demand_headcount_rejects_boolean_fraction_and_decimal_text(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("strict-integer-hc@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    for suffix, headcount in [
        ("BOOLEAN", True),
        ("FRACTION", 10000.9),
        ("DECIMAL-TEXT", "1.5"),
    ]:
        response = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(job_id, owner_id, suffix, headcount=headcount),
        )

        assert response.status_code == 400
        assert response.get_json()["fields"]["headcount"] == "HC 必须是大于 0 的整数"


def test_demand_headcount_has_a_production_upper_bound(client, make_user, app):
    owner_id, token = make_user("bounded-hc-demand@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    oversized = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(
            job_id,
            owner_id,
            "OVERSIZED",
            headcount=10_001,
        ),
    )

    assert oversized.status_code == 400
    assert oversized.get_json()["fields"]["headcount"] == "单条招聘需求的 HC 不能超过 10000"

    boundary = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(
            job_id,
            owner_id,
            "BOUNDARY",
            headcount=10_000,
        ),
    )

    assert boundary.status_code == 201
    demand_id = boundary.get_json()["id"]

    update = client.patch(
        f"/api/demands/{demand_id}",
        headers=_auth(token),
        json={"headcount": 10_001},
    )

    assert update.status_code == 400
    assert update.get_json()["fields"]["headcount"] == "单条招聘需求的 HC 不能超过 10000"
    unchanged = client.get(f"/api/demands/{demand_id}", headers=_auth(token))
    assert unchanged.status_code == 200
    assert unchanged.get_json()["headcount"] == 10_000

    for invalid_headcount in (True, 9999.9, "2.5"):
        invalid_update = client.patch(
            f"/api/demands/{demand_id}",
            headers=_auth(token),
            json={"headcount": invalid_headcount},
        )
        assert invalid_update.status_code == 400
        assert invalid_update.get_json()["fields"]["headcount"] == "HC 必须是大于 0 的整数"

    still_unchanged = client.get(f"/api/demands/{demand_id}", headers=_auth(token))
    assert still_unchanged.status_code == 200
    assert still_unchanged.get_json()["headcount"] == 10_000


def test_business_requester_cannot_submit_oversized_headcount(client, make_user, app):
    interviewer_id, token = make_user(
        "bounded-hc-interviewer@example.com",
        role="interviewer",
    )

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_title": "仓配运营负责人",
            "jd_text": "负责仓配运营团队和履约质量",
            "owner_hr_id": interviewer_id,
            "request_no": "REQ-P0-INTERVIEWER-OVERSIZED",
            "requester_name": "业务负责人",
            "requester_department": "供应链部",
            "city": "上海",
            "hiring_manager_name": "业务负责人",
            "requested_at": "2026-07-10",
            "target_date": "2026-08-10",
            "headcount": 10_001,
        },
    )

    assert response.status_code == 400
    assert response.get_json()["fields"]["headcount"] == "单条招聘需求的 HC 不能超过 10000"


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


def test_demand_keyword_treats_sql_like_wildcards_as_literal_text(
    client, make_user, app
):
    owner_id, token = make_user("demand-like-escape@example.com", role="recruiter")
    literal_job_id = _make_job(app, owner_id, title="增长100%负责人")
    wildcard_job_id = _make_job(app, owner_id, title="增长100X负责人")

    for suffix, job_id in [
        ("LITERAL-PERCENT", literal_job_id),
        ("WILDCARD-LOOKALIKE", wildcard_job_id),
    ]:
        response = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(job_id, owner_id, suffix),
        )
        assert response.status_code == 201

    response = client.get(
        "/api/demands",
        query_string={"q": "100%"},
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert [item["job_title"] for item in response.get_json()["items"]] == [
        "增长100%负责人"
    ]


def test_demand_list_exact_filters_do_not_expand_like_keyword_search(
    client, make_user, app
):
    owner_id, token = make_user("demand-exact-filter@example.com", role="recruiter")
    exact_job_id = _make_job(app, owner_id, title="数据工程师")
    similar_job_id = _make_job(app, owner_id, title="数据工程师（高级）")
    fallback_job_id = _make_job(app, owner_id, title="产品经理")

    created_ids = {}
    for suffix, job_id in [
        ("EXACT", exact_job_id),
        ("EXACT-PLUS", similar_job_id),
        ("FALLBACK", fallback_job_id),
    ]:
        response = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(job_id, owner_id, suffix),
        )
        assert response.status_code == 201
        created_ids[suffix] = response.get_json()["id"]

    fuzzy_title = client.get(
        "/api/demands",
        query_string={"q": "数据工程师"},
        headers=_auth(token),
    ).get_json()
    assert {item["id"] for item in fuzzy_title["items"]} == {
        created_ids["EXACT"],
        created_ids["EXACT-PLUS"],
    }

    fuzzy_request_no = client.get(
        "/api/demands",
        query_string={"q": "REQ-P0-EXACT"},
        headers=_auth(token),
    ).get_json()
    assert {item["id"] for item in fuzzy_request_no["items"]} == {
        created_ids["EXACT"],
        created_ids["EXACT-PLUS"],
    }

    exact_title = client.get(
        "/api/demands",
        query_string={"job_title": "数据工程师", "page_size": 1},
        headers=_auth(token),
    ).get_json()
    assert exact_title["total"] == exact_title["pages"] == 1
    assert [item["id"] for item in exact_title["items"]] == [created_ids["EXACT"]]

    exact_request_no = client.get(
        "/api/demands",
        query_string={"request_no": "REQ-P0-EXACT", "page_size": 1},
        headers=_auth(token),
    ).get_json()
    assert exact_request_no["total"] == exact_request_no["pages"] == 1
    assert [item["id"] for item in exact_request_no["items"]] == [
        created_ids["EXACT"]
    ]

    with app.app_context():
        fallback = db.session.get(RecruitmentDemand, created_ids["FALLBACK"])
        fallback.job_title_snapshot = ""
        db.session.commit()

    exact_fallback_title = client.get(
        "/api/demands",
        query_string={"job_title": "产品经理", "page_size": 1},
        headers=_auth(token),
    ).get_json()
    assert exact_fallback_title["total"] == exact_fallback_title["pages"] == 1
    assert [item["id"] for item in exact_fallback_title["items"]] == [
        created_ids["FALLBACK"]
    ]


def test_demand_list_filters_by_delivery_date_and_latest_pipeline_facts(
    client, make_user, app
):
    owner_id, token = make_user("demand-column-filter@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)

    created = []
    for suffix, target_date, headcount in [
        ("INTERVIEW", "2026-08-10", 2),
        ("COMPLETE", "2026-09-15", 2),
        ("EMPTY", "2026-10-20", 1),
    ]:
        response = client.post(
            "/api/demands",
            headers=_auth(token),
            json=_valid_payload(
                job_id,
                owner_id,
                suffix,
                target_date=target_date,
                headcount=headcount,
            ),
        )
        assert response.status_code == 201
        created.append(response.get_json()["id"])

    interview_id, complete_id, _ = created
    with app.app_context():
        interview_candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="阶段筛选候选人",
            resume_json={},
        )
        onboarded_candidates = [
            Candidate(
                owner_hr_id=owner_id,
                name_masked=f"已入职候选人{index}",
                resume_json={},
            )
            for index in range(2)
        ]
        db.session.add_all([interview_candidate, *onboarded_candidates])
        db.session.flush()
        db.session.add_all(
            [
                PipelineStage(
                    candidate_id=interview_candidate.id,
                    job_id=job_id,
                    demand_id=interview_id,
                    stage="pending",
                    updated_by=owner_id,
                ),
                PipelineStage(
                    candidate_id=interview_candidate.id,
                    job_id=job_id,
                    demand_id=interview_id,
                    stage="interview_first",
                    updated_by=owner_id,
                ),
                *[
                    PipelineStage(
                        candidate_id=candidate.id,
                        job_id=job_id,
                        demand_id=complete_id,
                        stage="onboarded",
                        updated_by=owner_id,
                    )
                    for candidate in onboarded_candidates
                ],
            ]
        )
        db.session.commit()

    by_date = client.get(
        "/api/demands?target_date=2026-08-10", headers=_auth(token)
    ).get_json()
    assert [item["id"] for item in by_date["items"]] == [interview_id]

    by_stage = client.get(
        "/api/demands?pipeline_stage=interview", headers=_auth(token)
    ).get_json()
    assert [item["id"] for item in by_stage["items"]] == [interview_id]

    old_stage = client.get(
        "/api/demands?pipeline_stage=pending", headers=_auth(token)
    ).get_json()
    assert old_stage["total"] == 0

    any_stage = client.get(
        "/api/demands?pipeline_stage=any&page=1&page_size=1",
        headers=_auth(token),
    ).get_json()
    assert any_stage["total"] == 2
    assert any_stage["pages"] == 2
    assert len(any_stage["items"]) == 1

    complete = client.get(
        "/api/demands?hc_status=complete", headers=_auth(token)
    ).get_json()
    assert [item["id"] for item in complete["items"]] == [complete_id]

    incomplete = client.get(
        "/api/demands?hc_status=incomplete", headers=_auth(token)
    ).get_json()
    assert incomplete["total"] == 2
    assert complete_id not in [item["id"] for item in incomplete["items"]]


def test_pipeline_stage_filter_uses_same_single_demand_legacy_scope_as_metrics(
    client, make_user, app
):
    owner_id, token = make_user("demand-legacy-filter@example.com", role="recruiter")
    job_id = _make_job(app, owner_id)
    first = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(job_id, owner_id, "LEGACY-ONLY"),
    )
    assert first.status_code == 201
    first_id = first.get_json()["id"]

    with app.app_context():
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="旧流程候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(
            PipelineStage(
                candidate_id=candidate.id,
                job_id=job_id,
                demand_id=None,
                stage="interview",
                updated_by=owner_id,
            )
        )
        db.session.commit()

    single = client.get(
        "/api/demands?pipeline_stage=interview", headers=_auth(token)
    ).get_json()
    assert [item["id"] for item in single["items"]] == [first_id]

    sibling = client.post(
        "/api/demands",
        headers=_auth(token),
        json=_valid_payload(job_id, owner_id, "LEGACY-SIBLING"),
    )
    assert sibling.status_code == 201

    ambiguous = client.get(
        "/api/demands?pipeline_stage=interview", headers=_auth(token)
    ).get_json()
    assert ambiguous["total"] == 0


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
