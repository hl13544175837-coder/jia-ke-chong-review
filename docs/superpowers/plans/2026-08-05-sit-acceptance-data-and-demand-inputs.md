# SIT Acceptance Data and Demand Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow flexible job, department, and recruitment-location input, then add a guarded idempotent acceptance-data suite to Test/SIT.

**Architecture:** Reuse the existing transactional `create_demand_from_input` path for custom interviewer jobs so the job and pending demand succeed or roll back together. Keep department and location flexibility entirely in the frontend because the backend already stores free text. Add a standalone RC/SIT-only ORM script whose records are identified by fixed acceptance markers and whose default mode is read-only preview.

**Tech Stack:** React 19, TypeScript, Flask, SQLAlchemy, pytest, Node source-contract tests, GitLab/Libra/K8S.

---

### Task 1: Allow interviewers to submit a custom job

**Files:**
- Modify: `backend/tests/test_demand_approval.py`
- Modify: `backend/app/services/demand_service.py`
- Modify: `readdy-frontend/src/features/demands/types.ts`
- Modify: `readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- Create: `readdy-frontend/tests/flexible-demand-inputs.test.mjs`

- [ ] **Step 1: Replace the old backend rejection test with the desired behavior**

Add a test that posts an interviewer demand without `job_id`, with `job_title` and `jd_text`, and asserts HTTP 201, a newly created Job, `approval_status == "pending"`, `status == "pending"`, and `created_by == interviewer_id`.

```python
def test_interviewer_can_submit_custom_job_as_pending_demand(client, make_user, app):
    interviewer_id, token = make_user("business-custom-job@example.com", role="interviewer")
    hr_id, _ = make_user("hr-custom-job@example.com", role="recruiter")
    response = client.post("/api/demands", headers=_auth(token), json={
        "job_title": "海外履约产品经理",
        "jd_text": "负责海外履约产品设计与跨区域协同。",
        "owner_hr_id": hr_id,
        "city": "新加坡",
        "requester_department": "海外业务部",
        "hiring_manager_name": "业务负责人",
        "requested_at": "2026-08-05",
        "target_date": "2026-09-30",
        "headcount": 1,
    })
    assert response.status_code == 201
    body = response.get_json()
    assert body["job_title"] == "海外履约产品经理"
    assert body["approval_status"] == "pending"
    assert body["status"] == "pending"
    with app.app_context():
        assert db.session.get(Job, body["job_id"]).title == "海外履约产品经理"
```

- [ ] **Step 2: Run the backend test and verify RED**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_demand_approval.py::test_interviewer_can_submit_custom_job_as_pending_demand -q`

Expected: FAIL with the current `job_id` validation error.

- [ ] **Step 3: Write the frontend source-contract test and verify RED**

The test must require a `customJob` draft field, a “自定义新岗位” option, a `job_title` payload branch, editable department suggestions, and an editable recruitment-location input.

Run: `node --test readdy-frontend/tests/flexible-demand-inputs.test.mjs`

Expected: FAIL because those controls do not exist yet.

- [ ] **Step 4: Implement the minimal backend behavior**

In `validate_create_input`, remove the interviewer-only `job_id` rejection and validate `job_title` plus `jd_text` whenever `job is None`. Keep the existing transaction and pending-demand rules unchanged.

```python
if job is None:
    if not title:
        fields["job_title"] = "请填写职位名称"
    if not jd_text:
        fields["jd_text"] = "请填写 JD"
```

- [ ] **Step 5: Implement the interviewer custom-job form**

Add `customJobTitle` to `DemandDraft`. Keep the template select and add `<option value="custom">自定义新岗位</option>`. When custom is selected, show a required job-title input, keep JD editable, and submit `job_title` without `job_id`.

```ts
const payload: BusinessDemandInput = {
  ...editable,
  ...(draft.jobId === 'custom'
    ? { job_title: draft.customJobTitle.trim() }
    : { job_id: Number(draft.jobId) }),
  owner_hr_id: Number(draft.ownerHrId),
  default_interviewer_id: userId ?? undefined,
  priority: draft.priority,
  status: 'pending',
  focus_points,
};
```

Change `BusinessDemandInput` so `job_id` is optional and `job_title` remains available from `RecruitmentDemandInput`.

- [ ] **Step 6: Run focused backend and frontend tests and verify GREEN**

Run:

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_demand_approval.py -q
cd .. && node --test readdy-frontend/tests/flexible-demand-inputs.test.mjs
```

Expected: both commands PASS.

### Task 2: Make department and recruitment location editable

**Files:**
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionForm.tsx`
- Modify: `readdy-frontend/tests/flexible-demand-inputs.test.mjs`

- [ ] **Step 1: Extend the failing frontend test**

Assert that the form contains text inputs linked to datalists named `department-suggestions` and `location-suggestions`, and that the old two required province/city selects are absent.

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `node --test readdy-frontend/tests/flexible-demand-inputs.test.mjs`

Expected: FAIL on the current hard-coded department and province/city selects.

- [ ] **Step 3: Implement editable suggestions**

Replace the department select with a text input plus the six existing options in a datalist. Replace province/city controls with one `city` text input whose datalist is built from `provinceCityData.flatMap((province) => province.cities)` and also includes `海外` and `远程办公`.

```tsx
<input required list="department-suggestions" value={formData.department} />
<datalist id="department-suggestions">
  {departmentSuggestions.map((department) => (
    <option key={department} value={department} />
  ))}
</datalist>
<input required list="location-suggestions" value={formData.city} />
<datalist id="location-suggestions">
  {locationSuggestions.map((location) => (
    <option key={location} value={location} />
  ))}
</datalist>
```

Remove the unused `province` state and `useMemo` city derivation.

- [ ] **Step 4: Run the frontend test and verify GREEN**

Run: `node --test readdy-frontend/tests/flexible-demand-inputs.test.mjs`

Expected: PASS.

### Task 3: Add guarded idempotent Test/SIT acceptance data

**Files:**
- Create: `backend/scripts/add_sit_acceptance_data.py`
- Create: `backend/tests/test_sit_acceptance_data.py`
- Modify: `RUNNING.md`

- [ ] **Step 1: Write failing environment and idempotency tests**

Tests must prove:

1. default preview does not change table counts;
2. GA or non-SIT config raises before writes;
3. first `apply=True` creates the fixed scenario suite;
4. second `apply=True` leaves Job, Demand, Candidate, BusinessReviewTask, InterviewAssignment, InterviewFeedback, OfferRecord, and OfferEvent counts unchanged;
5. non-acceptance records are unchanged.

Use a bootstrapped temporary SQLite database and create `hr01@mvp.local` plus `100002@gateway.local` as the two actors.

- [ ] **Step 2: Run the script test and verify RED**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sit_acceptance_data.py -q`

Expected: ERROR because `scripts/add_sit_acceptance_data.py` does not exist.

- [ ] **Step 3: Implement preview and environment guards**

Expose:

```python
def ensure_sit_allowed(config):
    if config.get("BUILD_CHANNEL") != "RC" or not config.get("ALLOW_INSECURE_SIT_STARTUP"):
        raise RuntimeError("验收测试数据只允许写入 RC/SIT 环境")

def inspect_acceptance_data():
    return {"jobs": 0, "demands": 0, "candidates": 0}

def apply_acceptance_data():
    ensure_sit_allowed(current_app.config)
    return upsert_acceptance_suite()
```

Allow writes only when `BUILD_CHANNEL == "RC"` and `ALLOW_INSECURE_SIT_STARTUP` is true. CLI default prints preview; `--apply` calls `apply_acceptance_data`.

- [ ] **Step 4: Implement marker-owned upserts**

Use a fixed Job code `ACCEPTANCE-TEST-JOB-001`, Demand request numbers beginning `ACCEPTANCE-TEST-`, and candidate names beginning `验收测试-`. Refuse execution if any fixed marker has duplicates. Never delete or update an unmarked record.

Create pending and approved demands, business-review tasks, interview assignments, completed feedback, and Offer lifecycle records tied to the current Test interviewer and a seeded recruiter.

- [ ] **Step 5: Run the script test and verify GREEN**

Run: `cd backend && ../.venv/bin/python -m pytest tests/test_sit_acceptance_data.py -q`

Expected: PASS.

- [ ] **Step 6: Document the exact preview/apply commands**

Add to `RUNNING.md`:

```bash
python /app/backend/scripts/add_sit_acceptance_data.py
python /app/backend/scripts/add_sit_acceptance_data.py --apply
```

State that the script is RC/SIT-only, non-destructive, and idempotent.

### Task 4: Full verification, GitLab, build, deploy, and live acceptance

**Files:**
- All files changed by Tasks 1-3

- [ ] **Step 1: Run the release gate**

Run the repository release verification command, frontend contract suite, TypeScript check, lint, production build, backend tests, security scans, and schema check.

Expected: all required checks PASS; report any documented warnings separately.

- [ ] **Step 2: Commit and push only scoped changes**

Preserve the user-owned untracked `docs/verification/2026-08-04-requirements-summary/` directory. Push the current `test` branch to `https://git.ymdd.tech/cfpd/zhipin-mvp.git`.

- [ ] **Step 3: Build and deploy both modules to SIT through Libra**

Start a Test branch build with automatic SIT deployment. Verify server and frontend deployment records reach success and the public asset changes.

- [ ] **Step 4: Preview and apply acceptance data in the server pod**

Run preview, apply, then apply a second time. Capture before/after scenario counts and prove the second apply adds zero records.

- [ ] **Step 5: Live UI acceptance**

Verify in Tabbit:

1. Li Si can select “自定义新岗位”, type a job title and JD, and reach a valid pending submission form without a template.
2. Recruitment department accepts a value outside the six suggestions.
3. Recruitment location accepts `新加坡` and `远程办公`.
4. Li Si sees acceptance screening and interview tasks.
5. Admin/recruitment views show acceptance demands, candidates, Offers, and dashboard drill-downs.

- [ ] **Step 6: Final numbered plain-language report**

Return only short numbered Chinese statements describing the tests actually completed and their outcomes.
