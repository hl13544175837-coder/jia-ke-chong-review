# Local Colleague Trial Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish three low-risk local polish batches so colleagues can understand every core page state, run a repeatable five-role trial, and detect regressions before handoff.

**Architecture:** Add one presentation-only page-state component and one user-facing error translator, then reuse them in existing core work pages. Reuse the current validated backup/restore utilities, add contract tests and a build-artifact budget check, and keep real interaction acceptance in Tabbit.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node built-in test runner, Vite, Bash, existing Flask backup/restore scripts.

---

## File map

- Create `readdy-frontend/src/components/ui/PageStateCard.tsx`: consistent loading, empty and error presentation.
- Create `readdy-frontend/src/lib/userFacingError.ts`: preserve useful Chinese business errors and translate technical failures.
- Create `readdy-frontend/tests/trial-polish-contract.test.mjs`: contracts for state reuse, retry actions, close labels and trial docs.
- Modify the six core work pages under `readdy-frontend/src/pages/`: replace duplicated state blocks without changing data flow.
- Modify `CandidateDetailDrawer.tsx`: label the icon-only close button found in real Tabbit acceptance.
- Create `docs/16_本地同事试用验收清单.md`: five-role checkbox runbook and safe snapshot procedure.
- Modify `docs/15_同事小范围试用说明.md`: link the checklist and add the “验收测试” naming rule.
- Create `scripts/check-frontend-bundle-budget.mjs`: inspect built JS files and enforce current performance boundaries.
- Modify `scripts/check-sit-release.sh`: run the budget check immediately after the Vite build.
- Modify `docs/14_本地多角色招聘闭环验收记录.md`: record final results only after fresh verification.

### Task 1: Shared state and error contracts

**Files:**
- Create: `readdy-frontend/tests/trial-polish-contract.test.mjs`
- Create: `readdy-frontend/src/components/ui/PageStateCard.tsx`
- Create: `readdy-frontend/src/lib/userFacingError.ts`

- [ ] **Step 1: Write the failing component contract**

Add a Node test that reads the two not-yet-created files and requires:

```js
test('共享页面状态同时覆盖加载、空数据、失败和重试', () => {
  const source = read('src/components/ui/PageStateCard.tsx');
  assert.match(source, /type PageStateVariant = 'loading' \| 'empty' \| 'error'/);
  assert.match(source, /onAction\?: \(\) => void/);
  assert.match(source, /role=\{variant === 'error' \? 'alert' : 'status'\}/);
  assert.match(source, /重新加载/);
});

test('技术错误统一翻译为业务用户看得懂的提示', () => {
  const source = read('src/lib/userFacingError.ts');
  assert.match(source, /export function userFacingError/);
  assert.match(source, /Failed to fetch|NetworkError|HTTP\\s*\\d{3}/);
  assert.match(source, /请稍后重试/);
});
```

- [ ] **Step 2: Verify RED**

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs`

Expected: FAIL because `PageStateCard.tsx` and `userFacingError.ts` do not exist.

- [ ] **Step 3: Implement the minimal shared units**

`PageStateCard` accepts `variant`, `title`, `description`, optional `actionLabel` and `onAction`. Loading uses the existing green/gray palette, empty uses neutral styling, and error uses the existing red palette. Default error action text is `重新加载`.

`userFacingError(error, fallback)` returns a non-empty Chinese business error unchanged, but maps network errors, HTTP-only messages, stack-like errors and unknown values to `${fallback}，请稍后重试。`.

- [ ] **Step 4: Verify GREEN**

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs && npm run type-check`

Expected: both component contracts pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add readdy-frontend/src/components/ui/PageStateCard.tsx readdy-frontend/src/lib/userFacingError.ts readdy-frontend/tests/trial-polish-contract.test.mjs
git commit -m "feat: unify core page states"
```

### Task 2: Core work-page adoption and close labels

**Files:**
- Modify: `readdy-frontend/tests/trial-polish-contract.test.mjs`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/jobs/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Modify: `readdy-frontend/src/pages/candidates/components/CandidateDetailDrawer.tsx`

- [ ] **Step 1: Extend the contract and verify RED**

Require every listed page to import `PageStateCard` and `userFacingError`, require visible retry callbacks in error states, and require `CandidateDetailDrawer` to contain:

```tsx
type="button"
aria-label="关闭候选人详情"
```

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs`

Expected: FAIL because pages still use duplicated blocks and the candidate close button is unlabeled.

- [ ] **Step 2: Replace only the state presentation**

For each page, keep current API calls, arrays, filters and callbacks unchanged. Replace loading/error/empty JSX with `PageStateCard`. Empty descriptions must state the next action, for example:

```tsx
<PageStateCard
  variant="empty"
  title="暂无符合条件的面试任务"
  description="可以切换状态或清除筛选条件后再查看。"
/>
```

Use `userFacingError(error, '加载面试任务失败')` in catch blocks. Add the close button type and label only; do not alter drawer behavior.

- [ ] **Step 3: Run targeted verification**

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs tests/overlay-lifecycle-contract.test.mjs tests/ui-consistency-contract.test.mjs && npm run type-check && npm run lint`

Expected: all targeted tests, type check and lint pass.

- [ ] **Step 4: Commit**

```bash
git add readdy-frontend/src readdy-frontend/tests/trial-polish-contract.test.mjs
git commit -m "fix: clarify core workspace states"
```

### Task 3: Trial data and recovery runbook

**Files:**
- Create: `docs/16_本地同事试用验收清单.md`
- Modify: `docs/15_同事小范围试用说明.md`
- Modify: `readdy-frontend/tests/trial-polish-contract.test.mjs`

- [ ] **Step 1: Add the failing documentation contract**

Require the docs to contain all five accounts, the `验收测试` prefix, `backup_pilot_data.py`, `restore_pilot_data.py`, `--dry-run`, a stop-services warning, and a statement that restore is never automatic.

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs`

Expected: FAIL because the new checklist does not exist.

- [ ] **Step 2: Write the five-role checkbox checklist**

The checklist contains separate sections for `hr01`, `interviewer01`, `interviewer02`, `director01` and `admin01`. Every section covers normal work, open/close detail, leave/return state, empty/error recovery, and expected permissions. Add commands that reuse the existing backup script, and only show restore as dry-run plus an explicit user-confirmed final command.

- [ ] **Step 3: Verify docs contract**

Run: `cd readdy-frontend && node --test tests/trial-polish-contract.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/15_同事小范围试用说明.md docs/16_本地同事试用验收清单.md readdy-frontend/tests/trial-polish-contract.test.mjs
git commit -m "docs: add repeatable local trial checklist"
```

### Task 4: Build performance budget

**Files:**
- Create: `scripts/check-frontend-bundle-budget.mjs`
- Modify: `scripts/check-sit-release.sh`
- Create: `readdy-frontend/tests/bundle-budget-contract.test.mjs`

- [ ] **Step 1: Write and run the failing budget contract**

The contract requires the script to locate `readdy-frontend/out/assets/index-*.js`, fail above `360000` bytes, fail when any lazy page chunk exceeds `130000` bytes, and print the measured largest files. It also requires `check-sit-release.sh` to invoke the script after `npm run build`.

Run: `cd readdy-frontend && node --test tests/bundle-budget-contract.test.mjs`

Expected: FAIL because the budget script does not exist.

- [ ] **Step 2: Implement the read-only budget script**

Use only `node:fs/promises`, `node:path` and `node:url`. Read file sizes from `out/assets`, identify the entry by `index-*.js`, identify route chunks by `page-*.js`, print entry and largest route size, and exit non-zero with a Chinese explanation when a limit is exceeded.

- [ ] **Step 3: Wire it into the release gate and verify**

Run:

```bash
cd readdy-frontend
npm run build
node ../scripts/check-frontend-bundle-budget.mjs
node --test tests/bundle-budget-contract.test.mjs
```

Expected: current entry around 314 KB and largest route around 101 KB; all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-frontend-bundle-budget.mjs scripts/check-sit-release.sh readdy-frontend/tests/bundle-budget-contract.test.mjs
git commit -m "test: enforce frontend bundle budget"
```

### Task 5: Tabbit multi-role read-only acceptance

**Files:**
- Modify only if a newly reproduced scoped defect needs a TDD fix.

- [ ] **Step 1: Verify local services and wrong-version exclusions**

Confirm 5190, 5100 and 5010 point to the required root paths; old ports and `/private/tmp` recruitment processes are absent.

- [ ] **Step 2: Run five-role acceptance in Tabbit**

Use the existing test accounts. For each role, open one core list, open and close one detail, switch to another menu and return. Confirm state preservation, no stale overlay, clear empty/error wording where available, and role-specific data-board navigation. Do not submit business decisions.

- [ ] **Step 3: Record evidence**

Append a dated section to `docs/14_本地多角色招聘闭环验收记录.md` listing role, action and result. Do not include passwords or candidate private information.

- [ ] **Step 4: Commit**

```bash
git add docs/14_本地多角色招聘闭环验收记录.md
git commit -m "docs: record three-batch local acceptance"
```

### Task 6: Full final verification and local handoff

**Files:**
- No expected production changes.

- [ ] **Step 1: Run the complete release gate**

Run: `./scripts/check-sit-release.sh`

Expected: backend, frontend tests, type check, lint, build, bundle budget, dependency audits, migration head and Git diff checks all pass.

- [ ] **Step 2: Verify exact Git and service state**

Run `git status --short`, `git diff --check`, health checks and `lsof`. Confirm the worktree is clean and services still use only the required root paths and ports.

- [ ] **Step 3: Preserve the local branch**

Keep the branch and worktree as-is. Do not push, deploy, delete the worktree or clean runtime data.

- [ ] **Step 4: Report in plain Chinese**

Report what changed, fresh test counts, bundle sizes, remaining external limitations, final local commit and the only open URL: `http://127.0.0.1:5190`.
