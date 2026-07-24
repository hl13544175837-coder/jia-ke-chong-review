import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job(app, *, org_id, owner_hr_id, title, status="active"):
    with app.app_context():
        from app import db
        from app.models import Job

        job = Job(
            org_id=org_id,
            owner_hr_id=owner_hr_id,
            title=title,
            jd_text=f"{title} JD",
            jd_structured={"focus_points": [f"{title} focus"]},
            status=status,
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def test_interviewer_reads_only_same_org_active_job_templates(client, make_user, app):
    owner_id, _ = make_user(
        "business-template-owner@example.com", role="recruiter", org_id=1
    )
    foreign_owner_id, _ = make_user(
        "business-template-foreign-owner@example.com", role="recruiter", org_id=2
    )
    _, token = make_user(
        "business-template-reader@example.com", role="interviewer", org_id=1
    )
    active_job_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title="同组织在招岗位",
    )
    closed_job_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title="同组织停用岗位",
        status="closed",
    )
    foreign_job_id = _seed_job(
        app,
        org_id=2,
        owner_hr_id=foreign_owner_id,
        title="其他组织在招岗位",
    )

    listed = client.get("/api/jobs?status=all", headers=_auth(token))
    closed_list = client.get("/api/jobs?status=closed", headers=_auth(token))
    active_detail = client.get(f"/api/jobs/{active_job_id}", headers=_auth(token))
    closed_detail = client.get(f"/api/jobs/{closed_job_id}", headers=_auth(token))
    foreign_detail = client.get(f"/api/jobs/{foreign_job_id}", headers=_auth(token))

    assert listed.status_code == 200
    assert {item["id"] for item in listed.get_json()} == {active_job_id}
    assert closed_list.status_code == 200
    assert closed_list.get_json() == []
    assert active_detail.status_code == 200
    assert active_detail.get_json()["jd_text"] == "同组织在招岗位 JD"
    assert closed_detail.status_code == 403
    assert foreign_detail.status_code == 404


def test_interviewer_cannot_create_modify_close_restore_or_delete_templates(
    client, make_user, app
):
    owner_id, _ = make_user(
        "business-template-write-owner@example.com", role="recruiter", org_id=1
    )
    _, token = make_user(
        "business-template-write-denied@example.com", role="interviewer", org_id=1
    )
    active_job_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title="不可修改的在招岗位",
    )
    closed_job_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title="不可恢复的停用岗位",
        status="closed",
    )

    created = client.post(
        "/api/jobs",
        headers=_auth(token),
        json={"title": "越权新建", "jd_text": "不应保存"},
    )
    updated = client.put(
        f"/api/jobs/{active_job_id}",
        headers=_auth(token),
        json={"title": "越权修改"},
    )
    closed = client.post(f"/api/jobs/{active_job_id}/close", headers=_auth(token))
    restored = client.post(f"/api/jobs/{closed_job_id}/restore", headers=_auth(token))
    deleted = client.delete(f"/api/jobs/{active_job_id}", headers=_auth(token))

    assert created.status_code == 403
    assert updated.status_code == 403
    assert closed.status_code == 403
    assert restored.status_code == 403
    assert deleted.status_code == 405

    with app.app_context():
        from app import db
        from app.models import Job

        assert Job.query.count() == 2
        assert db.session.get(Job, active_job_id).title == "不可修改的在招岗位"
        assert db.session.get(Job, active_job_id).status == "active"
        assert db.session.get(Job, closed_job_id).status == "closed"


def test_recruiter_job_template_access_remains_owner_scoped(client, make_user, app):
    owner_id, token = make_user(
        "template-recruiter-owner@example.com", role="recruiter", org_id=1
    )
    other_owner_id, _ = make_user(
        "template-recruiter-other@example.com", role="recruiter", org_id=1
    )
    foreign_owner_id, _ = make_user(
        "template-recruiter-foreign@example.com", role="recruiter", org_id=2
    )
    own_active_id = _seed_job(
        app, org_id=1, owner_hr_id=owner_id, title="招聘专员自有在招"
    )
    own_closed_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title="招聘专员自有停用",
        status="closed",
    )
    other_id = _seed_job(
        app, org_id=1, owner_hr_id=other_owner_id, title="同组织他人岗位"
    )
    foreign_id = _seed_job(
        app, org_id=2, owner_hr_id=foreign_owner_id, title="其他组织岗位"
    )

    listed = client.get("/api/jobs?status=all", headers=_auth(token))

    assert listed.status_code == 200
    assert {item["id"] for item in listed.get_json()} == {
        own_active_id,
        own_closed_id,
    }
    assert client.get(f"/api/jobs/{own_closed_id}", headers=_auth(token)).status_code == 200
    assert client.get(f"/api/jobs/{other_id}", headers=_auth(token)).status_code == 403
    assert client.get(f"/api/jobs/{foreign_id}", headers=_auth(token)).status_code == 404


@pytest.mark.parametrize("role", ["manager", "admin"])
def test_manager_and_admin_job_template_access_remains_org_wide(
    role, client, make_user, app
):
    owner_id, _ = make_user(
        f"template-{role}-owner@example.com", role="recruiter", org_id=1
    )
    foreign_owner_id, _ = make_user(
        f"template-{role}-foreign-owner@example.com", role="recruiter", org_id=2
    )
    _, token = make_user(
        f"template-{role}-reader@example.com", role=role, org_id=1
    )
    active_id = _seed_job(
        app, org_id=1, owner_hr_id=owner_id, title=f"{role} 在招岗位"
    )
    closed_id = _seed_job(
        app,
        org_id=1,
        owner_hr_id=owner_id,
        title=f"{role} 停用岗位",
        status="closed",
    )
    foreign_id = _seed_job(
        app, org_id=2, owner_hr_id=foreign_owner_id, title=f"{role} 其他组织岗位"
    )

    listed = client.get("/api/jobs?status=all", headers=_auth(token))
    updated = client.put(
        f"/api/jobs/{active_id}",
        headers=_auth(token),
        json={"title": f"{role} 可管理岗位"},
    )

    assert listed.status_code == 200
    assert {item["id"] for item in listed.get_json()} == {active_id, closed_id}
    assert client.get(f"/api/jobs/{closed_id}", headers=_auth(token)).status_code == 200
    assert client.get(f"/api/jobs/{foreign_id}", headers=_auth(token)).status_code == 404
    assert updated.status_code == 200
    assert updated.get_json()["title"] == f"{role} 可管理岗位"
