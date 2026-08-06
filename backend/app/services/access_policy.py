"""Shared organization and role access policy for API and domain services."""

from .. import db
from .. import models as models_module
from ..models import Candidate, InterviewAssignment, Job, User
from .interview_workflow_service import active_assignment_filter


def actor_org_id(user_id):
    user = db.session.get(User, user_id)
    return (user.org_id if user else None) or 1


def same_org(obj, org_id):
    return obj is not None and (
        (getattr(obj, "org_id", None) or 1) == (org_id or 1)
    )


def active_candidate_query():
    return Candidate.query.filter(Candidate.deleted_at.is_(None))


def assigned_candidate_ids_for_interviewer(user_id):
    org_id = actor_org_id(user_id)
    rows = (
        db.session.query(InterviewAssignment.candidate_id)
        .filter_by(interviewer_id=user_id, org_id=org_id)
        .filter(active_assignment_filter())
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def interviewer_has_assignment(
    user_id,
    candidate_id,
    job_id=None,
    round_name=None,
):
    org_id = actor_org_id(user_id)
    query = InterviewAssignment.query.filter_by(
        interviewer_id=user_id,
        candidate_id=candidate_id,
        org_id=org_id,
    ).filter(active_assignment_filter())
    if job_id is not None:
        query = query.filter_by(job_id=job_id)
    if round_name:
        query = query.filter_by(round=round_name)
    return query.first() is not None


def interviewer_has_business_review(user_id, candidate_id):
    task_model = getattr(models_module, "BusinessReviewTask", None)
    if task_model is None:
        return False
    org_id = actor_org_id(user_id)
    return task_model.query.filter_by(
        org_id=org_id,
        reviewer_id=user_id,
        candidate_id=candidate_id,
    ).first() is not None


def visible_candidate_query(user_id, role):
    org_id = actor_org_id(user_id)
    query = active_candidate_query().filter(Candidate.org_id == org_id)
    if role in {"admin", "manager", "hr_director"}:
        return query
    if role == "recruiter":
        return query.filter(
            db.or_(
                Candidate.owner_hr_id == user_id,
                Candidate.owner_hr_id.is_(None),
            )
        )
    if role == "interviewer":
        assigned_ids = assigned_candidate_ids_for_interviewer(user_id)
        return query.filter(Candidate.id.in_(assigned_ids or [-1]))
    return query.filter(db.false())


def visible_job_query(user_id, role):
    org_id = actor_org_id(user_id)
    query = Job.query.filter(Job.org_id == org_id)
    if role == "recruiter":
        return query.filter(
            db.or_(Job.owner_hr_id == user_id, Job.owner_hr_id.is_(None))
        )
    if role == "interviewer":
        return query.filter(Job.status == "active")
    if role in ("manager", "admin"):
        return query
    return query.filter(Job.id < 0)


def can_read_job(user_id, role, job):
    if job is None or not same_org(job, actor_org_id(user_id)):
        return False
    return (
        visible_job_query(user_id, role).filter(Job.id == job.id).first()
        is not None
    )


def can_access_candidate(
    user_id,
    role,
    candidate_id,
    job_id=None,
    round_name=None,
):
    org_id = actor_org_id(user_id)
    candidate = active_candidate_query().filter(
        Candidate.id == candidate_id,
        Candidate.org_id == org_id,
    ).first()
    if candidate is None:
        return False
    if job_id is not None:
        job = db.session.get(Job, job_id)
        if not same_org(job, org_id):
            return False
        if role == "recruiter" and not can_manage_job(user_id, role, job):
            return False
    if role in ("manager", "admin"):
        return True
    if role == "recruiter":
        return candidate.owner_hr_id in (user_id, None)
    if role == "interviewer":
        return (
            interviewer_has_assignment(
                user_id,
                candidate_id,
                job_id,
                round_name,
            )
            or interviewer_has_business_review(user_id, candidate_id)
        )
    return False


def can_manage_job(user_id, role, job):
    if job is None or not same_org(job, actor_org_id(user_id)):
        return False
    if role in ("manager", "admin"):
        return True
    return role == "recruiter" and (
        job.owner_hr_id == user_id or job.owner_hr_id is None
    )


def job_is_active(job):
    return (job.status or "active") == "active"
