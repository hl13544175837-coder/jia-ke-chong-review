from datetime import timedelta


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_analytics_fact(app, *, org_id, owner_id, request_no, title, department):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, OfferRecord, PipelineStage, RecruitmentDemand, UploadBatch
        from app.time_utils import utc_now

        now = utc_now()
        job = Job(org_id=org_id, title=title, department=department, jd_text="真实统计验收")
        db.session.add(job)
        db.session.flush()
        start_date = (now - timedelta(days=10)).date()
        demand = RecruitmentDemand(
            org_id=org_id,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no=request_no,
            department=department,
            job_title_snapshot=title,
            headcount=2,
            status="active",
            approval_status="approved",
            requested_at=start_date,
            accepted_at=start_date,
        )
        db.session.add(demand)
        db.session.flush()
        batch = UploadBatch(
            org_id=org_id,
            owner_hr_id=owner_id,
            demand_id=demand.id,
            target_job_id=job.id,
            source_channel="内部推荐",
        )
        db.session.add(batch)
        db.session.flush()
        candidate = Candidate(
            org_id=org_id,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            upload_batch_id=batch.id,
            name_masked=f"{title}候选人",
            resume_json={"desired_position": title},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(PipelineStage(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            job_id=job.id,
            stage="onboarded",
            updated_by=owner_id,
        ))
        db.session.add(OfferRecord(
            org_id=org_id,
            candidate_id=candidate.id,
            demand_id=demand.id,
            job_id=job.id,
            approval_status="onboarded",
            onboarded_at=now,
            onboard_date=now.date(),
            created_by=owner_id,
            version=1,
        ))
        db.session.commit()


def test_analytics_uses_current_org_database_facts_and_exports_csv(app, client, make_user):
    admin_id, admin_token = make_user("analytics-admin@example.com", role="admin", org_id=1)
    _, director_token = make_user("analytics-director@example.com", role="hr_director", org_id=1)
    other_id, _ = make_user("analytics-other@example.com", role="admin", org_id=2)
    _, recruiter_token = make_user("analytics-recruiter@example.com", role="recruiter", org_id=1)
    _seed_analytics_fact(
        app,
        org_id=1,
        owner_id=admin_id,
        request_no="ANALYTICS-ORG-ONE",
        title="真实数据岗位",
        department="产品部",
    )
    _seed_analytics_fact(
        app,
        org_id=2,
        owner_id=other_id,
        request_no="ANALYTICS-ORG-TWO",
        title="其他组织岗位",
        department="其他部门",
    )

    forbidden = client.get("/api/analytics/overview", headers=_auth(recruiter_token))
    assert forbidden.status_code == 403

    director_overview = client.get("/api/analytics/overview", headers=_auth(director_token))
    assert director_overview.status_code == 200

    overview = client.get("/api/analytics/overview", headers=_auth(admin_token))
    assert overview.status_code == 200
    body = overview.get_json()
    assert body["summary"]["open_demands"] == 1
    assert body["summary"]["onboarded"] == 1
    assert body["summary"]["remaining_headcount"] == 1
    assert body["summary"]["offer_accept_rate"] == 100.0
    assert body["funnel"]["hired"] == 1
    assert [item["request_no"] for item in body["demands"]] == ["ANALYTICS-ORG-ONE"]
    demand_row = body["demands"][0]
    assert demand_row["funnel"]["onboarded"] == 1
    assert demand_row["hires_month"] == 1
    assert demand_row["hires_quarter"] == 1
    assert demand_row["offers_issued"] == 1
    assert demand_row["offers_accepted"] == 1
    assert demand_row["owner_name"]
    assert demand_row["start_date"]
    assert demand_row["days_open"] == 10
    assert demand_row["over_headcount"] == 0
    assert body["hired_records"] == [{
        "offer_id": body["hired_records"][0]["offer_id"],
        "candidate_id": body["hired_records"][0]["candidate_id"],
        "demand_id": demand_row["demand_id"],
        "candidate_name": "真实数据岗位候选人",
        "position": "真实数据岗位",
        "department": "产品部",
        "source_channel": "内部推荐",
        "onboard_date": body["hired_records"][0]["onboard_date"],
        "recruitment_days": 10,
    }]
    assert body["cycle_rows"] == [{
        "demand_id": demand_row["demand_id"],
        "position": "真实数据岗位",
        "department": "产品部",
        "average_days": 10,
        "fastest_days": 10,
        "slowest_days": 10,
        "hired_count": 1,
    }]
    assert body["summary"]["average_cycle_days"] == 10
    assert body["generated_at"]

    exported = client.get("/api/analytics/export", headers=_auth(admin_token))
    assert exported.status_code == 200
    assert exported.headers["Content-Type"].startswith("text/csv")
    assert "attachment" in exported.headers["Content-Disposition"]
    csv_text = exported.get_data(as_text=True)
    assert "ANALYTICS-ORG-ONE" in csv_text
    assert "ANALYTICS-ORG-TWO" not in csv_text

    with app.app_context():
        from app.models import Event

        assert Event.query.filter_by(org_id=1, action="analytics.exported", actor_id=admin_id).count() == 1
