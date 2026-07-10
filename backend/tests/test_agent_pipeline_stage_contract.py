from app import db
from app.models import Candidate, Interview, Job, PipelineStage
from app.services.agent_service import _tool_count_summary, _tool_get_pipeline, _write_move_pipeline


def test_agent_pipeline_query_uses_current_normalized_stage(app, make_user):
    owner_id, _ = make_user("agent-pipeline-owner@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="产品经理", jd_text="负责 AI 产品", owner_hr_id=owner_id)
        candidate_a = Candidate(owner_hr_id=owner_id, name_masked="候选人A", resume_json={})
        candidate_b = Candidate(owner_hr_id=owner_id, name_masked="候选人B", resume_json={})
        db.session.add_all([job, candidate_a, candidate_b])
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidate_a.id, job_id=job.id, stage="pending", updated_by=owner_id),
            PipelineStage(candidate_id=candidate_a.id, job_id=job.id, stage="interview_second", updated_by=owner_id),
            PipelineStage(candidate_id=candidate_b.id, job_id=job.id, stage="interview_first", updated_by=owner_id),
        ])
        db.session.commit()
        job_id = job.id

        result = _tool_get_pipeline(job_id, _user_id=owner_id, _role="recruiter")

    assert result["pipeline"] == {"interview": 2}


def test_agent_move_pipeline_normalizes_legacy_interview_stage(app, make_user):
    owner_id, _ = make_user("agent-pipeline-move@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="后端工程师", jd_text="负责服务端开发", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人C", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()

        result = _write_move_pipeline(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="interview_second",
            actor_id=owner_id,
            actor_role="recruiter",
        )

        latest = PipelineStage.query.filter_by(
            candidate_id=candidate.id,
            job_id=job.id,
        ).order_by(PipelineStage.id.desc()).first()

    assert result["status"] == "ok"
    assert result["stage"] == "interview"
    assert latest.stage == "interview"


def test_agent_count_summary_uses_current_normalized_stage(app, make_user):
    owner_id, _ = make_user("agent-summary-owner@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="增长产品经理", jd_text="负责增长", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人D", resume_json={})
        db.session.add_all([job, candidate])
        db.session.flush()
        db.session.add_all([
            PipelineStage(candidate_id=candidate.id, job_id=job.id, stage="pending", updated_by=owner_id),
            PipelineStage(candidate_id=candidate.id, job_id=job.id, stage="interview_final", updated_by=owner_id),
        ])
        db.session.commit()

        result = _tool_count_summary(_user_id=owner_id, _role="recruiter")

    assert result["stage_counts"] == {"interview": 1}


def test_agent_recruiter_summary_counts_only_interviews_in_visible_scope(app, make_user):
    owner_id, _ = make_user("agent-summary-visible@example.com", role="recruiter")
    other_id, _ = make_user("agent-summary-hidden@example.com", role="recruiter")

    with app.app_context():
        own_job = Job(title="自有岗位", jd_text="自有", owner_hr_id=owner_id)
        other_job = Job(title="他人岗位", jd_text="他人", owner_hr_id=other_id)
        own_candidate = Candidate(owner_hr_id=owner_id, name_masked="自有候选人", resume_json={})
        other_candidate = Candidate(owner_hr_id=other_id, name_masked="他人候选人", resume_json={})
        db.session.add_all([own_job, other_job, own_candidate, other_candidate])
        db.session.flush()
        db.session.add_all([
            Interview(candidate_id=own_candidate.id, job_id=own_job.id, qa_json=[]),
            Interview(candidate_id=other_candidate.id, job_id=other_job.id, qa_json=[]),
            Interview(candidate_id=own_candidate.id, job_id=other_job.id, qa_json=[]),
            Interview(candidate_id=other_candidate.id, job_id=own_job.id, qa_json=[]),
        ])
        db.session.commit()

        result = _tool_count_summary(_user_id=owner_id, _role="recruiter")

    assert result["candidate_count"] == 1
    assert result["job_count"] == 1
    assert result["interview_count"] == 1


def test_agent_manager_and_admin_summaries_keep_current_org_interview_total(app, make_user):
    manager_id, _ = make_user(
        "agent-summary-manager@example.com",
        role="manager",
        org_id=1,
    )
    admin_id, _ = make_user(
        "agent-summary-admin@example.com",
        role="admin",
        org_id=1,
    )
    org_1_owner_id, _ = make_user(
        "agent-summary-org-1@example.com",
        role="recruiter",
        org_id=1,
    )
    org_2_owner_id, _ = make_user(
        "agent-summary-org-2@example.com",
        role="recruiter",
        org_id=2,
    )

    with app.app_context():
        org_1_job = Job(org_id=1, title="组织一岗位", jd_text="组织一", owner_hr_id=org_1_owner_id)
        org_2_job = Job(org_id=2, title="组织二岗位", jd_text="组织二", owner_hr_id=org_2_owner_id)
        org_1_candidate = Candidate(
            org_id=1,
            owner_hr_id=org_1_owner_id,
            name_masked="组织一候选人",
            resume_json={},
        )
        org_2_candidate = Candidate(
            org_id=2,
            owner_hr_id=org_2_owner_id,
            name_masked="组织二候选人",
            resume_json={},
        )
        db.session.add_all([org_1_job, org_2_job, org_1_candidate, org_2_candidate])
        db.session.flush()
        db.session.add_all([
            Interview(
                org_id=1,
                candidate_id=org_1_candidate.id,
                job_id=org_1_job.id,
                qa_json=[],
            ),
            Interview(
                org_id=2,
                candidate_id=org_2_candidate.id,
                job_id=org_2_job.id,
                qa_json=[],
            ),
        ])
        db.session.commit()

        manager_result = _tool_count_summary(_user_id=manager_id, _role="manager")
        admin_result = _tool_count_summary(_user_id=admin_id, _role="admin")

    assert manager_result["interview_count"] == 1
    assert admin_result["interview_count"] == 1


def test_agent_move_pipeline_error_lists_public_stages(app, make_user):
    owner_id, _ = make_user("agent-pipeline-invalid@example.com", role="recruiter")

    with app.app_context():
        job = Job(title="测试岗位", jd_text="测试", owner_hr_id=owner_id)
        candidate = Candidate(owner_hr_id=owner_id, name_masked="候选人E", resume_json={})
        db.session.add_all([job, candidate])
        db.session.commit()

        result = _write_move_pipeline(
            candidate_id=candidate.id,
            job_id=job.id,
            stage="interview_third",
            actor_id=owner_id,
            actor_role="recruiter",
        )

    assert "无效阶段" in result["error"]
    assert "interview" in result["error"]
    assert "interview_first" not in result["error"]
    assert "interview_second" not in result["error"]
    assert "interview_final" not in result["error"]
