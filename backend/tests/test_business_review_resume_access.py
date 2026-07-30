from app import db
from app.models import Candidate, CandidateDemandFlow, Job, PipelineStage, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_resume_review(app, owner_id, raw_file_path):
    with app.app_context():
        job = Job(
            org_id=1,
            title="Resume Access Role",
            jd_text="Review the assigned resume",
            status="active",
        )
        db.session.add(job)
        db.session.flush()
        demand_values = {
            "org_id": 1,
            "job_id": job.id,
            "owner_hr_id": owner_id,
            "request_no": "REQ-BUSINESS-RESUME-ACCESS",
            "status": "active",
            "job_title_snapshot": job.title,
            "jd_text_snapshot": job.jd_text,
        }
        if hasattr(RecruitmentDemand, "approval_status"):
            demand_values["approval_status"] = "approved"
        demand = RecruitmentDemand(**demand_values)
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="Private Resume Candidate",
            resume_json={"skills": ["Python"], "summary": "Private profile"},
            raw_file_path=str(raw_file_path),
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add_all(
            [
                CandidateDemandFlow(
                    org_id=1,
                    candidate_id=candidate.id,
                    demand_id=demand.id,
                    owner_hr_id=owner_id,
                    status="active",
                ),
                PipelineStage(
                    org_id=1,
                    candidate_id=candidate.id,
                    job_id=job.id,
                    demand_id=demand.id,
                    stage="ai_screen",
                    updated_by=owner_id,
                ),
            ]
        )
        db.session.commit()
        return {
            "job_id": job.id,
            "demand_id": demand.id,
            "candidate_id": candidate.id,
        }


def _create_task(client, owner_token, case, reviewer_id):
    response = client.post(
        "/api/business-reviews",
        headers=_auth(owner_token),
        json={
            "demand_id": case["demand_id"],
            "candidate_id": case["candidate_id"],
            "reviewer_id": reviewer_id,
            "hr_note": "Read the original resume before deciding",
        },
    )
    assert response.status_code == 201
    return response.get_json()


def test_assigned_reviewer_can_view_preview_and_download_resume_only(
    client, make_user, app, tmp_path
):
    owner_id, owner_token = make_user(
        "resume-review-owner@example.com", role="recruiter"
    )
    reviewer_id, reviewer_token = make_user(
        "resume-assigned-reviewer@example.com", role="interviewer"
    )
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    original = upload_root / "private-server-filename.pdf"
    original.write_bytes(b"%PDF-1.4\nassigned business review")
    app.config["UPLOAD_FOLDER"] = str(upload_root)
    case = _seed_resume_review(app, owner_id, original)

    task = _create_task(client, owner_token, case, reviewer_id)
    task_detail = client.get(
        f"/api/business-reviews/{task['id']}", headers=_auth(reviewer_token)
    )
    journey = client.get(
        f"/api/candidates/{case['candidate_id']}/journey?demand_id={case['demand_id']}",
        headers=_auth(reviewer_token),
    )
    resume = client.get(
        f"/api/resume/{case['candidate_id']}", headers=_auth(reviewer_token)
    )
    preview = client.get(
        f"/api/resume/{case['candidate_id']}/original/preview",
        headers=_auth(reviewer_token),
    )
    download = client.get(
        f"/api/resume/{case['candidate_id']}/original/download",
        headers=_auth(reviewer_token),
    )

    assert task_detail.status_code == 200
    assert journey.status_code == 200
    original_metadata = task_detail.get_json()["candidate"]["original_resume"]
    assert original_metadata == {
        "available": True,
        "filename": f"candidate-{case['candidate_id']}-resume.pdf",
        "mime_type": "application/pdf",
        "preview_url": f"/api/resume/{case['candidate_id']}/original/preview",
        "download_url": f"/api/resume/{case['candidate_id']}/original/download",
    }
    assert str(tmp_path) not in str(task_detail.get_json())
    assert "private-server-filename" not in str(task_detail.get_json())
    assert resume.status_code == 200
    assert resume.get_json()["resume_json"]["skills"] == ["Python"]
    assert preview.status_code == 200
    assert preview.data == b"%PDF-1.4\nassigned business review"
    assert "inline" in preview.headers["Content-Disposition"]
    assert download.status_code == 200
    assert download.data == preview.data
    assert "attachment" in download.headers["Content-Disposition"]

    write_responses = [
        client.patch(
            f"/api/resume/{case['candidate_id']}/profile",
            headers=_auth(reviewer_token),
            json={"profile": {"summary": "Changed"}},
        ),
        client.post(
            f"/api/resume/{case['candidate_id']}/retry-parse",
            headers=_auth(reviewer_token),
        ),
        client.get(
            f"/api/candidates/{case['candidate_id']}/export",
            headers=_auth(reviewer_token),
        ),
        client.delete(
            f"/api/candidates/{case['candidate_id']}",
            headers=_auth(reviewer_token),
            json={"reason": "Must stay read only"},
        ),
        client.post(
            f"/api/pipeline/demands/{case['demand_id']}/move",
            headers=_auth(reviewer_token),
            json={"candidate_id": case["candidate_id"], "stage": "interview"},
        ),
    ]
    assert [response.status_code for response in write_responses] == [403] * 5
    with app.app_context():
        candidate = db.session.get(Candidate, case["candidate_id"])
        assert candidate.deleted_at is None
        assert candidate.resume_json["summary"] == "Private profile"


def test_unrelated_reviewer_cannot_read_task_or_any_resume_representation(
    client, make_user, app, tmp_path
):
    owner_id, owner_token = make_user(
        "resume-scope-owner@example.com", role="recruiter"
    )
    reviewer_id, _ = make_user(
        "resume-scope-assigned@example.com", role="interviewer"
    )
    _, unrelated_token = make_user(
        "resume-scope-unrelated@example.com", role="interviewer"
    )
    upload_root = tmp_path / "uploads"
    upload_root.mkdir()
    original = upload_root / "resume.pdf"
    original.write_bytes(b"%PDF-1.4\nprivate")
    app.config["UPLOAD_FOLDER"] = str(upload_root)
    case = _seed_resume_review(app, owner_id, original)
    task = _create_task(client, owner_token, case, reviewer_id)

    responses = [
        client.get(
            f"/api/business-reviews/{task['id']}", headers=_auth(unrelated_token)
        ),
        client.get(
            f"/api/resume/{case['candidate_id']}", headers=_auth(unrelated_token)
        ),
        client.get(
            f"/api/resume/{case['candidate_id']}/original/preview",
            headers=_auth(unrelated_token),
        ),
        client.get(
            f"/api/resume/{case['candidate_id']}/original/download",
            headers=_auth(unrelated_token),
        ),
        client.get(
            f"/api/candidates/{case['candidate_id']}/journey?demand_id={case['demand_id']}",
            headers=_auth(unrelated_token),
        ),
    ]

    assert [response.status_code for response in responses] == [403] * 5
    assert all(response.data != b"%PDF-1.4\nprivate" for response in responses)
