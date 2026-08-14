# Structured Resume Full-Width Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent empty right column by placing short resume sections in a top overview grid and rendering long sections full-width below it.

**Architecture:** Keep the existing resume section builder and specialized work-history cards. Change only `StructuredResumeView` composition: short sections render in a responsive overview grid, and long sections render in a separate full-width stack.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node test runner.

---

### Task 1: Lock the full-width layout contract

**Files:**
- Modify: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

- [ ] **Step 1: Write the failing source-level test**

Add an assertion that `StructuredResumeView` contains `data-ui="resume-overview-grid"` and `data-ui="resume-main-sections"`, and no longer contains `lg:grid-cols-3`, `lg:col-span-2`, or a permanent `<aside>`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/structured-resume-work-history.test.mjs`

Expected: the new layout test fails because the component still uses the fixed three-column split.

### Task 2: Implement the confirmed A layout

**Files:**
- Modify: `readdy-frontend/src/components/candidates/StructuredResumeView.tsx`
- Test: `readdy-frontend/tests/structured-resume-work-history.test.mjs`

- [ ] **Step 1: Replace the fixed split with two explicit regions**

Render `sideSections` in a responsive top grid marked `data-ui="resume-overview-grid"` using one column on small screens, two on medium screens, and up to three on large screens. Render `mainSections` below it in a full-width vertical stack marked `data-ui="resume-main-sections"`.

- [ ] **Step 2: Preserve single-group behavior**

When only short sections exist, render only the overview grid. When only long sections exist, render only the main stack. Do not render empty containers.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run: `node --test tests/structured-resume-work-history.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 4: Run frontend verification**

Run: `npm run test:contract && npm run type-check && npm run lint && npm run build`

Expected: all commands exit 0.

### Task 3: Release and browser acceptance

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run the complete SIT release gate**

Run `./scripts/check-sit-release.sh`. If dependency audit alone fails because the configured local proxy is unavailable, rerun both dependency audits with proxy variables removed and run the remaining migration, bundle, Git-diff, and image-parameter checks explicitly.

- [ ] **Step 2: Commit and push company `test`**

Confirm a clean tracked worktree, push to `cfpd/test`, and verify local HEAD equals `refs/heads/test` on the remote.

- [ ] **Step 3: Monitor pipeline and publish the new RC**

Verify all four jobs complete successfully within their configured timeouts. Bind both K8S modules to the new RC and use rolling update without forced termination.

- [ ] **Step 4: Verify SIT with real candidate data**

In Ego Lite, open 张征 and confirm the overview is above the work history, the main region occupies full width, all 10 work-history cards remain intact, both pods are Running/Ready/health 100, and `/api/health` returns 200.
