"""Compatibility facade for API modules importing access helpers."""

from ..services.access_policy import (
    active_candidate_query,
    actor_org_id,
    assigned_candidate_ids_for_interviewer,
    can_access_candidate,
    can_manage_job,
    can_read_job,
    interviewer_has_assignment,
    interviewer_has_business_review,
    job_is_active,
    same_org,
    visible_candidate_query,
    visible_job_query,
)

__all__ = [
    "active_candidate_query",
    "actor_org_id",
    "assigned_candidate_ids_for_interviewer",
    "can_access_candidate",
    "can_manage_job",
    "can_read_job",
    "interviewer_has_assignment",
    "interviewer_has_business_review",
    "job_is_active",
    "same_org",
    "visible_candidate_query",
    "visible_job_query",
]
