# Candidate Pipeline and Business Review Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make joining a demand, sending a business-screening task, reassigning that task, and arranging a formal interview appear as one clear state-driven sequence.

**Architecture:** Keep demand membership in the existing pipeline API and business screening in the existing business-review service. Add one explicit reassignment endpoint for a pending review, then derive the visible candidate action from current demand, latest review task, and interview status instead of rendering competing buttons.

**Tech Stack:** Flask, SQLAlchemy, pytest, React, TypeScript, existing API client and Node contract tests.

---

### Task 1: Explicit pending business-review reassignment

**Files:**
- Modify: `backend/tests/test_business_reviews.py`
- Modify: `backend/app/services/business_review_service.py`
- Modify: `backend/app/api/business_reviews.py`

- [ ] **Step 1: Write failing backend tests**

Add tests that create a pending task for reviewer A and call:

```python
response = client.patch(
    f"/api/business-reviews/{task['id']}/reviewer",
    headers=_auth(hr_token),
    json={"reviewer_id": reviewer_b_id},
)
assert response.status_code == 200
assert response.get_json()["reviewer_id"] == reviewer_b_id
```

The tests must also assert that only one pending task remains, reviewer A no longer sees it, reviewer B sees it, one `business_review.reassigned` event exists, both users receive a reassignment notification, and an invalid/inactive reviewer leaves the original task unchanged.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
.venv/bin/pytest backend/tests/test_business_reviews.py -q
```

Expected: the new tests fail because `PATCH /api/business-reviews/<id>/reviewer` does not exist.

- [ ] **Step 3: Add the minimal service operation**

Implement a focused service function with this contract:

```python
def reassign_business_review(org_id, task_id, actor_id, reviewer_id):
    task = _task_for_update(_business_review_model(), org_id=org_id, task_id=task_id)
    # validate active pending task, actor ownership/manager permission and reviewer role
    # return (task, True) when reviewer_id is unchanged
    # otherwise update reviewer_id, add old/new notifications and audit event, then commit
    return task, False
```

The normal create endpoint must continue to deduplicate without changing the reviewer.

- [ ] **Step 4: Add the explicit API route**

Add:

```python
@bp.patch("/business-reviews/<int:task_id>/reviewer")
@require_auth
@require_role("recruiter", "manager", "admin")
def reassign_review_task(task_id):
    reviewer_id = _positive_int(request.get_json(silent=True) or {}, "reviewer_id")
    if reviewer_id is None:
        return jsonify({"error": "reviewer_id 必须是正整数", "code": "invalid_business_reviewer"}), 400
    task, unchanged = reassign_business_review(g.org_id, task_id, g.user_id, reviewer_id)
    payload = business_review_payload(task)
    payload["unchanged"] = unchanged
    return jsonify(payload)
```

- [ ] **Step 5: Verify GREEN and commit**

Run the focused backend test file and commit only the three task files.

---

### Task 2: Frontend API and state-driven action contract

**Files:**
- Create: `readdy-frontend/src/features/businessReviews/actions.ts`
- Modify: `readdy-frontend/src/features/businessReviews/types.ts`
- Modify: `readdy-frontend/src/features/businessReviews/api.ts`
- Create: `frontend/tests/candidate_business_review_actions.test.mjs`

- [ ] **Step 1: Write a failing frontend contract test**

Require a pure action resolver and explicit API method:

```javascript
assert.match(actions, /export function candidateBusinessAction/);
assert.match(actions, /join_and_push:[\s\S]*加入当前需求并推送业务筛选/);
assert.match(actions, /waiting:[\s\S]*等待.*反馈/);
assert.match(actions, /reassign:[\s\S]*改派筛选人/);
assert.match(actions, /schedule_interview:[\s\S]*安排正式面试/);
assert.match(api, /reassignTask\s*\(/);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test frontend/tests/candidate_business_review_actions.test.mjs
```

Expected: FAIL because the resolver and reassignment API do not exist.

- [ ] **Step 3: Implement the shared action resolver**

Use a discriminated result:

```ts
export type CandidateBusinessActionKind =
  | 'join_and_push' | 'push' | 'waiting' | 'schedule_interview'
  | 'needs_info' | 'rejected' | 'later_stage';

export function candidateBusinessAction(input: CandidateBusinessActionInput) {
  if (!input.currentDemandId) return { kind: 'join_and_push', label: '加入当前需求并推送业务筛选' };
  if (input.pendingTask) return { kind: 'waiting', label: `等待「${input.pendingTask.reviewer_name || '业务筛选人'}」反馈` };
  if (input.latestTask?.status === 'approved') return { kind: 'schedule_interview', label: '安排正式面试' };
  if (input.latestTask?.status === 'needs_info') return { kind: 'needs_info', label: '补充并再次推送' };
  if (input.latestTask?.status === 'rejected') return { kind: 'rejected', label: '去流程处理' };
  return { kind: 'push', label: '推送业务筛选' };
}
```

Guard interview/offer/onboarded/rejected/transferred stages before suggesting business screening.

- [ ] **Step 4: Add the typed API method**

```ts
reassignTask(taskId: number, reviewerId: number): Promise<BusinessReviewTask & { unchanged?: boolean }> {
  return apiRequest(`/business-reviews/${taskId}/reviewer`, {
    method: 'PATCH',
    body: { reviewer_id: reviewerId },
  });
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run the contract test and TypeScript type-check, then commit the task files.

---

### Task 3: Candidate library and demand drawer interaction

**Files:**
- Modify: `readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx`
- Modify: `readdy-frontend/src/pages/candidates/components/AddToPipelineModal.tsx`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `frontend/tests/candidate_business_review_actions.test.mjs`

- [ ] **Step 1: Extend the failing contract for visible behavior**

Assert that the pages use `candidateBusinessAction`, pending tasks render the current reviewer, the push modal supports a `mode="reassign"`, and candidate-library rows do not render unconditional competing join and push actions.

- [ ] **Step 2: Verify RED**

Run the focused Node test and confirm it fails on missing state-driven UI.

- [ ] **Step 3: Add reassignment mode to the existing modal**

Add props:

```ts
mode?: 'create' | 'reassign';
currentReviewerName?: string | null;
```

In reassignment mode lock the demand, show `当前接收人：姓名`, change the title/button to `改派业务筛选人`, and disable selecting the same reviewer as a meaningful change.

- [ ] **Step 4: Replace competing row/detail actions**

For each candidate, resolve the latest task for its current demand and render exactly one primary next-step action. A pending task renders the waiting label plus a secondary `改派筛选人`; an approved task navigates to `/interviews?demand=<id>&candidate=<id>`; needs-info reopens the push modal with the prior reviewer; rejected navigates to the rejected pipeline view.

- [ ] **Step 5: Keep the fast demand-drawer path**

Preserve `加入/转入并推送业务筛选` and `仅加入/转入当前需求`. Once a pending task exists, replace push with `等待「姓名」反馈` and `改派筛选人` so repeated create calls are not presented as reassignment.

- [ ] **Step 6: Handle partial success plainly**

When joining succeeds but task creation fails, reload candidates and show: `候选人已加入当前需求，但业务筛选推送失败；可点击“推送业务筛选”继续。`

- [ ] **Step 7: Verify GREEN and commit**

Run the focused Node test, existing candidate/demand tests, lint and type-check, then commit only the listed files.

---

### Task 4: End-to-end acceptance and regression

**Files:**
- Modify only if a failing acceptance test reveals a scoped defect.

- [ ] **Step 1: Run focused workflow tests**

```bash
.venv/bin/pytest backend/tests/test_business_reviews.py backend/tests/test_interview_management_contract.py -q
node --test frontend/tests/candidate_business_review_actions.test.mjs frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs frontend/tests/demand_workspace_ux.test.mjs
```

- [ ] **Step 2: Run full automated verification**

```bash
.venv/bin/pytest backend/tests -q
rg --files frontend/tests -g '*.test.mjs' -g '!readdy_zip_exact_parity.test.mjs' | xargs node --test
npm --prefix readdy-frontend run lint
npm --prefix readdy-frontend run type-check
npm --prefix readdy-frontend run build
git diff --check
```

- [ ] **Step 3: Perform real-browser role acceptance**

Use local data to verify: recruiter joins and pushes; assigned business-screening account sees the task; recruiter sees the waiting reviewer; recruiter explicitly reassigns; old reviewer no longer sees the pending task; new reviewer sees it; approval reveals `安排正式面试`.

- [ ] **Step 4: Leave the deliverable page open and report evidence**

Keep the recruiter candidate/demand page open at the tested record, report exact pass counts, list any external integration limitation, and do not push or merge without user authorization.
