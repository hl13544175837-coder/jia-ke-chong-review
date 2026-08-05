def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app, owner_id=None):
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, Job, RecruitmentDemand
        j = Job(title="后端", jd_text="x", owner_hr_id=owner_id)
        db.session.add(j)
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=j.id,
            owner_hr_id=owner_id,
            created_by=owner_id,
            request_no=f"REQ-IV-LOOP-{j.id}",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        c = Candidate(
            name_masked="候选人A",
            resume_json={},
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
        )
        db.session.add(c)
        db.session.flush()
        db.session.add(CandidateDemandFlow(
            candidate_id=c.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        ))
        db.session.commit()
        return j.id, c.id

def _assign(app, cid, jid, interviewer_id, round_name="interview_first"):
    with app.app_context():
        from app import db
        from app.models import InterviewAssignment, RecruitmentDemand
        demand = RecruitmentDemand.query.filter_by(job_id=jid).one()
        db.session.add(InterviewAssignment(
            candidate_id=cid,
            job_id=jid,
            demand_id=demand.id,
            round=round_name,
            interviewer_id=interviewer_id,
        ))
        db.session.commit()

def test_interviewer_submits_feedback(client, make_user, app):
    interviewer_id, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id)
    r = client.post("/api/interview/feedback", headers=_auth(token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 4, "passed": True, "strengths": "扎实", "concerns": "", "note": ""})
    assert r.status_code == 201
    r2 = client.get(f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
                    headers=_auth(token))
    assert r2.status_code == 200
    items = r2.get_json()
    assert len(items) == 1 and items[0]["score"] == 4

def test_interviews_list_filtered_by_role(client, make_user, app):
    interviewer_id, iv_token = make_user("iv@x.com", role="interviewer")
    _, mgr_token = make_user("m@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id)
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 5, "passed": True})
    r = client.get("/api/interviews", headers=_auth(mgr_token))
    assert r.status_code == 200
    assert any(it["type"] == "feedback" for it in r.get_json())


def test_interviewer_lists_only_own_feedback(client, make_user, app):
    interviewer_one_id, interviewer_one_token = make_user(
        "iv-one@x.com", role="interviewer", name="面试官一"
    )
    interviewer_two_id, interviewer_two_token = make_user(
        "iv-two@x.com", role="interviewer", name="面试官二"
    )
    first_job_id, first_candidate_id = _seed(app)
    second_job_id, second_candidate_id = _seed(app)
    _assign(app, first_candidate_id, first_job_id, interviewer_one_id)
    _assign(app, second_candidate_id, second_job_id, interviewer_two_id)

    for token, candidate_id, job_id in (
        (interviewer_one_token, first_candidate_id, first_job_id),
        (interviewer_two_token, second_candidate_id, second_job_id),
    ):
        response = client.post(
            "/api/interview/feedback",
            headers=_auth(token),
            json={
                "candidate_id": candidate_id,
                "job_id": job_id,
                "round": "interview_first",
                "score": 4,
                "passed": True,
            },
        )
        assert response.status_code == 201

    interviewer_one_items = client.get(
        "/api/interviews", headers=_auth(interviewer_one_token)
    ).get_json()
    interviewer_two_items = client.get(
        "/api/interviews", headers=_auth(interviewer_two_token)
    ).get_json()

    assert {item["interviewer_id"] for item in interviewer_one_items} == {
        interviewer_one_id
    }
    assert {item["interviewer_id"] for item in interviewer_two_items} == {
        interviewer_two_id
    }
    assert {item["candidate_id"] for item in interviewer_one_items} == {
        first_candidate_id
    }
    assert {item["candidate_id"] for item in interviewer_two_items} == {
        second_candidate_id
    }

def test_interviews_list_exposes_feedback_detail_fields(client, make_user, app):
    interviewer_id, iv_token = make_user("iv-detail@x.com", role="interviewer", name="赵面试官")
    _, mgr_token = make_user("mgr-detail@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id, "interview_second")
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_second",
        "score": 4, "passed": False, "strengths": "沟通清晰",
        "concerns": "系统设计深度不足", "note": "建议暂缓"})

    r = client.get("/api/interviews", headers=_auth(mgr_token))

    assert r.status_code == 200
    feedback = next(it for it in r.get_json() if it["type"] == "feedback")
    assert feedback["interviewer_name"] == "赵面试官"
    assert feedback["strengths"] == "沟通清晰"
    assert feedback["concerns"] == "系统设计深度不足"
    assert feedback["note"] == "建议暂缓"

def test_feedback_persists_structured_reason_tags(client, make_user, app):
    interviewer_id, iv_token = make_user("iv-reason@x.com", role="interviewer", name="业务面试官")
    _, mgr_token = make_user("mgr-reason@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id, "round_1")

    r = client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "score": 2,
        "passed": False,
        "reason_tags": ["专业能力不匹配", "岗位要求变化", "候选人已接受其他机会", "未知原因"],
        "concerns": "业务侧重新调整画像",
    })
    assert r.status_code == 201

    feedback = client.get(
        f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
        headers=_auth(mgr_token),
    ).get_json()[0]
    assert feedback["reason_tags"] == ["专业能力不匹配", "岗位要求变化", "候选人已接受其他机会"]

    listed = client.get("/api/interviews", headers=_auth(mgr_token)).get_json()
    row = next(item for item in listed if item["type"] == "feedback")
    assert row["reason_tags"] == ["专业能力不匹配", "岗位要求变化", "候选人已接受其他机会"]


def test_feedback_rejects_legacy_job_portrait_reason_tag(client, make_user, app):
    interviewer_id, iv_token = make_user("iv-legacy-reason@x.com", role="interviewer")
    _, mgr_token = make_user("mgr-legacy-reason@x.com", role="manager")
    jid, cid = _seed(app)
    _assign(app, cid, jid, interviewer_id, "round_1")

    response = client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "score": 3,
        "passed": False,
        "reason_tags": ["岗位画像变化", "岗位要求变化"],
    })
    assert response.status_code == 201

    feedback = client.get(
        f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
        headers=_auth(mgr_token),
    ).get_json()[0]
    assert feedback["reason_tags"] == ["岗位要求变化"]


def test_legacy_job_portrait_reason_tags_are_migrated(app, make_user):
    interviewer_id, _ = make_user("iv-migrate-reason@x.com", role="interviewer")
    jid, cid = _seed(app)

    with app.app_context():
        import app as app_module
        from app import db
        from app.models import InterviewFeedback

        normalize = getattr(app_module, "_normalize_legacy_feedback_reason_tags", None)
        assert callable(normalize), "app startup should expose a legacy reason-tag normalizer"

        feedback = InterviewFeedback(
            candidate_id=cid,
            job_id=jid,
            round="round_1",
            interviewer_id=interviewer_id,
            score=2,
            passed=False,
            reason_tags=["岗位画像变化", "专业能力不匹配", "岗位画像变化"],
        )
        db.session.add(feedback)
        db.session.commit()

        normalize()

        refreshed = db.session.get(InterviewFeedback, feedback.id)
        assert refreshed.reason_tags == ["岗位要求变化", "专业能力不匹配"]


def test_feedback_requires_core_fields(client, make_user, app):
    _, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    r = client.post("/api/interview/feedback", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid})  # missing round
    assert r.status_code == 400


def test_create_assignment_rejects_inactive_interviewer(client, make_user, app):
    owner_id, hr_token = make_user("assign-hr@x.com", role="recruiter")
    inactive_id, _ = make_user(
        "inactive-interviewer@x.com",
        role="interviewer",
        is_active=False,
    )
    jid, cid = _seed(app, owner_id)

    response = client.post("/api/interview/assignments", headers=_auth(hr_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "interviewer_id": inactive_id,
    })

    assert response.status_code == 400
    assert "启用" in response.get_json()["error"]


def test_create_assignment_rejects_paused_demand(client, make_user, app):
    _, manager_token = make_user("assign-manager@x.com", role="manager")
    active_interviewer_id, _ = make_user("active-interviewer@x.com", role="interviewer")
    jid, cid = _seed(app)
    with app.app_context():
        from app import db
        from app.models import RecruitmentDemand

        demand = RecruitmentDemand.query.filter_by(job_id=jid).one()
        demand.status = "paused"
        db.session.commit()

    response = client.post("/api/interview/assignments", headers=_auth(manager_token), json={
        "candidate_id": cid,
        "job_id": jid,
        "round": "round_1",
        "interviewer_id": active_interviewer_id,
    })

    assert response.status_code == 409
    assert response.get_json()["code"] == "demand_not_open"


def _stub_report(monkeypatch, passed):
    """绕过 LLM：把 build_report 固定为给定通过与否，便于测回写逻辑。"""
    from app.services.interview_service import PreScreenService
    monkeypatch.setattr(
        PreScreenService, "build_report",
        lambda self, pairs, jd: {"avg_score": 4.0 if passed else 2.0,
                                 "pass_recommended": passed, "details": []},
    )


def _latest_stage(app, cid, jid):
    with app.app_context():
        from app.models import PipelineStage
        ps = (PipelineStage.query.filter_by(candidate_id=cid, job_id=jid)
              .order_by(PipelineStage.id.desc()).first())
        return ps.stage if ps else None


def test_ai_pass_only_saves_recommendation_when_new(client, make_user, app, monkeypatch):
    owner_id, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id)
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    assert r.get_json()["pipeline_changed"] is False
    assert r.get_json()["decision_required"] is True
    assert _latest_stage(app, cid, jid) is None


def test_ai_pass_does_not_move_backward(client, make_user, app, monkeypatch):
    """AI 预筛只给建议，不得新增、回退或重复写流程阶段。"""
    uid, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, uid)
    with app.app_context():
        from app import db
        from app.models import PipelineStage
        db.session.add(PipelineStage(candidate_id=cid, job_id=jid, stage="interview", updated_by=uid))
        db.session.commit()
    _stub_report(monkeypatch, passed=True)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    assert _latest_stage(app, cid, jid) == "interview"


def test_ai_fail_does_not_reject(client, make_user, app, monkeypatch):
    owner_id, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed(app, owner_id)
    _stub_report(monkeypatch, passed=False)
    r = client.post("/api/interview/submit", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid,
                          "qa_pairs": [{"q": "q", "a": "a"}]})
    assert r.status_code == 200
    assert r.get_json()["pipeline_changed"] is False
    assert _latest_stage(app, cid, jid) is None
