from datetime import UTC, datetime, timedelta

import pytest

from app import db
from app.models import Candidate, CandidateDemandFlow, Event, Job, PipelineStage, RecruitmentDemand


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
            "owner_hr_id": hr_id,
            "city": "上海",
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


def test_demand_creation_rolls_back_job_and_demand_when_second_audit_fails(
    client, make_user, app, monkeypatch
):
    hr_id, token = make_user("demand-audit-create@example.com", role="recruiter")
    from app.api import demands as demands_api

    real_record_event = demands_api.record_event

    def fail_second_event(action, *args, **kwargs):
        if action == "demand.created":
            raise RuntimeError("audit write failed")
        return real_record_event(action, *args, **kwargs)

    monkeypatch.setattr(demands_api, "record_event", fail_second_event)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.post(
            "/api/demands",
            headers=_auth(token),
            json={
                "job_title": "审计原子性岗位",
                "jd_text": "用于验证需求与审计同事务",
                "owner_hr_id": hr_id,
                "city": "上海",
                "requester_department": "技术部",
                "hiring_manager_name": "技术负责人",
                "requested_at": "2026-07-11",
                "target_date": "2026-08-11",
                "headcount": 1,
            },
        )

    with app.app_context():
        db.session.remove()
        assert Job.query.filter_by(title="审计原子性岗位").count() == 0
        assert RecruitmentDemand.query.count() == 0
        assert Event.query.filter(Event.action.in_(["job.created", "demand.created"])).count() == 0


@pytest.mark.parametrize(
    ("method", "suffix", "payload", "initial", "attribute", "expected"),
    [
        ("patch", "", {"note": "不应保存"}, {}, "note", "原备注"),
        (
            "post",
            "/close",
            {"status": "paused", "close_reason": "不应保存"},
            {},
            "status",
            "active",
        ),
        (
            "post",
            "/restore",
            {"note": "不应保存"},
            {"status": "paused", "close_reason": "原暂停原因"},
            "status",
            "paused",
        ),
        (
            "post",
            "/downgrade",
            {"priority": "C", "downgrade_reason": "不应保存"},
            {},
            "priority",
            "B",
        ),
    ],
)
def test_demand_lifecycle_changes_roll_back_when_audit_fails(
    client,
    make_user,
    app,
    monkeypatch,
    method,
    suffix,
    payload,
    initial,
    attribute,
    expected,
):
    owner_id, token = make_user(f"demand-audit-{suffix or 'update'}@example.com", role="recruiter")
    with app.app_context():
        job = Job(title="事务需求岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no=f"REQ-AUDIT-{suffix or 'UPDATE'}",
            status=initial.get("status", "active"),
            close_reason=initial.get("close_reason", ""),
            priority="B",
            note="原备注",
        )
        db.session.add(demand)
        db.session.commit()
        demand_id = demand.id

    from app.api import demands as demands_api

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(demands_api, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        getattr(client, method)(
            f"/api/demands/{demand_id}{suffix}",
            headers=_auth(token),
            json=payload,
        )

    with app.app_context():
        db.session.remove()
        demand = db.session.get(RecruitmentDemand, demand_id)
        assert getattr(demand, attribute) == expected
        assert Event.query.filter_by(demand_id=demand_id).count() == 0


def _seed_demand_owner_projection(app, owner_id, *, pointer_matches=True):
    with app.app_context():
        job = Job(title="负责人事务岗位", jd_text="x", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no=f"REQ-OWNER-{pointer_matches}",
            status="active",
        )
        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="负责人事务候选人",
            resume_json={},
        )
        db.session.add_all([demand, candidate])
        db.session.flush()
        candidate.current_demand_id = demand.id if pointer_matches else None
        flow = CandidateDemandFlow(
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        )
        db.session.add(flow)
        db.session.commit()
        return demand.id, candidate.id, flow.id


def test_demand_owner_reassignment_rolls_back_all_projections_when_audit_fails(
    client, make_user, app, monkeypatch
):
    _, manager_token = make_user("owner-audit-manager@example.com", role="manager")
    old_owner_id, _ = make_user("owner-audit-old@example.com", role="recruiter")
    new_owner_id, _ = make_user("owner-audit-new@example.com", role="recruiter")
    demand_id, candidate_id, flow_id = _seed_demand_owner_projection(app, old_owner_id)

    from app.api import demands as demands_api

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit write failed")

    monkeypatch.setattr(demands_api, "record_event", fail_audit)
    with pytest.raises(RuntimeError, match="audit write failed"):
        client.patch(
            f"/api/demands/{demand_id}/owner",
            headers=_auth(manager_token),
            json={"owner_hr_id": new_owner_id, "reason": "事务失败验证"},
        )

    with app.app_context():
        db.session.remove()
        assert db.session.get(RecruitmentDemand, demand_id).owner_hr_id == old_owner_id
        assert db.session.get(CandidateDemandFlow, flow_id).owner_hr_id == old_owner_id
        assert db.session.get(Candidate, candidate_id).owner_hr_id == old_owner_id
        assert Event.query.filter_by(action="demand.owner_reassigned").count() == 0


def test_demand_owner_reassignment_fails_closed_on_candidate_pointer_drift(
    client, make_user, app
):
    _, manager_token = make_user("owner-drift-manager2@example.com", role="manager")
    old_owner_id, _ = make_user("owner-drift-old2@example.com", role="recruiter")
    new_owner_id, _ = make_user("owner-drift-new2@example.com", role="recruiter")
    demand_id, candidate_id, flow_id = _seed_demand_owner_projection(
        app, old_owner_id, pointer_matches=False
    )

    response = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": new_owner_id, "reason": "不应绕过漂移"},
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_owner_projection_conflict"
    with app.app_context():
        db.session.remove()
        assert db.session.get(RecruitmentDemand, demand_id).owner_hr_id == old_owner_id
        assert db.session.get(CandidateDemandFlow, flow_id).owner_hr_id == old_owner_id
        assert db.session.get(Candidate, candidate_id).owner_hr_id == old_owner_id


def test_demand_owner_reassignment_fails_closed_when_pointer_has_no_active_flow(
    client, make_user, app
):
    _, manager_token = make_user("owner-missing-flow-manager@example.com", role="manager")
    old_owner_id, _ = make_user("owner-missing-flow-old@example.com", role="recruiter")
    new_owner_id, _ = make_user("owner-missing-flow-new@example.com", role="recruiter")
    demand_id, candidate_id, flow_id = _seed_demand_owner_projection(app, old_owner_id)
    with app.app_context():
        db.session.delete(db.session.get(CandidateDemandFlow, flow_id))
        db.session.commit()

    response = client.patch(
        f"/api/demands/{demand_id}/owner",
        headers=_auth(manager_token),
        json={"owner_hr_id": new_owner_id, "reason": "不应跳过无 Flow 指针"},
    )

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_owner_projection_conflict"
    with app.app_context():
        db.session.remove()
        assert db.session.get(RecruitmentDemand, demand_id).owner_hr_id == old_owner_id
        assert db.session.get(Candidate, candidate_id).owner_hr_id == old_owner_id


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
            "owner_hr_id": hr_id,
            "city": "上海",
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
    assert body["metrics"]["interview_count"] == 1
    assert body["metrics"]["offer_count"] == 1

    listed = client.get("/api/demands", headers=_auth(token))
    assert listed.status_code == 200
    item = listed.get_json()["items"][0]
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
        assert job.status == "active"


def test_closed_demands_can_be_restored_without_mutating_job_template(client, make_user, app):
    hr_id, token = make_user("demand-restore@example.com", role="recruiter", name="恢复HR")

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
            "owner_hr_id": hr_id,
            "city": "广州",
            "requester_department": "运营部",
            "hiring_manager_name": "运营负责人",
            "requested_at": "2026-07-10",
            "target_date": "2026-08-10",
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
            "owner_hr_id": hr_id,
            "city": "深圳",
            "requester_department": "研发部",
            "hiring_manager_name": "研发负责人",
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
            "owner_hr_id": hr_id,
            "city": "杭州",
            "requester_department": "产品部",
            "hiring_manager_name": "产品负责人",
            "requested_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=10)).date().isoformat(),
            "accepted_at": (datetime.now(UTC).replace(tzinfo=None) - timedelta(days=8)).date().isoformat(),
            "target_date": (datetime.now(UTC).replace(tzinfo=None) + timedelta(days=20)).date().isoformat(),
            "priority": "A",
            "headcount": 1,
            "status": "active",
        },
    )

    assert created.status_code == 201
    body = created.get_json()
    assert body["metrics"]["recommended_count"] == 0
    assert "hr_no_recommendation" in body["risk_flags"]


def test_demand_metrics_exclude_soft_deleted_candidates(client, make_user, app):
    hr_id, token = make_user("demand-soft-delete@example.com", role="recruiter", name="清理HR")

    with app.app_context():
        job = Job(title="数据工程师", city="上海", department="数据部", jd_text="负责数据平台")
        candidate = Candidate(owner_hr_id=hr_id, name_masked="已删除候选人", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="interview_first",
            updated_by=hr_id,
        ))
        db.session.commit()
        job_id = job.id
        candidate_id = candidate.id

    created = client.post(
        "/api/demands",
        headers=_auth(token),
        json={
            "job_id": job_id,
            "owner_hr_id": hr_id,
            "city": "上海",
            "requester_department": "数据部",
            "hiring_manager_name": "数据负责人",
            "requested_at": "2026-07-01",
            "target_date": "2026-08-01",
            "headcount": 1,
        },
    )
    assert created.status_code == 201
    demand_id = created.get_json()["id"]
    assert created.get_json()["metrics"]["recommended_count"] == 1

    with app.app_context():
        candidate = db.session.get(Candidate, candidate_id)
        candidate.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        db.session.commit()

    detail = client.get(f"/api/demands/{demand_id}", headers=_auth(token))
    assert detail.status_code == 200
    assert detail.get_json()["metrics"] == {
        "recommended_count": 0,
        "business_review_count": 0,
        "interview_count": 0,
        "offer_count": 0,
        "onboarded_count": 0,
        "accepted_offer_count": 0,
        "headcount": 1,
        "locked_headcount": 0,
        "remaining_headcount": 1,
        "over_headcount": 0,
        "transferred_count": 0,
        "current_stage_counts": {},
    }


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
    assert [item["request_no"] for item in listed.get_json()["items"]] == ["OWN"]

    forbidden_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(owner_token))
    assert forbidden_detail.status_code == 403

    reusable_template_create = client.post(
        "/api/demands",
        headers=_auth(owner_token),
        json={
            "job_id": other_job_id,
            "owner_hr_id": owner_id,
            "request_no": "REUSED",
            "requester_department": "跨部门项目组",
            "city": "上海",
            "hiring_manager_name": "项目负责人",
            "requested_at": "2026-07-10",
            "target_date": "2026-08-10",
            "headcount": 1,
        },
    )
    assert reusable_template_create.status_code == 201
    assert reusable_template_create.get_json()["owner_hr_id"] == owner_id

    other_detail = client.get(f"/api/demands/{other_demand_id}", headers=_auth(other_token))
    assert other_detail.status_code == 200
