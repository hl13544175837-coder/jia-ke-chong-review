# External Agent Resume Import MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent online-resume library for recruiter-owned Agent imports, preserve full BOSS chat history, and let external Agents send structured full resumes into the existing candidate library without requiring the resume AI parser.

**Architecture:** Keep the modular monolith. Add one `OnlineResume` aggregate with JSON resume/chat snapshots and recruiter ownership, expose recruiter-authenticated Agent import endpoints, and reuse the existing full-resume upload pipeline through a pre-parsed resume branch. Keep online and full resumes independent; use immutable audit events only for the imported-online-resume count.

**Tech Stack:** Flask, SQLAlchemy, Alembic, JWT/RBAC, React 19, TypeScript, React Router, Tailwind CSS, Node contract tests, Pytest, Playwright.

---

## File map

### Backend files to create

- `backend/app/services/online_resume_service.py` — validate, upsert, list, edit, and hard-delete recruiter-owned online resumes.
- `backend/app/api/online_resumes.py` — authenticated online-resume list/detail/edit/delete API.
- `backend/app/api/agent_imports.py` — authenticated external-Agent imports for online resumes and pre-parsed full resumes.
- `backend/migrations/versions/20260807_16_online_resumes.py` — additive online-resume schema.
- `backend/tests/test_online_resume_imports.py` — ownership, chat snapshot, deletion, KPI-event, and retry coverage.
- `backend/tests/test_agent_full_resume_import.py` — structured full-resume import and existing-library integration coverage.
- `backend/tests/test_online_resume_migration.py` — migration coverage.

### Backend files to modify

- `backend/app/models.py` — add `OnlineResume`.
- `backend/app/__init__.py` — register two new blueprints.
- `backend/app/services/resume_service.py` — add creation from trusted, already-structured resume data.
- `backend/app/services/resumes/parse_service.py` — route pre-parsed full resumes around the LLM parser while preserving deduplication and pipeline joining.
- `backend/app/services/resumes/upload_service.py` — accept validated per-file Agent metadata and reuse existing upload safety checks.
- `backend/app/services/bi_service.py` — include monthly imported-online-resume count from audit events.
- `backend/app/build_info.py` and schema-check scripts/tests — advance expected schema to `20260807_16`.
- `backend/tests/test_bi_monthly_performance.py` — verify the new objective count.

### Frontend files to create

- `readdy-frontend/src/features/onlineResumes/types.ts` — online-resume API contracts.
- `readdy-frontend/src/features/onlineResumes/api.ts` — list/detail/edit/delete calls.
- `readdy-frontend/src/features/onlineResumes/components/OnlineResumeList.tsx` — recruiter-owned list.
- `readdy-frontend/src/features/onlineResumes/components/OnlineResumeDetailDrawer.tsx` — structured resume, full chat, edit, and delete UI.
- `readdy-frontend/src/pages/online-resumes/page.tsx` — page composition.
- `readdy-frontend/tests/online-resume-mvp-contract.test.mjs` — route/navigation/no-chat-input/real-API contract.

### Frontend files to modify

- `readdy-frontend/src/router/config.tsx` — add `/online-resumes`.
- `readdy-frontend/src/components/feature/MainLayout.tsx` — add recruiter navigation.
- `readdy-frontend/src/auth/companyPagePermissions.ts` — reuse the existing `candidates` menu permission.
- `readdy-frontend/src/features/navigation/pageMemory.ts` — remember online-resume page state.
- `readdy-frontend/src/features/analytics/types.ts` — add `online_resume_imports` to monthly summary.
- `readdy-frontend/src/features/analytics/components/MonthlyPerformancePanel.tsx` — show the imported count without ranking.
- `readdy-frontend/tests/company-page-permissions.test.mjs` and `readdy-frontend/e2e/core-role-smoke.spec.ts` — route and recruiter smoke coverage.

### Documentation to modify

- `docs/01_PRD.md`
- `docs/03_BI看板设计.md`
- `docs/README.md`
- `docs/SDD-智聘招聘系统-v1.0.md`
- `RUNNING.md`
- `DEPLOYMENT.md`
- `docs/06_试点上线检查清单.md`
- `docs/07_上线部署前关键清单_给AI执行.md`
- `docs/08_Libra_SIT发布路线.md`

---

### Task 1: Add the independent online-resume schema

**Files:**
- Create: `backend/migrations/versions/20260807_16_online_resumes.py`
- Create: `backend/tests/test_online_resume_migration.py`
- Modify: `backend/app/models.py`

- [ ] **Step 1: Write the failing migration test**

```python
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_online_resume_migration_creates_independent_library(tmp_path):
    db_path = tmp_path / "online-resume.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(config, "20260806_15")
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("online_resumes")}
    assert {
        "id", "org_id", "owner_hr_id", "demand_id", "boss_account",
        "source_platform", "external_record_id", "display_name", "resume_json",
        "chat_json", "source_url", "created_at", "updated_at",
    }.issubset(columns)
    unique_names = {item["name"] for item in inspector.get_unique_constraints("online_resumes")}
    assert "uq_online_resume_owner_external" in unique_names
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20260807_16"
    engine.dispose()
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd backend && pytest -q tests/test_online_resume_migration.py
```

Expected: FAIL because revision `20260807_16` and table `online_resumes` do not exist.

- [ ] **Step 3: Add the model**

Add to `backend/app/models.py` after `CandidateResumeVersion`:

```python
class OnlineResume(db.Model):
    __tablename__ = "online_resumes"
    __table_args__ = (
        db.UniqueConstraint(
            "org_id",
            "owner_hr_id",
            "source_platform",
            "external_record_id",
            name="uq_online_resume_owner_external",
        ),
        db.Index("ix_online_resumes_owner_created", "org_id", "owner_hr_id", "created_at"),
        db.Index("ix_online_resumes_demand", "org_id", "demand_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    org_id = db.Column(db.Integer, nullable=False, default=1)
    owner_hr_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    demand_id = db.Column(db.Integer, db.ForeignKey("recruitment_demands.id", ondelete="RESTRICT"), nullable=False)
    boss_account = db.Column(db.String(160), nullable=False)
    source_platform = db.Column(db.String(60), nullable=False, default="BOSS直聘")
    external_record_id = db.Column(db.String(200), nullable=False)
    display_name = db.Column(db.String(100), nullable=False, default="未命名候选人")
    resume_json = db.Column(db.JSON, nullable=False, default=dict)
    chat_json = db.Column(db.JSON, nullable=False, default=list)
    source_url = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now, onupdate=utc_now)
```

- [ ] **Step 4: Add the additive migration**

Create `backend/migrations/versions/20260807_16_online_resumes.py` with `revision = "20260807_16"`, `down_revision = "20260806_15"`, the columns above, the named unique constraint, and the two indexes. Use `sa.JSON()` for `resume_json` and `chat_json`. Make `downgrade()` raise `RuntimeError("在线简历包含招聘业务数据，不支持破坏性在线降级。")`.

- [ ] **Step 5: Run model and migration tests**

Run:

```bash
cd backend && pytest -q tests/test_online_resume_migration.py tests/test_schema_compatibility.py
```

Expected: PASS.

- [ ] **Step 6: Commit the schema slice**

```bash
git add backend/app/models.py backend/migrations/versions/20260807_16_online_resumes.py backend/tests/test_online_resume_migration.py
git commit -m "feat: add independent online resume storage"
```

---

### Task 2: Add recruiter-owned online-resume import and CRUD APIs

**Files:**
- Create: `backend/app/services/online_resume_service.py`
- Create: `backend/app/api/online_resumes.py`
- Create: `backend/app/api/agent_imports.py`
- Create: `backend/tests/test_online_resume_imports.py`
- Modify: `backend/app/__init__.py`

- [ ] **Step 1: Write failing API tests**

Cover these exact scenarios in `backend/tests/test_online_resume_imports.py`:

```python
def _headers(token, key=None):
    headers = {"Authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def _make_demand(app, owner_id, request_no="REQ-ONLINE-001"):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand
        job = Job(org_id=1, title="Java开发", jd_text="Java", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="Java开发",
            request_no=request_no,
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        return demand.id


def _item(demand_id, external_id="boss-chat-001"):
    return {
        "external_record_id": external_id,
        "demand_id": demand_id,
        "boss_account": "何龙-BOSS账号",
        "source_platform": "BOSS直聘",
        "display_name": "在线候选人甲",
        "source_url": "https://www.zhipin.com/web/chat/index",
        "resume_json": {
            "extracted_info": {"name": "在线候选人甲", "target_position": "Java"},
            "skills": [{"tag": "Spring Boot", "score": 1}],
        },
        "chat_json": [
            {"sender": "recruiter", "text": "你好，方便了解机会吗？", "sent_at": "2026-08-07T09:00:00+08:00"},
            {"sender": "candidate", "text": "可以的", "sent_at": "2026-08-07T09:02:00+08:00"},
        ],
    }
```

Tests must assert:

- `POST /api/agent-imports/online-resumes` with `{"items": [_item(demand.id)]}` returns 200 and `created == 1`.
- The current recruiter can list and read the imported record.
- A different recruiter sees an empty list and receives 404 for the detail URL.
- Reposting the same `external_record_id` replaces `resume_json`, `chat_json`, and `updated_at`, returns `updated == 1`, and does not create a second row or second `online_resume.imported` event.
- `PATCH /api/online-resumes/<id>` can change `display_name` and `resume_json` but cannot change `owner_hr_id`, `boss_account`, `demand_id`, or `chat_json`.
- `DELETE /api/online-resumes/<id>` hard-deletes the row while the original `online_resume.imported` event remains.
- An interviewer receives 403 from all new endpoints.
- A recruiter cannot import into a demand they cannot manage.
- A batch with one invalid item returns a per-item error while valid items are committed.

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd backend && pytest -q tests/test_online_resume_imports.py
```

Expected: FAIL because the routes and service do not exist.

- [ ] **Step 3: Implement input validation and upsert in the service**

Create `OnlineResumeService` with these public methods and exact ownership rules:

```python
class OnlineResumeService:
    MAX_BATCH = 100

    def import_batch(self, *, org_id: int, owner_hr_id: int, role: str, items: list[dict]) -> dict:
        """Create or update by (org, owner, platform, external_record_id).

        Record online_resume.imported only for a new row. Commit each valid item
        independently so one bad item does not roll back the rest.
        """

    def list_for_actor(self, *, org_id: int, actor_id: int, role: str, page: int, per_page: int, demand_id: int | None = None) -> dict:
        """Recruiter sees owner_hr_id == actor_id; manager/admin may read the org."""

    def get_for_actor(self, resume_id: int, *, org_id: int, actor_id: int, role: str) -> OnlineResume | None:
        """Return None instead of exposing another recruiter's record."""

    def update_profile(self, resume: OnlineResume, *, display_name: str, resume_json: dict) -> OnlineResume:
        """Only editable structured fields; never rewrite chat/source/owner/demand."""

    def delete(self, resume: OnlineResume) -> None:
        """Hard-delete the online resume; do not delete import audit events."""

    def serialize(self, resume: OnlineResume) -> dict:
        """Return the stable API payload including demand summary and latest chat."""
```

Validate `display_name` to 100 characters, `boss_account` to 160, identifiers to 200, `resume_json` as an object, and `chat_json` as a list of objects containing `sender`, `text`, and `sent_at`. Resolve every `demand_id` with `resolve_demand_context(org_id=org_id, demand_id=item["demand_id"], open_only=True)` and require `can_manage_demand(owner_hr_id, role, org_id, demand)`.

- [ ] **Step 4: Add the authenticated routes**

Create these routes:

```python
# backend/app/api/agent_imports.py
bp = Blueprint("agent_imports", __name__)

@bp.post("/agent-imports/online-resumes")
@require_auth
@require_role("recruiter")
def import_online_resumes():
    payload = request.get_json(silent=True) or {}
    result = OnlineResumeService().import_batch(
        org_id=g.org_id,
        owner_hr_id=g.user_id,
        role=g.role,
        items=payload.get("items"),
    )
    return jsonify(result), 200
```

```python
# backend/app/api/online_resumes.py
@bp.get("/online-resumes")
@require_auth
@require_role("recruiter", "manager", "admin")
def list_online_resumes():
    result = OnlineResumeService().list_for_actor(
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
        page=max(1, request.args.get("page", 1, type=int)),
        per_page=min(100, max(1, request.args.get("per_page", 20, type=int))),
        demand_id=request.args.get("demand_id", type=int),
    )
    return jsonify(result)

@bp.get("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def online_resume_detail(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    return jsonify({"item": service.serialize(resume)})

@bp.patch("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def update_online_resume(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    payload = request.get_json(silent=True) or {}
    updated = service.update_profile(
        resume,
        display_name=payload.get("display_name", resume.display_name),
        resume_json=payload.get("resume_json", resume.resume_json),
    )
    return jsonify({"item": service.serialize(updated)})

@bp.delete("/online-resumes/<int:resume_id>")
@require_auth
@require_role("recruiter", "manager", "admin")
def delete_online_resume(resume_id):
    service = OnlineResumeService()
    resume = service.get_for_actor(
        resume_id,
        org_id=g.org_id,
        actor_id=g.user_id,
        role=g.role,
    )
    if resume is None:
        return jsonify({"error": "在线简历不存在"}), 404
    service.delete(resume)
    return jsonify({"ok": True})
```

All missing or out-of-scope records return `{"error": "在线简历不存在"}`, 404. Register both blueprints in `backend/app/__init__.py` with `/api` prefix.

- [ ] **Step 5: Run focused backend tests**

```bash
cd backend && pytest -q tests/test_online_resume_imports.py tests/test_auth_security.py tests/test_access_control_hardening.py
```

Expected: PASS.

- [ ] **Step 6: Commit the online-resume backend slice**

```bash
git add backend/app/__init__.py backend/app/api/agent_imports.py backend/app/api/online_resumes.py backend/app/services/online_resume_service.py backend/tests/test_online_resume_imports.py
git commit -m "feat: import and manage recruiter online resumes"
```

---

### Task 3: Let Agents import structured full resumes into the existing library

**Files:**
- Create: `backend/tests/test_agent_full_resume_import.py`
- Modify: `backend/app/api/agent_imports.py`
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/app/services/resumes/parse_service.py`
- Modify: `backend/app/services/resumes/upload_service.py`

- [ ] **Step 1: Write the failing full-import test**

```python
import io
import json


def _make_full_resume_demand(app, owner_id):
    with app.app_context():
        from app import db
        from app.models import Job, RecruitmentDemand
        job = Job(org_id=1, title="Java开发", jd_text="Java", owner_hr_id=owner_id)
        db.session.add(job)
        db.session.flush()
        demand = RecruitmentDemand(
            org_id=1,
            job_id=job.id,
            owner_hr_id=owner_id,
            job_title_snapshot="Java开发",
            request_no="REQ-FULL-001",
            status="active",
        )
        db.session.add(demand)
        db.session.commit()
        return demand.id


def test_agent_full_resume_uses_structured_data_when_ai_is_disabled(client, make_user, app, tmp_path):
    owner_id, token = make_user("agent-full@example.com", role="recruiter")
    demand_id = _make_full_resume_demand(app, owner_id)
    app.config.update(RESUME_AI_ENABLED=False, UPLOAD_FOLDER=str(tmp_path))
    resume_json = {
        "extracted_info": {
            "name": "完整候选人",
            "phone": "13800138000",
            "email": "candidate@example.com",
            "target_position": "Java开发",
        },
        "skills": [{"tag": "Spring Boot", "score": 1}],
    }
    metadata = {
        "items": [{
            "filename": "full.pdf",
            "external_import_id": "full-import-001",
            "resume_json": resume_json,
        }]
    }
    response = client.post(
        "/api/agent-imports/full-resumes",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "target_demand_id": str(demand_id),
            "boss_account": "何龙-BOSS账号",
            "source_link": "https://www.zhipin.com/web/chat/index",
            "metadata_json": json.dumps(metadata, ensure_ascii=False),
            "files": (io.BytesIO(b"%PDF-1.4 complete resume"), "full.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    result = response.get_json()["results"][0]
    assert result["status"] == "ok"

    with app.app_context():
        from app.models import Candidate, OnlineResume
        candidate = Candidate.query.filter_by(owner_hr_id=owner_id).one()
        assert candidate.resume_json == resume_json
        assert candidate.raw_file_data == b"%PDF-1.4 complete resume"
        assert candidate.parse_status == "ok"
        assert candidate.current_demand_id == demand_id
        assert OnlineResume.query.count() == 0
```

Also test: missing demand returns 400, missing structure for any file returns 400 before creating a batch, ZIP is rejected for this Agent endpoint, duplicate file uses the existing duplicate response, and two valid files in one request create two candidates.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd backend && pytest -q tests/test_agent_full_resume_import.py
```

Expected: FAIL because `/api/agent-imports/full-resumes` does not exist.

- [ ] **Step 3: Add structured candidate creation**

Add to `ResumeBatchService`:

```python
def create_from_structured_resume(
    self,
    *,
    file_path: str,
    owner_hr_id: int,
    parse_result: dict,
    upload_batch_id: int,
    org_id: int,
    resume_sha256: str,
    raw_file_name: str,
    raw_file_data: bytes,
) -> Candidate:
    normalized = self.normalize_structured_resume(parse_result)
    candidate = Candidate(
        org_id=org_id,
        owner_hr_id=owner_hr_id,
        upload_batch_id=upload_batch_id,
        resume_json={},
        raw_file_path=file_path,
        raw_file_name=raw_file_name,
        raw_file_data=raw_file_data,
        resume_sha256=resume_sha256,
        parse_status="ok",
    )
    db.session.add(candidate)
    db.session.flush()
    self._apply_parse_result(candidate, normalized)
    db.session.commit()
    return candidate

def normalize_structured_resume(self, parse_result: dict) -> dict:
    if not isinstance(parse_result, dict):
        raise ValueError("结构化简历必须是对象")
    encoded = json.dumps(parse_result, ensure_ascii=False).encode("utf-8")
    if len(encoded) > 1024 * 1024:
        raise ValueError("结构化简历内容超过1MB")
    normalized = dict(parse_result)
    normalized["extracted_info"] = self._sanitize_profile(
        parse_result.get("extracted_info") or {}
    )
    normalized["skills"] = self._sanitize_skills(parse_result.get("skills") or [])
    return normalized
```

Import `json` in `resume_service.py`. This normalization preserves full work/project/education sections while bounding the editable profile, skills, and total JSON size.

- [ ] **Step 4: Add the pre-parsed branch without disturbing normal uploads**

Extend `_process_resume(svc, fpath, display_name, results, upload_batch_id=None, target_demand_id=None, target_job_id=None, structured_resume=None)`. After file-fingerprint duplicate detection and before the `RESUME_AI_ENABLED` check, call `create_from_structured_resume` when `structured_resume` is present. Then run the existing identity duplicate check, `resume.uploaded` event, `_add_to_target_pipeline`, and result construction exactly as the normal successful parse path.

Refactor only the common post-parse block into `_finalize_successful_resume(candidate, display_name, results, target_demand_id, target_job_id, fpath)`; do not duplicate pipeline or deduplication rules.

- [ ] **Step 5: Add the Agent full-resume route**

Add to `backend/app/api/agent_imports.py`:

```python
@bp.post("/agent-imports/full-resumes")
@require_auth
@require_role("recruiter")
def import_full_resumes():
    return handle_resume_upload(
        require_target_demand=True,
        require_structured_metadata=True,
        source_channel_override="BOSS直聘",
        reject_zip=True,
    )
```

Extend `handle_resume_upload` with keyword-only flags. Parse `metadata_json` once into a filename-keyed dictionary, require one metadata item per uploaded file, require a non-empty `external_import_id`, and pass each `resume_json` to `_process_resume`. Keep ordinary `/api/resume/upload` behavior unchanged when flags use defaults.

- [ ] **Step 6: Run existing and new upload tests**

```bash
cd backend && pytest -q \
  tests/test_agent_full_resume_import.py \
  tests/test_resume_ai_disabled_trial.py \
  tests/test_resume_upload_duplicate_blocking.py \
  tests/test_resume_recovery_workflow.py
```

Expected: PASS. The new Agent test must prove the model parser was not called.

- [ ] **Step 7: Commit the full-resume import slice**

```bash
git add backend/app/api/agent_imports.py backend/app/services/resume_service.py backend/app/services/resumes/parse_service.py backend/app/services/resumes/upload_service.py backend/tests/test_agent_full_resume_import.py
git commit -m "feat: accept structured full resumes from agents"
```

---

### Task 4: Count imported online resumes in the existing monthly view

**Files:**
- Modify: `backend/app/services/bi_service.py`
- Modify: `backend/tests/test_bi_monthly_performance.py`
- Modify: `readdy-frontend/src/features/analytics/types.ts`
- Modify: `readdy-frontend/src/features/analytics/components/MonthlyPerformancePanel.tsx`

- [ ] **Step 1: Write the failing BI test**

In `backend/tests/test_bi_monthly_performance.py`, insert two `Event` rows with action `online_resume.imported` for the selected recruiter inside the requested month, one outside the month, and one for another recruiter. Assert:

```python
assert payload["summary"]["online_resume_imports"] == 2
```

Delete the corresponding `OnlineResume` row before calling the API and keep the assertion at `2`, proving manual deletion does not reduce the count.

- [ ] **Step 2: Run the BI test and confirm it fails**

```bash
cd backend && pytest -q tests/test_bi_monthly_performance.py
```

Expected: FAIL because `online_resume_imports` is absent.

- [ ] **Step 3: Add the objective event count**

Inside `build_monthly_staff_performance`, count:

```python
online_resume_imports = Event.query.filter(
    Event.org_id == org_id,
    Event.actor_id == hr_id,
    Event.action == "online_resume.imported",
    Event.result == "success",
    Event.ts >= start,
    Event.ts < end,
).count()
```

Add it to `summary` as `"online_resume_imports": online_resume_imports`. Do not include it in funnel conversion rates, progress score, ranking, or bonus logic.

- [ ] **Step 4: Add the frontend field and metric**

Add `online_resume_imports: number` to `MonthlyPerformance.summary`. Add:

```tsx
<SummaryMetric label="在线简历导入" value={performance.summary.online_resume_imports} suffix=" 份" />
```

Change the summary grid to `lg:grid-cols-8`. Keep the panel purpose copy objective and non-ranking.

- [ ] **Step 5: Run focused tests and type checks**

```bash
cd backend && pytest -q tests/test_bi_monthly_performance.py
cd ../readdy-frontend && npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit the KPI slice**

```bash
git add backend/app/services/bi_service.py backend/tests/test_bi_monthly_performance.py readdy-frontend/src/features/analytics/types.ts readdy-frontend/src/features/analytics/components/MonthlyPerformancePanel.tsx
git commit -m "feat: count imported online resumes"
```

---

### Task 5: Build the recruiter online-resume page

**Files:**
- Create: `readdy-frontend/src/features/onlineResumes/types.ts`
- Create: `readdy-frontend/src/features/onlineResumes/api.ts`
- Create: `readdy-frontend/src/features/onlineResumes/components/OnlineResumeList.tsx`
- Create: `readdy-frontend/src/features/onlineResumes/components/OnlineResumeDetailDrawer.tsx`
- Create: `readdy-frontend/src/pages/online-resumes/page.tsx`
- Create: `readdy-frontend/tests/online-resume-mvp-contract.test.mjs`

- [ ] **Step 1: Write the failing frontend contract test**

The test must assert that:

- `src/pages/online-resumes/page.tsx` imports only from `features/onlineResumes`.
- API calls use `/online-resumes`, `/online-resumes/:id`, PATCH, and DELETE.
- The page contains no runtime import from `@/mocks`.
- The detail renders `StructuredResumeView` and a full chat timeline.
- The page has edit and delete actions.
- The page contains no message textbox and no send/reply API.

Run:

```bash
cd readdy-frontend && node --import tsx --test tests/online-resume-mvp-contract.test.mjs
```

Expected: FAIL because the feature does not exist.

- [ ] **Step 2: Define the API contracts**

```typescript
export interface OnlineResumeChatMessage {
  sender: 'recruiter' | 'candidate' | 'system';
  text: string;
  sent_at: string;
}

export interface OnlineResumeItem {
  id: number;
  display_name: string;
  demand: { id: number; request_no: string; title: string };
  boss_account: string;
  source_platform: string;
  source_url: string;
  resume_json: Record<string, unknown>;
  chat_json: OnlineResumeChatMessage[];
  latest_chat: OnlineResumeChatMessage | null;
  created_at: string;
  updated_at: string;
}

export interface OnlineResumeListResponse {
  items: OnlineResumeItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
```

Expose `list`, `detail`, `update`, and `remove` from `onlineResumesApi` using `apiRequest`.

- [ ] **Step 3: Build the list page**

The list must show name, demand, BOSS account, latest chat text/time, import time, and row actions. It must render four explicit states: loading, load failure with retry, true empty state (`暂无Agent导入的在线简历`), and populated list. Use real API data only.

Compose the page as:

```tsx
export default function OnlineResumesPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground-900">在线简历</h1>
        <p className="mt-1 text-sm text-foreground-500">查看外部Agent导入的在线简历和完整聊天记录</p>
      </header>
      <OnlineResumeList />
    </div>
  );
}
```

- [ ] **Step 4: Build the detail drawer**

Use `StructuredResumeView` for read mode. Render every chat item with sender label, timestamp, and full text in chronological order. Edit mode exposes only structured profile fields and saves `display_name` plus `resume_json`. Delete uses one confirmation dialog with the exact warning: `删除后在线简历内容无法恢复，但已统计的导入数量不会减少。`

Do not add status controls, pipeline controls, candidate linkage, message input, or send buttons.

- [ ] **Step 5: Run frontend focused checks**

```bash
cd readdy-frontend && \
node --import tsx --test tests/online-resume-mvp-contract.test.mjs && \
npm run type-check && \
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit the page slice**

```bash
git add readdy-frontend/src/features/onlineResumes readdy-frontend/src/pages/online-resumes readdy-frontend/tests/online-resume-mvp-contract.test.mjs
git commit -m "feat: add recruiter online resume library"
```

---

### Task 6: Wire navigation, permissions, page memory, and smoke coverage

**Files:**
- Modify: `readdy-frontend/src/router/config.tsx`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/src/auth/companyPagePermissions.ts`
- Modify: `readdy-frontend/src/features/navigation/pageMemory.ts`
- Modify: `readdy-frontend/tests/company-page-permissions.test.mjs`
- Modify: `readdy-frontend/tests/page-state-memory-contract.test.mjs`
- Modify: `readdy-frontend/e2e/core-role-smoke.spec.ts`

- [ ] **Step 1: Add failing route and permission assertions**

Assert:

```javascript
assert.equal(requiredMenuCodeForPath('/online-resumes'), 'candidates');
assert.equal(memoryKeyForPath('/online-resumes'), '/online-resumes');
```

Update the recruiter smoke case to expect navigation text `在线简历`, then add a recruiter-only smoke test that opens `/online-resumes` and sees the heading.

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd readdy-frontend && node --import tsx --test \
  tests/company-page-permissions.test.mjs \
  tests/page-state-memory-contract.test.mjs
```

Expected: FAIL because the route is not registered.

- [ ] **Step 3: Register the route and navigation**

Add:

```tsx
const OnlineResumesPage = lazy(() => import('@/pages/online-resumes/page'));
```

and under the authenticated layout:

```tsx
{
  path: '/online-resumes',
  element: <RequireCompanyRole allow={hrRoles}><OnlineResumesPage /></RequireCompanyRole>,
},
```

Add only to `recruiterNavItems`:

```typescript
{ path: '/online-resumes', icon: 'ri-chat-history-line', label: '在线简历', roles: ['recruiter'], menuCode: 'candidates' },
```

Add `/online-resumes` before `/candidates` in `PAGE_MENU_RULES` and to `rememberedModulePaths`.

- [ ] **Step 4: Run route contracts and build**

```bash
cd readdy-frontend && \
npm run test:contract && \
npm run type-check && \
npm run lint && \
npm run build
```

Expected: all contract tests pass, TypeScript and ESLint exit 0, and Vite produces `out/`.

- [ ] **Step 5: Run recruiter browser smoke**

```bash
cd readdy-frontend && npm run test:e2e:smoke -- --grep "recruiter|在线简历"
```

Expected: recruiter can see and open `在线简历`; other core role smoke cases remain green.

- [ ] **Step 6: Commit the wiring slice**

```bash
git add readdy-frontend/src/router/config.tsx readdy-frontend/src/components/feature/MainLayout.tsx readdy-frontend/src/auth/companyPagePermissions.ts readdy-frontend/src/features/navigation/pageMemory.ts readdy-frontend/tests/company-page-permissions.test.mjs readdy-frontend/tests/page-state-memory-contract.test.mjs readdy-frontend/e2e/core-role-smoke.spec.ts
git commit -m "feat: expose recruiter online resume page"
```

---

### Task 7: Advance schema identity and synchronize product, BI, and deployment docs

**Files:**
- Modify: `backend/app/build_info.py`
- Modify: `backend/scripts/audit_mysql_pilot_schema.py`
- Modify: `backend/scripts/backfill_demand_scope.py`
- Modify: `backend/scripts/prepare_mysql_pilot.py`
- Modify: `backend/scripts/verify_demand_scope.py`
- Modify: `scripts/check-sit-release.sh`
- Modify schema-revision assertions under `backend/tests/`
- Modify: `docs/01_PRD.md`
- Modify: `docs/03_BI看板设计.md`
- Modify: `docs/README.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Modify: `RUNNING.md`
- Modify: `DEPLOYMENT.md`
- Modify: `docs/06_试点上线检查清单.md`
- Modify: `docs/07_上线部署前关键清单_给AI执行.md`
- Modify: `docs/08_Libra_SIT发布路线.md`

- [ ] **Step 1: Write the failing build/schema assertions**

Change `backend/tests/test_healthcheck.py` and migration-head assertions to expect `20260807_16`, then run:

```bash
cd backend && pytest -q tests/test_healthcheck.py tests/test_online_resume_migration.py tests/test_pilot_recruitment_schema.py
```

Expected: FAIL until build and script constants are advanced.

- [ ] **Step 2: Advance all live schema constants**

Set every live expected revision from `20260806_15` to `20260807_16` in build info, readiness/audit scripts, release check, and current regression assertions. Do not edit archived historical plans that intentionally record older revisions.

- [ ] **Step 3: Update product and technical truth docs**

Document these exact facts:

- The new `在线简历` recruiter menu is separate from `简历库`.
- External Agents push data into智聘;智聘 does not start or control Agents.
- Online resumes retain full chat snapshots and are visible only to their recruiter owner.
- Full resumes can be imported directly and reuse the existing candidate library.
- The two libraries do not auto-link, move, overwrite, or delete each other.
- Monthly staff view adds only the objective imported-online-resume count; it is not ranking or automatic performance judgment.
- Schema head `20260807_16` adds the independent `online_resumes` table.

- [ ] **Step 4: Run documentation and deployment contract tests**

```bash
cd backend && pytest -q \
  tests/test_healthcheck.py \
  tests/test_online_resume_migration.py \
  tests/test_deployment_artifacts.py \
  tests/test_pilot_recruitment_schema.py \
  tests/test_demand_scope_migration.py
cd ../readdy-frontend && node --import tsx --test tests/release-audit-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the schema/docs slice**

Stage only the listed live files and commit:

```bash
git commit -m "docs: document agent resume import mvp"
```

---

### Task 8: Run full verification and inspect the real user flow

**Files:**
- No planned source changes; fix only failures caused by Tasks 1–7 and commit each focused fix separately.

- [ ] **Step 1: Run the complete backend suite**

```bash
cd backend && pytest -q
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the complete frontend gates**

```bash
cd readdy-frontend && \
npm run test:contract && \
npm run type-check && \
npm run lint && \
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run relevant browser tests**

```bash
cd readdy-frontend && npm run test:e2e:smoke -- --grep "recruiter|在线简历"
```

Expected: recruiter login, navigation, true empty state, populated list, full chat drawer, edit, and delete all work without a message-send control.

- [ ] **Step 4: Run release and diff checks**

```bash
./scripts/check-sit-release.sh
git diff --check
git status --short
```

Expected: release gate passes, no whitespace errors, and only intentional changes remain.

- [ ] **Step 5: Perform one end-to-end API proof**

Using a test recruiter and one open demand:

1. Import two selected online resumes in one Agent request.
2. Re-import one with a longer complete chat snapshot and verify it updates without increasing the count.
3. Delete one online resume and verify monthly imported count remains two.
4. Import one structured full resume directly while `RESUME_AI_ENABLED=false`.
5. Verify the full candidate appears in the existing candidate library and the remaining online resume stays untouched.

Save request/response evidence under `docs/verification/2026-08-07-agent-resume-import-mvp/` without real candidate data or secrets.

- [ ] **Step 6: Commit verification evidence**

```bash
git add docs/verification/2026-08-07-agent-resume-import-mvp
git commit -m "test: verify agent resume import mvp"
```

---

## Final acceptance checklist

- [ ] Online and full resume libraries remain independent.
- [ ] Recruiter sees only their own online resumes.
- [ ] One online resume remains bound to one recruiter and one BOSS account.
- [ ] Full chat history is retained and displayed read-only.
- [ ] Recruiter can edit structured online-resume data and hard-delete the online resume.
- [ ] Deletion does not reduce the imported-online-resume count.
- [ ] Agent can import only selected online resumes rather than the whole BOSS inbox.
- [ ] Agent can directly import structured full resumes into the current candidate library.
- [ ] Agent-provided structured full resumes do not call the LLM parser.
- [ ] No BOSS messaging, Agent orchestration, auto-linking, auto-moving, or auto-deleting is added.
- [ ] Existing upload, candidate, pipeline, interview, Offer, and BI regression suites remain green.
