"""Durable-enough in-app dispatcher for long-running resume model calls.

The HTTP upload path persists a ``pending`` candidate and returns immediately.
Gunicorn workers on the same pod poll those rows, atomically claim one, and run
the model outside the gateway request lifecycle. Node-scoped markers prevent a
rolling-deployment pod from claiming another pod's local upload file.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime
from time import monotonic, sleep

from flask import g

from .. import db
from ..middleware.events import record_event
from ..models import Candidate, UploadBatch, User
from ..time_utils import utc_now
from .pipeline_service import PipelineServiceError, move_candidate
from .resume_service import ResumeBatchService, resume_parse_node_id


_logger = logging.getLogger(__name__)
_start_lock = threading.Lock()
_started_pid: int | None = None


def _claim_next_candidate() -> int | None:
    node_id = resume_parse_node_id()
    candidate_id = (
        db.session.query(Candidate.id)
        .filter(
            Candidate.parse_status == "pending",
            Candidate.parse_error == f"queued:{node_id}",
            Candidate.raw_file_path.isnot(None),
            Candidate.deleted_at.is_(None),
        )
        .order_by(Candidate.id.asc())
        .limit(1)
        .scalar()
    )
    if candidate_id is None:
        return None

    changed = (
        Candidate.query.filter(
            Candidate.id == candidate_id,
            Candidate.parse_status == "pending",
        )
        .update(
            {
                Candidate.parse_status: "processing",
                Candidate.parse_error: (
                    f"worker:{node_id}:{utc_now().isoformat()}"
                ),
            },
            synchronize_session=False,
        )
    )
    db.session.commit()
    return candidate_id if changed == 1 else None


def recover_stale_processing(app, *, max_age_seconds: int = 600) -> int:
    """Requeue work abandoned by a terminated pod without duplicating live work."""
    recovered = 0
    now = utc_now()
    with app.app_context():
        rows = Candidate.query.filter(
            Candidate.parse_status == "processing",
            Candidate.parse_error.like(f"worker:{resume_parse_node_id()}:%"),
            Candidate.deleted_at.is_(None),
        ).all()
        for candidate in rows:
            marker = str(candidate.parse_error or "")
            try:
                started_at = datetime.fromisoformat(marker.split(":", 2)[2])
            except (IndexError, ValueError):
                continue
            if (now - started_at).total_seconds() < max_age_seconds:
                continue
            candidate.parse_status = "pending"
            candidate.parse_error = f"queued:{resume_parse_node_id()}"
            recovered += 1
        if recovered:
            db.session.commit()
            app.logger.warning("恢复超时的简历后台任务: count=%s", recovered)
        return recovered


def _attach_actor(candidate: Candidate) -> None:
    user = db.session.get(User, candidate.owner_hr_id) if candidate.owner_hr_id else None
    g.user_id = candidate.owner_hr_id
    g.org_id = candidate.org_id or 1
    g.role = user.role if user else "recruiter"
    g.audit_source = "resume_parse_worker"


def _join_target_pipeline(candidate: Candidate) -> None:
    if not candidate.upload_batch_id:
        return
    batch = db.session.get(UploadBatch, candidate.upload_batch_id)
    if batch is None or not batch.demand_id:
        return
    try:
        move_candidate(
            candidate_id=candidate.id,
            demand_id=batch.demand_id,
            org_id=candidate.org_id or 1,
            actor_id=candidate.owner_hr_id,
            stage="pending",
            note="后台解析完成后进入待筛选",
        )
    except PipelineServiceError as error:
        record_event(
            "resume.pipeline_join_failed",
            entity_id=candidate.id,
            entity_type="candidate",
            demand_id=batch.demand_id,
            result="failure",
            failure_reason=error.message,
            payload={"code": error.code},
        )


def process_next_pending(app) -> bool:
    """Claim and process one pending candidate. Return whether work was found."""
    with app.app_context():
        candidate_id = _claim_next_candidate()
        if candidate_id is None:
            return False

        candidate = db.session.get(Candidate, candidate_id)
        if candidate is None:
            return True
        _attach_actor(candidate)

        try:
            candidate = ResumeBatchService().reparse_candidate(candidate)
            _join_target_pipeline(candidate)
            record_event(
                "resume.parse_completed",
                entity_id=candidate.id,
                entity_type="candidate",
                payload={"parse_status": candidate.parse_status},
            )
            _logger.info("后台简历解析完成: candidate_id=%s", candidate.id)
        except Exception as error:  # noqa: BLE001 - service persists actionable failure state
            db.session.rollback()
            failed = db.session.get(Candidate, candidate_id)
            if failed is not None:
                _attach_actor(failed)
                record_event(
                    "resume.parse_failed",
                    entity_id=failed.id,
                    entity_type="candidate",
                    result="failure",
                    failure_reason=str(error)[:240],
                    payload={"reason": str(error)[:500]},
                )
            _logger.exception("后台简历解析失败: candidate_id=%s", candidate_id)
        return True


def _worker_loop(app) -> None:
    last_recovery = 0.0
    while True:
        try:
            if monotonic() - last_recovery >= 30:
                recover_stale_processing(app)
                last_recovery = monotonic()
            found = process_next_pending(app)
        except Exception:  # noqa: BLE001 - keep dispatcher alive across transient DB errors
            _logger.exception("简历解析任务轮询失败")
            found = False
        if not found:
            sleep(1)


def start_resume_parse_worker(app) -> bool:
    """Start one daemon dispatcher per OS process."""
    global _started_pid
    current_pid = os.getpid()
    with _start_lock:
        if _started_pid == current_pid:
            return False
        thread = threading.Thread(
            target=_worker_loop,
            args=(app,),
            name="resume-parse-worker",
            daemon=True,
        )
        thread.start()
        _started_pid = current_pid
        app.logger.info("简历后台解析任务已启动: pid=%s", current_pid)
        return True
