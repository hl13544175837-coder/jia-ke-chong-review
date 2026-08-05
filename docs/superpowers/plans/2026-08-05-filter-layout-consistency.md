# Filter Layout Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify filter placement and spacing on existing filter-bearing workspaces, remove duplicate candidate filters, add inclusive candidate intake-date ranges, and display precise current pipeline state without changing established recruiting semantics.

**Architecture:** Keep domain truth in the existing Flask candidate API and expose read-only `pipeline_state`/history facts to React. Keep scope tabs separate from precise column filters, centralize equal-size grid styles in the existing `FilterBar` primitive, and reuse the existing candidate filter controller so URL state, pagination, selection clearing, and API queries stay on one path.

**Tech Stack:** Flask, SQLAlchemy, pytest, React 19, TypeScript, React Router, Tailwind CSS, Node test contracts.

---

## File map

- `backend/app/api/candidates.py`: parse date-range parameters, centralize pipeline-state query predicates, and serialize current/historical pipeline facts.
- `backend/tests/test_candidate_search_pagination.py`: prove inclusive dates and the distinction between active, never-entered, rejected, onboarded, and transferred candidates.
- `readdy-frontend/src/components/ui/FilterBar.tsx`: export the shared equal-width grid and control classes without changing the default wrapping behavior.
- `readdy-frontend/src/features/candidates/types.ts`: add API/filter types for dates and precise pipeline state.
- `readdy-frontend/src/features/candidates/library.ts`: validate precise pipeline-state values and retain existing scope labels.
- `readdy-frontend/src/features/candidates/library/useCandidateLibraryFilters.ts`: separate broad scope from precise state, add date URL state, and remove hidden phase-two skill UI state.
- `readdy-frontend/src/features/candidates/library/useCandidateLibraryData.ts`: send date/state filters to the server before pagination.
- `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`: provide current-state labels and click-filter actions to presentation components.
- `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`: build the compact four-column top grid and move scope tabs beneath it.
- `readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx`: keep frequent table-header filters, split education/city, hide skills, and make filterable values clickable.
- `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`, `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`, `readdy-frontend/src/pages/offers/page.tsx`, `readdy-frontend/src/pages/interviewer/screening/page.tsx`, `readdy-frontend/src/pages/interviewer/interviews/page.tsx`: adopt the shared equal-size grid only where an existing filter bar is present.
- `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`: protect the approved placement, spacing, hidden phase-two controls, and non-duplicated candidate columns.
- `docs/01_PRD.md`, `docs/SDD-智聘招聘系统-v1.0.md`, `docs/11_Readdy新前端迁移与验收矩阵.md`: synchronize the approved user-visible interaction and API contract.

### Task 1: Candidate date and pipeline-state backend contract

**Files:**
- Modify: `backend/tests/test_candidate_search_pagination.py`
- Modify: `backend/app/api/candidates.py`

- [ ] **Step 1: Write failing backend tests**

Add focused tests that create candidates on boundary dates and candidates with no flow, active flow, rejected history, onboarded history, and transferred history. Assert:

```python
response = client.get(
    "/api/candidates?created_from=2026-08-02&created_to=2026-08-03&page=1&per_page=20",
    headers=auth_headers,
)
assert response.status_code == 200
assert {item["name_masked"] for item in response.get_json()["candidates"]} == {
    "边界开始",
    "边界结束",
}

assert client.get(
    "/api/candidates?created_from=2026-08-04&created_to=2026-08-03&page=1&per_page=20",
    headers=auth_headers,
).status_code == 400

states = {
    item["name_masked"]: (item["pipeline_state"], item["has_rejected_history"])
    for item in client.get("/api/candidates?page=1&per_page=20", headers=auth_headers).get_json()["candidates"]
}
assert states["从未进入"] == ("never_entered", False)
assert states["当前淘汰"] == ("rejected", True)
assert states["重新启用"] == ("in_pipeline", True)
```

Also assert `pipeline_status=never_entered` and `pipeline_status=rejected` return distinct sets while legacy `pipeline_status=not_in_pipeline` still returns the existing talent-pool union.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pytest -q backend/tests/test_candidate_search_pagination.py
```

Expected: new assertions fail because date parameters and serialized pipeline facts do not yet exist.

- [ ] **Step 3: Implement date parsing and centralized state facts**

In `backend/app/api/candidates.py`, add ISO-date parsing with an inclusive upper boundary and batch-derived facts. Keep legacy filters compatible:

```python
def _parse_candidate_date_arg(name):
    raw = request.args.get(name, "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise ValueError(f"{name} 必须使用 YYYY-MM-DD 格式") from error


def _pipeline_state(latest_stage, active):
    if active:
        return "in_pipeline"
    if latest_stage in {"rejected", "onboarded", "transferred"}:
        return latest_stage
    return "never_entered"
```

Use shared subqueries for active flows and latest stages so both filtering and serialization follow the same owner logic. Apply `created_from` at midnight and `created_to + 1 day` as an exclusive boundary. Return `400` for invalid or reversed ranges.

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
pytest -q backend/tests/test_candidate_search_pagination.py
```

Expected: all tests pass.

- [ ] **Step 5: Commit backend contract**

```bash
git add backend/app/api/candidates.py backend/tests/test_candidate_search_pagination.py
git commit -m "feat: add precise candidate status filters"
```

### Task 2: Candidate filter state and API query wiring

**Files:**
- Create: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`
- Modify: `readdy-frontend/src/features/candidates/types.ts`
- Modify: `readdy-frontend/src/features/candidates/library.ts`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryFilters.ts`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryData.ts`

- [ ] **Step 1: Write the failing frontend contract**

Create a source contract that checks date/state query types, independent scope state, and absence of hidden skill state from the candidate controller:

```js
test('candidate filter state keeps scope separate and sends date ranges', () => {
  const types = read('src/features/candidates/types.ts');
  const filters = read('src/features/candidates/library/useCandidateLibraryFilters.ts');
  const data = read('src/features/candidates/library/useCandidateLibraryData.ts');
  assert.match(types, /created_from\?: string/);
  assert.match(types, /PipelineState/);
  assert.match(filters, /createdFrom/);
  assert.match(filters, /createdTo/);
  assert.match(filters, /pipelineStateFilter/);
  assert.match(data, /created_from: createdFrom/);
  assert.doesNotMatch(filters, /const \[skillFilter/);
  assert.doesNotMatch(filters, /const \[scoreFilter/);
});
```

- [ ] **Step 2: Run the contract and confirm failure**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs
```

Expected: fail on missing types and state.

- [ ] **Step 3: Implement typed state and URL synchronization**

Add:

```ts
export type PipelineState = 'in_pipeline' | 'never_entered' | 'rejected' | 'onboarded' | 'transferred';

export interface CandidateListQuery {
  created_from?: string;
  created_to?: string;
  pipeline_status?: 'in_pipeline' | 'not_in_pipeline' | Exclude<PipelineState, 'in_pipeline'>;
}
```

Use explicit `libraryScope`, `pipelineStateFilter`, `createdFrom`, and `createdTo` state. Scope selection resets an incompatible precise state; precise state remains combinable with favorites. Delete candidate-library-only `skillFilter` and `scoreFilter` state so no invisible URL filter survives after the UI is hidden.

- [ ] **Step 4: Wire the server query and run tests**

Send `created_from`, `created_to`, and the precise state (or the scope-derived legacy value) from `useCandidateLibraryData.ts`, then run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs && npm run type-check
```

Expected: contract and TypeScript pass.

- [ ] **Step 5: Commit state wiring**

```bash
git add readdy-frontend/tests/filter-layout-consistency-contract.test.mjs readdy-frontend/src/features/candidates/types.ts readdy-frontend/src/features/candidates/library.ts readdy-frontend/src/features/candidates/library/useCandidateLibraryFilters.ts readdy-frontend/src/features/candidates/library/useCandidateLibraryData.ts
git commit -m "feat: wire candidate filter state"
```

### Task 3: Candidate filter layout and table interaction

**Files:**
- Modify: `readdy-frontend/src/components/ui/FilterBar.tsx`
- Modify: `readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx`
- Modify: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Extend the failing UI contract**

Assert the approved grid and table structure:

```js
assert.match(filterBar, /FILTER_GRID_CLASS/);
assert.match(filtersUi, /入库开始日期/);
assert.match(filtersUi, /入库结束日期/);
assert.match(filtersUi, /来源渠道/);
assert.match(filtersUi, /解析状态/);
assert.match(filtersUi, /排序方式/);
assert.doesNotMatch(filtersUi, /技能关键词/);
assert.doesNotMatch(filtersUi, /最低技能分/);
assert.match(tableUi, /label="学历"/);
assert.match(tableUi, /label="意向城市"/);
assert.doesNotMatch(tableUi, /label="学历 \/ 城市"/);
assert.doesNotMatch(tableUi, /label="核心技能"/);
```

- [ ] **Step 2: Run the contract and confirm failure**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs
```

Expected: fail on current duplicate/combined/skill markup.

- [ ] **Step 3: Add shared grid constants and rebuild the candidate top area**

Export non-breaking constants from `FilterBar.tsx`:

```ts
export const FILTER_GRID_CLASS = 'grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4';
export const FILTER_CONTROL_CLASS = 'h-10 w-full min-w-0 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';
```

Render the seven approved top controls in that grid. Put `WorkspaceTabs` immediately below the grid. Remove duplicate city, education, flow-state, stage, skills, and score controls from the top area.

- [ ] **Step 4: Rebuild table columns and click filters**

Keep table popovers for flow state, education, city, and active stage only. Use buttons in cells that call the same controller setters:

```tsx
<button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    changeFilter(() => setEducationFilter(candidate.education_summary || ''));
  }}
  className="text-left text-primary-700 hover:underline"
>
  {candidate.education_summary}
</button>
```

Render pipeline state from the API, show `曾淘汰` separately when `has_rejected_history` is true and current state is active, split education/city cells, remove the skills column, and keep intake date as a plain column.

- [ ] **Step 5: Run candidate UI verification**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs tests/candidate-library-view-model.test.mjs tests/candidate-data-hygiene-contract.test.mjs && npm run type-check
```

Expected: all pass.

- [ ] **Step 6: Commit candidate UI**

```bash
git add readdy-frontend/src/components/ui/FilterBar.tsx readdy-frontend/src/features/candidates/library/useCandidateLibraryController.tsx readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx readdy-frontend/src/features/candidates/components/library/CandidateLibraryTable.tsx readdy-frontend/tests/filter-layout-consistency-contract.test.mjs
git commit -m "feat: unify candidate filtering layout"
```

### Task 4: Existing filter-bearing workspace consistency

**Files:**
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`
- Modify: `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Modify: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Add failing consistency assertions**

For each existing filter bar, assert it imports and uses `FILTER_GRID_CLASS` and `FILTER_CONTROL_CLASS`, and assert legacy stretching classes such as `flex-1`/unequal `min-w-*` are absent from filter controls.

- [ ] **Step 2: Run the contract and confirm failure**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs
```

Expected: fail for each inconsistent workspace.

- [ ] **Step 3: Normalize only existing filter bars**

Use:

```tsx
<FilterBar className={`${FILTER_GRID_CLASS} rounded-xl border border-background-200 bg-white p-3`}>
  <input className={FILTER_CONTROL_CLASS} />
  <select className={FILTER_CONTROL_CLASS}>...</select>
</FilterBar>
```

Do not move unrelated page actions, cards, role navigation, table columns, or business behavior. Pages with no comparable filter bar remain unchanged. Table-local filters already aligned and non-duplicated remain in place.

- [ ] **Step 4: Run targeted and full frontend checks**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs tests/ui-consistency-contract.test.mjs tests/visual-primitives-regression.test.mjs && npm run type-check && npm run lint
```

Expected: all pass.

- [ ] **Step 5: Commit cross-page spacing**

```bash
git add readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx readdy-frontend/src/pages/offers/page.tsx readdy-frontend/src/pages/interviewer/screening/page.tsx readdy-frontend/src/pages/interviewer/interviews/page.tsx readdy-frontend/tests/filter-layout-consistency-contract.test.mjs
git commit -m "style: normalize filter bar spacing"
```

### Task 5: Documentation and full verification

**Files:**
- Modify: `docs/01_PRD.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Modify: `docs/11_Readdy新前端迁移与验收矩阵.md`

- [ ] **Step 1: Update product and API truth**

Document the top-versus-header rule, equal-size grid, split education/city, inclusive intake dates, precise pipeline-state derivation, clickable values, and phase-two skill UI. State explicitly that company talent-pool scope and permissions are unchanged.

- [ ] **Step 2: Run backend and frontend suites**

Run:

```bash
pytest -q backend/tests/test_candidate_search_pagination.py backend/tests/test_job_match_batch_pipeline.py
cd readdy-frontend && npm run test:contract && npm run type-check && npm run lint && npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Inspect scoped diff and working tree**

Run:

```bash
git diff --check
git diff --stat HEAD~4..HEAD
git status --short
```

Expected: only filter-related code/tests/docs plus the pre-existing untracked verification directory and local brainstorming artifacts.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/01_PRD.md docs/SDD-智聘招聘系统-v1.0.md docs/11_Readdy新前端迁移与验收矩阵.md
git commit -m "docs: sync candidate filter behavior"
```

- [ ] **Step 5: Final verification evidence**

Record the exact passing commands, note any unavailable browser-level check, and do not claim SIT/test deployment because this task does not authorize pushing or publishing.
