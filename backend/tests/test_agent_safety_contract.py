from app import db
from app.models import Candidate, Job, PipelineStage
from app.services.agent_service import (
    WRITE_TOOLS,
    _build_decision_system_prompt,
    execute_write_tool,
)


def test_agent_exposes_matching_as_its_only_confirmed_write_capability():
    assert [tool["name"] for tool in WRITE_TOOLS] == ["run_match"]


def test_agent_prompt_forbids_recruiting_decisions_and_only_proposes_matching():
    prompt = _build_decision_system_prompt([])

    assert "仅可提议运行匹配" in prompt
    assert "Job 只是可复用的职位 / JD 模板" in prompt
    assert "不得按 job_id 混合多个 Demand" in prompt
    assert "不得创建招聘需求" in prompt
    assert "不得推进或淘汰候选人" in prompt
    assert "不得发放 Offer" in prompt
    assert "move_pipeline" not in prompt
    assert "create_job" not in prompt
    assert "start_interview" not in prompt


def test_removed_pipeline_write_tool_cannot_change_candidate_stage(app, make_user):
    owner_id, _ = make_user("agent-safety-owner@example.com", role="recruiter")

    with app.app_context():
        job = Job(
            org_id=1,
            title="AI 产品经理",
            jd_text="负责 AI 产品",
            owner_hr_id=owner_id,
        )
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            name_masked="候选人A",
            resume_json={},
        )
        db.session.add_all([job, candidate])
        db.session.commit()

        result = execute_write_tool(
            "move_pipeline",
            {
                "candidate_id": candidate.id,
                "job_id": job.id,
                "stage": "interview",
            },
            user_id=owner_id,
            role="recruiter",
        )

        assert result["ok"] is False
        assert "未知写工具" in result["error"]
        assert PipelineStage.query.count() == 0
