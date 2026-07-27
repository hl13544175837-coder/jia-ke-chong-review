# Recruiter Workbench Balanced Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-card recruiter dashboard with the approved medium-density workbench backed entirely by current recruitment APIs.

**Architecture:** Extend the pure dashboard summary module with date, stage, and demand-risk derivations. Rebuild `DashboardPage` from small local render helpers, then add explicit navigation-state support to the destination pages so all quick actions open the intended operation.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind CSS, Node.js contract tests

---

### Task 1: Dashboard summary view model

**Files:**
- Modify: `readdy-frontend/src/pages/dashboard/summary.ts`
- Create: `frontend/tests/dashboard_balanced_view_model.test.mjs`

- [ ] **Step 1: Write the failing view-model test**

Test `buildDashboardSummary(facts, role, now)` with fixed facts and assert `todayInterviews`, `overdueFeedback`, `stageSummary`, sorted active demands, and risk metadata.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node frontend/tests/dashboard_balanced_view_model.test.mjs`

Expected: FAIL because the new fields do not exist.

- [ ] **Step 3: Implement minimal pure derivations**

Add a fixed-time optional argument, safe local-day comparison, stage aggregation, target-date risk calculation, and next-action labels without changing the API inputs.

- [ ] **Step 4: Run focused summary tests**

Run: `node frontend/tests/dashboard_balanced_view_model.test.mjs && node frontend/tests/recruiter_dashboard_priority.test.mjs`

Expected: both pass.

### Task 2: Balanced recruiter workbench UI

**Files:**
- Modify: `readdy-frontend/src/pages/dashboard/page.tsx`
- Replace: `frontend/tests/dashboard_summary_card_disclosure.test.mjs`

- [ ] **Step 1: Replace the obsolete four-card contract with a failing layout contract**

Assert that the page contains `待处理事项`, `今日面试`, `我的岗位进展`, `阶段概况`, `等待他人`, quick action labels, two native disclosure regions, and no `DashboardPanel` or four-card grid.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node frontend/tests/dashboard_summary_card_disclosure.test.mjs`

Expected: FAIL because the old disclosure-card dashboard is still present.

- [ ] **Step 3: Implement the approved layout**

Build real action rows from summary data, render responsive two-column sections, add accurate empty/loading/error states, and connect interview reminder actions to `interviewsApi.remindFeedback`.

- [ ] **Step 4: Run all dashboard-focused tests**

Run all `frontend/tests/*dashboard*.test.mjs` files and confirm exit 0.

### Task 3: Quick-action destinations

**Files:**
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Create: `frontend/tests/dashboard_quick_actions.test.mjs`

- [ ] **Step 1: Write the failing navigation contract**

Assert the dashboard sends `openCreate`, `openUpload`, and `status=unassigned`, and destination pages consume those values.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node frontend/tests/dashboard_quick_actions.test.mjs`

Expected: FAIL because destination pages do not yet consume all three intents.

- [ ] **Step 3: Add minimal destination handling**

Open the requirement form and resume-upload modal from validated navigation state, and initialize the interview tab from a validated search parameter.

- [ ] **Step 4: Run focused navigation tests**

Run the new test plus existing jobs, candidates, and interview navigation contracts; expect exit 0.

### Task 4: Full verification and browser acceptance

**Files:**
- Verify only

- [ ] **Step 1: Run all runnable frontend tests**

Run every `frontend/tests/*.test.mjs` except the documented external-ZIP parity test when its fixture is unavailable. Expect zero failures.

- [ ] **Step 2: Run quality gates**

Run `npm run lint`, `npm run type-check`, `npm run build`, and `git diff --check`; each must exit 0.

- [ ] **Step 3: Browser acceptance**

Verify real recruiter data, empty/error-safe sections, exact row navigation, all three quick actions, disclosure toggles, reminder feedback, and responsive layout in the local browser.

- [ ] **Step 4: Review and commit only task files**

Preserve existing unrelated backend and demo-data changes, then commit the dashboard implementation without pushing or merging.
