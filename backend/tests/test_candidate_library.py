def _auth(t): return {"Authorization": f"Bearer {t}"}


def test_candidate_library_list_includes_resume_summary_and_top_tags(client, make_user, app):
    uid, token = make_user("hr@x.com", role="recruiter")
    with app.app_context():
        from app import db
        from app.models import Candidate, CandidateTag

        candidate = Candidate(
            owner_hr_id=uid,
            name_masked="候选人A",
            email_masked="a@example.com",
            phone_masked="13800000000",
            resume_json={
                "extracted_info": {
                    "education": [
                        {"school": "复旦大学", "degree": "本科", "major": "计算机科学"}
                    ],
                    "experience": [
                        {"company": "某AI公司", "position": "NLP算法工程师", "duration": "2022-至今"}
                    ],
                }
            },
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add_all([
            CandidateTag(candidate_id=candidate.id, tag="Python", score=5),
            CandidateTag(candidate_id=candidate.id, tag="NLP", score=4),
            CandidateTag(candidate_id=candidate.id, tag="SQL", score=3),
        ])
        db.session.commit()

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
