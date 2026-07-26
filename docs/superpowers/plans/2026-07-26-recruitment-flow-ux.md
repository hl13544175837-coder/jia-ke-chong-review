# Recruitment Flow UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make demand-scoped candidate selection, business-review handoff, result follow-up, and real interview assignment work as one smooth cross-role demo flow.

**Architecture:** Keep the existing Flask aggregates and APIs as the source of truth. Add focused Readdy components for a real demand candidate drawer, real notifications, and a real recruiter interview workbench; preserve existing demo surfaces only as fallback content, while all newly created tasks are read from and written to the backend.

**Tech Stack:** React 19, TypeScript, React Router 7, Vite 8, Flask 3.1, SQLAlchemy 2.0, Node source-contract tests, pytest.

---

### Task 1: Lock the demand context behavior

**Files:**
- Modify: `frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs`
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`

- [ ] Add failing source-contract assertions requiring `CandidateNavigationState` to contain `demandId` and `targetStage`, and requiring candidate/upload filters to initialize from that state.
- [ ] Run `node frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs` and confirm the new assertions fail because navigation state is ignored.
- [ ] Extend the navigation-state validator and initialize `demandFilter`, `stageFilter`, and `uploadDemandId` from the selected demand; map `feedback`, `interview`, and `offer` to real candidate stages.
- [ ] Update the contextual heading and helper text so demand-scoped pages no longer present themselves as the global talent library.
- [ ] Re-run the contract test and `npm --prefix readdy-frontend run type-check`.

### Task 2: Restore same-page demand candidate selection and upload

**Files:**
- Create: `readdy-frontend/src/pages/jobs/components/DemandCandidateDrawer.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs`

- [ ] Add failing assertions requiring `JobsPage` to render `DemandCandidateDrawer`, and requiring the drawer to call `listCandidates`, `previewMatches`, `addToPipeline`, and `uploadResumes` with the active demand id.
- [ ] Run `node frontend/tests/readdy_mysql_pilot_demand_ui_contract.test.mjs` and confirm failure because the drawer does not exist.
- [ ] Build a focused drawer that loads candidates, previews demand match scores, marks current/other/ended flow states, supports search and selection, and adds selected candidates to the current demand.
- [ ] Add drag/drop and file-picker upload; always pass `{ target_demand_id: demand.id }`.
- [ ] Replace the table “选候选人” navigation with drawer opening; keep stage-count clicks as contextual full-page navigation.
- [ ] Re-run the demand and candidate contract tests plus type-check.

### Task 3: Connect real notifications and business-review work

**Files:**
- Create: `readdy-frontend/src/features/notifications/api.ts`
- Create: `readdy-frontend/src/features/notifications/types.ts`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/dashboard/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_business_ui_contract.test.mjs`

- [ ] Add failing assertions requiring the shell to call the notification API, the interviewer dashboard to call `businessReviewsApi.listMine`, and the screening page to read the `task` query parameter.
- [ ] Run the business UI contract test and confirm all three new assertions fail for the missing live connections.
- [ ] Implement notification list/unread/mark-read API wrappers and make notification clicks navigate to backend-provided links.
- [ ] Load real pending reviews on the interviewer dashboard, show them ahead of demo fallback tasks, and refresh on page focus.
- [ ] Parse `?task=<id>` in the screening page and open the matching task after loading.
- [ ] Change user-facing wording to “推送业务负责人筛选” and state that HR arranges interviews after approval.
- [ ] Re-run the business UI contract test and type-check.

### Task 4: Surface business-review results and next actions to HR

**Files:**
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Modify: `readdy-frontend/src/features/businessReviews/api.ts`
- Modify: `frontend/tests/readdy_mysql_pilot_candidate_ui_contract.test.mjs`

- [ ] Add failing assertions requiring `businessReviewsApi.listForHr`, query-string demand/candidate deep links, and explicit review-result next-action labels.
- [ ] Run the candidate UI contract test and confirm the missing result behavior fails.
- [ ] Load HR-visible review tasks and index the latest task by demand/candidate.
- [ ] Read `?demand=<id>&candidate=<id>` on entry, apply the demand filter, and open the candidate detail once loaded.
- [ ] Show pending/approved/rejected/needs-info status beside the candidate and provide “安排面试”, “去流程处理”, or “补充并再次推送” actions.
- [ ] Re-run candidate contract tests and type-check.

### Task 5: Replace the recruiter interview demo mutation with real assignments

**Files:**
- Create: `readdy-frontend/src/pages/interviews/page.tsx`
- Create: `readdy-frontend/src/pages/interviews/components/InterviewScheduleModal.tsx`
- Modify: `readdy-frontend/src/features/interviews/api.ts`
- Modify: `readdy-frontend/src/features/interviews/types.ts`
- Modify: `readdy-frontend/src/router/config.tsx`
- Modify: `backend/app/services/interview_workflow_service.py`
- Modify: `backend/app/services/interview_management_service.py`
- Modify: `backend/tests/test_interview_management_contract.py`
- Modify: `frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs`

- [ ] Add failing backend assertions requiring interviewer notification links to use `/interviewer/interviews` and front-end assertions requiring the recruiter page to use real management and assignment APIs.
- [ ] Run the focused pytest and Node contract tests and confirm the new assertions fail.
- [ ] Extend `interviewsApi` with management rows, interviewer options, create/update assignment, mark conducted, and remind feedback methods.
- [ ] Implement a real recruiter interview table and schedule modal using existing field names and styling conventions.
- [ ] Route `/interviews` to the real page and preserve demand/candidate query focus.
- [ ] Correct all interviewer-facing notification links in the backend.
- [ ] Re-run focused tests, type-check, and build.

### Task 6: Full regression and role-based browser acceptance

**Files:**
- Modify only if verification reveals a reproducible defect covered by a new failing test.

- [ ] Run focused Node tests for demand, candidate, business review, interview, role navigation, and shell.
- [ ] Run focused backend tests for business reviews, interview management, candidate library, and demand approval.
- [ ] Run the full `npm --prefix frontend test`, `npm --prefix readdy-frontend run type-check`, `npm --prefix readdy-frontend run lint`, and `npm --prefix readdy-frontend run build` commands.
- [ ] Restart the isolated demo server.
- [ ] In the browser, verify demand same-page selection and targeted upload, recruiter-to-business-review handoff, business decision return, recruiter interview assignment, and interviewer task visibility.
- [ ] Confirm refresh persistence and no console errors on the exercised paths.

