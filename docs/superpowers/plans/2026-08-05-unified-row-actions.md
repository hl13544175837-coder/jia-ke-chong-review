# Unified Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify five list operation columns around one state-aware primary action and one shared, permission-aware overflow menu backed only by real routes and APIs.

**Architecture:** A reusable `RowActionMenu` owns popover positioning, dismissal, keyboard behavior, and visual grouping. Each business area owns a small pure action-policy module and passes handlers into its existing table; state mutations continue through existing dedicated APIs and confirmations rather than a generic status patch.

**Tech Stack:** React 19, TypeScript, React Router, Tailwind CSS, Lucide React, Node test runner through `tsx`, Playwright.

---

### Task 1: Shared row action menu

**Files:**
- Create: `readdy-frontend/src/components/ui/RowActionMenu.tsx`
- Create: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Write the failing shared-component contract**

Add assertions that the component uses a body portal, fixed coordinates, menu semantics, Escape/click-outside dismissal, danger tone, and an accessible expanded trigger:

```js
test('公共行菜单负责定位、关闭和键盘语义', () => {
  const source = read('src/components/ui/RowActionMenu.tsx');
  assert.match(source, /createPortal/);
  assert.match(source, /position: 'fixed'/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitem"/);
  assert.match(source, /Escape/);
  assert.match(source, /danger/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

Expected: FAIL because `RowActionMenu.tsx` does not exist.

- [ ] **Step 3: Implement the shared component**

Define the stable public contract:

```tsx
export interface RowActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  dividerBefore?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface RowActionMenuProps {
  ariaLabel: string;
  items: RowActionItem[];
}
```

Render a 32×32 trigger. On open, measure the trigger, calculate a 208-pixel-wide fixed menu that flips upward and left when needed, and portal it to `document.body`. Close on outside pointer, Escape, resize, captured scroll, route unmount, or item selection. Stop propagation on trigger and menu items.

- [ ] **Step 4: Run the focused test and type-check**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add readdy-frontend/src/components/ui/RowActionMenu.tsx readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: add shared row action menu"
```

### Task 2: Recruitment-demand actions and real mutations

**Files:**
- Create: `readdy-frontend/src/pages/jobs/rowActions.ts`
- Create: `readdy-frontend/src/pages/jobs/components/RequisitionActionDialog.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/DemandDetailPanel.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Modify: `readdy-frontend/src/features/demands/api.ts`
- Test: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Add failing demand-policy tests**

Test the exact de-duplication rules:

```js
assert.deepEqual(buildDemandRowActions(activeWithCapacity, 'admin').primary, 'select_candidates');
assert.ok(buildDemandRowActions(activeWithCapacity, 'admin').menu.includes('mark_filled'));
assert.equal(buildDemandRowActions(activeFull, 'admin').primary, 'mark_filled');
assert.ok(!buildDemandRowActions(activeFull, 'admin').menu.includes('mark_filled'));
assert.equal(buildDemandRowActions(paused, 'admin').primary, 'restore');
assert.ok(!buildDemandRowActions(paused, 'admin').menu.includes('restore'));
assert.ok(!buildDemandRowActions(activeWithCapacity, 'recruiter').menu.includes('reassign_owner'));
```

Also require the table to import `RowActionMenu` and prohibit the old `statusTransitions`/`statusExtraActions` menu renderer.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

Expected: FAIL because the demand policy and new handlers do not exist.

- [ ] **Step 3: Implement the pure demand action policy**

Expose:

```ts
export type DemandPrimaryAction = 'review' | 'select_candidates' | 'mark_filled' | 'restore' | 'view_candidates' | null;
export type DemandMenuAction = 'view' | 'edit' | 'view_candidates' | 'adjust_priority' | 'reassign_owner' | 'pause' | 'mark_filled' | 'cancel' | 'close' | 'restore';
export function buildDemandRowActions(row: RequisitionRow, role: ProductRole | null): { primary: DemandPrimaryAction; menu: DemandMenuAction[] };
```

Return only actions valid for the row state and role; remove any action already selected as primary.

- [ ] **Step 4: Add real API wrappers and dialogs**

Add:

```ts
adjustPriority(demandId: number, priority: DemandPriority, reason: string)
reassignOwner(demandId: number, ownerHrId: number, reason: string)
```

They call `/demands/:id/downgrade` and `/demands/:id/owner`. `RequisitionActionDialog` handles status reason, priority plus reason, and owner plus reason; it disables duplicate submissions and preserves input after failure.

- [ ] **Step 5: Wire the table and detail edit mode**

Replace the hand-built three-dot markup with `RowActionMenu`. Add an explicit edit handler that opens `DemandDetailPanel` with `initialMode="edit"`. Keep one primary action per row and route all mutations through page handlers that refresh `loadDemands()`.

- [ ] **Step 6: Run focused tests and type-check**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add readdy-frontend/src/pages/jobs readdy-frontend/src/features/demands/api.ts readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: expand demand row actions"
```

### Task 3: Interview-management actions

**Files:**
- Create: `readdy-frontend/src/pages/interviews/rowActions.ts`
- Modify: `readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx`
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Test: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Add failing interview-policy tests**

Cover unassigned, scheduled-before-start, scheduled-after-start, awaiting-feedback, completed, and pending-reschedule rows. Assert that `adjust` is absent from the menu when it is primary and that cancel is absent after the interview is conducted.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

Expected: FAIL because `interviews/rowActions.ts` does not exist.

- [ ] **Step 3: Implement the policy and table menu**

Expose:

```ts
export type InterviewMenuAction = 'details' | 'resume' | 'history' | 'reschedule_history' | 'adjust' | 'cancel';
export function buildInterviewMenuActions(row: InterviewManagementRow): InterviewMenuAction[];
```

Keep the existing `RowActions` primary button. Add one `RowActionMenu` beside it. `details`, `resume`, and histories open existing detail tabs/panels; `adjust` uses `openSchedule`; `cancel` opens the existing schedule modal’s reason-protected cancellation path.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

```bash
git add readdy-frontend/src/pages/interviews readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: add interview row action menus"
```

### Task 4: Candidate-library actions

**Files:**
- Create: `readdy-frontend/src/features/candidates/library/rowActions.ts`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`
- Test: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Add failing candidate-policy tests**

Require always-available detail/edit/favorite actions, conditional flow actions, and no delete/merge item. Require the table to remove standalone `Star` and `Eye` buttons.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

Expected: FAIL on missing policy and existing standalone icon buttons.

- [ ] **Step 3: Implement and wire candidate actions**

Expose:

```ts
export type CandidateMenuAction = 'view' | 'edit' | 'flow' | 'favorite' | 'transfer' | 'process';
export function buildCandidateMenuActions(candidate: CandidateListItem): CandidateMenuAction[];
```

Keep `renderCandidateBusinessAction(candidate, true)` as the only primary action. Move view and favorite into `RowActionMenu`; use the existing detail/recovery panel for editing, current route for flow processing, and existing transfer API/modal for demand transfer. Never add delete or per-row auto-merge.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

```bash
git add readdy-frontend/src/features/candidates readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: consolidate candidate row actions"
```

### Task 5: Offer navigation menu without expanding phase one

**Files:**
- Modify: `readdy-frontend/src/pages/offers/components/OfferTable.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Test: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Add failing Offer contract**

Require one OA registration/update primary button plus `RowActionMenu`, four approved navigation labels, and the continued absence of automatic send/approval/withdraw labels in `OfferTable`.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 3: Wire accurate navigation handlers**

Add `onOpenDemand`, `onOpenFlow`, and `onOpenInterviews` props. Navigate using exact `candidate` and `demand` query parameters while preserving `from=offers`. Keep `onRegister` as the only primary mutation.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

```bash
git add readdy-frontend/src/pages/offers readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: add Offer row navigation menu"
```

### Task 6: User-management actions and account safeguards

**Files:**
- Create: `readdy-frontend/src/pages/settings/UserActionDialog.tsx`
- Modify: `readdy-frontend/src/pages/settings/page.tsx`
- Modify: `readdy-frontend/src/features/settings/api.ts`
- Test: `readdy-frontend/tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 1: Add failing settings contract**

Require `编辑资料`, the shared menu, role/department adjustment, reset password, conditional enable/disable, no delete member text, and a `resetUserPassword` API wrapper.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/unified-row-actions-contract.test.mjs`

- [ ] **Step 3: Implement real account actions**

Add:

```ts
resetUserPassword(userId: number, password: string): Promise<{ status: 'ok'; id: number }> {
  return apiRequest(`/admin/users/${userId}/reset-password`, { method: 'POST', body: { password } });
}
```

Use the existing update endpoint for `is_active`, role, and department. The dialog requires a six-character password and confirmation before state changes; display backend protection errors without changing the list optimistically.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/unified-row-actions-contract.test.mjs && npm run type-check`

```bash
git add readdy-frontend/src/pages/settings readdy-frontend/src/features/settings/api.ts readdy-frontend/tests/unified-row-actions-contract.test.mjs
git commit -m "feat: expand user management actions"
```

### Task 7: Browser regression and final verification

**Files:**
- Create: `readdy-frontend/e2e/unified-row-actions.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-05-unified-row-actions-design.md`

- [ ] **Step 1: Add browser checks**

Test an admin/recruiter session at 1440×900: open each menu, assert only one primary action, verify menu placement stays inside the viewport, close with Escape, confirm row click does not also fire, and verify Offer contains no phase-two action.

- [ ] **Step 2: Run focused browser tests**

Run:

```bash
E2E_BASE_URL=http://127.0.0.1:5290 E2E_PASSWORD=Zhipin2026 \
  npx playwright test e2e/unified-row-actions.spec.ts --project=chromium
```

Expected: all new scenarios PASS.

- [ ] **Step 3: Run full frontend verification**

Run:

```bash
npm run test:contract
npm run type-check
npm run lint
npm run build
```

Expected: all commands exit 0 with no warnings promoted to errors.

- [ ] **Step 4: Inspect scope and commit verification**

Run `git diff --check`, confirm no dashboard/talent-map/analytics files changed, mark the design verification section with the final evidence directory, and commit the E2E/docs delta:

```bash
git add readdy-frontend/e2e/unified-row-actions.spec.ts docs/superpowers/specs/2026-08-05-unified-row-actions-design.md
git commit -m "test: cover unified row action menus"
```

- [ ] **Step 5: Merge and publish only after the merged result is re-tested**

Fast-forward the feature branch into local `test`, rerun `npm run test:contract`, then push `test` to GitHub `origin` and company GitLab `cfpd`. Verify both remote SHAs equal local `test`. Do not deploy SIT.
