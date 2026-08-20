import pytest

from app import db
from app.models import (
    BusinessReviewTask,
    Candidate,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    OfferEvent,
    OfferRecord,
    RecruitmentDemand,
    User,
)
from scripts.add_sit_acceptance_data import (
    ACCEPTANCE_CANDIDATE_PREFIX,
    ACCEPTANCE_DEMAND_PREFIX,
    ACCEPTANCE_JOB_CODE,
    apply_acceptance_data,
    ensure_sit_allowed,
    inspect_acceptance_data,
)


TRACKED_MODELS = (
    Job,
    RecruitmentDemand,
    Candidate,
    BusinessReviewTask,
    InterviewAssignment,
    InterviewFeedback,
    OfferRecord,
    OfferEvent,
)


def _counts():
    return {model.__tablename__: model.query.count() for model in TRACKED_MODELS}


def _seed_actors():
    recruiter = User(
        org_id=1,
        name="验收账号·招聘专员",
        email="100002@gateway.local",
        role="recruiter",
        password_hash="!gateway-managed",
        is_active=True,
    )
    interviewer = User(
        org_id=1,
        name="验收账号·面试官01",
        email="100003@gateway.local",
        role="interviewer",
        password_hash="!gateway-managed",
        is_active=True,
    )
    db.session.add_all([recruiter, interviewer])
    db.session.flush()
    sentinel = Candidate(
        org_id=1,
        owner_hr_id=recruiter.id,
        name_masked="普通候选人-不得修改",
        email_masked="ordinary@example.com",
        phone_masked="138****0000",
        resume_json={"source": "ordinary"},
        parse_status="ok",
    )
    db.session.add(sentinel)
    db.session.commit()
    return sentinel.id


def _allow_sit(app, monkeypatch):
    app.config["ALLOW_INSECURE_SIT_STARTUP"] = True
    monkeypatch.setenv("BUILD_CHANNEL", "RC")


def test_preview_is_read_only(app, monkeypatch):
    with app.app_context():
        _allow_sit(app, monkeypatch)
        sentinel_id = _seed_actors()
        before = _counts()

        preview = inspect_acceptance_data()

        assert preview["existing"]["jobs"] == 0
        assert _counts() == before
        assert db.session.get(Candidate, sentinel_id).resume_json == {"source": "ordinary"}


@pytest.mark.parametrize(
    ("channel", "allow_sit"),
    [("GA", True), ("RC", False), ("local", True)],
)
def test_apply_refuses_non_sit_environment(app, monkeypatch, channel, allow_sit):
    with app.app_context():
        app.config["ALLOW_INSECURE_SIT_STARTUP"] = allow_sit
        monkeypatch.setenv("BUILD_CHANNEL", channel)
        _seed_actors()

        with pytest.raises(RuntimeError, match="只允许写入 RC/SIT"):
            ensure_sit_allowed()


def test_apply_is_idempotent_and_preserves_unmarked_rows(app, monkeypatch):
    with app.app_context():
        _allow_sit(app, monkeypatch)
        sentinel_id = _seed_actors()

        first = apply_acceptance_data()
        first_counts = _counts()
        second = apply_acceptance_data()
        second_counts = _counts()

        assert first["created"] > 0
        assert second["created"] == 0
        assert second_counts == first_counts
        assert Job.query.filter_by(job_code=ACCEPTANCE_JOB_CODE).count() == 1
        assert RecruitmentDemand.query.filter(
            RecruitmentDemand.request_no.like(f"{ACCEPTANCE_DEMAND_PREFIX}%")
        ).count() == 2
        assert Candidate.query.filter(
            Candidate.name_masked.like(f"{ACCEPTANCE_CANDIDATE_PREFIX}%")
        ).count() >= 9
        assert BusinessReviewTask.query.count() >= 2
        assert InterviewAssignment.query.count() >= 3
        assert InterviewFeedback.query.count() >= 1
        assert OfferRecord.query.count() >= 5
        assert db.session.get(Candidate, sentinel_id).resume_json == {"source": "ordinary"}


def test_admin_endpoint_adds_acceptance_data_idempotently(
    app, client, make_user, monkeypatch
):
    make_user(
        "100002@gateway.local", role="recruiter", name="验收账号·招聘专员"
    )
    make_user(
        "100003@gateway.local", role="interviewer", name="验收账号·面试官01"
    )
    _, admin_token = make_user(
        "sit-admin@example.com", role="admin", name="验收管理员"
    )
    monkeypatch.setenv("BUILD_CHANNEL", "RC")
    app.config["ALLOW_INSECURE_SIT_STARTUP"] = True

    headers = {"Authorization": f"Bearer {admin_token}"}
    first = client.post("/api/admin/sit-acceptance-data", headers=headers)
    second = client.post("/api/admin/sit-acceptance-data", headers=headers)

    assert first.status_code == 200
    assert first.get_json()["created"] > 0
    assert second.status_code == 200
    assert second.get_json()["created"] == 0


def test_admin_endpoint_refuses_recruiter(app, client, make_user):
    _, recruiter_token = make_user(
        "endpoint-recruiter@example.com", role="recruiter"
    )

    response = client.post(
        "/api/admin/sit-acceptance-data",
        headers={"Authorization": f"Bearer {recruiter_token}"},
    )

    assert response.status_code == 403
