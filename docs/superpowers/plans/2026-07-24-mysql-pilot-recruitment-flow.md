# MySQL Pilot Recruitment Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the isolated 5190 product to the company test MySQL and deliver the approved business-demand, HR-review, business-screening, resume, and editable interview-feedback pilot flow.

**Architecture:** Keep the React 5190 UI as the only product entry, route all business reads and writes through the existing Flask API, and use SQLAlchemy/Alembic for additive MySQL changes. Reuse the existing Demand, candidate, original-resume, assignment, notification, event, and idempotency foundations; add only demand approval facts and an explicit business-review task aggregate.

**Tech Stack:** React 19, TypeScript, Vite, Flask 3.1, SQLAlchemy 2.0, Alembic 1.16, PyMySQL 1.1, pytest, Node source-contract tests, Tabbit.

---

## File Map

### Backend data and API

- Modify `backend/app/models.py`: add demand approval fields, `BusinessReviewTask`, and feedback edit metadata.
- Create `backend/migrations/versions/20260724_08_pilot_recruitment_flow.py`: additive schema revision.
- Modify `backend/scripts/verify_demand_scope.py`: require revision 08 and its schema contract.
- Create `backend/scripts/audit_mysql_pilot_schema.py`: read-only, secret-safe schema audit.
- Create `backend/scripts/prepare_mysql_pilot.py`: explicit backup, migration, and post-migration verification command.
- Modify `backend/scripts/backup_pilot_data.py`: support the available MySQL client path without printing credentials; abort on backup failure.
- Modify `backend/app/services/demand_context_service.py`: business-owner visibility and edit rules.
- Modify `backend/app/services/demand_service.py`: business-created pending demands and approval payloads.
- Create `backend/app/services/demand_approval_service.py`: approve, reject, and resubmit state changes.
- Modify `backend/app/api/demands.py`: expose business demand and HR approval endpoints.
- Create `backend/app/services/business_review_service.py`: task creation, listing, decisions, and payloads.
- Create `backend/app/api/business_reviews.py`: HR and business review routes.
- Modify `backend/app/__init__.py`: register the business-review blueprint.
- Modify `backend/app/api/access.py`: allow assigned reviewers to read only their candidates.
- Modify `backend/app/api/interview.py`: simple feedback fields and audited feedback editing.

### Isolated runtime

- Modify `scripts/start-isolated-demo.sh`: accept an explicit pilot database URL without changing the default SQLite mode.
- Create `scripts/prepare-mysql-pilot.sh`: load the ignored local environment and run backup/audit/migration.
- Create `scripts/serve-mysql-pilot.sh`: start this isolated project against MySQL.
- Create `scripts/check-mysql-pilot.sh`: confirm ports, backend database readiness, and schema revision without printing secrets.
- Modify `.gitignore`: explicitly ignore the isolated runtime credential file and generated pilot manifests.

### 5190 frontend

- Modify `readdy-frontend/src/lib/api.ts`: support JSON, multipart, and authenticated Blob responses.
- Create `readdy-frontend/src/features/jobs/api.ts`: job-template reads.
- Modify `readdy-frontend/src/features/demands/types.ts`: approval fields and business-create input.
- Modify `readdy-frontend/src/features/demands/api.ts`: approve, reject, and resubmit methods.
- Create `readdy-frontend/src/features/businessReviews/types.ts`: task and decision contracts.
- Create `readdy-frontend/src/features/businessReviews/api.ts`: list, push, decide, and resume Blob calls.
- Create `readdy-frontend/src/features/interviews/types.ts`: assignment and simple-feedback contracts.
- Create `readdy-frontend/src/features/interviews/api.ts`: assignment list and feedback save/update calls.
- Create `readdy-frontend/src/features/candidates/types.ts`: candidate, upload, and resume contracts.
- Create `readdy-frontend/src/features/candidates/api.ts`: candidate list/detail, upload, and HR push calls.
- Create `readdy-frontend/src/features/pipeline/types.ts`: Demand board and move contracts.
- Create `readdy-frontend/src/features/pipeline/api.ts`: real board, history, and HR move calls.
- Create `readdy-frontend/src/features/offers/types.ts`: Offer lifecycle contracts.
- Create `readdy-frontend/src/features/offers/api.ts`: Offer list, save, and transition calls.
- Rewrite `readdy-frontend/src/pages/interviewer/jobs/page.tsx`: real template/demand submission and status list.
- Modify `readdy-frontend/src/pages/jobs/page.tsx`: HR approval actions.
- Modify `readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx`: review state and approve/reject controls.
- Modify `readdy-frontend/src/pages/candidates/page.tsx`: real HR candidate list, upload, resume detail, and business push.
- Modify `readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx`: real reviewer, HR note, and deadline payload.
- Rewrite `readdy-frontend/src/pages/interviewer/screening/page.tsx`: real task list and detail.
- Modify `readdy-frontend/src/pages/interviewer/dashboard/components/ReviewActionModal.tsx`: real task type and three fixed outcomes.
- Create `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`: JD, structured resume, and original file controls.
- Create `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`: satisfaction and note editor.
- Modify `readdy-frontend/src/pages/interviewer/interviews/page.tsx`: real assignments and editable feedback.
- Rewrite `readdy-frontend/src/pages/kanban/page.tsx`: real Demand board and HR-controlled stage movement.
- Rewrite `readdy-frontend/src/pages/offers/page.tsx`: real Offer lifecycle.
- Modify `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`: real Demand/candidate IDs.
- Modify `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`: real status actions and history.
- Modify `readdy-frontend/src/pages/offers/components/OfferTable.tsx`: real Offer rows.

### Tests and handoff

- Create `backend/tests/test_pilot_recruitment_schema.py`.
- Create `backend/tests/test_mysql_pilot_preparation.py`.
- Create `backend/tests/test_demand_approval.py`.
- Create `backend/tests/test_business_reviews.py`.
- Create `backend/tests/test_business_review_resume_access.py`.
- Create `backend/tests/test_interview_feedback_editing.py`.
- Create `frontend/tests/readdy_mysql_pilot_contract.test.mjs`.
- Modify `docs/PRODUCT_INTERACTION_GUIDE.md`, `docs/ISOLATED_CLEANUP.md`, and `docs/13_试点业务流程与研发接口交接.md` after verified behavior exists.

## Task 1: Add the Pilot Schema Contract

**Files:**
- Create: `backend/tests/test_pilot_recruitment_schema.py`
- Modify: `backend/app/models.py`
- Create: `backend/migrations/versions/20260724_08_pilot_recruitment_flow.py`
- Modify: `backend/scripts/verify_demand_scope.py`

- [ ] **Step 1: Write the failing ORM/schema test**

```python
from sqlalchemy import inspect

from app import db
from app.models import BusinessReviewTask, InterviewFeedback, RecruitmentDemand


def test_pilot_schema_contains_review_workflow(app):
    with app.app_context():
        inspector = inspect(db.engine)
        demand_columns = {item["name"] for item in inspector.get_columns("recruitment_demands")}
        feedback_columns = {item["name"] for item in inspector.get_columns("interview_feedback")}
        task_columns = {item["name"] for item in inspector.get_columns("business_review_tasks")}

    assert {
        "approval_status", "submitted_at", "reviewed_by", "reviewed_at", "review_reason"
    }.issubset(demand_columns)
    assert {"updated_by", "updated_at"}.issubset(feedback_columns)
    assert {
        "org_id", "demand_id", "candidate_id", "reviewer_id", "status",
        "pending_slot", "hr_note", "business_note", "due_at", "created_by",
        "decided_by", "decided_at", "created_at", "updated_at",
    }.issubset(task_columns)
    assert RecruitmentDemand.approval_status.default is not None
    assert BusinessReviewTask.__tablename__ == "business_review_tasks"
    assert InterviewFeedback.updated_at is not None
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `./.venv/bin/python -m pytest backend/tests/test_pilot_recruitment_schema.py -q`

Expected: collection or assertion failure because `BusinessReviewTask` and the new columns do not exist.

- [ ] **Step 3: Add the minimal ORM fields and task model**

Use these exact state values:

```python
class RecruitmentDemand(db.Model):
    approval_status = db.Column(db.String(20), default="approved", nullable=False)
    submitted_at = db.Column(db.DateTime)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at = db.Column(db.DateTime)
    review_reason = db.Column(db.Text)


class BusinessReviewTask(db.Model):
    __tablename__ = "business_review_tasks"
    __table_args__ = (
        db.Index("ix_business_reviews_org_reviewer_status", "org_id", "reviewer_id", "status"),
        db.Index("ix_business_reviews_org_demand_candidate", "org_id", "demand_id", "candidate_id"),
        db.Index(
            "uq_business_reviews_pending_slot",
            "org_id", "demand_id", "candidate_id", "pending_slot",
            unique=True,
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, default=1, nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id", ondelete="RESTRICT"), nullable=False)
    reviewer_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status = db.Column(db.String(20), default="pending", nullable=False)
    pending_slot = db.Column(db.Integer, default=1)
    hr_note = db.Column(db.Text)
    business_note = db.Column(db.Text)
    due_at = db.Column(db.DateTime)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    decided_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    decided_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class InterviewFeedback(db.Model):
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)
```

The unique pending-slot index relies on MySQL allowing multiple `NULL` values: pending rows use `1`; completed rows set it to `NULL`.

- [ ] **Step 4: Add additive Alembic revision 08**

The migration must inspect before every add, use server default `approved` for existing demands, create `business_review_tasks` only when absent, and validate same-name objects before skipping them. Its revision header is:

```python
revision = "20260724_08"
down_revision = "20260722_07"
branch_labels = None
depends_on = None
```

Do not drop or rename any object in `upgrade()` or `downgrade()`. `downgrade()` must raise a clear `RuntimeError` explaining that an online destructive downgrade is intentionally unsupported.

- [ ] **Step 5: Extend the verifier to revision 08**

Set `EXPECTED_REVISION = "20260724_08"`, add the new columns/table/indexes, and keep all revision 01-07 checks. The verifier must report errors such as `missing_table:business_review_tasks` without printing the database URL.

- [ ] **Step 6: Run the focused schema tests and existing migration tests**

Run:

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_pilot_recruitment_schema.py \
  backend/tests/test_schema_lifecycle.py \
  backend/tests/test_schema_compatibility.py \
  backend/tests/test_demand_scope_migration.py \
  -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit only the backend schema files**

```bash
git add backend/app/models.py backend/migrations/versions/20260724_08_pilot_recruitment_flow.py backend/scripts/verify_demand_scope.py backend/tests/test_pilot_recruitment_schema.py
git diff --cached --check
git commit -m "feat: add pilot recruitment workflow schema"
```

Do not push.

## Task 2: Build Secret-Safe MySQL Preparation

**Files:**
- Create: `backend/tests/test_mysql_pilot_preparation.py`
- Create: `backend/scripts/audit_mysql_pilot_schema.py`
- Create: `backend/scripts/prepare_mysql_pilot.py`
- Modify: `backend/scripts/backup_pilot_data.py`
- Modify: `scripts/start-isolated-demo.sh`
- Create: `scripts/prepare-mysql-pilot.sh`
- Create: `scripts/serve-mysql-pilot.sh`
- Create: `scripts/check-mysql-pilot.sh`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing preparation tests**

Test these exact behaviors with a temporary SQLite schema and monkeypatched subprocess/database calls:

```python
import pytest

from scripts import audit_mysql_pilot_schema, prepare_mysql_pilot


def test_audit_redacts_database_credentials(monkeypatch, capsys):
    secret = "must-not-appear"
    monkeypatch.setenv("DATABASE_URL", f"mysql+pymysql://pilot:{secret}@db.invalid/pilot")
    report = {"ok": False, "missing": ["recruitment_demands.default_interviewer_id"]}
    print(audit_mysql_pilot_schema.safe_report(report))
    assert secret not in capsys.readouterr().out


def test_prepare_refuses_apply_without_successful_backup(monkeypatch):
    monkeypatch.setattr(prepare_mysql_pilot, "create_backup", lambda: (_ for _ in ()).throw(SystemExit("backup failed")))
    with pytest.raises(SystemExit, match="backup failed"):
        prepare_mysql_pilot.prepare(apply=True)


def test_prepare_dry_run_never_calls_migration(monkeypatch):
    called = []
    monkeypatch.setattr(prepare_mysql_pilot, "run_migrations", lambda: called.append(True))
    prepare_mysql_pilot.prepare(apply=False)
    assert called == []
```

- [ ] **Step 2: Run and verify RED**

Run: `./.venv/bin/python -m pytest backend/tests/test_mysql_pilot_preparation.py -q`

Expected: import failure because the preparation modules do not exist.

- [ ] **Step 3: Implement the read-only schema audit**

The audit accepts only `DATABASE_URL` from the environment, uses SQLAlchemy inspection, reports table/column/index/revision states, and exposes two CLI modes:

```text
python backend/scripts/audit_mysql_pilot_schema.py --json
python backend/scripts/audit_mysql_pilot_schema.py --require-compatible
```

Exit `0` when compatible, `2` when additive repair is required, and `3` when an existing definition conflicts. Output may contain dialect, database name, revision, counts, and object names; it must omit username, password, host, and full URL.

- [ ] **Step 4: Implement explicit prepare sequencing**

`prepare_mysql_pilot.py` performs this exact order:

```python
def prepare(*, apply: bool) -> int:
    before = audit_database()
    reject_conflicts(before)
    if not apply:
        print_safe_summary(before)
        return 0
    snapshot = create_backup()
    require_complete_snapshot(snapshot)
    run_alembic_upgrade("20260724_08")
    after = audit_database()
    require_head_and_schema(after, "20260724_08")
    print_safe_summary(after)
    return 0
```

No `--apply` means read-only. `--apply` is the only path allowed to invoke backup and Alembic.

- [ ] **Step 5: Make MySQL backup fail closed**

Keep the existing `mysqldump --single-transaction --routines --triggers` path. Add `--protocol=TCP` and select the Homebrew binary with `shutil.which("mysqldump")`. If the installed client cannot connect, abort before migration; do not silently fall back to an untested partial export. The snapshot directory and incomplete SQL file must be removed or marked incomplete.

- [ ] **Step 6: Add an isolated MySQL runtime mode**

`scripts/start-isolated-demo.sh` keeps SQLite as default and reads these optional variables:

```bash
DATABASE_URL_VALUE="${PILOT_DATABASE_URL:-sqlite:///$DATABASE_PATH}"
LOCAL_SCHEMA_COMPAT_VALUE=true
if [[ "$DATABASE_URL_VALUE" == mysql* ]]; then
  LOCAL_SCHEMA_COMPAT_VALUE=false
fi
```

It must skip `seed_dev.py` for MySQL and refuse MySQL startup unless the calling wrapper sets the transient `PILOT_SCHEMA_VERIFIED=true` value. `scripts/serve-mysql-pilot.sh` sets that value only after `audit_mysql_pilot_schema.py --require-compatible` succeeds in the same process. The value is not written into the credential file.

`scripts/prepare-mysql-pilot.sh` and `scripts/serve-mysql-pilot.sh` load only:

```text
../runtime/mysql-pilot.env
```

The file is outside `app`, must have mode `600`, and contains runtime values such as `PILOT_DATABASE_URL`, `JWT_SECRET`, `UPLOAD_FOLDER`, and `BACKUP_DIR`. Scripts must never echo these values.

MySQL pilot mode sets `VITE_ENABLE_ROLE_PREVIEW=false`. Role acceptance must use the real seven test accounts through the local OAuth bridge; changing only the frontend preview role is not valid evidence because it does not change the backend token.

- [ ] **Step 7: Verify preparation tests and shell syntax**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_mysql_pilot_preparation.py -q
bash -n scripts/start-isolated-demo.sh scripts/prepare-mysql-pilot.sh scripts/serve-mysql-pilot.sh scripts/check-mysql-pilot.sh
```

Expected: tests pass and `bash -n` exits `0`.

- [ ] **Step 8: Commit preparation code without the local environment file**

```bash
git add .gitignore backend/scripts/audit_mysql_pilot_schema.py backend/scripts/prepare_mysql_pilot.py backend/scripts/backup_pilot_data.py backend/tests/test_mysql_pilot_preparation.py scripts/start-isolated-demo.sh scripts/prepare-mysql-pilot.sh scripts/serve-mysql-pilot.sh scripts/check-mysql-pilot.sh
git diff --cached --check
git commit -m "feat: add safe mysql pilot preparation"
```

Confirm `git status --short` does not list `runtime/mysql-pilot.env`.

## Task 3: Implement Business Demand Submission and HR Review

**Files:**
- Create: `backend/tests/test_demand_approval.py`
- Modify: `backend/app/services/demand_context_service.py`
- Modify: `backend/app/services/demand_service.py`
- Create: `backend/app/services/demand_approval_service.py`
- Modify: `backend/app/api/demands.py`
- Modify: `backend/app/api/candidates.py`

- [ ] **Step 1: Write failing API tests**

Cover these independent behaviors:

```python
from app import db
from app.models import Event, Job


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_job(app):
    with app.app_context():
        job = Job(
            org_id=1,
            title="产品经理",
            city="上海",
            department="业务部",
            jd_text="负责产品规划和跨部门协作",
            status="active",
        )
        db.session.add(job)
        db.session.commit()
        return job.id


def _create_business_demand(client, app, interviewer_token, hr_id):
    response = client.post("/api/demands", headers=_auth(interviewer_token), json={
        "job_id": _seed_job(app),
        "owner_hr_id": hr_id,
        "city": "上海",
        "requester_department": "业务部",
        "hiring_manager_name": "业务负责人",
        "requested_at": "2026-07-24",
        "target_date": "2026-08-31",
        "headcount": 1,
        "status": "active",
    })
    assert response.status_code == 201
    return response.get_json()


def test_interviewer_submits_pending_demand(client, make_user, app):
    interviewer_id, token = make_user("business@example.com", role="interviewer")
    hr_id, _ = make_user("owner@example.com", role="recruiter")
    body = _create_business_demand(client, app, token, hr_id)
    assert body["status"] == "pending"
    assert body["approval_status"] == "pending"
    assert body["created_by"] == interviewer_id


def test_reject_requires_reason(client, make_user, app):
    _, interviewer_token = make_user("business-reject@example.com", role="interviewer")
    hr_id, token = make_user("reviewer@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)
    response = client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(token), json={"reason": ""},
    )
    assert response.status_code == 400
    assert response.get_json()["fields"]["reason"]


def test_creator_resubmits_rejected_demand_and_history_is_audited(client, make_user, app):
    creator_id, interviewer_token = make_user(
        "business-resubmit@example.com", role="interviewer"
    )
    hr_id, hr_token = make_user("hr-resubmit@example.com", role="recruiter")
    demand = _create_business_demand(client, app, interviewer_token, hr_id)

    rejected = client.post(
        f"/api/demands/{demand['id']}/reject",
        headers=_auth(hr_token),
        json={"reason": "请补充 HC 依据"},
    )
    assert rejected.status_code == 200
    assert rejected.get_json()["approval_status"] == "rejected"

    resubmitted = client.post(
        f"/api/demands/{demand['id']}/resubmit",
        headers=_auth(interviewer_token),
        json={"headcount": 2, "note": "已补充业务量说明"},
    )
    assert resubmitted.status_code == 200
    assert resubmitted.get_json()["approval_status"] == "pending"
    assert resubmitted.get_json()["review_reason"] == ""
    assert resubmitted.get_json()["created_by"] == creator_id

    with app.app_context():
        event = Event.query.filter_by(
            action="demand.resubmitted", entity_id=demand["id"]
        ).one()
        assert event.actor_id == creator_id
```

- [ ] **Step 2: Run and verify RED**

Run: `./.venv/bin/python -m pytest backend/tests/test_demand_approval.py -q`

Expected: interviewer receives 403 and approval endpoints return 404.

- [ ] **Step 3: Add business-owner visibility**

Implement these rules in `demand_context_service.py`:

```python
from sqlalchemy import or_


if role == "interviewer":
    return query.filter(
        or_(
            RecruitmentDemand.created_by == user_id,
            RecruitmentDemand.default_interviewer_id == user_id,
        )
    )
```

An interviewer can manage only a demand they created while its approval status is `pending` or `rejected`; recruiter/manager/admin behavior remains unchanged.

- [ ] **Step 4: Force business submissions into review**

In `validate_create_input` and `create_demand_from_input`:

- interviewer payloads always become `status="pending"` and `approval_status="pending"` regardless of requested status;
- `default_interviewer_id` defaults to the current interviewer;
- HR-created active demands default to `approval_status="approved"` for backward compatibility;
- `submitted_at=utc_now()` for business submissions;
- `owner_hr_id` remains a valid active recruiter selected from the existing owner options.

Allow interviewer read access to active job templates and recruiter owner options, but do not allow interviewers to create or edit `Job` templates.

- [ ] **Step 5: Implement approval service transactions**

`demand_approval_service.py` must lock the demand and expose:

```python
approve_demand(demand_id, actor_id, org_id)
reject_demand(demand_id, actor_id, org_id, reason)
resubmit_demand(demand_id, actor_id, org_id, changes)
```

Every function updates the demand and writes its `Event` in the same transaction. Invalid state returns a typed conflict mapped to HTTP 409. Reject requires a non-empty reason up to 1000 characters. Resubmit is limited to the original creator and uses the existing editable-field validation before clearing the latest review fields.

- [ ] **Step 6: Add routes and payload fields**

Register:

```text
POST /api/demands/<id>/approve   recruiter, manager, admin
POST /api/demands/<id>/reject    recruiter, manager, admin
POST /api/demands/<id>/resubmit  original interviewer creator
```

Add `approval_status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_reason`, and `created_by` to `demand_payload()`.

- [ ] **Step 7: Run approval and regression tests**

Run:

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_demand_approval.py \
  backend/tests/test_demand_management.py \
  backend/tests/test_demand_scope_permissions.py \
  backend/tests/test_demand_default_interviewer.py \
  -q
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit the demand-review slice**

```bash
git add backend/app/services/demand_context_service.py backend/app/services/demand_service.py backend/app/services/demand_approval_service.py backend/app/api/demands.py backend/app/api/candidates.py backend/tests/test_demand_approval.py
git diff --cached --check
git commit -m "feat: add business demand approval flow"
```

## Task 4: Implement Business Screening Tasks and Resume Access

**Files:**
- Create: `backend/tests/test_business_reviews.py`
- Create: `backend/tests/test_business_review_resume_access.py`
- Create: `backend/app/services/business_review_service.py`
- Create: `backend/app/api/business_reviews.py`
- Modify: `backend/app/__init__.py`
- Modify: `backend/app/api/access.py`

- [ ] **Step 1: Write failing business-review tests**

Test HR creation, reviewer-only visibility, the three decisions, required reasons, and no automatic stage advancement:

```python
import pytest

from app import db
from app.models import Candidate, CandidateDemandFlow, Job, PipelineStage, RecruitmentDemand


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_review_case(app, owner_id):
    with app.app_context():
        job = Job(org_id=1, title="数据分析师", jd_text="负责经营数据分析", status="active")
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-BUSINESS-REVIEW",
            status="active",
            approval_status="approved",
            job_title_snapshot=job.title,
            jd_text_snapshot=job.jd_text,
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="测试候选人",
            resume_json={"skills": ["SQL"]},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateDemandFlow(
            org_id=1,
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        ))
        db.session.add(PipelineStage(
            org_id=1,
            candidate_id=candidate.id,
            job_id=job.id,
            demand_id=demand.id,
            stage="business_review",
            updated_by=owner_id,
        ))
        db.session.commit()
        return {"demand_id": demand.id, "candidate_id": candidate.id}


def _latest_stage(app, candidate_id, demand_id):
    with app.app_context():
        row = PipelineStage.query.filter_by(
            candidate_id=candidate_id, demand_id=demand_id
        ).order_by(PipelineStage.id.desc()).first()
        return row.stage


def _push_review(client, token, case, reviewer_id):
    response = client.post(
        "/api/business-reviews",
        headers=_auth(token),
        json={
            "demand_id": case["demand_id"],
            "candidate_id": case["candidate_id"],
            "reviewer_id": reviewer_id,
            "hr_note": "请重点核对 SQL 项目经验",
        },
    )
    assert response.status_code in {200, 201}
    return response.get_json()


@pytest.mark.parametrize("decision", ["approved", "rejected", "needs_info"])
def test_assigned_reviewer_can_submit_fixed_decisions(
    client, make_user, app, decision
):
    hr_id, hr_token = make_user("hr-review@example.com", role="recruiter")
    interviewer_id, interviewer_token = make_user(
        "business-review@example.com", role="interviewer"
    )
    case = _seed_review_case(app, hr_id)
    task = _push_review(client, hr_token, case, interviewer_id)
    note = "" if decision == "approved" else "具体原因"
    response = client.post(
        f"/api/business-reviews/{task['id']}/decision",
        headers=_auth(interviewer_token),
        json={"decision": decision, "note": note},
    )
    assert response.status_code == 200
    assert response.get_json()["status"] == decision
    assert _latest_stage(app, case["candidate_id"], case["demand_id"]) == "business_review"


def test_duplicate_pending_push_returns_existing_task(client, make_user, app):
    hr_id, hr_token = make_user("hr-dedupe@example.com", role="recruiter")
    interviewer_id, _ = make_user("business-dedupe@example.com", role="interviewer")
    case = _seed_review_case(app, hr_id)
    first = _push_review(client, hr_token, case, interviewer_id)
    second = _push_review(client, hr_token, case, interviewer_id)
    assert first["id"] == second["id"]
```

Also verify an unrelated interviewer gets 403 for task detail and original resume.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
./.venv/bin/python -m pytest backend/tests/test_business_reviews.py backend/tests/test_business_review_resume_access.py -q
```

Expected: route-not-found failures.

- [ ] **Step 3: Implement the task service**

Use these exact service operations:

```python
create_business_review(org_id, demand_id, candidate_id, reviewer_id, actor_id, hr_note, due_at)
list_business_reviews(org_id, user_id, role, status=None)
get_business_review(org_id, task_id, user_id, role)
decide_business_review(org_id, task_id, actor_id, decision, note)
```

Creation validates an approved active demand, active candidate flow, active interviewer/manager reviewer, and HR ownership scope. It inserts or reuses one pending task, sets the candidate stage to `business_review` only as the HR push action, writes a notification, and records `business_review.created` in one transaction.

Decision accepts only `approved`, `rejected`, `needs_info`; rejection and needs-info require a note. It sets `pending_slot=None`, records decision metadata, notifies the Demand owner, and writes `business_review.decided`. It does not create an interview, reject a candidate, or move the pipeline.

- [ ] **Step 4: Expose role-scoped routes**

```text
POST /api/business-reviews                 recruiter, manager, admin
GET  /api/business-reviews                 recruiter, manager, admin
GET  /api/business-reviews/mine            interviewer, manager, admin
GET  /api/business-reviews/<id>            scoped reader
POST /api/business-reviews/<id>/decision   assigned reviewer
```

Task payload includes Demand snapshots, candidate structured resume, original-resume metadata/URLs, HR note, business note, timestamps, reviewer, and creator names. It must not include raw filesystem paths.

- [ ] **Step 5: Extend candidate access for assigned review tasks**

In `can_access_candidate`, interviewer access is true when either an active/non-cancelled `InterviewAssignment` or a `BusinessReviewTask` assigned to that user exists for the candidate in the same organization. This grants view/preview/download only; profile editing, deletion, export, and process movement remain denied.

- [ ] **Step 6: Run focused and access-control regression tests**

Run:

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_business_reviews.py \
  backend/tests/test_business_review_resume_access.py \
  backend/tests/test_access_control_hardening.py \
  backend/tests/test_candidate_library.py \
  -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit the business-review slice**

```bash
git add backend/app/services/business_review_service.py backend/app/api/business_reviews.py backend/app/__init__.py backend/app/api/access.py backend/tests/test_business_reviews.py backend/tests/test_business_review_resume_access.py
git diff --cached --check
git commit -m "feat: add assigned business screening tasks"
```

## Task 5: Make Interview Feedback Simple and Editable

**Files:**
- Create: `backend/tests/test_interview_feedback_editing.py`
- Modify: `backend/app/api/interview.py`
- Modify: `backend/app/services/interview_workflow_service.py`

- [ ] **Step 1: Write failing feedback tests**

```python
import pytest

from app import db
from app.models import (
    Candidate,
    CandidateDemandFlow,
    Event,
    InterviewAssignment,
    InterviewFeedback,
    Job,
    RecruitmentDemand,
)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_assignment(app, owner_id, interviewer_id):
    with app.app_context():
        job = Job(org_id=1, title="后端工程师", jd_text="熟悉 Python", status="active")
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            request_no="REQ-FEEDBACK-EDIT",
            status="active",
            approval_status="approved",
        )
        db.session.add(demand)
        db.session.flush()
        candidate = Candidate(
            org_id=1,
            owner_hr_id=owner_id,
            current_demand_id=demand.id,
            name_masked="反馈候选人",
            resume_json={},
        )
        db.session.add(candidate)
        db.session.flush()
        db.session.add(CandidateDemandFlow(
            org_id=1,
            candidate_id=candidate.id,
            demand_id=demand.id,
            owner_hr_id=owner_id,
            status="active",
        ))
        assignment = InterviewAssignment(
            org_id=1,
            candidate_id=candidate.id,
            job_id=job.id,
            demand_id=demand.id,
            round="interview_first",
            round_sequence=1,
            is_primary=True,
            primary_slot=1,
            interviewer_id=interviewer_id,
            status="awaiting_feedback",
            created_by=owner_id,
        )
        db.session.add(assignment)
        db.session.commit()
        return assignment.id


def test_interviewer_submits_satisfaction_and_note(client, make_user, app):
    hr_id, _ = make_user("feedback-owner@example.com", role="recruiter")
    interviewer_id, token = make_user("feedback-author@example.com", role="interviewer")
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)
    response = client.post("/api/interview/feedback", headers=_auth(token), json={
        "assignment_id": assignment_id,
        "satisfaction": "satisfied",
        "note": "符合 JD 重点，可继续推进。",
    })
    assert response.status_code == 201
    assert response.get_json()["satisfaction"] == "satisfied"


def test_original_interviewer_can_edit_feedback_with_audit(client, make_user, app):
    hr_id, _ = make_user("feedback-edit-owner@example.com", role="recruiter")
    interviewer_id, token = make_user("feedback-edit-author@example.com", role="interviewer")
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)
    created = client.post("/api/interview/feedback", headers=_auth(token), json={
        "assignment_id": assignment_id,
        "satisfaction": "satisfied",
        "note": "初次评价",
    })
    assert created.status_code == 201
    feedback_id = created.get_json()["id"]

    response = client.patch(
        f"/api/interview/feedback/{feedback_id}",
        headers=_auth(token),
        json={"satisfaction": "pending", "note": "补充观察"},
    )
    assert response.status_code == 200
    assert response.get_json()["note"] == "补充观察"
    assert response.get_json()["updated_by"] == interviewer_id
    with app.app_context():
        event = Event.query.filter_by(
            action="interview.feedback_updated", entity_id=feedback_id
        ).one()
        assert event.payload["before"]["satisfaction"] == "satisfied"


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"satisfaction": "excellent", "note": ""}, "satisfaction"),
        ({"satisfaction": "pending", "note": "过" * 1001}, "note"),
    ],
)
def test_simple_feedback_validation(client, make_user, app, payload, field):
    hr_id, _ = make_user(f"feedback-validation-owner-{field}@example.com", role="recruiter")
    interviewer_id, token = make_user(
        f"feedback-validation-author-{field}@example.com", role="interviewer"
    )
    assignment_id = _seed_assignment(app, hr_id, interviewer_id)
    response = client.post(
        "/api/interview/feedback",
        headers=_auth(token),
        json={"assignment_id": assignment_id, **payload},
    )
    assert response.status_code == 400
    assert field in response.get_json()["fields"]


def test_unrelated_interviewer_cannot_edit_feedback(client, make_user, app):
    hr_id, _ = make_user("feedback-denied-owner@example.com", role="recruiter")
    author_id, author_token = make_user("feedback-denied-author@example.com", role="interviewer")
    _, unrelated_token = make_user("feedback-denied-other@example.com", role="interviewer")
    assignment_id = _seed_assignment(app, hr_id, author_id)
    created = client.post("/api/interview/feedback", headers=_auth(author_token), json={
        "assignment_id": assignment_id,
        "satisfaction": "satisfied",
        "note": "原始评价",
    })
    feedback_id = created.get_json()["id"]

    denied = client.patch(
        f"/api/interview/feedback/{feedback_id}",
        headers=_auth(unrelated_token),
        json={"satisfaction": "unsatisfied", "note": "不应写入"},
    )
    assert denied.status_code == 403


@pytest.mark.parametrize("role", ["manager", "admin"])
def test_manager_and_admin_can_correct_feedback(client, make_user, app, role):
    hr_id, _ = make_user(f"feedback-correct-owner-{role}@example.com", role="recruiter")
    author_id, author_token = make_user(
        f"feedback-correct-author-{role}@example.com", role="interviewer"
    )
    actor_id, actor_token = make_user(f"feedback-correct-{role}@example.com", role=role)
    assignment_id = _seed_assignment(app, hr_id, author_id)
    created = client.post("/api/interview/feedback", headers=_auth(author_token), json={
        "assignment_id": assignment_id,
        "satisfaction": "pending",
        "note": "待补充",
    })

    corrected = client.patch(
        f"/api/interview/feedback/{created.get_json()['id']}",
        headers=_auth(actor_token),
        json={"satisfaction": "satisfied", "note": "已根据现场记录修正"},
    )
    assert corrected.status_code == 200
    assert corrected.get_json()["updated_by"] == actor_id
```

- [ ] **Step 2: Run and verify RED**

Run: `./.venv/bin/python -m pytest backend/tests/test_interview_feedback_editing.py -q`

Expected: POST payload fields are absent or PATCH returns 404/405.

- [ ] **Step 3: Normalize the simple feedback contract**

Add helpers:

```python
SATISFACTION_VALUES = {"satisfied", "pending", "unsatisfied"}


def normalize_simple_feedback(data):
    satisfaction = str(data.get("satisfaction") or "").strip()
    note = str(data.get("note") or "").strip()
    if satisfaction not in SATISFACTION_VALUES:
        raise FeedbackValidationError({"satisfaction": "请选择满意、待定或不满意"})
    if len(note) > 1000:
        raise FeedbackValidationError({"note": "面试备注不能超过 1000 字"})
    return satisfaction, note
```

Store satisfaction in `evaluation_json["satisfaction"]`; preserve unrelated evaluation JSON keys. Existing score/pass fields remain backward compatible but are not required by the pilot UI.

- [ ] **Step 4: Add audited edit endpoint**

Register `PATCH /api/interview/feedback/<feedback_id>`. Lock the feedback row. Allow the original interviewer, manager, or admin in the same organization. Update `updated_by` and `updated_at`; record before/after satisfaction and note in `interview.feedback_updated` before one commit. Editing never changes pipeline stage or assignment state.

- [ ] **Step 5: Run feedback and interview regressions**

Run:

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_interview_feedback_editing.py \
  backend/tests/test_interview_management_contract.py \
  backend/tests/test_interview_loop.py \
  backend/tests/test_demand_interview_rounds.py \
  -q
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the feedback slice**

```bash
git add backend/app/api/interview.py backend/app/services/interview_workflow_service.py backend/tests/test_interview_feedback_editing.py
git diff --cached --check
git commit -m "feat: add editable pilot interview feedback"
```

## Task 6: Add the 5190 Typed API Layer

**Files:**
- Create: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`
- Modify: `readdy-frontend/src/lib/api.ts`
- Create: `readdy-frontend/src/features/jobs/api.ts`
- Modify: `readdy-frontend/src/features/demands/types.ts`
- Modify: `readdy-frontend/src/features/demands/api.ts`
- Create: `readdy-frontend/src/features/businessReviews/types.ts`
- Create: `readdy-frontend/src/features/businessReviews/api.ts`
- Create: `readdy-frontend/src/features/interviews/types.ts`
- Create: `readdy-frontend/src/features/interviews/api.ts`

- [ ] **Step 1: Write the failing source-contract test**

Assert the new API methods and the absence of mocks:

```javascript
const demandApi = read('readdy-frontend/src/features/demands/api.ts');
for (const method of ['approveDemand', 'rejectDemand', 'resubmitDemand']) {
  assert.match(demandApi, new RegExp(method));
}

const reviewApi = read('readdy-frontend/src/features/businessReviews/api.ts');
for (const method of ['listMine', 'createTask', 'decideTask', 'loadResume', 'downloadResume']) {
  assert.match(reviewApi, new RegExp(method));
}

const interviewApi = read('readdy-frontend/src/features/interviews/api.ts');
assert.match(interviewApi, /listMyAssignments/);
assert.match(interviewApi, /saveFeedback/);
assert.match(interviewApi, /updateFeedback/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: missing-file or missing-method failure.

- [ ] **Step 3: Extend the common API client**

Keep `apiRequest<T>()` for JSON. Add:

```typescript
export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, { headers: companyAuthHeaders() });
  if (!response.ok) await throwApiResponse(response);
  return response.blob();
}

export async function apiMultipart<T>(path: string, form: FormData): Promise<T> {
  return requestWithResponse<T>(path, { method: 'POST', headers: companyAuthHeaders(), body: form });
}
```

Do not set `Content-Type` for `FormData`. Reuse one JSON error parser so JSON, Blob, and multipart calls dispatch the same 401 event and preserve 403/409 messages.

- [ ] **Step 4: Implement exact TypeScript contracts**

Use backend state names verbatim:

```typescript
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type BusinessReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_info';
export type Satisfaction = 'satisfied' | 'pending' | 'unsatisfied';
```

Demand API methods call `/demands/:id/approve`, `/reject`, and `/resubmit`. Business review calls `/business-reviews` and `/business-reviews/mine`. Interview API calls existing assignment routes and the new feedback PATCH route. Original resume Blob URLs are created with `URL.createObjectURL()` by the page and revoked on close/unmount.

- [ ] **Step 5: Run contract, type, and lint checks**

Run:

```bash
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit only the API layer and contract**

```bash
git add frontend/tests/readdy_mysql_pilot_contract.test.mjs readdy-frontend/src/lib/api.ts readdy-frontend/src/features/jobs/api.ts readdy-frontend/src/features/demands/types.ts readdy-frontend/src/features/demands/api.ts readdy-frontend/src/features/businessReviews readdy-frontend/src/features/interviews
git diff --cached --check
git commit -m "feat: add 5190 pilot api contracts"
```

## Task 7: Connect Demand Submission and HR Review UI

**Files:**
- Modify: `readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Extend the contract test and verify RED**

Require the business page to call job/demand APIs and forbid its old mocks; require the HR page to call approval methods:

```javascript
assert.match(businessJobs, /jobsApi\.listTemplates/);
assert.match(businessJobs, /demandsApi\.createDemand/);
assert.doesNotMatch(businessJobs, /@\/mocks\/interviewer/);
assert.match(hrJobs, /demandsApi\.approveDemand/);
assert.match(hrJobs, /demandsApi\.rejectDemand/);
```

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: assertions fail against the current mock pages.

- [ ] **Step 2: Replace the business demand mock page**

The page must provide:

- real loading, empty, failure, and retry states;
- template selector with title, department, city, JD, and structured focus points;
- fields for owner HR, department, city, HC, target date, priority, manager name, JD, focus points, and note;
- submit disabled while saving and an idempotency key per click;
- tabs for pending, approved, and rejected requests;
- rejected demand reason and a resubmit action.

Do not create a second decorative dashboard. Keep the existing compact work-page layout and use the current form controls.

- [ ] **Step 3: Add HR review actions**

`DemandDetailPanel` shows approval state, submit/review timestamps, and rejection reason. For pending business-created demands, recruiter/manager/admin see two explicit buttons: check icon + “通过”, close icon + “不通过”. Reject opens a reason textarea and cannot submit empty text. Successful actions reload the detail and list; 409 shows “状态已变化，请刷新”.

- [ ] **Step 4: Run frontend verification for this slice**

```bash
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit the demand UI slice**

Before staging, inspect the existing uncommitted diffs in these files and preserve them. Then:

```bash
git add readdy-frontend/src/pages/interviewer/jobs/page.tsx readdy-frontend/src/pages/jobs/page.tsx readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect demand review ui"
```

## Task 8: Connect HR Candidate Upload and Business Push UI

**Files:**
- Create: `readdy-frontend/src/features/candidates/types.ts`
- Create: `readdy-frontend/src/features/candidates/api.ts`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Add failing candidate-flow contract assertions**

```javascript
const candidatesApi = read('readdy-frontend/src/features/candidates/api.ts');
for (const method of ['listCandidates', 'uploadResumes', 'getResume', 'pushToBusinessReview']) {
  assert.match(candidatesApi, new RegExp(method));
}

const candidatesPage = read('readdy-frontend/src/pages/candidates/page.tsx');
assert.match(candidatesPage, /candidatesApi\.listCandidates/);
assert.match(candidatesPage, /candidatesApi\.uploadResumes/);
assert.match(candidatesPage, /candidatesApi\.pushToBusinessReview/);
assert.doesNotMatch(candidatesPage, /@\/mocks\/candidates/);
```

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: missing-file and mock-import assertions fail.

- [ ] **Step 2: Add candidate and upload API contracts**

Use the existing backend shapes without renaming IDs:

```typescript
export interface CandidateListItem {
  id: number;
  name_masked: string;
  owner_hr_id: number | null;
  current_demand_id: number | null;
  parse_status: 'ok' | 'failed' | 'pending';
  created_at: string;
  resume_summary?: string;
  current_stage?: string;
}

export interface ResumeDetail {
  id: number;
  name_masked: string;
  resume_json: Record<string, unknown>;
  original_resume: {
    available: boolean;
    filename: string | null;
    mime_type: string | null;
    preview_url: string;
    download_url: string;
  };
}

export interface ResumeUploadResponse {
  batch_id: number;
  total: number;
  deduplicated?: boolean;
  results: Array<{ file: string; status: string; reason?: string; candidate_id?: number }>;
}
```

`uploadResumes` builds `FormData` with `files`, `target_demand_id`, `source_channel`, and optional note, then calls `/resume/upload`. `listCandidates` calls `/candidates?demand_id=<id>&page=<n>&per_page=<n>`. `getResume` calls `/resume/<id>`. `pushToBusinessReview` delegates to the typed business-review API and carries numeric Demand/candidate/reviewer IDs.

- [ ] **Step 3: Replace simulated upload with the real multipart call**

Keep the existing upload dialog and supported extensions. Remove the 500 ms timer and in-memory candidate creation. Require a selected approved Demand before upload, display each backend result, preserve failed filenames, and reload the candidate list after status 200/202. Disable the submit button while the request is active so the backend fingerprint remains the second line of deduplication.

- [ ] **Step 4: Replace candidate-list and detail mocks**

Use real pagination, search, Demand filter, loading, error/retry, and genuine empty states. Candidate row selection loads `/resume/<id>` and displays structured resume plus original preview/download. Controls without a real endpoint in this pilot are hidden; they must not show a fake success toast.

- [ ] **Step 5: Wire the HR push modal**

The modal receives actual selected candidate IDs and requires one approved active Demand plus one active business reviewer. Its payload is:

```typescript
{
  demand_id: number;
  candidate_id: number;
  reviewer_id: number;
  hr_note: string;
  due_at: string | null;
}
```

Successful push shows the returned task ID and reloads the candidate/task state. Duplicate push reuses the pending task and reports “该候选人已在等待业务筛选”. HR rejection uses the existing pipeline move endpoint with a required disposition reason; it is not simulated locally.

- [ ] **Step 6: Run candidate API regressions and frontend checks**

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_candidate_library.py \
  backend/tests/test_resume_parse_retry.py \
  backend/tests/test_business_reviews.py \
  -q
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the HR candidate slice**

```bash
git add readdy-frontend/src/features/candidates readdy-frontend/src/pages/candidates/page.tsx readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect hr candidate and business push flow"
```

## Task 9: Connect Business Screening and Original Resume UI

**Files:**
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/components/ReviewActionModal.tsx`
- Create: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Add failing UI contract assertions**

Require `businessReviewsApi.listMine`, `decideTask`, Blob resume access, `needs_info`, and no imports from `mocks/resumePush`, `mocks/candidates`, or `mocks/interviews`.

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: current mock imports fail the test.

- [ ] **Step 2: Replace the screening list data source**

Map backend states to these visible labels:

```typescript
const labels = {
  pending: '待筛选',
  approved: '已通过',
  rejected: '不合适',
  needs_info: '待 HR 补充',
} as const;
```

Retain the existing tabs and dense list. Add loading, error/retry, genuine empty state, due time, HR note, creator, and decision time. Do not mutate candidate/pipeline/interview arrays in the browser.

- [ ] **Step 3: Build the detail and decision interaction**

The detail component shows candidate structured resume, complete JD, focus points, HR note, and buttons for preview/download. Preview fetches a Blob with auth, opens an object URL in a new Tabbit tab or embedded supported preview, and revokes object URLs when finished. Download uses a temporary anchor with the backend filename.

The decision modal uses exactly:

- “通过，进入一面” (`approved`, note optional)
- “不合适” (`rejected`, note required)
- “需要 HR 补充信息” (`needs_info`, note required)

After a successful decision, refresh from the API. Do not create an interview or move the candidate locally.

- [ ] **Step 4: Run contract, type, lint, and build**

```bash
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit the business-screening UI slice**

```bash
git add readdy-frontend/src/pages/interviewer/screening/page.tsx readdy-frontend/src/pages/interviewer/dashboard/components/ReviewActionModal.tsx readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect assigned business screening ui"
```

## Task 10: Connect My Interviews and Editable Feedback UI

**Files:**
- Create: `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Add failing interview UI assertions**

Require the page to call `interviewsApi.listMyAssignments`, remove the old mock import, and use `SimpleFeedbackModal` with all three satisfaction values.

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: current mock page fails.

- [ ] **Step 2: Build the simple feedback modal**

Use a segmented three-choice control for satisfied/pending/unsatisfied and one textarea limited to 1000 characters. The save button is disabled without a satisfaction value or while saving. Existing feedback opens in edit mode and displays last editor/time. API errors remain in the modal so entered text is not lost.

- [ ] **Step 3: Replace the interview page data source**

Load only `/interview/assignments` rows visible to the current backend identity. Keep list/calendar/detail capabilities that are supported by real fields. Remove or hide controls that have no real endpoint rather than simulating success. Detail shows Demand JD, current round, candidate information, original resume, and prior feedback. Saving feedback refreshes the assignment and does not move stages.

- [ ] **Step 4: Run frontend verification**

```bash
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
node frontend/tests/readdy_role_interfaces_contract.test.mjs
node frontend/tests/readdy_pilot_handoff_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit the interview UI slice**

```bash
git add readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx readdy-frontend/src/pages/interviewer/interviews/page.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect simple interview feedback ui"
```

## Task 11: Connect the HR-Controlled Pipeline Board

**Files:**
- Create: `readdy-frontend/src/features/pipeline/types.ts`
- Create: `readdy-frontend/src/features/pipeline/api.ts`
- Modify: `readdy-frontend/src/pages/kanban/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Add failing pipeline contract assertions**

```javascript
const pipelineApi = read('readdy-frontend/src/features/pipeline/api.ts');
for (const method of ['getBoard', 'getHistory', 'moveCandidate']) {
  assert.match(pipelineApi, new RegExp(method));
}

const kanban = read('readdy-frontend/src/pages/kanban/page.tsx');
assert.match(kanban, /pipelineApi\.getBoard/);
assert.match(kanban, /pipelineApi\.moveCandidate/);
assert.doesNotMatch(kanban, /@\/mocks\/candidates/);
```

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: missing API and mock-import assertions fail.

- [ ] **Step 2: Add exact board and move contracts**

```typescript
export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected'
  | 'transferred';

export interface PipelineBoardCandidate {
  candidate_id: number;
  demand_id: number;
  name_masked: string;
  stage: PipelineStage;
  stage_updated_at: string | null;
  owner_hr_id: number | null;
}

export interface MoveCandidateInput {
  candidate_id: number;
  demand_id: number;
  stage: PipelineStage;
  note: string;
  disposition?: { reason: string; enter_talent_pool: boolean; note: string };
}
```

`getBoard(demandId)` calls `/pipeline/demands/<id>/board`, `getHistory` calls the Demand-scoped history route, and `moveCandidate` posts to `/pipeline/demands/<id>/move` with an idempotency key.

- [ ] **Step 3: Replace the mock board with a Demand-scoped work board**

Require an approved active Demand selector and load only its real board. Use the backend's six main stages plus rejected/transferred terminal states. Display real counts, candidate names, current owner, and last stage time. Keep the existing compact board layout, but remove fabricated monthly charts and export success messages that lack a real data source.

- [ ] **Step 4: Make HR the only stage mover**

Recruiter, manager, and admin can open a candidate action menu. Use explicit actions instead of free drag-and-drop:

- business approval -> HR moves to `interview` and then schedules round one;
- after round one -> HR keeps stage `interview` and schedules round two;
- after round two -> HR moves to `offer` or `rejected`;
- `rejected` requires disposition reason;
- `onboarded` is reached only through the Offer onboard action, not a board shortcut.

The page must refresh after every move and surface 409 as “候选人状态已变化，请刷新”. Interviewer routes never render movement controls.

- [ ] **Step 5: Run pipeline backend and frontend verification**

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_candidate_journey.py \
  backend/tests/test_demand_pipeline_isolation.py \
  backend/tests/test_pipeline_rounds.py \
  -q
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit the pipeline slice**

```bash
git add readdy-frontend/src/features/pipeline readdy-frontend/src/pages/kanban/page.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect hr pipeline board"
```

## Task 12: Connect Offer and Onboarding Lifecycle

**Files:**
- Create: `readdy-frontend/src/features/offers/types.ts`
- Create: `readdy-frontend/src/features/offers/api.ts`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferTable.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_contract.test.mjs`

- [ ] **Step 1: Add failing Offer contract assertions**

```javascript
const offersApi = read('readdy-frontend/src/features/offers/api.ts');
for (const method of ['listOffers', 'saveDraft', 'runAction']) {
  assert.match(offersApi, new RegExp(method));
}

const offersPage = read('readdy-frontend/src/pages/offers/page.tsx');
assert.match(offersPage, /offersApi\.listOffers/);
assert.match(offersPage, /offersApi\.runAction/);
assert.doesNotMatch(offersPage, /initialOffers|zhipin-current-role/);
```

Run: `node frontend/tests/readdy_mysql_pilot_contract.test.mjs`

Expected: missing API methods and mock state fail.

- [ ] **Step 2: Add Offer lifecycle contracts**

```typescript
export type OfferStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'onboarded';

export type OfferAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'send'
  | 'accept'
  | 'decline'
  | 'withdraw'
  | 'expire'
  | 'onboard'
  | 'resend'
  | 'follow_up';

export interface OfferDraftInput {
  salary_range: string;
  onboard_date: string | null;
  note: string;
  salary_breakdown?: Array<{ label: string; value: string }>;
}
```

`listOffers` calls `/offers`, `saveDraft` calls `/pipeline/demands/<demandId>/offer/<candidateId>`, and `runAction` posts to `/offers/<id>/actions`.

- [ ] **Step 3: Replace the Offer mock list and form**

Port the already verified data flow from `frontend/src/pages/OffersPage.tsx` while retaining 5190 visual components. The create modal selects an approved Demand and only candidates currently in `offer`. Saving creates or updates a draft with salary, onboard date, and note. All rows come from `/offers`; refresh, search, status tabs, loading, empty, error, and retry states are real.

- [ ] **Step 4: Connect lifecycle actions without pretending to send email**

Show only actions valid for the current status and role:

```text
draft -> submit
pending -> approve/reject (manager or admin)
approved -> send
sent -> accept/decline/withdraw/expire
accepted -> onboard
onboarded/declined/withdrawn/expired -> terminal history
```

The “send” button label is “记录为已发放”; it records state only and must not claim an email was delivered. Reject, decline, and withdraw require a reason. Onboard requires the actual date and relies on the backend transaction to move the candidate to `onboarded`.

- [ ] **Step 5: Render real history and concurrency errors**

`OfferDetailDrawer` renders the backend `history` array and `version`. After any action, replace the row with the returned payload. For 409, keep the modal input, show the conflict, and offer “刷新最新状态”.

- [ ] **Step 6: Run Offer backend and frontend verification**

```bash
./.venv/bin/python -m pytest \
  backend/tests/test_offer_lifecycle.py \
  backend/tests/test_offer_lifecycle_migration.py \
  backend/tests/test_demand_pipeline_isolation.py \
  -q
node frontend/tests/readdy_mysql_pilot_contract.test.mjs
cd readdy-frontend && npm run type-check && npm run lint && npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the Offer slice**

```bash
git add readdy-frontend/src/features/offers readdy-frontend/src/pages/offers/page.tsx readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx readdy-frontend/src/pages/offers/components/OfferTable.tsx frontend/tests/readdy_mysql_pilot_contract.test.mjs
git diff --cached --check
git commit -m "feat: connect offer and onboarding lifecycle"
```

## Task 13: Add Scoped Acceptance Cleanup and Update Handoff Docs

**Files:**
- Create: `backend/tests/test_pilot_acceptance_cleanup.py`
- Create: `backend/scripts/cleanup_pilot_acceptance.py`
- Modify: `docs/PRODUCT_INTERACTION_GUIDE.md`
- Modify: `docs/ISOLATED_CLEANUP.md`
- Modify: `docs/13_试点业务流程与研发接口交接.md`

- [ ] **Step 1: Write failing cleanup tests**

The cleanup command reads an acceptance manifest containing exact record IDs, defaults to dry-run, refuses unlisted references, and requires both `--apply` and a matching generated confirmation token before deletion. Test that normal business rows are never selected.

- [ ] **Step 2: Run and verify RED**

Run: `./.venv/bin/python -m pytest backend/tests/test_pilot_acceptance_cleanup.py -q`

Expected: missing-module failure.

- [ ] **Step 3: Implement manifest-scoped cleanup**

The manifest lives under `../runtime/mysql-pilot-acceptance/` and records only records created by automated acceptance. Dry-run prints table names and IDs, never candidate personal fields. Apply deletes in foreign-key-safe order inside one transaction and aborts if any linked row is outside the manifest. Actual colleague-entered pilot records and revision 08 schema are never removed by this command.

- [ ] **Step 4: Update the three user-facing docs**

Document:

- `./scripts/prepare-mysql-pilot.sh` and `./scripts/serve-mysql-pilot.sh`;
- 5190 role flow and real-data status;
- local-delete versus shared-MySQL cleanup boundary;
- no production deployment and no Git push;
- credential rotation before wider handoff.

- [ ] **Step 5: Run cleanup tests and documentation contracts**

```bash
./.venv/bin/python -m pytest backend/tests/test_pilot_acceptance_cleanup.py -q
node frontend/tests/readdy_pilot_handoff_contract.test.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit cleanup and docs**

```bash
git add backend/scripts/cleanup_pilot_acceptance.py backend/tests/test_pilot_acceptance_cleanup.py docs/PRODUCT_INTERACTION_GUIDE.md docs/ISOLATED_CLEANUP.md docs/13_试点业务流程与研发接口交接.md
git diff --cached --check
git commit -m "docs: add mysql pilot operation and cleanup guide"
```

## Task 14: Run Local Verification Before Touching MySQL

**Files:**
- No production file changes unless a verification failure reveals a defect.

- [ ] **Step 1: Run all backend tests on disposable SQLite**

Run: `./.venv/bin/python -m pytest backend/tests -q`

Expected: zero failures.

- [ ] **Step 2: Run all 5190 contract tests**

Run:

```bash
for test_file in frontend/tests/readdy_*.test.mjs; do
  node "$test_file"
done
```

Expected: every test prints its `OK` line and exits `0`.

- [ ] **Step 3: Run frontend static verification**

```bash
cd readdy-frontend
npm run type-check
npm run lint
npm run build
```

Expected: all three commands exit `0`.

- [ ] **Step 4: Run default SQLite isolated smoke**

```bash
./scripts/stop-isolated-demo.sh
./scripts/start-isolated-demo.sh
./scripts/check-isolated-demo.sh
```

Expected: ports 5010, 5110, 5190, and 5192 belong to this isolated project and all checks are accessible. This proves MySQL work did not break the disposable local mode.

## Task 15: Prepare MySQL, Start 5190, and Complete Tabbit Acceptance

**Files:**
- Generated only under `../runtime`; no credential or acceptance artifact enters Git.

- [ ] **Step 1: Create the ignored runtime environment**

Create `../runtime/mysql-pilot.env` with mode `600` using the credential already supplied in the private session. Do not echo it and do not include it in any tool output, doc, commit, or screenshot.

- [ ] **Step 2: Run read-only MySQL audit**

Run: `./scripts/prepare-mysql-pilot.sh --dry-run`

Expected: a secret-free report listing recognized additive gaps and no conflicting definitions. If a conflict appears, stop without database writes.

- [ ] **Step 3: Create backup and apply migration once**

Run: `./scripts/prepare-mysql-pilot.sh --apply`

Expected sequence: complete backup manifest -> Alembic revision `20260724_08` -> post-audit `ok=true`. If backup or post-audit fails, stop the rollout and do not start 5190 against MySQL.

- [ ] **Step 4: Re-run prepare in dry-run mode**

Run: `./scripts/prepare-mysql-pilot.sh --dry-run`

Expected: no missing or conflicting objects, revision 08, no writes.

- [ ] **Step 5: Start the isolated MySQL pilot**

```bash
./scripts/stop-isolated-demo.sh
./scripts/serve-mysql-pilot.sh
```

In another terminal run: `./scripts/check-mysql-pilot.sh`

Expected: this project owns all four ports, backend database readiness passes, and 5190 is available at `http://127.0.0.1:5190`.

- [ ] **Step 6: Open Tabbit and perform the role flow**

Open `http://127.0.0.1:5190` in Tabbit. Use one clearly marked acceptance Demand and dummy resume, recording created IDs in the acceptance manifest. Verify:

1. Business role submits a template-based demand.
2. HR rejects it with a required reason.
3. Business role edits and resubmits it.
4. HR approves it.
5. HR uploads the dummy resume and pushes business screening.
6. Only the assigned business account sees the task.
7. Structured resume and original preview/download work.
8. The three business decisions can each be tested without automatic advancement.
9. HR arranges first and second rounds.
10. Interviewer submits and edits satisfaction/note; HR still controls stage movement.
11. Refreshing and signing in as another role preserves data and scope.

- [ ] **Step 7: Capture secret-free evidence**

Write `docs/evidence/2026-07-24-mysql-pilot/acceptance.json` with route, role, record IDs, result, and timestamp only. Screenshots must not show passwords, connection strings, personal contact details, or terminal environment values.

- [ ] **Step 8: Remove automated acceptance rows or leave them explicitly for user review**

First run `cleanup_pilot_acceptance.py` in dry-run mode and show the exact record count. Apply cleanup only if the user asks to remove acceptance data. Never delete colleague-entered business rows.

- [ ] **Step 9: Final status check**

Run:

```bash
git status --short
./scripts/check-mysql-pilot.sh
```

Report local commits and remaining pre-existing working-tree changes. Do not deploy and do not push.
