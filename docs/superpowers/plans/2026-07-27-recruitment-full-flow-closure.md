# Recruitment Full-Flow Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the complete internal recruitment flow from an approved demand through resume import, business review, interviews, recruiter decision, Offer, and onboarding, while keeping unavailable OA/WeCom delivery visibly outside the system boundary.

**Architecture:** Keep the existing React/Vite front end and Flask/SQLAlchemy monolith. Backend services remain the only owners of permissions, stage transitions, interview timing, Offer lifecycle, and HC changes; the Readdy UI consumes those facts through the existing API layer and removes parallel mock mutation paths. Shared presentation components and stable route redirects converge all roles on one real dataset.

**Tech Stack:** React 19, TypeScript, React Router 7, Vite 8, Flask 3.1, SQLAlchemy 2.0, pytest, Node source-contract tests.

---

### Task 1: Converge every operational route on the real workflow

**Files:**
- Modify: `frontend/tests/readdy_mysql_pilot_role_navigation_contract.test.mjs`
- Modify: `frontend/tests/readdy_dashboard_contract.test.mjs`
- Modify: `readdy-frontend/src/router/config.tsx`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`

- [ ] **Step 1: Add failing route and data-source contracts**

```js
assert.match(routerSource, /Navigate[\s\S]*to="\/interviews"/)
assert.match(routerSource, /Navigate[\s\S]*to="\/offers"/)
assert.doesNotMatch(layoutSource, /setPreviewRole|预览角色/)
assert.match(dashboardSource, /demandsApi\.|interviewsApi\.|offersApi\./)
assert.doesNotMatch(interviewerDashboardSource, /mockInterviews/)
```

- [ ] **Step 2: Run the contracts and verify RED**

Run: `node frontend/tests/readdy_mysql_pilot_role_navigation_contract.test.mjs && node frontend/tests/readdy_dashboard_contract.test.mjs`

Expected: FAIL because legacy dashboards remain writable, role preview is still exposed, or a dashboard still reads mock operational facts.

- [ ] **Step 3: Replace legacy entries with redirects and real data**

```tsx
<Route path="/dashboard/interviews" element={<Navigate to="/interviews" replace />} />
<Route path="/dashboard/offers" element={<Navigate to="/offers" replace />} />
```

Remove the local role mutation control. Dashboard counts and links must be built from the existing demand, candidate, interview, Offer, business-review, and notification API clients; an API error renders “数据暂不可用” rather than a fabricated zero.

- [ ] **Step 4: Verify GREEN and regress navigation**

Run: `node frontend/tests/readdy_mysql_pilot_role_navigation_contract.test.mjs && node frontend/tests/readdy_dashboard_contract.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add frontend/tests/readdy_mysql_pilot_role_navigation_contract.test.mjs frontend/tests/readdy_dashboard_contract.test.mjs readdy-frontend/src/router/config.tsx readdy-frontend/src/components/feature/MainLayout.tsx readdy-frontend/src/pages/dashboard/page.tsx readdy-frontend/src/pages/interviewer/dashboard/page.tsx
git commit -m "fix: converge recruitment workflow routes"
```

### Task 2: Enforce business-review stage and reason guards in the backend

**Files:**
- Modify: `backend/tests/test_business_reviews.py`
- Modify: `backend/app/services/business_review_service.py`
- Modify: `backend/app/services/pipeline_service.py`
- Modify: `readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `frontend/tests/rejection_disposition_requires_reason.test.mjs`

- [ ] **Step 1: Add failing backend tests for forbidden regression and required notes**

```python
@pytest.mark.parametrize("stage", ["interview", "offer", "onboarded", "rejected"])
def test_create_business_review_rejects_later_stage(client, auth_headers, candidate_in_stage, stage):
    response = client.post("/api/business-reviews", headers=auth_headers, json={
        "demand_id": candidate_in_stage.demand_id,
        "candidate_id": candidate_in_stage.candidate_id,
        "reviewer_id": 3,
    })
    assert response.status_code == 409

@pytest.mark.parametrize("decision", ["rejected", "needs_info"])
def test_business_review_requires_note_for_non_approval(client, interviewer_headers, review, decision):
    response = client.post(f"/api/business-reviews/{review.id}/decision", headers=interviewer_headers, json={"decision": decision, "note": "  "})
    assert response.status_code == 400
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_business_reviews.py -q`

Expected: new cases FAIL because later-stage review creation or blank-note decisions are accepted.

- [ ] **Step 3: Add one shared stage guard and service validation**

```python
BUSINESS_REVIEW_ENTRY_STAGES = {"pending", "ai_screen", "business_review"}

def assert_business_review_entry_allowed(stage: str) -> None:
    if stage not in BUSINESS_REVIEW_ENTRY_STAGES:
        raise WorkflowConflict("候选人已进入后续流程，不能再退回业务筛选")
```

Call this rule inside the review service before creating a task. Require a trimmed note for `rejected` and `needs_info`; keep the route thin and return the existing stable 400/409 envelopes.

- [ ] **Step 4: Add front-end status-aware controls**

```tsx
const canPushToReview = ['pending', 'ai_screen', 'business_review'].includes(candidate.stage)
```

Hide/disable the push action after interview entry and show the server conflict in plain Chinese. Keep the note field required for “不合适” and “需补充”.

- [ ] **Step 5: Verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_business_reviews.py backend/tests/test_pipeline_rounds.py -q && node frontend/tests/rejection_disposition_requires_reason.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 6: Commit only Task 2 files**

```bash
git add backend/tests/test_business_reviews.py backend/app/services/business_review_service.py backend/app/services/pipeline_service.py readdy-frontend/src/pages/candidates/components/PushToReviewerModal.tsx readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx frontend/tests/rejection_disposition_requires_reason.test.mjs
git commit -m "fix: guard business review workflow stages"
```

### Task 3: Make interview timing, conflicts, feedback, and recruiter decisions real

**Files:**
- Modify: `backend/tests/test_interview_management_contract.py`
- Modify: `backend/tests/test_interview_loop.py`
- Modify: `backend/app/services/interview_management_service.py`
- Modify: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/app/services/pipeline_service.py`
- Modify: `readdy-frontend/src/features/interviews/api.ts`
- Modify: `readdy-frontend/src/features/interviews/types.ts`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs`

- [ ] **Step 1: Add failing tests for past scheduling, future completion, conflicts, and next-round ownership**

```python
def test_create_assignment_rejects_past_time(client, hr_headers, interview_payload):
    interview_payload["scheduled_at"] = "2020-01-01T10:00:00+08:00"
    assert client.post("/api/interviews/assignments", headers=hr_headers, json=interview_payload).status_code == 400

def test_future_assignment_cannot_be_marked_conducted_or_receive_feedback(client, hr_headers, interviewer_headers, future_assignment):
    assert client.post(f"/api/interviews/management/{future_assignment.id}/conducted", headers=hr_headers).status_code == 409
    assert client.post(f"/api/interviews/assignments/{future_assignment.id}/feedback", headers=interviewer_headers, json={"result": "satisfied", "note": "通过"}).status_code == 409

def test_overlapping_active_assignment_is_rejected(client, hr_headers, overlapping_payload):
    assert client.post("/api/interviews/assignments", headers=hr_headers, json=overlapping_payload).status_code == 409
```

- [ ] **Step 2: Run focused backend tests and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_interview_management_contract.py backend/tests/test_interview_loop.py -q`

Expected: at least one new assertion FAILS for missing time or conflict enforcement.

- [ ] **Step 3: Implement server-owned timing and overlap rules**

```python
def ensure_interview_time_is_future(scheduled_at: datetime, *, now: datetime) -> None:
    if scheduled_at <= now:
        raise ValidationError("面试时间必须晚于当前时间")

def ensure_interview_has_started(assignment, *, now: datetime) -> None:
    if assignment.scheduled_at > now:
        raise WorkflowConflict("面试尚未开始，暂时不能确认或评价")
```

For create/update, reject active assignments for the same interviewer whose occupied time window overlaps. For conducted/feedback, reject before `scheduled_at`. Preserve cancellation, ownership, organization, audit, notification, and idempotency behavior.

- [ ] **Step 4: Add recruiter result actions on the real interview page**

```ts
type InterviewDecision = 'next_round' | 'add_interviewer' | 'offer' | 'rejected'
```

After feedback exists, expose exactly these next actions: create the next `round_sequence` assignment, add an interviewer to the current round, move the demand pipeline to Offer, or reject with a mandatory reason. “进入 Offer” navigates to `/offers?demand=<id>&candidate=<id>` after the backend move succeeds.

- [ ] **Step 5: Make scheduling controls state-aware**

Use a browser-local minimum equal to the current minute, show “查看/调整面试” for already scheduled candidates, preview internal conflicts, require cancellation reasons, and show “站内日程已创建，企业微信日历待接入”. Add a recruiter confirmation dialog before marking conducted.

- [ ] **Step 6: Verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_interview_management_contract.py backend/tests/test_interview_loop.py backend/tests/test_pipeline_rounds.py -q && node frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 7: Commit only Task 3 files**

```bash
git add backend/tests/test_interview_management_contract.py backend/tests/test_interview_loop.py backend/app/services/interview_management_service.py backend/app/services/interview_workflow_service.py backend/app/services/pipeline_service.py readdy-frontend/src/features/interviews/api.ts readdy-frontend/src/features/interviews/types.ts readdy-frontend/src/pages/interviews/page.tsx readdy-frontend/src/pages/interviews/components/ScheduleInterviewModal.tsx readdy-frontend/src/pages/interviewer/interviews/components/SimpleFeedbackModal.tsx frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs
git commit -m "feat: close interview result decision flow"
```

### Task 4: Turn the demand drawer into a paginated candidate workbench

**Files:**
- Modify: `backend/tests/test_job_matcher.py`
- Modify: `backend/app/api/match.py`
- Modify: `backend/app/services/match_service.py`
- Modify: `readdy-frontend/src/features/candidates/api.ts`
- Modify: `readdy-frontend/src/features/candidates/types.ts`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs`

- [ ] **Step 1: Add failing API and UI contracts**

```python
def test_match_preview_marks_unconfigured_job(client, hr_headers, demand_without_skill_tags):
    payload = client.post("/api/match/preview", headers=hr_headers, json={"demand_id": demand_without_skill_tags.id, "candidate_ids": [1]}).get_json()
    assert payload["match_configured"] is False
```

```js
for (const field of ['city', 'education', 'skills', 'source', 'stage', 'minScore', 'sort']) {
  assert.match(drawerSource, new RegExp(field))
}
assert.match(drawerSource, /page|total|per_page/)
assert.match(drawerSource, /查看简历/)
assert.match(drawerSource, /岗位技能尚未配置/)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_job_matcher.py -q && node frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs`

Expected: FAIL because match readiness and the full workbench controls do not exist.

- [ ] **Step 3: Return explicit match readiness**

```json
{
  "match_configured": false,
  "required_skills": [],
  "items": []
}
```

Determine readiness only from the persisted JD snapshot/structured skills. Do not label an unknown match as score 0.

- [ ] **Step 4: Implement server-backed filters and pagination in the drawer**

Send the existing candidate query fields plus `page` and `per_page`; display backend `total`, previous/next controls, city, education, skill, source, flow status, stage, minimum score, actionable-only shortcut, and sort. Preserve demand id for every list, upload, preview, and add action.

- [ ] **Step 5: Separate resume preview from selection**

Clicking a card/title opens the shared resume drawer; clicking its checkbox only changes selection. Unavailable candidates remain visible with a reason and a suitable “查看当前流程” action.

- [ ] **Step 6: Verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_job_matcher.py backend/tests/test_candidate_search_pagination.py -q && node frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 7: Commit only Task 4 files**

```bash
git add backend/tests/test_job_matcher.py backend/app/api/match.py backend/app/services/match_service.py readdy-frontend/src/features/candidates/api.ts readdy-frontend/src/features/candidates/types.ts readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs
git commit -m "feat: add demand candidate workbench filters"
```

### Task 5: Use one readable Chinese resume across recruiter and interviewer pages

**Files:**
- Create: `readdy-frontend/src/components/candidates/StructuredResumeView.tsx`
- Create: `readdy-frontend/src/components/candidates/resumePresentation.ts`
- Modify: `readdy-frontend/src/pages/candidates/components/CandidateDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/components/InterviewDetailDrawer.tsx`
- Modify: `frontend/tests/candidate_resume_workspace.test.mjs`
- Modify: `frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs`

- [ ] **Step 1: Add failing presentation contracts**

```js
assert.match(resumeViewSource, /基本信息/)
assert.match(resumeViewSource, /教育经历/)
assert.match(resumeViewSource, /工作经历/)
assert.match(resumeViewSource, /项目经历/)
assert.match(resumeViewSource, /技能/)
for (const pageSource of [candidateDetail, businessDetail, interviewDetail]) {
  assert.match(pageSource, /StructuredResumeView/)
  assert.doesNotMatch(pageSource, /Object\.entries\([^)]*(resume_json|extracted_info)/)
}
```

- [ ] **Step 2: Run contracts and verify RED**

Run: `node frontend/tests/candidate_resume_workspace.test.mjs && node frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs`

Expected: FAIL because each page renders raw keys independently.

- [ ] **Step 3: Normalize known resume aliases without changing persisted data**

```ts
export type ResumeSection = { title: string; rows: Array<{ label: string; value: ReactNode }> }

export function buildResumeSections(resume: unknown): ResumeSection[] {
  // map name/姓名, education/教育经历, work_experience/工作经历,
  // projects/项目经历, skills/技能 and summary/个人总结 into Chinese sections
}
```

Unknown harmless fields may appear under “其他信息” with a Chinese label map; internal keys such as `extracted_info`, parser metadata, IDs, and raw JSON must never be exposed.

- [ ] **Step 4: Reuse the component in all three roles**

Keep the original resume file link when present. When absent, display “当前没有原版文件，以下为系统解析信息” and continue showing structured content.

- [ ] **Step 5: Verify GREEN**

Run: `node frontend/tests/candidate_resume_workspace.test.mjs && node frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 6: Commit only Task 5 files**

```bash
git add readdy-frontend/src/components/candidates/StructuredResumeView.tsx readdy-frontend/src/components/candidates/resumePresentation.ts readdy-frontend/src/pages/candidates/components/CandidateDetailDrawer.tsx readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx readdy-frontend/src/pages/interviewer/interviews/components/InterviewDetailDrawer.tsx frontend/tests/candidate_resume_workspace.test.mjs frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs
git commit -m "feat: unify Chinese resume presentation"
```

### Task 6: Make handoffs, Offer entry, HC, and external boundaries obvious

**Files:**
- Modify: `backend/tests/test_offer_lifecycle.py`
- Modify: `backend/tests/test_demand_bi_isolation.py`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs`
- Modify: `frontend/tests/readdy_mysql_pilot_offer_ui_contract.test.mjs`

- [ ] **Step 1: Add failing contracts for status-aware handoff and Offer deep links**

```js
assert.match(candidateSource, /查看\/调整面试/)
assert.match(offerPageSource, /searchParams|get\('demand'\)|get\('candidate'\)/)
assert.match(offerModalSource, /prefill|initialDemandId|initialCandidateId/)
assert.match(interviewSource, /企业微信.*待接入/)
```

Add backend assertions that accepted + onboarded reduces the demand gap exactly once, while rejected, withdrawn, and expired Offers do not reduce it.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/bin/pytest backend/tests/test_offer_lifecycle.py backend/tests/test_demand_bi_isolation.py -q && node frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs && node frontend/tests/readdy_mysql_pilot_offer_ui_contract.test.mjs`

Expected: at least one new assertion FAILS for a missing handoff/deep link or incorrect HC edge case.

- [ ] **Step 3: Implement status-aware labels and Offer prefill**

Candidates with an active assignment show “查看/调整面试”; those approved without an assignment show “安排面试”. The Offer page reads explicit demand/candidate query parameters, opens the draft modal, and preselects only if the backend options authorize the pair.

- [ ] **Step 4: Keep external delivery honest**

After internal task, notification, or calendar creation, display “站内已创建；企业微信/外部日历待接入”. Never use “已发送”“已同步” for unavailable external integrations.

- [ ] **Step 5: Verify GREEN**

Run: `backend/.venv/bin/pytest backend/tests/test_offer_lifecycle.py backend/tests/test_demand_bi_isolation.py -q && node frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs && node frontend/tests/readdy_mysql_pilot_offer_ui_contract.test.mjs && npm --prefix readdy-frontend run type-check`

Expected: all commands PASS.

- [ ] **Step 6: Commit only Task 6 files**

```bash
git add backend/tests/test_offer_lifecycle.py backend/tests/test_demand_bi_isolation.py readdy-frontend/src/pages/candidates/page.tsx readdy-frontend/src/pages/offers/page.tsx readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx readdy-frontend/src/pages/interviews/page.tsx frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs frontend/tests/readdy_mysql_pilot_offer_ui_contract.test.mjs
git commit -m "feat: clarify recruitment handoffs and offer entry"
```

### Task 7: Synchronize product documentation with the implemented truth

**Files:**
- Modify: `docs/01_PRD.md`
- Modify: `docs/12_5190真实上线改造矩阵.md`
- Modify: `docs/13_试点业务流程与研发接口交接.md`
- Modify: `docs/PRODUCT_INTERACTION_GUIDE.md`
- Modify: `docs/superpowers/plans/2026-07-27-recruitment-full-flow-closure.md`

- [ ] **Step 1: Compare implementation with the nine-stage design**

Record the real route, backend owner, role, persisted record, failure behavior, and external boundary for each stage. Do not document an integration as complete unless it was observed.

- [ ] **Step 2: Update product and handoff documents**

```markdown
| 环节 | 真实入口 | 数据落点 | 外部状态 |
|---|---|---|---|
| 业务初筛 | `/interviewer/screening` | business review task + decision | 企业微信待接入 |
| 面试评价 | `/interviewer/interviews` | assignment + feedback | 企业微信待接入 |
```

Include the route convergence, stage guard, timing rule, Chinese resume presentation, matching readiness, decision actions, and HC rule.

- [ ] **Step 3: Mark completed plan boxes from actual command evidence**

Only replace `[ ]` with `[x]` for steps whose command or browser outcome was actually observed.

- [ ] **Step 4: Verify docs and commit**

Run: `rg -n "T[B]D|T[O]DO|implement[[:space:]]+later|fill[[:space:]]+in[[:space:]]+details" docs/superpowers/plans/2026-07-27-recruitment-full-flow-closure.md; git diff --check`

Expected: the first command returns no matches and `git diff --check` exits 0.

```bash
git add docs/01_PRD.md docs/12_5190真实上线改造矩阵.md docs/13_试点业务流程与研发接口交接.md docs/PRODUCT_INTERACTION_GUIDE.md docs/superpowers/plans/2026-07-27-recruitment-full-flow-closure.md
git commit -m "docs: record recruitment full-flow behavior"
```

### Task 8: Run full automation and three-role browser acceptance

**Files:**
- Modify only when verification exposes a reproducible defect; add a failing regression test before every such fix.

- [ ] **Step 1: Run all backend tests from a clean test database**

Run: `backend/.venv/bin/pytest backend/tests -q`

Expected: all tests PASS with no unexpected warnings.

- [ ] **Step 2: Run all front-end contracts and production checks**

Run: `npm --prefix frontend test`

Run: `npm --prefix readdy-frontend run type-check`

Run: `npm --prefix readdy-frontend run lint`

Run: `npm --prefix readdy-frontend run build`

Expected: all runnable checks PASS. If the exact Readdy ZIP parity fixture is still absent, report that single environmental skip separately; it cannot substitute for any functional test.

- [ ] **Step 3: Restart the local stack and verify the recruiter path**

Log in with a real recruiter account. Create/select a demand, import or select a candidate in the same-page workbench, inspect the full resume, push business review, receive the result, schedule interviews, make the result decision, create/approve/send/accept an Offer, and confirm onboarding. Refresh after every persisted boundary.

- [ ] **Step 4: Verify the interviewer path**

Log in with the assigned real interviewer account. Confirm only assigned review/interview tasks are visible; inspect the complete candidate/JD; submit review; confirm future feedback is blocked; submit due feedback; verify the recruiter receives it.

- [ ] **Step 5: Verify the manager/top-product path**

Log in with the real manager account. Confirm organization-scoped dashboard facts, team work visibility, authorized Offer approval, no fake zero/mock facts, and no forbidden controls for unauthorized records.

- [ ] **Step 6: Inspect persistence and reverse paths**

Verify task, decision, assignment, feedback, pipeline-event, Offer-event, notification, audit, and HC records. Also verify refresh/relogin, duplicate submit, cancellation with reason, rejection with reason, withdrawn/rejected Offer capacity release, unavailable original file, unconfigured job skills, empty lists, 403, and 409 behavior.

- [ ] **Step 7: Re-run focused regressions after browser fixes**

Every browser defect first receives a failing automated regression, then a minimal fix, then focused and full reruns.

- [ ] **Step 8: Final issue-by-issue closure audit**

Compare actual evidence against all 12 original issues, the three added UX safeguards, the nine image stages, and all three role perspectives. Completion is allowed only when every internal item is proven closed and the only remaining gaps are the explicitly excluded OA/WeCom/SMS/email/candidate-contact integrations.
