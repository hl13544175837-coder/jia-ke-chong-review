def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed_job_candidate(app, owner_hr_id):
    with app.app_context():
        from app import db
        from app.models import Candidate, Job, RecruitmentDemand
        j = Job(title="后端", jd_text="x", owner_hr_id=owner_hr_id)
        c = Candidate(owner_hr_id=owner_hr_id, name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.flush()
        demand = RecruitmentDemand(
            job_id=j.id,
            owner_hr_id=owner_hr_id,
            request_no=f"REQ-ROUND-{j.id}",
            status="active",
        )
        db.session.add(demand); db.session.commit()
        return j.id, demand.id, c.id

def test_move_through_main_pipeline_with_note(client, make_user, app):
    hr_id, token = make_user("hr@x.com", role="recruiter")
    jid, demand_id, cid = _seed_job_candidate(app, hr_id)
    for stage in ["pending", "ai_screen", "business_review", "interview"]:
        r = client.post(f"/api/pipeline/demands/{demand_id}/move", headers=_auth(token),
                        json={"candidate_id": cid, "stage": stage,
                              "note": f"进入{stage}"})
        assert r.status_code == 200
    counts = client.get(f"/api/pipeline/demands/{demand_id}", headers=_auth(token)).get_json()
    assert counts == {"interview": 1}
    hist = client.get(f"/api/pipeline/demands/{demand_id}/history/{cid}", headers=_auth(token)).get_json()
    stages = [t["stage"] for t in hist["timeline"]]
    assert stages == ["pending", "ai_screen", "business_review", "interview"]
    assert hist["timeline"][-1]["note"] == "进入interview"


def test_business_review_appears_in_board_order(client, make_user, app):
    hr_id, token = make_user("hr-board@x.com", role="recruiter")
    _, demand_id, cid = _seed_job_candidate(app, hr_id)

    r = client.post(f"/api/pipeline/demands/{demand_id}/move", headers=_auth(token),
                    json={"candidate_id": cid, "stage": "business_review"})
    assert r.status_code == 200

    board = client.get(f"/api/pipeline/demands/{demand_id}/board", headers=_auth(token)).get_json()
    assert board["stage_order"].index("business_review") > board["stage_order"].index("ai_screen")
    assert board["stage_order"].index("business_review") < board["stage_order"].index("interview")
    assert board["candidates"][0]["stage"] == "business_review"

def test_invalid_stage_rejected(client, make_user, app):
    hr_id, token = make_user("hr-invalid@x.com", role="recruiter")
    _, demand_id, cid = _seed_job_candidate(app, hr_id)
    r = client.post(f"/api/pipeline/demands/{demand_id}/move", headers=_auth(token),
                    json={"candidate_id": cid, "stage": "screened"})
    assert r.status_code == 400


def test_transfer_candidate_to_another_demand_keeps_history(client, make_user, app):
    hr_id, token = make_user("hr-transfer@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateDemandFlow, Job, PipelineStage, RecruitmentDemand

        source = Job(title="销售经理", jd_text="负责华东销售", owner_hr_id=hr_id)
        target = Job(title="渠道经理", jd_text="负责渠道拓展", owner_hr_id=hr_id)
        candidate = Candidate(name_masked="候选人转需", resume_json={}, owner_hr_id=hr_id)
        db.session.add_all([source, target, candidate])
        db.session.flush()
        source_demand = RecruitmentDemand(
            job_id=source.id,
            owner_hr_id=hr_id,
            request_no="REQ-TRANSFER-SOURCE",
            status="active",
        )
        target_demand = RecruitmentDemand(
            job_id=target.id,
            owner_hr_id=hr_id,
            request_no="REQ-TRANSFER-TARGET",
            status="active",
        )
        db.session.add_all([source_demand, target_demand])
        db.session.flush()
        candidate.current_demand_id = source_demand.id
        db.session.add(CandidateDemandFlow(
            candidate_id=candidate.id,
            demand_id=source_demand.id,
            owner_hr_id=hr_id,
            status="active",
        ))
        db.session.add(PipelineStage(
            candidate_id=candidate.id,
            job_id=source.id,
            demand_id=source_demand.id,
            stage="business_review",
            updated_by=hr_id,
            note="业务初筛",
        ))
        db.session.commit()
        source_demand_id = source_demand.id
        target_demand_id = target_demand.id
        candidate_id = candidate.id

    r = client.post("/api/pipeline/transfer", headers=_auth(token), json={
        "candidate_id": candidate_id,
        "from_demand_id": source_demand_id,
        "to_demand_id": target_demand_id,
        "reason": "更适合渠道岗位",
    })

    assert r.status_code == 200
    body = r.get_json()
    assert body["from_stage"] == "business_review"
    assert body["to_stage"] == "pending"

    source_board = client.get(f"/api/pipeline/demands/{source_demand_id}/board", headers=_auth(token)).get_json()
    target_board = client.get(f"/api/pipeline/demands/{target_demand_id}/board", headers=_auth(token)).get_json()
    assert source_board["candidates"][0]["stage"] == "transferred"
    assert "转入其他招聘需求" in source_board["candidates"][0]["note"]
    assert target_board["candidates"][0]["stage"] == "pending"
    assert "更适合渠道岗位" in target_board["candidates"][0]["note"]
