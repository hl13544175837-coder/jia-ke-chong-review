# Structured Resume Work History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented generic field grid for structured work history with one cohesive card per employment record.

**Architecture:** Add pure normalization helpers beside the existing resume presentation helpers, then render only the `work` section through a focused `WorkHistoryValue` component. All non-work sections continue through the existing generic renderer so the change stays isolated.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node test runner, Jiti.

---

### Task 1: Normalize a work history record

**Files:**
- Modify: `readdy-frontend/src/components/candidates/resumePresentation.ts`
- Test: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

- [ ] **Step 1: Write the failing normalization test**

Test that a record with `company`, `position`, `duration`, and `description` becomes one model containing `company`, `role`, `period`, `details`, and no duplicated fields. Also test `start_date` + `end_date`, missing fields, and an unrecognized field retained in `remaining`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/structured-resume-work-history.test.mjs`

Expected: FAIL because `normalizeWorkHistoryItem` is not exported.

- [ ] **Step 3: Implement the smallest pure helper**

Export `normalizeWorkHistoryItem(value)` from `resumePresentation.ts`. Prefer aliases in this order: `company`; `position`, `title`, `role`; `duration`, `period`, then combined `start_date` and `end_date`; `description`, `desc`, `responsibilities`, `responsibility`, `achievements`. Return unconsumed displayable fields as `remaining`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/structured-resume-work-history.test.mjs`

Expected: all focused tests pass.

### Task 2: Render the confirmed A layout

**Files:**
- Modify: `readdy-frontend/src/components/candidates/StructuredResumeView.tsx`
- Test: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

- [ ] **Step 1: Add a source-level regression assertion**

Verify that the work section routes through `WorkHistoryValue`, includes one card marker per record, and does not send the work section directly through the generic `ResumeValue` path.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/structured-resume-work-history.test.mjs`

Expected: FAIL because `WorkHistoryValue` is absent.

- [ ] **Step 3: Implement the work history component**

Render each object as a single card. Put company and role on the left and period in a right-side badge within the same responsive header. Render detail fields under a divider and preserve `remaining` fields with the generic renderer. Fall back to `ResumeValue` when the work section is not an object list.

- [ ] **Step 4: Run focused and contract tests**

Run: `npm run test:contract`

Expected: all contract tests pass.

### Task 3: Verify, commit, push, build, release, and inspect SIT

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run local release checks**

Run frontend type-check, lint, build, backend full tests, contract tests, dependency audits, migration head, bundle budget, and `git diff --check` using `scripts/check-sit-release.sh`; retry dependency audits without the unavailable local proxy if the only failure is network transport.

- [ ] **Step 2: Commit and push `test`**

Confirm a clean worktree, commit the implementation, push to `cfpd/test`, and verify the remote SHA equals local HEAD.

- [ ] **Step 3: Monitor the new pipeline**

Confirm all jobs finish successfully within configured timeouts and record the new RC version. Do not publish an earlier superseded pipeline.

- [ ] **Step 4: Publish both K8S modules to SIT**

Bind `zhipin-server` and `zhipin-frontend` to the new RC, use rolling update without forced termination, and verify both pods are `Running`, `Ready`, health 100, and show the new version.

- [ ] **Step 5: Browser acceptance with real data**

In Ego Lite, open 张征 in 简历库 and verify each employment is one card with company, role, and period in the same header. Recheck Offer default counts and confirm blank-name fallback uses candidate `#35`, not Offer `#8`.
