from datetime import UTC, datetime, timedelta


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_candidates_support_search_stage_sort_and_pagination(client, make_user, app):
    admin_id, admin_token = make_user("candidate-search-admin@example.com", role="admin")
    recruiter_id, _ = make_user("candidate-search-hr@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, PipelineStage

        job = Job(title="AI 产品经理", jd_text="负责 AI 产品", owner_hr_id=admin_id)
        db.session.add(job)
        db.session.flush()

        first = Candidate(
            owner_hr_id=recruiter_id,
            name_masked="候选人Alpha",
            email_masked="alpha@example.com",
            phone_masked="13800000001",
            resume_json={"extracted_info": {}},
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        second = Candidate(
            owner_hr_id=recruiter_id,
            name_masked="候选人Beta",
            email_masked="beta@example.com",
            phone_masked="13800000002",
            resume_json={"extracted_info": {}},
            created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
        )
        db.session.add_all([first, second])
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=first.id, tag="Python", score=5),
            CandidateTag(candidate_id=second.id, tag="Java", score=4),
            PipelineStage(
                candidate_id=first.id,
                job_id=job.id,
                stage="interview_first",
                updated_by=admin_id,
            ),
            PipelineStage(
                candidate_id=second.id,
                job_id=job.id,
                stage="pending",
                updated_by=admin_id,
            ),
        ])
        db.session.commit()

    response = client.get(
        "/api/candidates?search=Python&stage=interview_first&page=1&per_page=1&sort_by=name_masked&sort_order=asc",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert body["pages"] == 1
    assert body["candidates"][0]["name_masked"] == "候选人Alpha"
    assert body["candidates"][0]["top_tags"][0] == {"tag": "Python", "score": 5}


def test_candidates_search_includes_resume_company_position_and_school(client, make_user, app):
    admin_id, admin_token = make_user("candidate-resume-search-admin@example.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add_all([
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人画像命中",
                email_masked="resume-hit@example.com",
                resume_json={
                    "extracted_info": {
                        "education": [{"school": "复旦大学", "major": "计算机科学"}],
                        "experience": [{"company": "某AI公司", "position": "NLP算法工程师"}],
                    }
                },
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人画像未命中",
                email_masked="resume-miss@example.com",
                resume_json={"extracted_info": {"education": [{"school": "普通大学"}]}},
            ),
        ])
        db.session.commit()

    company_response = client.get(
        "/api/candidates?search=某AI公司&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert company_response.status_code == 200
    company_body = company_response.get_json()
    assert company_body["total"] == 1
    assert company_body["candidates"][0]["name_masked"] == "候选人画像命中"

    school_response = client.get(
        "/api/candidates?search=复旦大学&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert school_response.status_code == 200
    school_body = school_response.get_json()
    assert school_body["total"] == 1
    assert school_body["candidates"][0]["name_masked"] == "候选人画像命中"


def test_candidates_support_intent_city_filter_from_resume(client, make_user, app):
    admin_id, admin_token = make_user("candidate-city-admin@example.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add_all([
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人深圳",
                resume_json={"extracted_info": {"intent_city": "深圳"}},
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人杭州",
                resume_json={"extracted_info": {"summary": "求职意向：后端工程师；意向城市：杭州"}},
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="候选人上海校友",
                resume_json={"extracted_info": {"education": [{"school": "上海交通大学"}]}},
            ),
        ])
        db.session.commit()

    shenzhen = client.get(
        "/api/candidates?city=深圳&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert shenzhen.status_code == 200
    shenzhen_body = shenzhen.get_json()
    assert shenzhen_body["total"] == 1
    assert shenzhen_body["candidates"][0]["name_masked"] == "候选人深圳"
    assert shenzhen_body["candidates"][0]["intent_city"] == "深圳"

    hangzhou = client.get(
        "/api/candidates?city=杭州&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert hangzhou.status_code == 200
    hangzhou_body = hangzhou.get_json()
    assert hangzhou_body["total"] == 1
    assert hangzhou_body["candidates"][0]["name_masked"] == "候选人杭州"
    assert hangzhou_body["candidates"][0]["intent_city"] == "杭州"

    education_only = client.get(
        "/api/candidates?city=上海&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert education_only.status_code == 200
    assert education_only.get_json()["total"] == 0


def test_candidates_support_source_parse_and_pipeline_filters(client, make_user, app):
    admin_id, admin_token = make_user("candidate-library-filter-admin@example.com", role="admin")

    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, UploadBatch

        job = Job(title="算法工程师", jd_text="负责推荐算法", owner_hr_id=admin_id)
        boss_batch = UploadBatch(owner_hr_id=admin_id, source_channel="BOSS直聘")
        liepin_batch = UploadBatch(owner_hr_id=admin_id, source_channel="猎聘")
        db.session.add_all([job, boss_batch, liepin_batch])
        db.session.flush()

        library_only = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=boss_batch.id,
            name_masked="候选人未分配",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="ok",
        )
        failed = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=liepin_batch.id,
            name_masked="候选人解析失败",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="failed",
            parse_error="文件损坏",
        )
        in_pipeline = Candidate(
            owner_hr_id=admin_id,
            upload_batch_id=boss_batch.id,
            name_masked="候选人已入流程",
            resume_json={"extracted_info": {"intent_city": "深圳"}},
            parse_status="ok",
        )
        db.session.add_all([library_only, failed, in_pipeline])
        db.session.flush()
        db.session.add(PipelineStage(
            candidate_id=in_pipeline.id,
            job_id=job.id,
            stage="pending",
            updated_by=admin_id,
        ))
        db.session.commit()

    response = client.get(
        "/api/candidates?source_channel=BOSS直聘&parse_status=ok&pipeline_status=not_in_pipeline&page=1&per_page=20",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["candidates"][0]["name_masked"] == "候选人未分配"
    assert body["candidates"][0]["source"]["channel"] == "BOSS直聘"
    assert body["candidates"][0]["parse_status"] == "ok"

    failed_response = client.get(
        "/api/candidates?parse_status=failed&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert failed_response.status_code == 200
    assert failed_response.get_json()["candidates"][0]["name_masked"] == "候选人解析失败"

    pipeline_response = client.get(
        "/api/candidates?pipeline_status=in_pipeline&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert pipeline_response.status_code == 200
    assert pipeline_response.get_json()["candidates"][0]["name_masked"] == "候选人已入流程"


def test_candidates_support_inclusive_created_date_range(client, make_user, app):
    admin_id, admin_token = make_user(
        "candidate-created-range-admin@example.com", role="admin"
    )

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add_all([
            Candidate(
                owner_hr_id=admin_id,
                name_masked="范围之前",
                resume_json={"extracted_info": {}},
                created_at=datetime(2026, 8, 1, 23, 59, 59),
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="边界开始",
                resume_json={"extracted_info": {}},
                created_at=datetime(2026, 8, 2, 0, 0, 0),
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="边界结束",
                resume_json={"extracted_info": {}},
                created_at=datetime(2026, 8, 3, 23, 59, 59),
            ),
            Candidate(
                owner_hr_id=admin_id,
                name_masked="范围之后",
                resume_json={"extracted_info": {}},
                created_at=datetime(2026, 8, 4, 0, 0, 0),
            ),
        ])
        db.session.commit()

    response = client.get(
        "/api/candidates?created_from=2026-08-02&created_to=2026-08-03&page=1&per_page=20",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    assert {
        item["name_masked"] for item in response.get_json()["candidates"]
    } == {"边界开始", "边界结束"}

    invalid = client.get(
        "/api/candidates?created_from=2026-08-XX&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert invalid.status_code == 400
    assert invalid.get_json()["error"] == "created_from 必须使用 YYYY-MM-DD 格式"

    reversed_range = client.get(
        "/api/candidates?created_from=2026-08-04&created_to=2026-08-03&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert reversed_range.status_code == 400
    assert reversed_range.get_json()["error"] == "入库开始日期不能晚于结束日期"


def test_candidates_expose_and_filter_precise_pipeline_state(client, make_user, app):
    admin_id, admin_token = make_user(
        "candidate-pipeline-state-admin@example.com", role="admin"
    )

    with app.app_context():
        from app import db
        from app.models import (
            Candidate,
            CandidateDemandFlow,
            Job,
            PipelineStage,
            RecruitmentDemand,
        )

        job = Job(title="后端工程师", jd_text="负责后端开发", owner_hr_id=admin_id)
        db.session.add(job)
        db.session.flush()

        never_entered = Candidate(
            owner_hr_id=admin_id,
            name_masked="从未进入",
            resume_json={"extracted_info": {}},
        )
        active = Candidate(
            owner_hr_id=admin_id,
            name_masked="当前流程中",
            resume_json={"extracted_info": {}},
        )
        rejected = Candidate(
            owner_hr_id=admin_id,
            name_masked="当前淘汰",
            resume_json={"extracted_info": {}},
        )
        reactivated = Candidate(
            owner_hr_id=admin_id,
            name_masked="重新启用",
            resume_json={"extracted_info": {}},
        )
        onboarded = Candidate(
            owner_hr_id=admin_id,
            name_masked="已经入职",
            resume_json={"extracted_info": {}},
        )
        transferred = Candidate(
            owner_hr_id=admin_id,
            name_masked="已经转出",
            resume_json={"extracted_info": {}},
        )
        active_with_other_rejection = Candidate(
            owner_hr_id=admin_id,
            name_masked="跨需求仍在流程",
            resume_json={"extracted_info": {}},
        )
        db.session.add_all([
            never_entered,
            active,
            rejected,
            reactivated,
            onboarded,
            transferred,
            active_with_other_rejection,
        ])
        db.session.flush()
        active_demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=admin_id,
            created_by=admin_id,
            request_no="PIPE-ACTIVE",
            job_title_snapshot="活动需求",
        )
        rejected_demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=admin_id,
            created_by=admin_id,
            request_no="PIPE-REJECTED",
            job_title_snapshot="历史淘汰需求",
        )
        db.session.add_all([active_demand, rejected_demand])
        db.session.flush()
        active_demand_id = active_demand.id
        active_with_other_rejection.current_demand_id = active_demand.id
        db.session.add(CandidateDemandFlow(
            candidate_id=active_with_other_rejection.id,
            demand_id=active_demand.id,
            owner_hr_id=admin_id,
            status="active",
        ))
        db.session.add_all([
            PipelineStage(candidate_id=active.id, job_id=job.id, stage="pending", updated_by=admin_id),
            PipelineStage(candidate_id=rejected.id, job_id=job.id, stage="rejected", updated_by=admin_id),
            PipelineStage(candidate_id=reactivated.id, job_id=job.id, stage="rejected", updated_by=admin_id),
            PipelineStage(candidate_id=reactivated.id, job_id=job.id, stage="pending", updated_by=admin_id),
            PipelineStage(candidate_id=onboarded.id, job_id=job.id, stage="onboarded", updated_by=admin_id),
            PipelineStage(candidate_id=transferred.id, job_id=job.id, stage="transferred", updated_by=admin_id),
            PipelineStage(candidate_id=active_with_other_rejection.id, job_id=job.id, demand_id=active_demand.id, stage="business_review", updated_by=admin_id),
            PipelineStage(candidate_id=active_with_other_rejection.id, job_id=job.id, demand_id=rejected_demand.id, stage="rejected", updated_by=admin_id),
        ])
        db.session.commit()

    response = client.get(
        "/api/candidates?page=1&per_page=20",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    states = {
        item["name_masked"]: (
            item["pipeline_state"],
            item["has_rejected_history"],
        )
        for item in response.get_json()["candidates"]
    }
    assert states["从未进入"] == ("never_entered", False)
    assert states["当前流程中"] == ("in_pipeline", False)
    assert states["当前淘汰"] == ("rejected", True)
    assert states["重新启用"] == ("in_pipeline", True)
    assert states["已经入职"] == ("onboarded", False)
    assert states["已经转出"] == ("transferred", False)
    assert states["跨需求仍在流程"] == ("in_pipeline", True)
    active_item = next(
        item
        for item in response.get_json()["candidates"]
        if item["name_masked"] == "跨需求仍在流程"
    )
    assert active_item["current_stage"] == "business_review"
    assert active_item["latest_demand_id"] == active_demand_id

    never_response = client.get(
        "/api/candidates?pipeline_status=never_entered&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert never_response.status_code == 200
    assert [
        item["name_masked"] for item in never_response.get_json()["candidates"]
    ] == ["从未进入"]

    rejected_response = client.get(
        "/api/candidates?pipeline_status=rejected&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert rejected_response.status_code == 200
    assert [
        item["name_masked"] for item in rejected_response.get_json()["candidates"]
    ] == ["当前淘汰"]

    talent_pool_response = client.get(
        "/api/candidates?pipeline_status=not_in_pipeline&page=1&per_page=20",
        headers=_auth(admin_token),
    )
    assert talent_pool_response.status_code == 200
    assert {
        item["name_masked"]
        for item in talent_pool_response.get_json()["candidates"]
    } == {"从未进入", "当前淘汰"}


def test_candidates_support_education_skill_and_score_filters(client, make_user, app):
    admin_id, admin_token = make_user(
        "candidate-profile-filter-admin@example.com", role="admin"
    )

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        matched = Candidate(
            owner_hr_id=admin_id,
            name_masked="候选人本科Python",
            resume_json={
                "extracted_info": {
                    "education": [
                        {"school": "复旦大学", "degree": "本科", "major": "计算机"}
                    ]
                }
            },
        )
        low_score = Candidate(
            owner_hr_id=admin_id,
            name_masked="候选人本科低分",
            resume_json={
                "extracted_info": {
                    "education": [
                        {"school": "同济大学", "degree": "本科", "major": "软件工程"}
                    ]
                }
            },
        )
        other_degree = Candidate(
            owner_hr_id=admin_id,
            name_masked="候选人硕士Java",
            resume_json={
                "extracted_info": {
                    "education": [
                        {"school": "浙江大学", "degree": "硕士", "major": "计算机"}
                    ]
                }
            },
        )
        db.session.add_all([matched, low_score, other_degree])
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=matched.id, tag="Python", score=5),
            CandidateTag(candidate_id=low_score.id, tag="Python", score=2),
            CandidateTag(candidate_id=other_degree.id, tag="Java", score=5),
        ])
        db.session.commit()

    response = client.get(
        "/api/candidates?education=本科&skill=Python&min_score=4&page=1&per_page=20",
        headers=_auth(admin_token),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["candidates"][0]["name_masked"] == "候选人本科Python"


def test_candidates_keep_legacy_array_shape_without_query_params(client, make_user, app):
    user_id, token = make_user("candidate-legacy@example.com", role="recruiter")

    with app.app_context():
        from app import db
        from app.models import Candidate

        db.session.add(Candidate(
            owner_hr_id=user_id,
            name_masked="候选人Legacy",
            resume_json={"extracted_info": {}},
        ))
        db.session.commit()

    response = client.get("/api/candidates", headers=_auth(token))

    assert response.status_code == 200
    body = response.get_json()
    assert isinstance(body, list)
    assert body[0]["name_masked"] == "候选人Legacy"
