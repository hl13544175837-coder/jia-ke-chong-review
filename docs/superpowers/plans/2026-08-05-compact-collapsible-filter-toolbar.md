# Compact Collapsible Filter Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stretched, inconsistently positioned filter grids with one compact collapsible toolbar above persistent green status tabs on every existing filter-bearing recruiting page.

**Architecture:** Add a presentation-only `CollapsibleFilterBar` that owns compact sizing, wrapping, disclosure state, and active-filter count while leaving each page’s filter values and business behavior unchanged. Pages place this toolbar before their existing `WorkspaceTabs`; the tabs never enter the collapsible region. Move the recruitment-demand filter UI out of the table component so its DOM order follows the approved hierarchy without coupling the shared component to demand semantics.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node test contracts, Playwright.

---

## File map

- Create `readdy-frontend/src/components/ui/CollapsibleFilterBar.tsx`: shared expand/collapse behavior and accessible toggle.
- Modify `readdy-frontend/src/components/ui/FilterBar.tsx`: replace stretched grid tokens with shared `160px × 36px` compact field/control tokens while preserving the primitive’s generic wrapping behavior.
- Modify `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`: compact ordinary filters first, persistent candidate-scope tabs second.
- Create `readdy-frontend/src/pages/jobs/components/RequisitionFilters.tsx`: move demand-specific filter, sort, active-chip, and disclosure presentation out of the table.
- Modify `readdy-frontend/src/pages/jobs/page.tsx`: render demand filters, then demand status tabs, then states/table.
- Modify `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`: retain table and row actions only; remove filter-toolbar ownership.
- Modify `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`: render compact collapsible filters before persistent status/view row.
- Modify `readdy-frontend/src/pages/offers/page.tsx`: render compact collapsible filters before Offer status tabs.
- Modify `readdy-frontend/src/pages/interviewer/screening/page.tsx`: render compact collapsible filters before business-review status tabs.
- Modify `readdy-frontend/src/pages/interviewer/interviews/page.tsx`: render compact collapsible filters before interviewer task status tabs.
- Modify `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`: replace the obsolete grid contract with compact sizing, disclosure, and source-order contracts.
- Modify `readdy-frontend/e2e/filter-layout-consistency.spec.ts`: verify desktop dimensions, hierarchy, and collapse behavior in a real page.
- Modify `docs/01_PRD.md`, `docs/SDD-智聘招聘系统-v1.0.md`, `docs/11_Readdy新前端迁移与验收矩阵.md`, `docs/12_5190真实上线改造矩阵.md`: replace the old equal-grid description with the confirmed compact hierarchy.

### Task 1: Protect the corrected shared contract

**Files:**
- Modify: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Replace the obsolete equal-grid assertions with failing compact-toolbar assertions**

Add a focused contract before production code changes:

```js
test('普通筛选使用紧凑可收缩工具栏且绿色状态栏不在收缩区域内', () => {
  const filterBar = read('src/components/ui/FilterBar.tsx');
  const collapsible = read('src/components/ui/CollapsibleFilterBar.tsx');

  assert.match(filterBar, /FILTER_FIELD_CLASS/);
  assert.match(filterBar, /sm:w-40/);
  assert.match(filterBar, /h-9/);
  assert.doesNotMatch(filterBar, /FILTER_GRID_CLASS/);
  assert.match(collapsible, /activeFilterCount/);
  assert.match(collapsible, /aria-expanded/);
  assert.match(collapsible, /收起筛选/);
  assert.match(collapsible, /展开筛选/);
  assert.doesNotMatch(collapsible, /WorkspaceTabs/);
});
```

Replace the page contract with source-order assertions:

```js
const orderedPages = [
  ['src/features/candidates/components/library/CandidateLibraryFilters.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
  ['src/pages/interviews/components/InterviewWorkbenchToolbar.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
  ['src/pages/offers/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
  ['src/pages/interviewer/screening/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
  ['src/pages/interviewer/interviews/page.tsx', 'CollapsibleFilterBar', 'WorkspaceTabs'],
];

for (const [path, filters, tabs] of orderedPages) {
  const source = read(path);
  assert.ok(source.indexOf(`<${filters}`) < source.indexOf(`<${tabs}`), `${path} 普通筛选必须位于状态分类上方`);
  assert.match(source, /FILTER_FIELD_CLASS/);
}

const jobsPage = read('src/pages/jobs/page.tsx');
assert.ok(jobsPage.indexOf('<RequisitionFilters') < jobsPage.indexOf('<RequisitionTabs'));
assert.ok(jobsPage.indexOf('<RequisitionTabs') < jobsPage.indexOf('<RequisitionTable'));
```

- [ ] **Step 2: Run the focused contract and verify the expected RED state**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs
```

Expected: FAIL because `CollapsibleFilterBar.tsx` and `FILTER_FIELD_CLASS` do not exist, the old `FILTER_GRID_CLASS` remains, and several pages render tabs before filters.

- [ ] **Step 3: Commit the failing contract**

```bash
git add readdy-frontend/tests/filter-layout-consistency-contract.test.mjs
git commit -m "test: define compact filter toolbar contract"
```

### Task 2: Build the shared compact collapsible primitive

**Files:**
- Modify: `readdy-frontend/src/components/ui/FilterBar.tsx`
- Create: `readdy-frontend/src/components/ui/CollapsibleFilterBar.tsx`
- Test: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Replace stretched grid tokens with compact reusable tokens**

In `FilterBar.tsx`, retain `FilterBar` itself and export these exact presentation tokens:

```tsx
export const FILTER_FIELD_CLASS = 'block w-full sm:w-40 sm:flex-none';
export const FILTER_CONTROL_CLASS = 'h-9 w-full min-w-0 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';
export const FILTER_TOGGLE_CLASS = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-600 transition hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 sm:w-40 sm:flex-none';
```

Delete `FILTER_GRID_CLASS`. Keep `FilterBar`’s existing `flex min-w-0 flex-wrap items-center gap-2` container so all ordinary fields use `8px` horizontal and vertical gaps.

- [ ] **Step 2: Add the collapsible toolbar component**

Create `CollapsibleFilterBar.tsx` with complete disclosure behavior:

```tsx
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import FilterBar, { FILTER_TOGGLE_CLASS } from './FilterBar';

interface CollapsibleFilterBarProps {
  children: ReactNode;
  ariaLabel: string;
  activeFilterCount?: number;
  defaultExpanded?: boolean;
  className?: string;
}

export default function CollapsibleFilterBar({
  children,
  ariaLabel,
  activeFilterCount = 0,
  defaultExpanded = true,
  className = '',
}: CollapsibleFilterBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const countLabel = activeFilterCount > 0 ? `（${activeFilterCount}项）` : '';

  return (
    <section data-ui="collapsible-filter-bar" aria-label={ariaLabel} className={className}>
      {expanded ? (
        <FilterBar ariaLabel={`${ariaLabel}条件`}>
          {children}
          <button type="button" aria-expanded="true" onClick={() => setExpanded(false)} className={FILTER_TOGGLE_CLASS}>
            <ChevronUp size={14} aria-hidden="true" />收起筛选
          </button>
        </FilterBar>
      ) : (
        <button type="button" aria-expanded="false" onClick={() => setExpanded(true)} className={FILTER_TOGGLE_CLASS}>
          <ChevronDown size={14} aria-hidden="true" />展开筛选{countLabel}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Run the focused contract**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs
```

Expected: the shared-component assertions pass; page-order assertions still fail until the page tasks are complete.

- [ ] **Step 4: Commit the primitive**

```bash
git add readdy-frontend/src/components/ui/FilterBar.tsx readdy-frontend/src/components/ui/CollapsibleFilterBar.tsx
git commit -m "feat: add compact collapsible filter toolbar"
```

### Task 3: Correct candidate-library hierarchy and dimensions

**Files:**
- Modify: `readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx`
- Test: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Calculate ordinary active-filter count without including the green scope tab**

Use the current values already provided by the controller:

```tsx
const activeFilterCount = [
  searchQuery.trim(),
  demandFilter,
  createdFrom,
  createdTo,
  sourceFilter.trim(),
  parseStatusFilter,
  sortBy !== 'created_at' || sortOrder !== 'desc' ? 'sort' : '',
].filter(Boolean).length;
```

Do not count `libraryScope`; it belongs to the always-visible green status row.

- [ ] **Step 2: Replace the large labeled grid with compact fields**

Render `CollapsibleFilterBar` first. Give every visible label/select/date wrapper `FILTER_FIELD_CLASS`, keep inputs on `FILTER_CONTROL_CLASS`, replace long placeholders with concise text such as `搜索候选人`, and place the existing datalist outside the toolbar. Remove the current `rounded-xl border border-background-200 bg-background-50 p-3` grid container.

```tsx
<CollapsibleFilterBar ariaLabel="候选人普通筛选" activeFilterCount={activeFilterCount}>
  <label className={`${FILTER_FIELD_CLASS} relative`}>
    <span className="sr-only">精确搜索候选人</span>
    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
    <input type="search" value={searchQuery} onChange={handleSearchChange} placeholder="搜索候选人" className={`${FILTER_CONTROL_CLASS} pl-9`} />
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">招聘需求</span>
    <select value={demandFilter} onChange={handleDemandFilterChange} className={FILTER_CONTROL_CLASS}>
      <option value="">全部招聘需求</option>
      {demands.map((demand) => <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title}</option>)}
    </select>
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">入库开始日期</span>
    <input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => changeFilter(() => setCreatedFrom(event.target.value))} className={FILTER_CONTROL_CLASS} />
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">入库结束日期</span>
    <input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => changeFilter(() => setCreatedTo(event.target.value))} className={FILTER_CONTROL_CLASS} />
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">来源渠道</span>
    <input list="candidate-source-options" value={sourceFilter} onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))} placeholder="全部来源" className={FILTER_CONTROL_CLASS} />
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">解析状态</span>
    <select value={parseStatusFilter} onChange={(event) => { const next = event.target.value; if (next === '' || isParseStatus(next)) changeFilter(() => setParseStatusFilter(next)); }} className={FILTER_CONTROL_CLASS}>
      <option value="">全部解析状态</option>
      {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
    </select>
  </label>
  <label className={FILTER_FIELD_CLASS}>
    <span className="sr-only">排序方式</span>
    <select value={`${sortBy}:${sortOrder}`} onChange={(event) => {
      const [nextSortBy, nextSortOrder] = event.target.value.split(':');
      if ((nextSortBy === 'created_at' || nextSortBy === 'name_masked') && (nextSortOrder === 'asc' || nextSortOrder === 'desc')) {
        changeFilter(() => {
          setSortBy(nextSortBy);
          setSortOrder(nextSortOrder);
        });
      }
    }} className={FILTER_CONTROL_CLASS}>
      <option value="created_at:desc">最近入库</option>
      <option value="created_at:asc">最早入库</option>
      <option value="name_masked:asc">候选人名称升序</option>
      <option value="name_masked:desc">候选人名称降序</option>
    </select>
  </label>
</CollapsibleFilterBar>
<WorkspaceTabs items={candidateScopeTabs} value={libraryScope} onChange={selectLibraryScope} ariaLabel="候选人库范围" />
```

- [ ] **Step 3: Run the contract and type check**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs && npm run type-check
```

Expected: candidate source-order and compact-token assertions pass; other page-order assertions remain RED.

- [ ] **Step 4: Commit the candidate page**

```bash
git add readdy-frontend/src/features/candidates/components/library/CandidateLibraryFilters.tsx
git commit -m "fix: place compact candidate filters above scopes"
```

### Task 4: Move recruitment-demand filters above persistent status tabs

**Files:**
- Create: `readdy-frontend/src/pages/jobs/components/RequisitionFilters.tsx`
- Modify: `readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx`
- Modify: `readdy-frontend/src/pages/jobs/page.tsx`
- Test: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Extract demand filter presentation from the table**

Move `filterOptions`, `stageOptions`, `sortModes`, `toolbarPanel`, outside-click handling, active filter chips, sort panel, and all ordinary filter controls into `RequisitionFilters.tsx`. Its public interface is:

```tsx
interface RequisitionFiltersProps {
  optionSource: RequisitionRow[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: DemandWorkspaceFilters;
  onFilterChange: (key: keyof DemandWorkspaceFilters, value: string) => void;
  onClearFilters: () => void;
  sortField: DemandSortField;
  sortDirection: DemandSortDirection;
  onSortChange: (field: DemandSortField) => void;
}
```

The component renders `CollapsibleFilterBar` with search, department, city, owner, stage, sort, and reset. Each field uses `FILTER_FIELD_CLASS`; `activeFilterCount` is `activeFilterEntries.length + (searchQuery.trim() ? 1 : 0) + (sortField !== 'newest' || sortDirection !== 'desc' ? 1 : 0)`.

- [ ] **Step 2: Reduce `RequisitionTable` to table responsibility**

Remove its filter/search/sort props and toolbar state. The retained interface starts with:

```tsx
interface RequisitionTableProps {
  data: RequisitionRow[];
  onRowClick: (req: RequisitionRow) => void;
  onStatusChange: (id: string, newStatusCode: string, reason: string) => Promise<void>;
  statusTransitions: Record<string, { advance: { to: string; label: string } | null; rollback: { to: string; label: string } | null }>;
  statusExtraActions: Record<string, { to: string; label: string; icon: string }[]>;
  onSelectCandidates: (req: RequisitionRow) => void;
  onViewCandidates: (req: RequisitionRow) => void;
  onStageCountClick: (req: RequisitionRow, stage: DemandStageDrilldown) => void;
}
```

Keep the record count inside the table card and remove every ordinary filter control from that card.

- [ ] **Step 3: Render the approved order in `jobs/page.tsx`**

Use this exact order before loading/error/table states:

```tsx
<RequisitionFilters
  optionSource={requisitions}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  filters={filters}
  onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
  onClearFilters={() => setFilters({ department: '', owner: '', city: '', stage: '', headcount: '', deadline: '' })}
  sortField={sortField}
  sortDirection={sortDirection}
  onSortChange={(field) => {
    if (sortField === field) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortDirection(field === 'deadline' ? 'asc' : 'desc');
    }
  }}
/>
<RequisitionTabs activeTab={activeTab} onTabChange={setActiveTab} />
```

Then render `PageStateCard` or `RequisitionTable`. Do not move `RequisitionTabs` into the collapsible component.

- [ ] **Step 4: Run contract and type check**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs && npm run type-check
```

Expected: recruitment-demand order passes; remaining page-order assertions identify only pages not yet migrated.

- [ ] **Step 5: Commit the demand page**

```bash
git add readdy-frontend/src/pages/jobs/components/RequisitionFilters.tsx readdy-frontend/src/pages/jobs/components/RequisitionTable.tsx readdy-frontend/src/pages/jobs/page.tsx
git commit -m "fix: move demand filters above status tabs"
```

### Task 5: Apply the same hierarchy to remaining existing filter pages

**Files:**
- Modify: `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`
- Modify: `readdy-frontend/src/pages/offers/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/screening/page.tsx`
- Modify: `readdy-frontend/src/pages/interviewer/interviews/page.tsx`
- Test: `readdy-frontend/tests/filter-layout-consistency-contract.test.mjs`

- [ ] **Step 1: Correct the main interview workbench**

In `InterviewWorkbenchToolbar.tsx`, render `CollapsibleFilterBar` before the row containing `WorkspaceTabs`, result count, and list/calendar switch. Pass `activeFilterCount={activeInterviewFilterCount(filters) + (search.trim() ? 1 : 0)}`. Give every search/select/date/reset wrapper `FILTER_FIELD_CLASS` and every control `FILTER_CONTROL_CLASS`.

- [ ] **Step 2: Correct Offer management**

In `offers/page.tsx`, render the ordinary filter form first and the `WorkspaceTabs` row second inside the workbench section. Put `CollapsibleFilterBar` inside the form; count `searchInput.trim()`, demand, owner, non-default range, and updated date. Keep submit behavior and OA business behavior unchanged.

- [ ] **Step 3: Correct business screening and interviewer task pages**

In both pages, move the existing `WorkspaceTabs` after `CollapsibleFilterBar`. For business screening use `[query.trim(), jobFilter, departmentFilter, cityFilter].filter(Boolean).length`; for interviewer tasks use `[searchQuery.trim(), jobFilter, departmentFilter, dateFilter].filter(Boolean).length`. The count excludes `activeTab`; each visible field/reset uses the shared compact classes. Keep requested-demand notices, task queries, URL state, and status-tab behavior unchanged.

- [ ] **Step 4: Run the complete contract and type check**

Run:

```bash
cd readdy-frontend && node --test tests/filter-layout-consistency-contract.test.mjs && npm run type-check
```

Expected: all filter-layout contracts pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit remaining pages**

```bash
git add readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx readdy-frontend/src/pages/offers/page.tsx readdy-frontend/src/pages/interviewer/screening/page.tsx readdy-frontend/src/pages/interviewer/interviews/page.tsx
git commit -m "fix: unify recruiting filter hierarchy"
```

### Task 6: Prove dimensions, order, and collapse behavior in the browser

**Files:**
- Modify: `readdy-frontend/e2e/filter-layout-consistency.spec.ts`

- [ ] **Step 1: Rewrite the browser regression before final implementation verification**

The candidate test must assert the approved behavior rather than equal stretched columns:

```ts
test('普通筛选紧凑可收起且状态分类始终位于下方', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'recruiter');
  await page.goto('/candidates');

  const filters = page.getByLabel('候选人普通筛选');
  const search = page.getByRole('searchbox', { name: '精确搜索候选人' });
  const scope = page.getByRole('tab', { name: '全部候选人' });

  const searchBox = await search.boundingBox();
  const scopeBox = await scope.boundingBox();
  expect(searchBox?.width).toBeCloseTo(160, 0);
  expect(searchBox?.height).toBeCloseTo(36, 0);
  expect((searchBox?.y ?? 0) + (searchBox?.height ?? 0)).toBeLessThan(scopeBox?.y ?? 0);

  await filters.getByRole('button', { name: '收起筛选' }).click();
  await expect(search).toBeHidden();
  await expect(scope).toBeVisible();
  await filters.getByRole('button', { name: /展开筛选/ }).click();
  await expect(search).toBeVisible();
});
```

Also open `/jobs` and assert `招聘需求查询条件` is above the `招聘需求状态` tablist and the table header.

- [ ] **Step 2: Run the E2E test against the isolated demo**

Start the existing isolated demo using the documented project script, then run:

```bash
cd readdy-frontend
E2E_BASE_URL=http://127.0.0.1:5190 E2E_PASSWORD=Zhipin2026 npx playwright test e2e/filter-layout-consistency.spec.ts --project=chromium
```

Expected: candidate and demand layout checks pass. Stop only the services started for this verification.

- [ ] **Step 3: Commit the browser regression**

```bash
git add readdy-frontend/e2e/filter-layout-consistency.spec.ts
git commit -m "test: cover collapsible filter hierarchy"
```

### Task 7: Synchronize product truth and run full verification

**Files:**
- Modify: `docs/01_PRD.md`
- Modify: `docs/SDD-智聘招聘系统-v1.0.md`
- Modify: `docs/11_Readdy新前端迁移与验收矩阵.md`
- Modify: `docs/12_5190真实上线改造矩阵.md`

- [ ] **Step 1: Replace obsolete equal-grid wording**

Document these exact truths in each directly affected source:

```text
已有筛选页面统一为“普通筛选在上、绿色状态分类在下、列表/表格最后”。桌面端普通筛选使用 160px × 36px 紧凑控件和 8px 间距，可整组展开/收起；状态分类始终显示且不参与收缩。没有筛选或没有状态分类的页面不补造入口。
```

Do not change API, permissions, BI, Demand ownership, or deployment documentation.

- [ ] **Step 2: Run fresh full frontend verification**

Run:

```bash
cd readdy-frontend
npm run test:contract
npm run type-check
npm run lint
npm run build
```

Expected: every command exits 0. Record exact test counts and any pre-existing warnings separately.

- [ ] **Step 3: Inspect final scope**

Run:

```bash
git diff --check
git status --short
git diff --stat 625bad1..HEAD
```

Expected: no whitespace errors; only the shared filter components, listed filter-bearing pages, regression tests, and directly related docs differ. `docs/verification/2026-08-04-requirements-summary/` remains untouched and untracked.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/01_PRD.md docs/SDD-智聘招聘系统-v1.0.md docs/11_Readdy新前端迁移与验收矩阵.md docs/12_5190真实上线改造矩阵.md
git commit -m "docs: sync compact filter hierarchy"
```

- [ ] **Step 5: Re-run the final verification after the last commit**

Run the four frontend commands again after the documentation commit and report the current local `test` HEAD. Do not push CFPD `test` or deploy SIT without an explicit user request.
