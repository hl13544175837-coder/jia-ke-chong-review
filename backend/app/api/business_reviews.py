from flask import Blueprint, g, jsonify, request

from .. import db
from ..middleware.auth import require_auth, require_role
from ..services.business_review_service import (
    BusinessReviewError,
    business_review_payload,
    create_business_review,
    decide_business_review,
    get_business_review,
    list_business_reviews,
    reassign_business_review,
    remind_business_review,
)


bp = Blueprint("business_reviews", __name__)


def _error_response(error):
    db.session.rollback()
    return jsonify(error.as_payload()), error.status_code


def _positive_int(data, field):
    value = data.get(field)
    if isinstance(value, bool):
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized > 0 else None


@bp.post("/business-reviews")
@require_auth
@require_role("recruiter", "manager", "admin")
def create_review_task():
    data = request.get_json(silent=True) or {}
    demand_id = _positive_int(data, "demand_id")
    candidate_id = _positive_int(data, "candidate_id")
    reviewer_id = _positive_int(data, "reviewer_id")
    if not all((demand_id, candidate_id, reviewer_id)):
        return jsonify(
            {
                "error": "demand_id、candidate_id、reviewer_id 必须是正整数",
                "code": "invalid_business_review_input",
            }
        ), 400
    try:
        task, deduplicated = create_business_review(
            g.org_id,
            demand_id,
            candidate_id,
            reviewer_id,
            g.user_id,
            data.get("hr_note"),
            data.get("due_at"),
        )
        payload = business_review_payload(task)
    except BusinessReviewError as error:
        return _error_response(error)
    payload["deduplicated"] = deduplicated
    return jsonify(payload), 200 if deduplicated else 201


@bp.get("/business-reviews")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_review_tasks():
    try:
        tasks = list_business_reviews(
            g.org_id,
            g.user_id,
            g.role,
            request.args.get("status") or None,
        )
        payload = [business_review_payload(task) for task in tasks]
    except BusinessReviewError as error:
        return _error_response(error)
    return jsonify(payload)


@bp.get("/business-reviews/mine")
@require_auth
@require_role("interviewer", "manager", "admin")
def list_my_review_tasks():
    try:
        tasks = list_business_reviews(
            g.org_id,
            g.user_id,
            g.role,
            request.args.get("status") or None,
        )
        if g.role in {"manager", "admin"}:
            tasks = [task for task in tasks if task.reviewer_id == g.user_id]
        payload = [business_review_payload(task) for task in tasks]
    except BusinessReviewError as error:
        return _error_response(error)
    return jsonify(payload)


@bp.get("/business-reviews/<int:task_id>")
@require_auth
def get_review_task(task_id):
    try:
        task = get_business_review(g.org_id, task_id, g.user_id, g.role)
        payload = business_review_payload(task)
    except BusinessReviewError as error:
        return _error_response(error)
    return jsonify(payload)


@bp.patch("/business-reviews/<int:task_id>/reviewer")
@require_auth
@require_role("recruiter", "manager", "admin")
def reassign_review_task(task_id):
    reviewer_id = _positive_int(
        request.get_json(silent=True) or {}, "reviewer_id"
    )
    if reviewer_id is None:
        return jsonify(
            {
                "error": "reviewer_id 必须是正整数",
                "code": "invalid_business_reviewer",
            }
        ), 400
    try:
        task, unchanged = reassign_business_review(
            g.org_id, task_id, g.user_id, reviewer_id
        )
        payload = business_review_payload(task)
    except BusinessReviewError as error:
        return _error_response(error)
    payload["unchanged"] = unchanged
    return jsonify(payload)


@bp.post("/business-reviews/<int:task_id>/remind")
@require_auth
@require_role("recruiter", "manager", "admin")
def remind_review_task(task_id):
    try:
        task, deduplicated = remind_business_review(
            g.org_id, task_id, g.user_id
        )
        payload = business_review_payload(task)
    except BusinessReviewError as error:
        return _error_response(error)
    payload["deduplicated"] = deduplicated
    return jsonify(payload)


@bp.post("/business-reviews/<int:task_id>/decision")
@require_auth
@require_role("interviewer", "manager", "admin")
def decide_review_task(task_id):
    data = request.get_json(silent=True) or {}
    try:
        task = decide_business_review(
            g.org_id,
            task_id,
            g.user_id,
            data.get("decision"),
            data.get("note"),
        )
        payload = business_review_payload(task)
    except BusinessReviewError as error:
        return _error_response(error)
    return jsonify(payload)
