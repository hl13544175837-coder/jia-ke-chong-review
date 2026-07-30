import io

from app import db
from app.models import Candidate


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _upload(client, token, content, filename):
    return client.post(
        "/api/resume/upload",
        headers=_auth(token),
        data={"files": (io.BytesIO(content), filename)},
        content_type="multipart/form-data",
    )


def _fake_parser_with_profiles(profiles):
    calls = []

    def fake_parse_and_save(self, fpath, owner_hr_id, upload_batch_id=None):
        profile = profiles[len(calls)]
        calls.append(fpath)
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_hr_id,
            upload_batch_id=upload_batch_id,
            name_masked=profile["name"],
            phone_masked=profile.get("phone", ""),
            email_masked=profile.get("email", ""),
            resume_json={
                "extracted_info": {
                    "name": profile["name"],
                    "phone": profile.get("phone", ""),
                    "email": profile.get("email", ""),
                }
            },
            raw_file_path=fpath,
        )
        db.session.add(candidate)
        db.session.commit()
        return candidate

    return calls, fake_parse_and_save


def test_same_resume_content_with_a_different_filename_is_blocked_before_reparse(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("duplicate-file-owner@example.com", role="recruiter")
    calls, fake_parse = _fake_parser_with_profiles(
        [
            {"name": "文件重复候选人", "phone": "13800138000"},
            {"name": "文件重复候选人", "phone": "13800138000"},
        ]
    )
    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save", fake_parse
    )

    first = _upload(client, token, b"%PDF-1.4 identical resume", "first-name.pdf")
    second = _upload(client, token, b"%PDF-1.4 identical resume", "renamed.pdf")

    assert first.status_code == 202
    assert second.status_code == 202
    duplicate = second.get_json()["results"][0]
    assert duplicate == {
        "file": "renamed.pdf",
        "status": "duplicate",
        "reason": "导入失败：系统中已存在重复简历",
        "existing_candidate_id": first.get_json()["results"][0]["candidate_id"],
        "existing_candidate_name": "文件重复候选人",
        "match_basis": "文件内容一致",
    }
    assert len(calls) == 1
    with app.app_context():
        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 1


def test_same_full_phone_or_email_is_blocked_after_parse_without_overwriting_existing(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("duplicate-identity-owner@example.com", role="recruiter")
    calls, fake_parse = _fake_parser_with_profiles(
        [
            {"name": "身份重复候选人", "phone": "13800138001", "email": "same@example.com"},
            {"name": "身份重复候选人新版", "phone": "138 0013 8001", "email": "same@example.com"},
        ]
    )
    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save", fake_parse
    )

    first = _upload(client, token, b"%PDF-1.4 identity version one", "identity-v1.pdf")
    second = _upload(client, token, b"%PDF-1.4 identity version two", "identity-v2.pdf")

    assert first.status_code == 202
    duplicate = second.get_json()["results"][0]
    assert duplicate["status"] == "duplicate"
    assert duplicate["reason"] == "导入失败：系统中已存在重复简历"
    assert duplicate["existing_candidate_id"] == first.get_json()["results"][0]["candidate_id"]
    assert duplicate["existing_candidate_name"] == "身份重复候选人"
    assert duplicate["match_basis"] in {"手机号一致", "邮箱一致"}
    assert len(calls) == 2
    with app.app_context():
        candidates = Candidate.query.filter_by(owner_hr_id=owner_id).all()
        assert len(candidates) == 1
        assert candidates[0].name_masked == "身份重复候选人"


def test_same_name_without_matching_phone_or_email_is_not_blocked(
    client, make_user, app, monkeypatch
):
    owner_id, token = make_user("duplicate-name-owner@example.com", role="recruiter")
    calls, fake_parse = _fake_parser_with_profiles(
        [
            {"name": "同名候选人", "phone": "13800138002", "email": "first@example.com"},
            {"name": "同名候选人", "phone": "13800138003", "email": "second@example.com"},
        ]
    )
    monkeypatch.setattr(
        "app.services.resume_service.ResumeBatchService.parse_and_save", fake_parse
    )

    first = _upload(client, token, b"%PDF-1.4 same name first", "same-name-1.pdf")
    second = _upload(client, token, b"%PDF-1.4 same name second", "same-name-2.pdf")

    assert first.get_json()["results"][0]["status"] == "ok"
    assert second.get_json()["results"][0]["status"] == "ok"
    assert len(calls) == 2
    with app.app_context():
        assert Candidate.query.filter_by(owner_hr_id=owner_id).count() == 2
