import csv
import io
import json

from flask import Response, current_app, jsonify, request, g
from runtime_paths import DEFAULT_UPLOAD_FOLDER, RuntimePathError, resolve_stored_upload_path

from .. import db
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from ..models import Candidate, CandidateDemandFlow, CandidateResumeVersion, User
from ..services.candidate_library_read_service import export_count_for_actor
from ..services.csv_security import safe_csv_cell
from ..time_utils import utc_now
from .access import can_access_candidate, same_org


def register_candidate_admin_routes(bp):
    @bp.patch("/candidates/<int:candidate_id>/owner")
    @require_auth
    @require_role("manager", "admin")
    def reassign_owner(candidate_id):
        data = request.get_json(silent=True) or {}
        new_owner = data.get("owner_hr_id")
        reason = str(data.get("reason") or "").strip()[:240]
        if not new_owner:
            return jsonify({"error": "owner_hr_id required"}), 400
        if not reason:
            return jsonify({"error": "转派原因必填"}), 400
        candidate = db.session.get(Candidate, candidate_id)
        if (
            candidate is None
            or not same_org(candidate, g.org_id)
            or candidate.deleted_at is not None
        ):
            return jsonify({"error": "候选人不存在"}), 404
        active_flow = (
            CandidateDemandFlow.query.filter_by(
                org_id=g.org_id,
                candidate_id=candidate_id,
                status="active",
            )
            .order_by(CandidateDemandFlow.id.asc())
            .first()
        )
        managed_demand_id = candidate.current_demand_id or (
            active_flow.demand_id if active_flow is not None else None
        )
        if managed_demand_id is not None:
            return jsonify({
                "error": "进行中候选人的负责人跟随招聘需求，请在需求详情中转派",
                "code": "owner_managed_by_demand",
                "demand_id": managed_demand_id,
            }), 409
        target = db.session.get(User, new_owner)
        if target is None or not same_org(target, g.org_id):
            return jsonify({"error": "目标用户不存在"}), 404
        if target.role != "recruiter" or not target.is_active:
            return jsonify({"error": "候选人负责人必须是启用中的招聘专员"}), 400
        old_owner = candidate.owner_hr_id
        candidate.owner_hr_id = new_owner
        db.session.commit()
        record_event(
            "candidate.reassigned",
            entity_id=candidate_id,
            entity_type="candidate",
            payload={"from": old_owner, "to": new_owner, "reason": reason},
        )
        return jsonify({
            "candidate_id": candidate_id,
            "owner_hr_id": new_owner,
            "reason": reason,
        })

    @bp.get("/candidates/<int:candidate_id>/export")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def export_candidate(candidate_id):
        candidate = db.session.get(Candidate, candidate_id)
        if (
            candidate is None
            or not same_org(candidate, g.org_id)
            or candidate.deleted_at is not None
        ):
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "candidate_id",
            "name",
            "email",
            "phone",
            "owner_hr_id",
            "created_at",
            "resume_json",
        ])
        writer.writerow([
            candidate.id,
            safe_csv_cell(candidate.name_masked or ""),
            safe_csv_cell(candidate.email_masked or ""),
            safe_csv_cell(candidate.phone_masked or ""),
            candidate.owner_hr_id or "",
            safe_csv_cell(
                candidate.created_at.isoformat()
                if candidate.created_at
                else ""
            ),
            safe_csv_cell(
                json.dumps(candidate.resume_json or {}, ensure_ascii=False)
            ),
        ])

        export_count_10m = export_count_for_actor(
            org_id=g.org_id,
            user_id=g.user_id,
        ) + 1
        record_event(
            "candidate.exported",
            entity_id=candidate.id,
            entity_type="candidate",
            payload={"format": "csv", "export_count_10m": export_count_10m},
            severity="warning" if export_count_10m >= 6 else "info",
        )
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=candidate-{candidate.id}.csv"
            },
        )

    @bp.delete("/candidates/<int:candidate_id>")
    @require_auth
    @require_role("recruiter", "manager", "admin")
    def delete_candidate(candidate_id):
        data = request.get_json(silent=True) or {}
        reason = str(data.get("reason") or "").strip()[:240]
        if not reason:
            return jsonify({"error": "删除原因必填"}), 400
        candidate = db.session.get(Candidate, candidate_id)
        if (
            candidate is None
            or not same_org(candidate, g.org_id)
            or candidate.deleted_at is not None
        ):
            return jsonify({"error": "候选人不存在"}), 404
        if not can_access_candidate(g.user_id, g.role, candidate_id):
            return jsonify({"error": "Forbidden"}), 403

        raw_file_removed = False
        raw_path = candidate.raw_file_path
        if raw_path:
            try:
                path = resolve_stored_upload_path(
                    raw_path,
                    current_app.config.get("UPLOAD_FOLDER") or DEFAULT_UPLOAD_FOLDER,
                )
                if path.is_file():
                    path.unlink()
                    raw_file_removed = True
            except (OSError, RuntimePathError):
                raw_file_removed = False

        candidate.name_masked = "已删除候选人"
        candidate.email_masked = ""
        candidate.phone_masked = ""
        candidate.resume_json = {}
        candidate.raw_file_path = None
        candidate.raw_file_name = None
        candidate.raw_file_data = None
        candidate.parse_error = None
        candidate.deleted_at = utc_now()
        candidate.deleted_by = g.user_id
        candidate.anonymized_at = utc_now()
        for tag in candidate.tags:
            tag.tag = "已删除"
            tag.score = None
            tag.org_id = g.org_id
        for version in CandidateResumeVersion.query.filter_by(
            org_id=g.org_id,
            candidate_id=candidate.id,
        ).all():
            version.raw_file_path = None
            version.raw_file_name = None
            version.raw_file_data = None
        db.session.commit()
        record_event(
            "candidate.deleted",
            entity_id=candidate_id,
            entity_type="candidate",
            payload={
                "reason": reason,
                "anonymized": True,
                "raw_file_removed": raw_file_removed,
            },
        )
        return jsonify({
            "candidate_id": candidate_id,
            "deleted": True,
            "anonymized": True,
        })
