# Readdy Desktop Interaction and Image Resume Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an isolated desktop recruitment demo that preserves the company product foundation, closes Readdy interaction gaps, and adds secure image-resume ingestion.

**Architecture:** Keep the existing React 18/Router 6 frontend and Flask backend. Use the exported Readdy project only as a source reference, preserve current HTTP contracts, and run against isolated local acceptance data. Add an AST-based control audit so every visible button has an action or an explicit disabled explanation.

**Tech Stack:** React 18, TypeScript, React Router 6, Tailwind CSS, Vite, Flask, SQLAlchemy, Pytest, Pillow, DashScope-compatible vision API.

---

### Task 1: Establish and verify the isolated baseline

**Files:**
- Existing: `frontend/package-lock.json`
- Existing: `backend/requirements.txt`
- Existing: `base_agent/requirements.txt`
- Verify: `docs/superpowers/specs/2026-07-24-readdy-resume-desktop-integration-design.md`

- [ ] **Step 1: Install isolated frontend dependencies**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app/frontend
npm ci
```

Expected: `node_modules` is created under the isolated app and npm exits with code 0.

- [ ] **Step 2: Create the isolated Python environment**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt -r base_agent/requirements.txt
```

Expected: `.venv` is contained inside the isolated app and dependency installation exits with code 0.

- [ ] **Step 3: Run the committed frontend baseline**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app/frontend
npm test
npm run typecheck -- --pretty false
npm run lint -- --quiet
npm run build
```

Expected: 105 test files, TypeScript, ESLint, and Vite build pass before feature changes.

- [ ] **Step 4: Run focused backend baseline tests**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
.venv/bin/python -m pytest backend/tests/test_resume_parse_retry.py backend/tests/test_security_hardening_next.py backend/tests/test_demand_interview_rounds.py backend/tests/test_interview_loop.py -q
```

Expected: all selected tests pass before feature changes.

### Task 2: Preserve the current complete interview workflow

**Files:**
- Modify: `backend/app/api/interview.py`
- Create: `backend/app/services/interview_management_service.py`
- Create: `backend/tests/test_interview_management_contract.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/ReaddyInterviewsPage.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/tests/current_page_detail_drawers.test.mjs`
- Modify: `frontend/tests/readdy_interviews_contract.test.mjs`

- [ ] **Step 1: Copy the eight-file source snapshot into the isolated app**

Copy the exact files from:

```text
/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/references/company-uncommitted-20260724
```

to matching paths under:

```text
/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
```

Expected: only the eight listed files change in the isolated app; the company source checkout remains untouched.

- [ ] **Step 2: Run the interview contracts**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
.venv/bin/python -m pytest backend/tests/test_interview_management_contract.py backend/tests/test_demand_interview_rounds.py backend/tests/test_interview_loop.py -q
cd frontend
node tests/readdy_interviews_contract.test.mjs
node tests/current_page_detail_drawers.test.mjs
npm run typecheck -- --pretty false
```

Expected: interview API, page interaction contracts, and TypeScript pass.

- [ ] **Step 3: Commit the recovered workflow**

```bash
git add backend/app/api/interview.py backend/app/services/interview_management_service.py backend/tests/test_interview_management_contract.py frontend/src/lib/api.ts frontend/src/pages/ReaddyInterviewsPage.tsx frontend/src/types/index.ts frontend/tests/current_page_detail_drawers.test.mjs frontend/tests/readdy_interviews_contract.test.mjs
git commit -m "feat: complete Readdy interview interactions"
```

### Task 3: Add a deterministic Readdy route and control audit

**Files:**
- Create: `frontend/scripts/audit-interactive-controls.mjs`
- Modify: `frontend/package.json`
- Create: `frontend/tests/readdy_export_route_coverage.test.mjs`
- Test: `frontend/tests/readdy_export_route_coverage.test.mjs`

- [ ] **Step 1: Add a failing route coverage test**

Create a test that reads `src/App.tsx` and asserts that these exported Readdy destinations remain reachable through a direct route or an intentional alias:

```js
const expectedRoutes = [
  '/dashboard', '/dashboard/interviews', '/dashboard/hired',
  '/dashboard/cycle', '/dashboard/offers', '/jobs', '/candidates',
  '/talent-map', '/kanban', '/interviews', '/offers', '/kpi-standards',
  '/analytics', '/ai-assistant', '/settings', '/interviewer/dashboard',
  '/interviewer/interviews', '/interviewer/candidates', '/interviewer/jobs',
  '/interviewer/screening', '/director/cockpit', '/director/progress',
  '/director/insights', '/director/approvals',
];
```

The test must list a missing route by name instead of returning a generic failure.

- [ ] **Step 2: Run the route test and record gaps**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app/frontend
node tests/readdy_export_route_coverage.test.mjs
```

Expected: the test fails only for routes that need an alias; no route is silently omitted.

- [ ] **Step 3: Add the TypeScript AST control audit**

Use the installed `typescript` package to parse every `src/**/*.tsx` file. For intrinsic `button` and shared `Button` elements, accept controls that have one of:

```js
const ACTION_ATTRIBUTES = new Set([
  'onClick', 'onDoubleClick', 'onMouseDown', 'onPointerDown',
]);
```

Also accept `type="submit"`, `type="reset"`, or a spread attribute delegated by a component wrapper. A disabled control must include `title` or `aria-describedby` so the reason is discoverable. Print `file:line` for every violation and exit nonzero when violations exist.

- [ ] **Step 4: Expose the audit command**

Add to `frontend/package.json`:

```json
"audit:interactions": "node scripts/audit-interactive-controls.mjs"
```

- [ ] **Step 5: Add intentional route aliases and fix reported controls**

Modify `frontend/src/App.tsx` so each exported route resolves to the correct existing product page and role guard. For each audit violation, either add the intended interaction handler or add a disabled reason. Do not add empty handlers or fake success messages.

- [ ] **Step 6: Verify and commit the audit contract**

Run:

```bash
npm run audit:interactions
node tests/readdy_export_route_coverage.test.mjs
npm test
npm run typecheck -- --pretty false
```

Expected: zero unclassified controls, complete route coverage, and all frontend tests pass.

Commit:

```bash
git add frontend/scripts/audit-interactive-controls.mjs frontend/package.json frontend/src/App.tsx frontend/tests/readdy_export_route_coverage.test.mjs frontend/src
git commit -m "test: enforce complete desktop interactions"
```

### Task 4: Complete the high-value desktop interaction surfaces

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/features/demands/pages/DemandsPage.tsx`
- Modify: `frontend/src/features/candidates/pages/CandidatesPage.tsx`
- Modify: `frontend/src/pages/KanbanPage.tsx`
- Modify: `frontend/src/pages/OffersPage.tsx`
- Modify: `frontend/src/pages/director/DirectorApprovalsPage.tsx`
- Modify: `frontend/src/components/AppShell.tsx`
- Test: `frontend/tests/same_page_detail_interactions.test.mjs`
- Test: `frontend/tests/readdy_dashboard_contract.test.mjs`
- Test: `frontend/tests/readdy_candidates_surface.test.mjs`
- Test: `frontend/tests/readdy_kanban_contract.test.mjs`
- Test: `frontend/tests/readdy_offer_contract.test.mjs`

- [ ] **Step 1: Expand interaction tests before page changes**

For each surface, assert the concrete contract:

```text
Dashboard metric/todo -> same-page drawer or list filter
Demand table/header -> filter, detail drawer, or explicit action dialog
Candidate row/name/batch action -> detail, selection state, or modal
Kanban card/stage action -> detail or confirmation workflow
Offer row/status action -> detail/history or confirmation workflow
Director approval row -> real detail drawer and approve/reject confirmation
Top-bar notification/account controls -> visible menu and close behavior
```

- [ ] **Step 2: Compare against the matching Readdy source files**

Use the reference files under `../references/readdy-export/src/pages/` to verify labels, control grouping, drawer contents, and modal states. Copy interaction ideas and small presentational fragments only; do not import `src/mocks` or replace the application framework.

- [ ] **Step 3: Implement missing handlers and state transitions**

Use existing API methods when present. When a later backend endpoint is required, route the action through an existing typed service boundary and return a visible unavailable state; do not directly embed Readdy mock imports in production pages.

- [ ] **Step 4: Verify high-value routes**

Run:

```bash
npm run audit:interactions
node tests/same_page_detail_interactions.test.mjs
node tests/readdy_dashboard_contract.test.mjs
node tests/readdy_candidates_surface.test.mjs
node tests/readdy_kanban_contract.test.mjs
node tests/readdy_offer_contract.test.mjs
npm run typecheck -- --pretty false
```

Expected: every listed surface has an explicit interaction and all tests pass.

- [ ] **Step 5: Commit the desktop interaction pass**

```bash
git add frontend/src frontend/tests
git commit -m "feat: close Readdy desktop interaction gaps"
```

### Task 5: Migrate secure image-resume ingestion

**Files:**
- Create: `base_agent/image_resume_parser.py`
- Modify: `base_agent/resume_parser.py`
- Modify: `base_agent/requirements.txt`
- Modify: `backend/app/api/resume.py`
- Modify: `backend/requirements.txt`
- Modify: `frontend/src/pages/UploadPage.tsx`
- Modify: `frontend/src/features/candidates/components/OriginalResumeViewer.tsx`
- Modify: `frontend/src/features/demands/components/CandidateSelectionModal.tsx`
- Modify: `frontend/tests/resume_parse_retry.test.mjs`
- Modify: `backend/tests/test_resume_parse_retry.py`
- Modify: `backend/tests/test_security_hardening_next.py`

- [ ] **Step 1: Copy the image parser and dependency pins from the GitHub reference**

Use the versions under:

```text
/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/references/github-image-resume
```

Keep `Pillow==12.2.0`, the image limits, image normalization, endpoint validation, response normalization, and secret-free logging.

- [ ] **Step 2: Port upload validation and ZIP handling**

Update `backend/app/api/resume.py` so allowed document formats remain PDF/DOCX and image formats become JPG/JPEG/PNG/WebP/GIF. Keep the existing path traversal and ZIP bomb protections and apply the stricter image size limit inside ZIP files.

- [ ] **Step 3: Port the upload and preview UI**

Update `UploadPage.tsx` so the file input accepts:

```ts
['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.zip']
```

Show an image-resume badge, image count, 10 MB limit, and model-configuration guidance. Preserve the current source-channel fields and upload result handling.

- [ ] **Step 4: Run the image-resume tests**

Run:

```bash
cd /Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
.venv/bin/python -m pytest backend/tests/test_resume_parse_retry.py backend/tests/test_security_hardening_next.py -q
cd frontend
node tests/resume_parse_retry.test.mjs
npm run typecheck -- --pretty false
```

Expected: valid images are accepted, damaged/spoofed/oversized images are rejected before model calls, ZIP validation remains safe, and frontend contracts pass.

- [ ] **Step 5: Commit image-resume support**

```bash
git add base_agent backend frontend/src/pages/UploadPage.tsx frontend/src/features/candidates/components/OriginalResumeViewer.tsx frontend/src/features/demands/components/CandidateSelectionModal.tsx frontend/tests/resume_parse_retry.test.mjs
git commit -m "feat: support secure image resume recognition"
```

### Task 6: Add isolated start, stop, and readiness controls

**Files:**
- Create: `scripts/start-isolated-demo.sh`
- Create: `scripts/stop-isolated-demo.sh`
- Create: `scripts/check-isolated-demo.sh`
- Create: `.env.isolated.example`
- Create: `docs/ISOLATED_CLEANUP.md`

- [ ] **Step 1: Write the start script with fixed isolated paths**

Use these defaults:

```bash
ROOT=/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724
APP="$ROOT/app"
RUNTIME="$ROOT/runtime"
BACKEND_PORT=5010
OAUTH_PORT=5110
FRONTEND_PORT=5190
```

The script must bind the frontend to `0.0.0.0`, keep backend data/uploads/logs/PIDs inside `$RUNTIME`, reject occupied ports, and never run `pkill` against generic process names.

- [ ] **Step 2: Write exact stop and check scripts**

The stop script reads only PID files under `$RUNTIME/pids`, verifies each process command contains the isolated root, then terminates it. The check script reports PID state and probes backend health, OAuth bridge, and frontend HTTP status.

- [ ] **Step 3: Document deletion boundaries**

`docs/ISOLATED_CLEANUP.md` must state that cleanup targets only:

```text
/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724
```

and must explicitly forbid deleting the company source checkout or unrelated `/private/tmp` content.

- [ ] **Step 4: Shell-check and commit runtime controls**

Run:

```bash
bash -n scripts/start-isolated-demo.sh
bash -n scripts/stop-isolated-demo.sh
bash -n scripts/check-isolated-demo.sh
```

Expected: all scripts parse successfully.

Commit:

```bash
git add scripts .env.isolated.example docs/ISOLATED_CLEANUP.md
git commit -m "chore: add isolated demo runtime controls"
```

### Task 7: Run complete automated and browser acceptance

**Files:**
- Create: `docs/evidence/2026-07-24-isolated-demo/README.md`
- Create: `docs/evidence/2026-07-24-isolated-demo/acceptance.json`
- Create: `docs/evidence/2026-07-24-isolated-demo/*.png`

- [ ] **Step 1: Run complete automated gates**

Run:

```bash
cd frontend
npm test
npm run audit:interactions
npm run typecheck -- --pretty false
npm run lint -- --quiet
npm run build
cd ..
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python -m pytest base_agent/tests -q
git diff --check
```

Expected: every command exits 0. Record exact pass counts in the evidence document.

- [ ] **Step 2: Start the isolated stack**

Run:

```bash
scripts/start-isolated-demo.sh
scripts/check-isolated-demo.sh
```

Expected: backend `5010`, OAuth bridge `5110`, and frontend `5190` are healthy.

- [ ] **Step 3: Validate desktop viewports**

At `1366x768`, `1440x900`, and `1920x1080`, verify login plus all role-visible core routes. For each route, check the primary button, one detail drilldown, one filter or mode control, and every modal/drawer opened by that flow. Capture representative screenshots and console errors.

- [ ] **Step 4: Record machine-readable acceptance**

Write `acceptance.json` with route, role, viewport, interaction, result, screenshot, and console error count. Any failed interaction keeps the task incomplete.

- [ ] **Step 5: Commit acceptance evidence**

```bash
git add docs/evidence/2026-07-24-isolated-demo
git commit -m "test: record isolated desktop acceptance"
```

### Task 8: Deliver product and handoff documentation

**Files:**
- Create: `docs/PRODUCT_INTERACTION_GUIDE.md`
- Create: `docs/HANDOFF_PROMPT.md`
- Modify: `README.md`

- [ ] **Step 1: Write the product interaction guide**

Document each role, route, main information, buttons, modal/drawer outcomes, demo-state behavior, and future API replacement point. State clearly that mobile is outside this delivery.

- [ ] **Step 2: Write the short handoff prompt**

Use this exact structure:

```text
请打开并接手项目：/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724/app
先阅读 README.md、docs/PRODUCT_INTERACTION_GUIDE.md 和 docs/ISOLATED_CLEANUP.md，再运行 scripts/check-isolated-demo.sh；未运行则执行 scripts/start-isolated-demo.sh。只操作该独立根目录，不要修改或删除其他项目。
```

- [ ] **Step 3: Update the root README**

Place the local URL, LAN access guidance, demo accounts, start/check/stop commands, source references, branch name, and cleanup boundary near the top.

- [ ] **Step 4: Verify documentation commands and commit**

Run every documented check/start/stop command once, then commit:

```bash
git add README.md docs/PRODUCT_INTERACTION_GUIDE.md docs/HANDOFF_PROMPT.md
git commit -m "docs: deliver product interaction and handoff guide"
```

- [ ] **Step 5: Final completion check**

Run:

```bash
git status --short
scripts/check-isolated-demo.sh
```

Expected: clean git status and a healthy isolated stack on ports `5010`, `5110`, and `5190`.
