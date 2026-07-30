def _auth(t): return {"Authorization": f"Bearer {t}"}


def test_candidate_library_list_includes_resume_summary_and_top_tags(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, PipelineStage, RecruitmentDemand

        job = Job(title="算法工程师", jd_text="负责算法研发", owner_hr_id=uid)
        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="候选人A",
            email_masked="a@example.com",
            phone_masked="13800000000",
            resume_json={
                "target_position": "大模型算法工程师",
                "education": [
                    {"school": "复旦大学", "degree": "本科", "major": "计算机科学"}
                ],
                "experience": [
                    {"company": "某AI公司", "position": "NLP算法工程师", "duration": "2022-至今"}
                ],
            },
        )
        db.session.add_all([job, candidate])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=uid,
            request_no="REQ-LIBRARY-OFFER",
            status="active",
            approval_status="approved",
        )
        db.session.add(demand)
        db.session.flush()
        candidate.current_demand_id = demand.id
        db.session.add_all([
            CandidateTag(candidate_id=candidate.id, tag="Python", score=5),
            CandidateTag(candidate_id=candidate.id, tag="NLP", score=4),
            CandidateTag(candidate_id=candidate.id, tag="SQL", score=3),
            PipelineStage(
                candidate_id=candidate.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="offer",
                updated_by=uid,
            ),
        ])
        db.session.commit()
        demand_id = demand.id

    response = client.get("/api/candidates", headers=_auth(token))

    assert response.status_code == 200
    body = response.get_json()
    assert body[0]["email_masked"] == "a@example.com"
    assert body[0]["phone_masked"] == "13800000000"
    assert body[0]["max_score"] == 5
    assert body[0]["top_tags"][0] == {"tag": "Python", "score": 5}
    assert body[0]["latest_experience"] == {
        "company": "某AI公司",
        "position": "NLP算法工程师",
        "duration": "2022-至今",
    }
    assert body[0]["education_summary"] == "复旦大学 · 本科 · 计算机科学"
    assert body[0]["desired_position"] == "大模型算法工程师"
    assert body[0]["current_stage"] == "offer"
    assert body[0]["current_demand_id"] == demand_id
    assert body[0]["current_demand"] == {
        "id": demand_id,
        "request_no": "REQ-LIBRARY-OFFER",
        "job_title": "算法工程师",
    }
    assert body[0]["latest_demand"] == body[0]["current_demand"]
    assert body[0]["is_favorite"] is False

    offer_candidates = client.get(
        f"/api/candidates?demand_id={demand_id}&stage=offer&page=1&per_page=100",
        headers=_auth(token),
    )
    assert offer_candidates.status_code == 200
    assert offer_candidates.get_json()["candidates"][0]["current_stage"] == "offer"


def test_candidate_library_adds_scoped_read_only_duplicate_and_local_demo_hints(
    client,
    make_user,
    app,
):
    manager_id, token = make_user(
        "candidate-hygiene-manager@example.com",
        role="manager",
        org_id=1,
    )
    foreign_owner_id, _ = make_user(
        "candidate-hygiene-foreign@example.com",
        role="recruiter",
        org_id=2,
    )

    with app.app_context():
        from app import db
        from app.models import Candidate
        from app.time_utils import utc_now

        primary = Candidate(
            org_id=1,
            owner_hr_id=manager_id,
            name_masked=" 张 三 ",
            resume_json={},
            resume_sha256="same-resume-hash",
        )
        same_record = Candidate(
            org_id=1,
            owner_hr_id=manager_id,
            name_masked="张三",
            resume_json={},
            resume_sha256="same-resume-hash",
        )
        deleted_duplicate = Candidate(
            org_id=1,
            owner_hr_id=manager_id,
            name_masked="张三",
            resume_json={},
            resume_sha256="same-resume-hash",
            deleted_at=utc_now(),
        )
        foreign_duplicate = Candidate(
            org_id=2,
            owner_hr_id=foreign_owner_id,
            name_masked="张三",
            resume_json={},
            resume_sha256="same-resume-hash",
        )
        local_demo_candidates = [
            Candidate(org_id=1, owner_hr_id=manager_id, name_masked=name, resume_json={})
            for name in (
                "候选人123",
                "验收候选人-001",
                "面试演示-二面",
                "需求演示-后端工程师",
                "Offer演示-待发放",
            )
        ]
        ordinary_candidates = [
            Candidate(org_id=1, owner_hr_id=manager_id, name_masked=name, resume_json={})
            for name in (
                "候选人12",
                "普通演示候选人",
                "普通候选人",
            )
        ]
        db.session.add_all([
            primary,
            same_record,
            deleted_duplicate,
            foreign_duplicate,
            *local_demo_candidates,
            *ordinary_candidates,
        ])
        db.session.commit()
        primary_id = primary.id
        same_record_id = same_record.id
        deleted_id = deleted_duplicate.id
        foreign_id = foreign_duplicate.id
        local_demo_ids = {candidate.id for candidate in local_demo_candidates}
        ordinary_ids = {candidate.id for candidate in ordinary_candidates}
        candidate_count_before = Candidate.query.count()

    app.config["LOCAL_SCHEMA_COMPAT"] = True
    response = client.get(
        "/api/candidates?page=1&per_page=100",
        headers=_auth(token),
    )

    assert response.status_code == 200
    items = {item["id"]: item for item in response.get_json()["candidates"]}
    assert items[primary_id]["identical_resume_count"] == 2
    assert items[same_record_id]["identical_resume_count"] == 2
    assert items[primary_id]["same_name_count"] == 2
    assert items[same_record_id]["same_name_count"] == 2
    assert deleted_id not in items
    assert foreign_id not in items
    assert all(items[candidate_id]["is_local_demo_record"] for candidate_id in local_demo_ids)
    assert all(not items[candidate_id]["is_local_demo_record"] for candidate_id in ordinary_ids)
    assert all(items[candidate_id]["identical_resume_count"] == 0 for candidate_id in ordinary_ids)

    app.config["LOCAL_SCHEMA_COMPAT"] = False
    non_local_response = client.get(
        "/api/candidates?page=1&per_page=100",
        headers=_auth(token),
    )
    assert non_local_response.status_code == 200
    assert all(
        item["is_local_demo_record"] is False
        for item in non_local_response.get_json()["candidates"]
    )

    with app.app_context():
        from app.models import Candidate

        assert Candidate.query.count() == candidate_count_before


def test_full_headcount_blocks_new_candidate_from_joining_demand(client, make_user, app):
    owner_id, token = make_user("full-hc-owner@example.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, PipelineStage, RecruitmentDemand

        job = Job(title="HC 已满岗位", jd_text="用于验证名额守卫", owner_hr_id=owner_id)
        onboarded = Candidate(owner_hr_id=owner_id, name_masked="已入职候选人", resume_json={})
        waiting = Candidate(owner_hr_id=owner_id, name_masked="待加入候选人", resume_json={})
        db.session.add_all([job, onboarded, waiting])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-FULL-HC",
            status="active",
            approval_status="approved",
            headcount=1,
        )
        db.session.add(demand)
        db.session.flush()
        db.session.add(PipelineStage(
            org_id=demand.org_id,
            candidate_id=onboarded.id,
            job_id=job.id,
            demand_id=demand.id,
            stage="onboarded",
            updated_by=owner_id,
        ))
        db.session.commit()
        demand_id = demand.id
        waiting_id = waiting.id

    response = client.post(
        "/api/candidates/pipeline/add",
        headers=_auth(token),
        json={"demand_id": demand_id, "candidate_ids": [waiting_id]},
    )

    assert response.status_code == 409
    assert response.get_json() == {
        "code": "demand_headcount_reached",
        "error": "该需求 HC 已满，请先确认完成需求或调整 HC",
    }
    with app.app_context():
        from app.models import PipelineStage

        assert PipelineStage.query.filter_by(
            candidate_id=waiting_id,
            demand_id=demand_id,
        ).count() == 0


def test_candidate_favorites_and_safe_duplicate_merge(client, make_user, app):
    manager_id, manager_token = make_user(
        "candidate-library-manager@example.com",
        role="manager",
    )
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag, Job, PipelineStage, RecruitmentDemand

        job = Job(title="数据工程师", jd_text="负责数据平台", owner_hr_id=manager_id)
        primary = Candidate(
            owner_hr_id=manager_id,
            name_masked="候选人主档",
            email_masked="same@example.com",
            phone_masked="13900001111",
            resume_json={"extracted_info": {"education": [{"school": "同济大学", "degree": "硕士"}]}},
        )
        duplicate = Candidate(
            owner_hr_id=manager_id,
            name_masked="候选人重复档",
            email_masked="same@example.com",
            phone_masked="13900001111",
            resume_json={"extracted_info": {"experience": [{"company": "某科技公司", "title": "数据工程师"}]}},
        )
        unrelated = Candidate(
            owner_hr_id=manager_id,
            name_masked="其他流程候选人",
            email_masked="other@example.com",
            phone_masked="13900002222",
            resume_json={},
        )
        db.session.add_all([job, primary, duplicate, unrelated])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=manager_id,
            request_no="REQ-LIBRARY-MERGE",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        primary.current_demand_id = demand.id
        db.session.add_all([
            PipelineStage(
                candidate_id=primary.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="pending",
                updated_by=manager_id,
            ),
            PipelineStage(
                candidate_id=unrelated.id,
                job_id=job.id,
                demand_id=demand.id,
                stage="pending",
                updated_by=manager_id,
            ),
            CandidateTag(candidate_id=duplicate.id, tag="Python", score=5),
        ])
        db.session.commit()
        primary_id = primary.id
        duplicate_id = duplicate.id

    favorite = client.post(
        "/api/candidates/favorites/set",
        headers=_auth(manager_token),
        json={"candidate_ids": [duplicate_id], "favorite": True},
    )
    assert favorite.status_code == 200
    assert favorite.get_json()["changed"] == 1

    duplicates = client.get(
        "/api/candidates/duplicates/get",
        headers=_auth(manager_token),
    )
    assert duplicates.status_code == 200
    group = duplicates.get_json()["groups"][0]
    assert group["can_merge"] is True
    assert set(group["match_basis"]) == {"手机号一致", "邮箱一致"}

    merged = client.post(
        "/api/candidates/duplicates/merge",
        headers=_auth(manager_token),
        json={
            "primary_candidate_id": primary_id,
            "duplicate_candidate_ids": [duplicate_id],
            "reason": "完整联系方式一致，人工核对为同一候选人",
        },
    )
    assert merged.status_code == 200
    assert merged.get_json()["merged_count"] == 1

    favorite_candidates = client.get(
        "/api/candidates?favorite=true&page=1&per_page=20",
        headers=_auth(manager_token),
    )
    assert [item["id"] for item in favorite_candidates.get_json()["candidates"]] == [primary_id]

    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateFavorite, CandidateMerge, CandidateTag, Event

        assert db.session.get(Candidate, duplicate_id).deleted_at is not None
        assert CandidateFavorite.query.filter_by(
            user_id=manager_id,
            candidate_id=primary_id,
        ).count() == 1
        assert CandidateTag.query.filter_by(candidate_id=primary_id, tag="Python").count() == 1
        assert CandidateMerge.query.filter_by(
            primary_candidate_id=primary_id,
            duplicate_candidate_id=duplicate_id,
        ).count() == 1
        assert Event.query.filter_by(
            action="candidate.duplicates.merged",
            entity_id=primary_id,
        ).count() == 1


def test_duplicate_groups_require_one_shared_exact_identity(client, make_user, app):
    manager_id, manager_token = make_user(
        "candidate-overlap-manager@example.com",
        role="manager",
    )
    with app.app_context():
        from app import db
        from app.models import Candidate

        candidates = [
            Candidate(
                owner_hr_id=manager_id,
                name_masked="手机号重复甲",
                email_masked="first@example.com",
                phone_masked="13800002222",
                resume_json={},
            ),
            Candidate(
                owner_hr_id=manager_id,
                name_masked="桥接档案乙",
                email_masked="second@example.com",
                phone_masked="13800002222",
                resume_json={},
            ),
            Candidate(
                owner_hr_id=manager_id,
                name_masked="邮箱重复丙",
                email_masked="second@example.com",
                phone_masked="13700003333",
                resume_json={},
            ),
        ]
        db.session.add_all(candidates)
        db.session.commit()
        candidate_ids = [candidate.id for candidate in candidates]

    response = client.get(
        "/api/candidates/duplicates/get",
        headers=_auth(manager_token),
    )

    assert response.status_code == 200
    groups = response.get_json()["groups"]
    member_sets = [
        {candidate["id"] for candidate in group["candidates"]}
        for group in groups
    ]
    assert len(groups) == 2
    assert set(candidate_ids[:2]) in member_sets
    assert set(candidate_ids[1:]) in member_sets
    assert set(candidate_ids) not in member_sets


def test_original_resume_preview_and_download_are_protected_and_path_free(
    client,
    make_user,
    app,
    tmp_path,
):
    owner_id, token = make_user("original-owner@example.com", role="recruiter")
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    original = upload_root / "private-server-name.pdf"
    original.write_bytes(b"%PDF-1.4\noriginal resume")
    app.config["UPLOAD_FOLDER"] = str(upload_root)

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="原件候选人",
            raw_file_path=str(original),
            resume_json={"extracted_info": {}},
            parse_status="failed",
            parse_error="parser unavailable",
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    detail = client.get(f"/api/resume/{candidate_id}", headers=_auth(token))
    preview = client.get(
        f"/api/resume/{candidate_id}/original/preview",
        headers=_auth(token),
    )
    download = client.get(
        f"/api/resume/{candidate_id}/original/download",
        headers=_auth(token),
    )

    assert detail.status_code == 200
    detail_body = detail.get_json()
    assert "raw_file_path" not in detail_body
    assert str(tmp_path) not in str(detail_body)
    assert detail_body["original_resume"] == {
        "available": True,
        "filename": f"candidate-{candidate_id}-resume.pdf",
        "mime_type": "application/pdf",
        "preview_url": f"/api/resume/{candidate_id}/original/preview",
        "download_url": f"/api/resume/{candidate_id}/original/download",
    }
    assert preview.status_code == 200
    assert preview.data == b"%PDF-1.4\noriginal resume"
    assert preview.mimetype == "application/pdf"
    assert "inline" in preview.headers["Content-Disposition"]
    assert str(tmp_path) not in preview.headers["Content-Disposition"]
    assert download.status_code == 200
    assert download.data == preview.data
    assert "attachment" in download.headers["Content-Disposition"]
    assert f"candidate-{candidate_id}-resume.pdf" in download.headers["Content-Disposition"]


def test_missing_original_resume_fails_closed_and_is_audited(client, make_user, app, tmp_path):
    owner_id, token = make_user("missing-original@example.com", role="recruiter")
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    app.config["UPLOAD_FOLDER"] = str(upload_root)

    with app.app_context():
        from app import db
        from app.models import Candidate

        candidate = Candidate(
            owner_hr_id=owner_id,
            name_masked="原件缺失候选人",
            raw_file_path=str(upload_root / "missing.pdf"),
            resume_json={},
        )
        db.session.add(candidate)
        db.session.commit()
        candidate_id = candidate.id

    response = client.get(
        f"/api/resume/{candidate_id}/original/preview",
        headers=_auth(token),
    )

    assert response.status_code == 404
    assert response.get_json() == {
        "code": "original_resume_missing",
        "error": "原始简历文件不可用",
    }
    with app.app_context():
        from app.models import Event

        event = Event.query.filter_by(
            action="resume.original.access_denied",
            entity_id=candidate_id,
        ).one()
        assert event.result == "denied"
        assert event.failure_reason == "missing_file"
        assert event.payload == {"reason": "missing_file"}
        assert str(tmp_path) not in str(event.payload)
