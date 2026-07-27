# Recruiter Offer Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the archive-first Offer page with a recruiter-owned daily action workspace that supports self-confirmation, truthful send recording, risk prioritization, and separated history.

**Architecture:** Keep the existing Offer status machine and database schema. Add backend permission and channel validation at the current action endpoint, isolate frontend derivation in a small `workbench.ts`, and reuse the existing page, table, creation modal, and detail drawer with clearer task-first composition.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router, Flask, SQLAlchemy, Node contract tests, pytest.

---

## File map

- Create `readdy-frontend/src/pages/offers/workbench.ts`: tabs, risk calculation, daily-task selection, sort and filter helpers.
- Modify `readdy-frontend/src/pages/offers/page.tsx`: task-first state, reminder strip, centralized filters, URL-aware tab selection.
- Modify `readdy-frontend/src/pages/offers/components/OfferTable.tsx`: daily-work columns and one clear primary action per row.
- Modify `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`: recruiter self-confirmation, send channel form, task-first copy.
- Modify `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`: replace approval language with confirmation language.
- Modify `backend/app/api/pipeline.py`: allow recruiters to confirm managed Offer records.
- Modify `backend/app/services/pipeline_service.py`: require and persist a valid send channel.
- Modify `backend/tests/test_offer_lifecycle.py`: prove recruiter-owned lifecycle and channel validation.
- Create `frontend/tests/recruiter_offer_workbench.test.mjs`: protect the new product behavior and source structure.

### Task 1: Recruiter self-confirmation and truthful send recording

**Files:**
- Modify: `backend/tests/test_offer_lifecycle.py`
- Modify: `backend/app/api/pipeline.py`
- Modify: `backend/app/services/pipeline_service.py`

- [ ] **Step 1: Write failing backend tests**

Change the lifecycle test so the owning recruiter executes `approve`, assert the result is `approved`, and add a missing-channel case:

```python
confirmed = client.post(
    f"/api/offers/{offer_id}/actions",
    headers=_auth(recruiter_token),
    json={"action": "approve", "comment": "薪酬与入职日期已确认"},
)
assert confirmed.status_code == 200
assert confirmed.get_json()["status"] == "approved"

missing_channel = client.post(
    f"/api/offers/{offer_id}/actions",
    headers=_auth(recruiter_token),
    json={"action": "send"},
)
assert missing_channel.status_code == 400
assert missing_channel.get_json()["code"] == "offer_send_channel_required"
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `.venv/bin/pytest backend/tests/test_offer_lifecycle.py -q`

Expected: recruiter approval returns 403 and missing channel is accepted.

- [ ] **Step 3: Implement scoped confirmation permission**

In `run_offer_action`, remove the global recruiter denial for `approve`, keep `reject` manager/admin-only, and rely on `_manage_allowed(demand)` for owner scope:

```python
if action == "reject" and g.role not in {"manager", "admin"}:
    return jsonify({"error": "Forbidden"}), 403
```

- [ ] **Step 4: Validate and persist the channel**

In `transition_offer`, before changing status on `send`, normalize the channel and reject an empty value:

```python
channel = str(data.get("channel") or "").strip()[:40]
if action == "send" and not channel:
    raise PipelineServiceError(
        "请填写实际发送渠道",
        400,
        "offer_send_channel_required",
    )
```

Store `channel` in the existing Offer history detail. Update unrelated existing send fixtures to pass `channel="email"`.

- [ ] **Step 5: Run focused backend tests and verify GREEN**

Run: `.venv/bin/pytest backend/tests/test_offer_lifecycle.py backend/tests/test_demand_pipeline_isolation.py -q`

Expected: all selected tests pass.

### Task 2: Offer workbench view model

**Files:**
- Create: `frontend/tests/recruiter_offer_workbench.test.mjs`
- Create: `readdy-frontend/src/pages/offers/workbench.ts`

- [ ] **Step 1: Write a failing view-model test**

Import the TypeScript module and assert these contracts:

```javascript
assert.equal(offerStatusLabel('pending'), '待确认');
assert.equal(offerPrimaryAction('approved'), '登记发放');
assert.deepEqual(
  buildOfferTabCounts(records, now),
  { today: 5, draft: 1, pending: 1, approved: 1, sent: 1, accepted: 1, history: 4 },
);
assert.equal(offerRisk(overdueReply, now).level, 'high');
assert.equal(isTodayOfferTask(onboarded, now), false);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node frontend/tests/recruiter_offer_workbench.test.mjs`

Expected: missing `workbench.ts`.

- [ ] **Step 3: Implement typed derivation helpers**

Export:

```ts
export type OfferWorkbenchTab = 'today' | 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'history';
export type OfferRisk = { level: 'high' | 'medium' | 'low'; label: string; rank: number };
export function offerStatusLabel(status: OfferStatus): string;
export function offerPrimaryAction(status: OfferStatus): string;
export function offerRisk(offer: OfferRecord, now?: Date): OfferRisk;
export function isTodayOfferTask(offer: OfferRecord, now?: Date): boolean;
export function buildOfferTabCounts(items: OfferRecord[], now?: Date): Record<OfferWorkbenchTab, number>;
export function filterAndSortOffers(input: OfferWorkbenchInput): OfferRecord[];
```

Use active statuses for task tabs, closed statuses for history, node timestamps for waiting time, and injected `now` for deterministic tests.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node frontend/tests/recruiter_offer_workbench.test.mjs`

Expected: `recruiter_offer_workbench: OK`.

### Task 3: Task-first page and filters

**Files:**
- Modify: `frontend/tests/recruiter_offer_workbench.test.mjs`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`

- [ ] **Step 1: Add failing page contract assertions**

Assert the page contains `Offer 工作台`, defaults to `today`, uses `filterAndSortOffers`, renders `今日提醒`, and exposes centralized filters for demand, owner, risk, and order. Assert it no longer renders the old table-head filter reset copy.

- [ ] **Step 2: Run and verify RED**

Run: `node frontend/tests/recruiter_offer_workbench.test.mjs`

Expected: page contract assertions fail.

- [ ] **Step 3: Replace archive-first composition**

Use the seven workbench tabs and initialize safely from the URL:

```ts
const [activeTab, setActiveTab] = useState<OfferWorkbenchTab>(
  () => initialOfferTab(searchParams.get('tab')),
);
```

Build reminder counts from `offerRisk`, show the strip only when non-zero, move filters into one compact row, and show removable active-filter chips. Preserve `demand` and `from` URL context.

- [ ] **Step 4: Verify page contracts and type safety**

Run:

```bash
node frontend/tests/recruiter_offer_workbench.test.mjs
cd readdy-frontend && npm run type-check
```

Expected: both pass.

### Task 4: Clear row actions and detail flow

**Files:**
- Modify: `frontend/tests/recruiter_offer_workbench.test.mjs`
- Modify: `readdy-frontend/src/pages/offers/components/OfferTable.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/OfferDetailDrawer.tsx`
- Modify: `readdy-frontend/src/pages/offers/components/CreateOfferModal.tsx`

- [ ] **Step 1: Add failing interaction-copy assertions**

Require these visible actions and forbid old approval copy:

```javascript
for (const copy of ['继续编辑', '确认 Offer', '登记发放', '登记候选人回复', '确认入职', '查看记录']) {
  assert.match(offerSurface, new RegExp(copy));
}
for (const stale of ['提交审批', '待审批', '审批通过', '审批人']) {
  assert.doesNotMatch(offerSurface, new RegExp(stale));
}
assert.match(detail, /企业微信/);
assert.match(detail, /线下/);
assert.match(detail, /仅登记发送结果/);
```

- [ ] **Step 2: Run and verify RED**

Run: `node frontend/tests/recruiter_offer_workbench.test.mjs`

Expected: old copy and missing actions fail.

- [ ] **Step 3: Implement one primary action per row**

Pass `onPrimaryAction` from the page. Each row shows its status-derived label, waiting duration, date, and risk. Keep row click opening the detail drawer and make the primary button open the corresponding action form.

Track the requested action in the page and pass it explicitly:

```ts
const [requestedAction, setRequestedAction] = useState<OfferAction | null>(null);
// OfferDetailDrawer props
initialAction={requestedAction}
onClose={() => { closeDetail(); setRequestedAction(null); }}
```

The drawer applies `initialAction` in an effect keyed by `offer.id` and `initialAction`, so a row CTA opens the correct form without simulating clicks.

- [ ] **Step 4: Implement task-first drawer copy and forms**

Allow recruiter `approve`; map UI copy to the confirmed business wording. Add `sendChannel` state with required options:

```ts
const SEND_CHANNELS = [
  ['enterprise_wechat', '企业微信'],
  ['email', '邮件'],
  ['offline', '线下'],
  ['other', '其他'],
] as const;
```

For `send`, disable confirmation until a channel is selected and pass it in `OfferActionInput.channel`. Explain that this records the real result and does not call an external interface.

- [ ] **Step 5: Update creation copy**

Replace “保存后仍需提交审批” with “保存为草稿，确认薪酬与入职日期后再登记发放”。

- [ ] **Step 6: Run focused frontend checks**

Run:

```bash
node frontend/tests/recruiter_offer_workbench.test.mjs
cd readdy-frontend && npm run type-check && npm run lint
```

Expected: all pass.

### Task 5: End-to-end acceptance data and regression

**Files:**
- No source files. This task changes local demo state through real APIs and runs verification commands.

- [ ] **Step 1: Create local lifecycle coverage through the real API**

Use the current recruiter account and existing active demands to create or transition local demo Offer records covering draft, pending, approved, sent, and accepted. Do not insert directly into the database; use the same API actions as the UI.

- [ ] **Step 2: Browser acceptance**

Verify:

- default page is 今日待办;
- the five existing onboarded records appear only in 历史记录;
- each active status exposes the correct next action;
- recruiter can confirm a pending Offer;
- send cannot submit without channel and saves channel when submitted;
- accepted Offer can be confirmed onboarded;
- search, demand filter, risk filter, sort, detail drawer, and return context work;
- console has no errors.

- [ ] **Step 3: Run all verification commands**

```bash
rg --files frontend/tests -g '*.test.mjs' -g '!readdy_zip_exact_parity.test.mjs' -0 | sort -z | xargs -0 node --test
.venv/bin/pytest backend/tests -q
cd readdy-frontend && npm run type-check && npm run lint && npm run build
cd .. && git diff --check
```

Expected: zero failures and build exit code 0.

- [ ] **Step 4: Commit only Offer workbench files**

Stage explicit files from Tasks 1-4 and the new tests. Confirm `backend/seed_dev.py`, `backend/tests/test_seed_dev_demand_scope.py`, `.superpowers/`, and existing demo scripts remain untracked or unstaged.
