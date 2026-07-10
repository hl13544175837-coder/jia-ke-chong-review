from datetime import UTC, datetime, timedelta

from app import db
from app.models import Candidate, Event, Job, PipelineStage, RecruitmentDemand
from sqlalchemy.dialects import mysql


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_demand_creation_can_create_matching_job_profile(client, make_user, app):
    hr_id, token = make_user("demand-direct@example.com", role="recruiter", name="直建HR")

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_title": "Java 后端工程师",
            "jd_text": "负责核心业务系统开发，熟悉 Java、Spring Boot、MySQL，有高并发经验。",
            "request_no": "REQ-DIRECT-001",
            "requester_name": "杨阳",
            "requester_department": "科技部",
            "hiring_manager_name": "邹鹏辉",
            "requested_at": "2026-06-23",
            "accepted_at": "2026-06-23",
            "target_date": "2026-07-31",
            "priority": "A",
            "headcount": 2,
            "status": "active",
            "note": "OA 未来会推送同类字段，当前由 HR 手工创建。",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["job_id"] > 0
    assert body["job_title"] == "Java 后端工程师"
    assert body["job_department"] == "科技部"
    assert body["request_no"] == "REQ-DIRECT-001"
    assert body["owner_hr_id"] == hr_id

    with app.app_context():
      job = db.session.get(Job, body["job_id"])
      assert job is not None
      assert job.title == "Java 后端工程师"
      assert job.department == "科技部"
      assert job.owner_hr_id == hr_id
      assert job.status == "active"


def test_demands_can_be_created_listed_and_closed_with_metrics(client, make_user, app):
    hr_id, token = make_user("demand-hr@example.com", role="recruiter", name="需求HR")

    with app.app_context():
        job = Job(title="产品经理", city="上海", department="科技部", jd_text="负责产品规划")
        db.session.add(job)
        db.session.flush()
        candidates = [
            Candidate(owner_hr_id=hr_id, name_masked=f"候选人{i}", resume_json={})
            for i in range(1, 4)
        ]
        db.session.add_all(candidates)
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidates[0].id, job_id=job.id, stage="business_review", updated_by=hr_id),
            PipelineStage(candidate_id=candidates[1].id, job_id=job.id, stage="interview_first", updated_by=hr_id),
            PipelineStage(candidate_id=candidates[2].id, job_id=job.id, stage="offer", updated_by=hr_id),
        ])
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "request_no": "REQ-2026-001",
            "requester_name": "宋总",
            "requester_department": "科技部",
            "hiring_manager_name": "业务负责人A",
            "requested_at": "2026-06-01",
            "accepted_at": "2026-06-02",
            "target_date": "2026-07-01",
            "priority": "A",
            "headcount": 3,
            "status": "active",
            "note": "核心需求",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["job_id"] == job_id
    assert body["priority"] == "A"
    assert body["metrics"]["recommended_count"] == 3
    assert body["metrics"]["business_review_count"] == 1
    assert body["metrics"]["interview_count"] == 2
    assert body["metrics"]["offer_count"] == 1

    listed = client.get("/api/demands", headers=_auth(token))
    assert listed.status_code == 200
    item = listed.get_json()[0]
    assert item["request_no"] == "REQ-2026-001"
    assert item["job_title"] == "产品经理"
    assert item["metrics"]["recommended_count"] == 3

    closed = client.post(
        f"/api/demands/{body['id']}/close",
        headers=_auth(token),
        json={"status": "cancelled", "close_reason": "业务确认暂不招聘"},
    )
    assert closed.status_code == 200
    assert closed.get_json()["status"] == "cancelled"
    assert closed.get_json()["close_reason"] == "业务确认暂不招聘"

    with app.app_context():
        job = db.session.get(Job, job_id)
        assert job.status == "closed"


def test_closed_demands_can_be_restored_with_linked_job(client, make_user, app):
    _, token = make_user("demand-restore@example.com", role="recruiter", name="恢复HR")

    with app.app_context():
        job = Job(title="运营负责人", city="广州", department="运营部", jd_text="负责运营团队")
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "requester_department": "运营部",
            "priority": "B",
            "headcount": 1,
            "status": "active",
        },
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]

    closed = client.post(
        f"/api/demands/{demand_id}/close",
        headers=_auth(token),
        json={"status": "cancelled", "close_reason": "业务误点关闭"},
    )
    assert closed.status_code == 200
    assert closed.get_json()["status"] == "cancelled"

    restored = client.post(
        f"/api/demands/{demand_id}/restore",
        headers=_auth(token),
        json={"note": "业务确认继续招聘"},
    )
    assert restored.status_code == 200
    body = restored.get_json()
    assert body["status"] == "active"
    assert body["close_reason"] == ""
    assert "业务确认继续招聘" in body["note"]

    with app.app_context():
        job = db.session.get(Job, job_id)
        assert job.status == "active"


def test_demands_can_be_downgraded_and_expose_risk_flags(client, make_user, app):
    hr_id, token = make_user("demand-risk@example.com", role="recruiter", name="风险HR")

    with app.app_context():
        job = Job(title="Java 工程师", city="深圳", department="研发部", jd_text="负责 Java 开发")
        db.session.add(job)
        db.session.flush()
        for index in range(25):
            candidate = Candidate(owner_hr_id=hr_id, name_masked=f"候选人{index}", resume_json={})
            db.session.add(candidate)
            db.session.flush()
            db.session.add(PipelineStage(
                candidate_id=candidate.id,
                job_id=job.id,
                stage="business_review",
                updated_by=hr_id,
            ))
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "requester_department": "研发部",
            "requested_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=45)).date().isoformat(),
            "accepted_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=44)).date().isoformat(),
            "target_date": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=5)).date().isoformat(),
            "priority": "A",
            "headcount": 2,
            "status": "active",
        },
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]

    detail = client.get(f"/api/demands/{demand_id}", headers=_auth(token))
    assert detail.status_code == 200
    body = detail.get_json()
    assert "overdue" in body["risk_flags"]
    assert "business_feedback_pending" in body["risk_flags"]

    downgraded = client.post(
        f"/api/demands/{demand_id}/downgrade",
        headers=_auth(token),
        json={"priority": "C", "downgrade_reason": "推送多轮仍未反馈，先降级处理"},
    )
    assert downgraded.status_code == 200
    assert downgraded.get_json()["priority"] == "C"
    assert downgraded.get_json()["downgrade_reason"] == "推送多轮仍未反馈，先降级处理"


def test_demands_flag_hr_side_when_accepted_but_no_candidates(client, make_user, app):
    hr_id, token = make_user("demand-hr-stall@example.com", role="recruiter", name="停滞HR")

    with app.app_context():
        job = Job(title="AI 产品经理", city="杭州", department="产品部", jd_text="负责 AI 产品")
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "requester_department": "产品部",
            "requested_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=10)).date().isoformat(),
            "accepted_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=8)).date().isoformat(),
            "priority": "A",
            "headcount": 1,
            "status": "active",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["metrics"]["recommended_count"] == 0
    assert "hr_no_recommendation" in body["risk_flags"]


def test_recruiter_demands_are_scoped_to_owned_jobs(client, make_user, app):
    owner_id, owner_token = make_user("demand-owner@example.com", role="recruiter", name="负责人")
    other_id, other_token = make_user("demand-other@example.com", role="recruiter", name="其他HR")

    with app.app_context():
        from app.models import RecruitmentDemand

        owner_job = Job(title="自有岗位", jd_text="x", owner_hr_id=owner_id)
        other_job = Job(title="他人岗位", jd_text="x", owner_hr_id=other_id)
        db.session.add_all([owner_job, other_job])
        db.session.flush()
        owner_demand = RecruitmentDemand(job_id=owner_job.id, owner_hr_id=owner_id, request_no="OWN")
        other_demand = RecruitmentDemand(job_id=other_job.id, owner_hr_id=other_id, request_no="OTHER")
        db.session.add_all([owner_demand, other_demand])
        db.session.commit()
        owner_demand_id = owner_demand.id
        other_demand_id = other_demand.id
        other_job_id = other_job.id

    listed = client.get("/api/demands", headers=_auth(owner_token))
    assert listed.status_code == 200
    assert [item["request_no"] for item in listed.get_json()] == ["OWN"]

    forbidden_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(owner_token))
    assert forbidden_detail.status_code == 403

    forbidden_create = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json={"job_id": other_job_id, "request_no": "BAD"},
    )
    assert forbidden_create.status_code == 403

    other_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(other_token))
    assert other_detail.status_code == 200


def test_demand_create_rejects_second_open_demand_for_same_job(client, make_user, app):
    owner_id, token = make_user("demand-single-open@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="唯一活动需求岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        existing = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            status="paused",
            request_no="OPEN-1",
        )
        db.session.add(existing)
        db.session.commit()
        job_id = job.id

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={"job_id": job_id, "status": "active", "request_no": "OPEN-2"},
    )

    assert response.status_code == 409
    assert "未结束需求" in response.get_json()["error"]
    with app.app_context():
        assert RecruitmentDemand.query.filter_by(job_id=job_id).count() == 1


def test_open_demand_conflict_query_is_a_mysql_locking_read(app):
    with app.app_context():
        from app.api.demands import _open_demand_statement

        statement = _open_demand_statement(org_id=1, job_id=9, exclude_demand_id=4)
        sql = str(statement.compile(dialect=mysql.dialect()))

    assert "FOR UPDATE" in sql.upper()
    assert "recruitment_demands.job_id" in sql
    assert "recruitment_demands.status IN" in sql


def test_terminal_demand_does_not_block_new_open_demand(client, make_user, app):
    owner_id, token = make_user("demand-terminal-reuse@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="可复用岗位", jd_text="x", owner_hr_id=owner_id, status="active")
        db.session.add(job)
        db.session.flush()
        db.session.add(RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            status="cancelled",
            request_no="CLOSED-1",
        ))
        db.session.commit()
        job_id = job.id

    response = client.post(
        "/api/demands",
        headers=_auth(token),
        json={"job_id": job_id, "status": "active", "request_no": "OPEN-NEW"},
    )

    assert response.status_code == 201
    with app.app_context():
        assert RecruitmentDemand.query.filter_by(job_id=job_id).count() == 2


def test_create_demand_rejects_terminal_or_unknown_initial_status(client, make_user, app):
    owner_id, token = make_user("demand-create-status@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="初始状态约束岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.commit()
        job_id = job.id

    responses = [
        client.post(
            "/api/demands",
            headers=_auth(token),
            json={"job_id": job_id, "status": status},
        )
        for status in ("filled", "cancelled", "unexpected")
    ]

    assert [response.status_code for response in responses] == [400, 400, 400]
    with app.app_context():
        assert RecruitmentDemand.query.filter_by(job_id=job_id).count() == 0


def test_restore_rejects_legacy_open_demand_conflict_without_mutation(client, make_user, app):
    owner_id, token = make_user("demand-restore-conflict@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="历史冲突岗位", jd_text="x", owner_hr_id=owner_id, status="active")
        db.session.add(job)
        db.session.flush()
        closed = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            status="cancelled",
            close_reason="历史关闭",
        )
        open_demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            status="active",
        )
        db.session.add_all([closed, open_demand])
        db.session.commit()
        closed_id = closed.id

    response = client.post(
        f"/api/demands/{closed_id}/restore",
        headers=_auth(token),
        json={"note": "业务继续招聘"},
    )

    assert response.status_code == 409
    with app.app_context():
        closed = db.session.get(RecruitmentDemand, closed_id)
        assert closed.status == "cancelled"
        assert closed.close_reason == "历史关闭"


def test_demand_command_endpoints_require_non_empty_reasons(client, make_user, app):
    owner_id, token = make_user("demand-reasons@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="原因约束岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(job_id=job.id, owner_hr_id=owner_id, status="active", priority="A")
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    close = client.post(
        f"/api/demands/{demand_id}/close",
        headers=_auth(token),
        json={"status": "cancelled", "close_reason": "   "},
    )
    downgrade = client.post(
        f"/api/demands/{demand_id}/downgrade",
        headers=_auth(token),
        json={"priority": "C", "downgrade_reason": ""},
    )
    with app.app_context():
        demand = db.session.get(RecruitmentDemand, demand_id)
        demand.status = "cancelled"
        demand.close_reason = "先关闭"
        db.session.commit()
    restore = client.post(
        f"/api/demands/{demand_id}/restore",
        headers=_auth(token),
        json={"note": "\t"},
    )

    assert close.status_code == 400
    assert downgrade.status_code == 400
    assert restore.status_code == 400
    with app.app_context():
        demand = db.session.get(RecruitmentDemand, demand_id)
        assert demand.status == "cancelled"
        assert demand.priority == "A"
        assert demand.close_reason == "先关闭"


def test_close_demand_rejects_unknown_status_instead_of_silently_cancelling(
    client,
    make_user,
    app,
):
    owner_id, token = make_user("demand-close-status@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="关闭状态校验岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(job_id=job.id, owner_hr_id=owner_id, status="active")
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    response = client.post(
        f"/api/demands/{demand_id}/close",
        headers=_auth(token),
        json={"status": "unexpected", "close_reason": "不应被静默取消"},
    )

    assert response.status_code == 400
    with app.app_context():
        assert db.session.get(RecruitmentDemand, demand_id).status == "active"


def test_generic_demand_patch_cannot_bypass_command_fields(client, make_user, app):
    owner_id, token = make_user("demand-patch-guard@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="通用编辑保护岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            status="active",
            priority="A",
            close_reason="",
            downgrade_reason="",
        )
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    response = client.patch(
        f"/api/demands/{demand_id}",
        headers=_auth(token),
        json={
            "note": "普通备注也不应在非法请求中被部分保存",
            "status": "cancelled",
            "owner_hr_id": owner_id + 100,
            "priority": "C",
            "close_reason": "绕过关闭",
            "downgrade_reason": "绕过降级",
        },
    )

    assert response.status_code == 400
    with app.app_context():
        demand = db.session.get(RecruitmentDemand, demand_id)
        assert demand.status == "active"
        assert demand.owner_hr_id == owner_id
        assert demand.priority == "A"
        assert demand.close_reason in (None, "")
        assert demand.downgrade_reason in (None, "")
        assert demand.note in (None, "")


def test_manager_can_transfer_demand_and_job_to_active_same_org_recruiter_with_audit(
    client,
    make_user,
    app,
):
    manager_id, manager_token = make_user("demand-transfer-manager@example.com", role="manager", org_id=1)
    old_owner_id, _ = make_user("demand-transfer-old@example.com", role="recruiter", org_id=1)
    new_owner_id, _ = make_user(
        "demand-transfer-new@example.com",
        role="recruiter",
        name="新负责人",
        org_id=1,
    )
    with app.app_context():
        job = Job(org_id=1, title="转派岗位", jd_text="x", owner_hr_id=old_owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(org_id=1, job_id=job.id, owner_hr_id=old_owner_id, status="active")
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id
        job_id = job.id

    response = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": new_owner_id, "reason": "团队负载重新分配"},
    )

    assert response.status_code == 200
    assert response.get_json()["owner_hr_id"] == new_owner_id
    assert response.get_json()["owner_hr_name"] == "新负责人"
    with app.app_context():
        assert db.session.get(RecruitmentDemand, demand_id).owner_hr_id == new_owner_id
        assert db.session.get(Job, job_id).owner_hr_id == new_owner_id
        event = Event.query.filter_by(action="demand.owner_reassigned", actor_id=manager_id).one()
        assert event.entity_id == demand_id
        assert event.payload == {
            "from": old_owner_id,
            "to": new_owner_id,
            "job_id": job_id,
            "reason": "团队负载重新分配",
        }


def test_demand_owner_transfer_rejects_invalid_target_and_recruiter_actor(client, make_user, app):
    _, manager_token = make_user("demand-transfer-guard-manager@example.com", role="manager", org_id=1)
    old_owner_id, recruiter_token = make_user("demand-transfer-guard-old@example.com", role="recruiter", org_id=1)
    inactive_id, _ = make_user("demand-transfer-inactive@example.com", role="recruiter", org_id=1)
    interviewer_id, _ = make_user("demand-transfer-interviewer@example.com", role="interviewer", org_id=1)
    other_org_id, _ = make_user("demand-transfer-other-org@example.com", role="recruiter", org_id=2)
    with app.app_context():
        from app.models import User

        db.session.get(User, inactive_id).is_active = False
        job = Job(org_id=1, title="转派防线岗位", jd_text="x", owner_hr_id=old_owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(org_id=1, job_id=job.id, owner_hr_id=old_owner_id, status="active")
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    missing_reason = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": old_owner_id, "reason": " "},
    )
    invalid_responses = [
        client.patch(
            f"/api/demands/{demand_id}/owner",
            headers=_auth(manager_token),
            json={"owner_hr_id": target_id, "reason": "测试非法目标"},
        )
        for target_id in (inactive_id, interviewer_id, other_org_id)
    ]
    recruiter_attempt = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(recruiter_token),
        json={"owner_hr_id": old_owner_id, "reason": "越权转派"},
    )

    assert missing_reason.status_code == 400
    assert [response.status_code for response in invalid_responses] == [400, 400, 404]
    assert recruiter_attempt.status_code == 403
    with app.app_context():
        assert db.session.get(RecruitmentDemand, demand_id).owner_hr_id == old_owner_id
