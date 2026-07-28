from datetime import UTC, datetime, timedelta

from app import db
from app import models


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_notifications_are_user_scoped_and_require_auth(app, client, make_user):
    assert hasattr(models, "Notification"), "Notification model should exist"
    Notification = models.Notification

    user_id, user_token = make_user("notify-user@example.com", role="recruiter")
    other_id, _ = make_user("notify-other@example.com", role="manager")

    with app.app_context():
        db.session.add_all([
            Notification(
                user_id=user_id,
                type="stage_change",
                title="候选人进入一面",
                body="张三已进入一面",
                link="/pipeline",
                is_read=False,
                created_at=datetime.now(UTC).replace(tzinfo=None),
            ),
            Notification(
                user_id=user_id,
                type="feedback_added",
                title="面试反馈已提交",
                is_read=True,
                created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5),
            ),
            Notification(
                user_id=other_id,
                type="candidate_uploaded",
                title="别人账号的通知",
                is_read=False,
                created_at=datetime.now(UTC).replace(tzinfo=None),
            ),
        ])
        db.session.commit()

    missing_auth = client.get("/api/notifications")
    assert missing_auth.status_code == 401

    response = client.get("/api/notifications", headers=_auth(user_token))
    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 2
    assert body["unread_count"] == 1
    assert [item["title"] for item in body["notifications"]] == [
        "候选人进入一面",
        "面试反馈已提交",
    ]


def test_mark_notifications_read_only_updates_current_user(app, client, make_user):
    assert hasattr(models, "Notification"), "Notification model should exist"
    Notification = models.Notification

    user_id, user_token = make_user("notify-mark@example.com", role="recruiter")
    other_id, _ = make_user("notify-mark-other@example.com", role="manager")

    with app.app_context():
        own = Notification(user_id=user_id, type="stage_change", title="自己的通知")
        other = Notification(user_id=other_id, type="stage_change", title="别人的通知")
        db.session.add_all([own, other])
        db.session.commit()
        own_id = own.id
        other_id_value = other.id

    response = client.post(
        "/api/notifications/mark-read",
        headers=_auth(user_token),
        json={"ids": [own_id, other_id_value]},
    )
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"

    with app.app_context():
        assert db.session.get(Notification, own_id).is_read is True
        assert db.session.get(Notification, other_id_value).is_read is False

    count_response = client.get("/api/notifications/unread-count", headers=_auth(user_token))
    assert count_response.status_code == 200
    assert count_response.get_json()["unread_count"] == 0


def test_active_notification_scope_excludes_closed_demand_from_badge_but_keeps_history(
    app, client, make_user
):
    Notification = models.Notification
    user_id, user_token = make_user("notify-active-scope@example.com", role="recruiter")

    with app.app_context():
        active_job = models.Job(org_id=1, title="在招岗位", department="技术部", jd_text="JD")
        closed_job = models.Job(org_id=1, title="已关闭岗位", department="技术部", jd_text="JD")
        db.session.add_all([active_job, closed_job])
        db.session.flush()
        active_demand = models.RecruitmentDemand(
            org_id=1,
            job_id=active_job.id,
            owner_hr_id=user_id,
            request_no="NOTIFY-ACTIVE-001",
            department="技术部",
            job_title_snapshot="在招岗位",
            headcount=1,
            status="active",
            approval_status="approved",
        )
        closed_demand = models.RecruitmentDemand(
            org_id=1,
            job_id=closed_job.id,
            owner_hr_id=user_id,
            request_no="NOTIFY-CLOSED-001",
            department="技术部",
            job_title_snapshot="已关闭岗位",
            headcount=1,
            status="closed",
            approval_status="approved",
        )
        db.session.add_all([active_demand, closed_demand])
        db.session.flush()
        db.session.add_all([
            Notification(org_id=1, user_id=user_id, demand_id=active_demand.id, type="business_review", title="在招待办"),
            Notification(org_id=1, user_id=user_id, demand_id=closed_demand.id, type="business_review", title="关闭待办"),
            Notification(org_id=1, user_id=user_id, demand_id=None, type="system", title="系统通知"),
        ])
        db.session.commit()

    history = client.get("/api/notifications", headers=_auth(user_token))
    assert history.status_code == 200
    assert history.get_json()["total"] == 3

    active = client.get("/api/notifications?active_only=1", headers=_auth(user_token))
    assert active.status_code == 200
    assert {item["title"] for item in active.get_json()["notifications"]} == {"在招待办", "系统通知"}
    assert active.get_json()["unread_count"] == 2

    active_count = client.get("/api/notifications/unread-count?active_only=1", headers=_auth(user_token))
    assert active_count.status_code == 200
    assert active_count.get_json()["unread_count"] == 2
