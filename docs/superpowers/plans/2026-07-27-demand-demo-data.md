# Recruitment Demand Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idempotent, local-SQLite-only demo suite that makes every recruitment-demand status and row action discoverable to the recruiter.

**Architecture:** Add one standalone backend script that reuses the current Flask models and the seeded `hr01`, `interviewer01`, job template, and organization. Fixed request numbers make the operation an upsert, while a separate subprocess test proves state coverage, idempotency, candidate linkage, and the non-SQLite safety gate without modifying `seed_dev.py`.

**Tech Stack:** Python, Flask-SQLAlchemy, SQLite, pytest, existing React recruiter UI.

---

## File map

- Create `backend/scripts/add_demand_demo_data.py`: safety gate, five scenario definitions, demand/candidate upsert, CLI output.
- Create `backend/tests/test_demand_demo_data.py`: isolated SQLite subprocess and pure safety-gate tests.
- Do not modify `backend/seed_dev.py` or `backend/tests/test_seed_dev_demand_scope.py`; both already contain unrelated local work.

### Task 1: Freeze the five-scenario contract

**Files:**
- Create: `backend/tests/test_demand_demo_data.py`

- [ ] **Step 1: Write the failing safety-gate test**

Create a test that loads the not-yet-existing script and requires non-SQLite URLs to fail before any connection:

```python
import importlib.util
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND_DIR / "scripts" / "add_demand_demo_data.py"

def load_demo_module():
    spec = importlib.util.spec_from_file_location("add_demand_demo_data", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module

def test_demand_demo_rejects_non_sqlite_before_writing():
    module = load_demo_module()
    with pytest.raises(RuntimeError, match="只允许写入本地 SQLite"):
        module.require_local_sqlite("mysql+pymysql://user:secret@example/db")
```

- [ ] **Step 2: Write the failing subprocess/idempotency test**

Bootstrap a temporary SQLite database, run `seed_dev.py`, then run the new script twice. Query `recruitment_demands` and require exactly these fixed rows:

```python
EXPECTED = {
    "DEMO-DEMAND-PENDING": ("pending", "pending"),
    "DEMO-DEMAND-ACTIVE": ("active", "approved"),
    "DEMO-DEMAND-FILLED": ("filled", "approved"),
    "DEMO-DEMAND-PAUSED": ("paused", "approved"),
    "DEMO-DEMAND-CLOSED": ("closed", "approved"),
}
```

Also assert: five rows after both runs; pending has `submitted_at` and was created by `interviewer01@mvp.local`; every row belongs to `hr01@mvp.local`; active/filled/closed each has one `需求演示-*` candidate flow; output contains no database URL or password.

- [ ] **Step 3: Run the test and verify RED**

Run: `.venv/bin/pytest backend/tests/test_demand_demo_data.py -q`

Expected: FAIL because `backend/scripts/add_demand_demo_data.py` does not exist.

- [ ] **Step 4: Commit the test contract**

```bash
git add backend/tests/test_demand_demo_data.py
git commit -m "test: define demand demo data scenarios"
```

### Task 2: Implement the guarded idempotent script

**Files:**
- Create: `backend/scripts/add_demand_demo_data.py`
- Test: `backend/tests/test_demand_demo_data.py`

- [ ] **Step 1: Add the SQLite safety gate and scenario constants**

Use `sqlalchemy.engine.make_url` and return the resolved database path only for SQLite:

```python
SCENARIOS = (
    ("DEMO-DEMAND-PENDING", "演示需求-待审核", "pending", "pending"),
    ("DEMO-DEMAND-ACTIVE", "演示需求-招聘中", "active", "approved"),
    ("DEMO-DEMAND-FILLED", "演示需求-已完成", "filled", "approved"),
    ("DEMO-DEMAND-PAUSED", "演示需求-已暂停", "paused", "approved"),
    ("DEMO-DEMAND-CLOSED", "演示需求-已关闭", "closed", "approved"),
)

def require_local_sqlite(database_url: str) -> Path:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        raise RuntimeError("演示需求脚本只允许写入本地 SQLite 数据库")
    if not url.database or url.database == ":memory:":
        raise RuntimeError("演示需求脚本需要本地 SQLite 文件")
    path = Path(url.database)
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()
```

- [ ] **Step 2: Implement demand upsert**

Inside an app context, require `hr01@mvp.local`, `interviewer01@mvp.local`, and base demand `DEMO-2026-001`. For each fixed request number, create or update a `RecruitmentDemand` using the base demand's `org_id`, `job_id`, and `default_interviewer_id`; set city/department/JD/HC/priority/dates and a note explaining the button to demonstrate.

For pending set `created_by=interviewer.id`, `submitted_at=now`, and clear review fields. For all other rows set `created_by=recruiter.id`, `reviewed_by=recruiter.id`, and `reviewed_at=now`. Paused/closed receive visible `close_reason` and `closed_at`; other scenarios clear them.

- [ ] **Step 3: Add idempotent linked candidates**

For active, filled, and closed scenarios create one fixed candidate (`需求演示-招聘中候选人`, `需求演示-已完成候选人`, `需求演示-已关闭候选人`) if missing. Upsert one `CandidateDemandFlow` per candidate/demand and one latest `PipelineStage`: `business_review`, `onboarded`, and `interview` respectively. Re-running must update existing rows, not add duplicates.

- [ ] **Step 4: Add CLI behavior**

Read the effective URL from `AppConfig.SQLALCHEMY_DATABASE_URI`, run `require_local_sqlite` before mutation, then call `add_demand_demo_data()`. Print only counts and scenario names; never print the URL.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `.venv/bin/pytest backend/tests/test_demand_demo_data.py -q`

Expected: all tests pass.

- [ ] **Step 6: Run nearby regression tests**

Run: `.venv/bin/pytest backend/tests/test_demand_approval.py backend/tests/test_demand_escape_hatches.py backend/tests/test_seed_dev_demand_scope.py -q`

Expected: all tests pass with zero failures.

- [ ] **Step 7: Commit implementation**

```bash
git add backend/scripts/add_demand_demo_data.py backend/tests/test_demand_demo_data.py
git commit -m "feat: add recruitment demand demo suite"
```

### Task 3: Populate the current local demo and validate every entry point

**Files:**
- No code changes expected.

- [ ] **Step 1: Confirm the target is local SQLite**

Run: `cd backend && ../.venv/bin/python -c "from app.config import AppConfig; from scripts.add_demand_demo_data import require_local_sqlite; print(require_local_sqlite(AppConfig.SQLALCHEMY_DATABASE_URI).name)"`

Expected: a local `.db` filename only; no host or credentials.

- [ ] **Step 2: Populate twice to prove idempotency locally**

Run twice: `cd backend && ../.venv/bin/python scripts/add_demand_demo_data.py`

Expected: first run reports created/updated scenarios; second run reports the same five scenarios with no duplicate rows.

- [ ] **Step 3: Browser acceptance as recruiter**

Open `/jobs` as `hr01`. Verify the five named rows are discoverable under `待审核`, `招聘中`, `已完成`, and `已停止`. Open each row and verify: pending shows “通过/不通过”; active shows “选候选人” and status menu; filled/paused/closed expose the appropriate view/restore actions. Open candidate drawers but do not confirm through/reject/close/restore, so the demo states remain reusable.

- [ ] **Step 4: Record evidence**

Append the five visible rows, tab counts, and available actions to `PROGRESS.md`; write `BLOCKED.md` as `无` unless a real limitation remains.

### Task 4: Full regression and handoff

**Files:**
- Modify only if verification finds a defect: `backend/scripts/add_demand_demo_data.py`, `backend/tests/test_demand_demo_data.py`

- [ ] **Step 1: Run backend full suite**

Run: `.venv/bin/pytest backend/tests -q`

Expected: zero failures; baseline before this feature was 578 passing tests.

- [ ] **Step 2: Run frontend regression checks**

```bash
rg --files frontend/tests -g '*.test.mjs' -g '!readdy_zip_exact_parity.test.mjs' | xargs node --test
npm --prefix readdy-frontend run lint
npm --prefix readdy-frontend run type-check
npm --prefix readdy-frontend run build
```

Expected: frontend tests, lint, type-check, and build exit 0.

- [ ] **Step 3: Verify repository hygiene**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; pre-existing `seed_dev.py`, `test_seed_dev_demand_scope.py`, interview demo script, and `.superpowers/` changes remain preserved and uncommitted unless they were already committed by their owner.

- [ ] **Step 4: Final commit if verification required fixes**

```bash
git add backend/scripts/add_demand_demo_data.py backend/tests/test_demand_demo_data.py
git commit -m "fix: harden demand demo data setup"
```
