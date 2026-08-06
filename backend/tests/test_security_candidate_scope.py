from app import db
from app.models import Candidate
from app.services.access_policy import visible_candidate_query


def test_unknown_role_cannot_see_candidate_library(app, make_user):
    unknown_id, _ = make_user(
        "unknown-scope@example.com",
        role="auditor",
        org_id=1,
    )
    with app.app_context():
        db.session.add(
            Candidate(org_id=1, name_masked="不应可见", resume_json={})
        )
        db.session.commit()
        assert visible_candidate_query(unknown_id, "auditor").count() == 0


def test_hr_director_explicitly_sees_same_org_candidates(app, make_user):
    director_id, _ = make_user(
        "director-scope@example.com",
        role="hr_director",
        org_id=1,
    )
    with app.app_context():
        db.session.add_all(
            [
                Candidate(
                    org_id=1,
                    name_masked="本组织候选人",
                    resume_json={},
                ),
                Candidate(
                    org_id=2,
                    name_masked="其他组织候选人",
                    resume_json={},
                ),
            ]
        )
        db.session.commit()
        names = {
            row.name_masked
            for row in visible_candidate_query(
                director_id,
                "hr_director",
            ).all()
        }
        assert names == {"本组织候选人"}
