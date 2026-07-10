from app import db
from app.models import Candidate, Job, PipelineStage, RecruitmentDemand
from app.services.agent_service import _tool_count_summary, _tool_get_pipeline, execute_write_tool


def test_agent_pipeline_query_uses_current_normalized_stage(app, make_user):
    owner_id, _ = make_user("agent-pipeline-owner@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="产品经理", jd_text="负责 AI 产品", owner_hr_id=owner_id)
        candidate_a = Candidate(owner_hr_id=owner_id, name_masked="候选人A", resume_json={})
        candidate_b = Candidate(owner_hr_id=owner_id, name_masked="候选人B", resume_json={})
        db.session.add_all([job, candidate_a, candidate_b])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-AGENT-PIPE",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate_a.current_demand_id = demand.id
        candidate_b.current_demand_id = demand.id
        db.session.add_all([
            PipelineStage(candidate_id=candidate_a.id, demand_id=demand.id, job_id=job.id, stage="pending", updated_by=owner_id),
            PipelineStage(candidate_id=candidate_a.id, demand_id=demand.id, job_id=job.id, stage="interview_second", updated_by=owner_id),
            PipelineStage(candidate_id=candidate_b.id, demand_id=demand.id, job_id=job.id, stage="interview_first", updated_by=owner_id),
        ])
        db.session.commit()
        job_id = job.id
        demand_id = demand.id

        result = _tool_get_pipeline(
            demand_id=demand_id,
            _user_id=owner_id,
            _role="recruiter",
        )

    assert result["demand_id"] == demand_id
    assert result["job_id"] == job_id
    assert result["pipeline"] == {"interview": 2}


def test_agent_pipeline_query_does_not_guess_between_sibling_demands(app, make_user):
    owner_id, _ = make_user("agent-pipeline-ambiguous@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="产品经理", jd_text="负责 AI 产品", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        db.session.add_all([
            RecruitmentDemand(job_id=job.id, owner_hr_id=owner_id, request_no="REQ-A"),
            RecruitmentDemand(job_id=job.id, owner_hr_id=owner_id, request_no="REQ-B"),
        ])
        db.session.commit()

        result = _tool_get_pipeline(
            job_id=job.id,
            _user_id=owner_id,
            _role="recruiter",
        )

    assert result["code"] == "demand_id_required"


def test_agent_cannot_move_pipeline_even_with_a_legacy_interview_stage(app, make_user):
    owner_id, _ = make_user("agent-pipeline-move@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="后端工程师", jd_text="负责服务端开发", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人C", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()

        result = execute_write_tool(
            "move_pipeline",
            {
                "candidate_id": candidate.id,
                "job_id": job.id,
                "stage": "interview_second",
            },
            user_id=owner_id,
            role="recruiter",
        )

        latest = PipelineStage.query.filter_by(
            candidate_id=candidate.id,
            job_id=job.id,
        ).order_by(PipelineStage.id.desc()).first()

    assert result["ok"] is False
    assert "未知写工具" in result["error"]
    assert latest is None


def test_agent_count_summary_uses_current_normalized_stage(app, make_user):
    owner_id, _ = make_user("agent-summary-owner@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="增长产品经理", jd_text="负责增长", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人D", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        demand = RecruitmentDemand(
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-AGENT-SUMMARY",
            status="active",
        )
        db.session.add(demand)
        db.session.flush()
        candidate.current_demand_id = demand.id
        db.session.add_all([
            PipelineStage(candidate_id=candidate.id, demand_id=demand.id, job_id=job.id, stage="pending", updated_by=owner_id),
            PipelineStage(candidate_id=candidate.id, demand_id=demand.id, job_id=job.id, stage="interview_final", updated_by=owner_id),
        ])
        db.session.commit()

        result = _tool_count_summary(_user_id=owner_id, _role="recruiter")

    assert result["stage_counts"] == {"interview": 1}


def test_agent_move_pipeline_is_not_a_registered_tool(app, make_user):
    owner_id, _ = make_user("agent-pipeline-invalid@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="测试岗位", jd_text="测试", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人E", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()

        result = execute_write_tool(
            "move_pipeline",
            {
                "candidate_id": candidate.id,
                "job_id": job.id,
                "stage": "interview_third",
            },
            user_id=owner_id,
            role="recruiter",
        )

    assert result["ok"] is False
    assert "未知写工具" in result["error"]
