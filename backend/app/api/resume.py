from flask import Blueprint

from ..middleware.auth import require_auth, require_role
from ..middleware.rate_limit import rate_limit
from ..services.resumes.upload_service import handle_resume_upload


bp = Blueprint("resume", __name__)


@bp.post("/resume/upload")
@require_auth
@require_role("recruiter", "manager", "admin")
@rate_limit("resume.upload")
def upload():
    return handle_resume_upload()


from .resume_history import register_resume_history_routes
from .resume_upload_batches import register_resume_batch_routes

register_resume_batch_routes(bp)
register_resume_history_routes(bp)
