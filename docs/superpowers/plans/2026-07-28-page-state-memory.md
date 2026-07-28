# Recruitment Page State Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让招聘需求、简历库、面试管理和 Offer 在左侧导航来回切换时恢复筛选、页码、排序、滚动位置和已打开详情，同时保持现有界面与跳转方式。

**Architecture:** 在 `MainLayout` 内使用当前登录会话级内存，记住四个模块最后一次的 URL 与滚动位置；登出后随布局卸载自动清空。各页把可恢复的查询状态显式写入 URL，业务数据仍从后端重新读取；弹窗表单、报错和确认框不保存。

**Tech Stack:** React 19, React Router, TypeScript, Node contract tests.

**Change boundary:** 不修改 `readdy-frontend/src/pages/dashboard/**`、任何漏斗/月度绩效文件、后端接口、数据库、人才地图和界面样式。

---

### Task 1: Shared module memory and scroll restoration

**Files:**
- Create: `readdy-frontend/src/features/navigation/pageMemory.ts`
- Modify: `readdy-frontend/src/components/feature/MainLayout.tsx`
- Test: `frontend/tests/page_state_memory.test.mjs`

- [x] Write a failing test that requires `/jobs`, `/candidates`, `/interviews`, and `/offers` to use remembered same-module URLs, requires the main scroll container to save/restore `scrollTop`, and rejects `localStorage`/`sessionStorage` business persistence.
- [x] Run `node --test frontend/tests/page_state_memory.test.mjs`; expect failure because the shared memory module does not exist.
- [x] Add `memoryKeyForPath(pathname)`, `safeRememberedHref(basePath, href)`, and the `MainLayout` in-memory URL/scroll map. Navigation labels and destinations remain visually unchanged.
- [x] Re-run the test; expect pass.

### Task 2: Recruitment demand URL state

**Files:**
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Test: `frontend/tests/page_state_memory.test.mjs`

- [x] Extend the failing test to require URL keys for demand tab, search, department, city, owner, stage, HC, deadline, sort direction, and selected demand.
- [x] Run the focused test; expect failure on missing query synchronization.
- [x] Initialize demand page controls from URL, replace the URL when controls change, keep `demand=<id>` while the detail drawer is open, and remove it when the drawer closes. Creation and confirmation forms are excluded.
- [x] Re-run focused demand and existing demand workspace tests; expect pass.

### Task 3: Resume library URL state

**Files:**
- Modify: `readdy-frontend/src/pages/candidates/page.tsx`
- Test: `frontend/tests/page_state_memory.test.mjs`

- [x] Extend the failing test to require URL keys for library scope, search, demand, city, education, skill, source, parse state, stage, score, sort, page, and selected candidate.
- [x] Run the focused test; expect failure.
- [x] Initialize candidate controls from URL and synchronize changes with `replace`; opening a candidate sets `candidate=<id>`, closing removes it. Upload, merge, push, and other write modals are not restored.
- [x] Re-run focused candidate and existing candidate contract tests; expect pass.

### Task 4: Interview and Offer URL state

**Files:**
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Test: `frontend/tests/page_state_memory.test.mjs`

- [x] Extend the failing test for interview tab/search/view/all applied filters/detail assignment and Offer tab/search/demand/owner/risk/order/detail offer.
- [x] Run the focused test; expect failure.
- [x] Synchronize the two pages with URL state. Interview/Offer detail drawers restore by stable IDs; schedule, rejection, approval, editing, and creation forms never restore.
- [x] Re-run focused interview and Offer tests; expect pass.

### Task 5: Full verification and interaction acceptance

**Files:**
- Modify only if a verified defect is found in Tasks 1-4.

- [x] Run all executable frontend tests, excluding only the known external ZIP parity test.
- [x] Run Readdy type check, lint, and production build.
- [x] Verify `git diff --check` and confirm no dashboard/funnel files changed.
- [x] In the browser, exercise `简历库 → 招聘需求 → 简历库` and equivalent interview/Offer switching; verify filters, page, scroll, and details restore while data reloads.
- [x] Verify logout/login starts from clean memory and invalid detail IDs fall back without a blank screen.
