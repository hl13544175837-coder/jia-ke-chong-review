# 面试管理折中版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前真实可用的面试管理页升级为单排工具栏、隐藏式筛选、平衡双行表格和真实日历视图，同时保持全部面试数据流不变。

**Architecture:** 继续由 `RecruiterInterviewsPage` 负责真实接口、动作和弹窗状态；新增纯筛选模块以及工具栏、表格、日历三个展示组件。筛选、搜索和状态先统一生成 `visibleRows`，列表与日历只消费同一份结果，避免两个视图口径不一致。

**Tech Stack:** React 19、TypeScript 5.8、Tailwind CSS、Lucide React、Vite、Node contract tests、Flask/Pytest 回归测试。

---

## 文件结构

- Create: `readdy-frontend/src/pages/interviews/workbench.ts` — 状态判断、筛选状态、选项推导和统一过滤。
- Create: `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx` — 单排状态、搜索、隐藏式筛选、结果数、列表/日历切换。
- Create: `readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx` — 六项悬浮筛选、角标、重置、取消和应用。
- Create: `readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx` — 平衡双行表格和按状态收敛后的操作区。
- Create: `readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx` — 基于真实管理行的月历和待安排区。
- Modify: `readdy-frontend/src/pages/interviews/page.tsx` — 接入新组件，保留真实 API、详情侧栏和工作流动作。
- Create: `frontend/tests/readdy_interview_balanced_workspace.test.mjs` — 静态契约，防止重新接入 Mock、恢复多排筛选或丢失真实操作。
- Modify: `frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs` — 保持现有真实流程契约并识别拆分后的组件。

### Task 1: 统一筛选模型和真实数据口径

**Files:**
- Create: `readdy-frontend/src/pages/interviews/workbench.ts`
- Create: `frontend/tests/readdy_interview_balanced_workspace.test.mjs`

- [ ] **Step 1: 写失败契约，锁定纯筛选模块**

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modelPath = path.join(root, 'readdy-frontend/src/pages/interviews/workbench.ts');

assert.ok(existsSync(modelPath), '面试管理必须有独立筛选模型');
const model = read('readdy-frontend/src/pages/interviews/workbench.ts');
for (const symbol of ['emptyInterviewFilters', 'rowStatus', 'statusLabel', 'interviewLocalDateKey', 'deriveInterviewFilterOptions', 'filterInterviewRows', 'activeInterviewFilterCount']) {
  assert.match(model, new RegExp(`export (const|function) ${symbol}`), `缺少 ${symbol}`);
}
assert.doesNotMatch(model, /@\/mocks\//, '筛选模型不得依赖 Mock 数据');
```

- [ ] **Step 2: 运行契约并确认失败**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: FAIL，提示 `面试管理必须有独立筛选模型`。

- [ ] **Step 3: 实现筛选类型、选项和统一过滤**

```ts
import type { InterviewManagementRow } from '@/features/interviews/types';

export type InterviewStatusTab = 'all' | 'unassigned' | 'scheduled' | 'awaiting_feedback' | 'completed';
export type InterviewViewMode = 'list' | 'calendar';

export interface InterviewFilters {
  jobTitle: string;
  interviewerId: string;
  dateFrom: string;
  dateTo: string;
  roundSequence: string;
  city: string;
  department: string;
}

export const emptyInterviewFilters: InterviewFilters = {
  jobTitle: '', interviewerId: '', dateFrom: '', dateTo: '',
  roundSequence: '', city: '', department: '',
};

export function rowStatus(row: InterviewManagementRow): Exclude<InterviewStatusTab, 'all'> {
  if (row.feedback_submitted || ['completed', 'feedback_submitted'].includes(row.assignment_status)) return 'completed';
  if (row.assignment_status === 'awaiting_feedback') return 'awaiting_feedback';
  if (!row.assignment_id || row.assignment_status === 'unassigned') return 'unassigned';
  return 'scheduled';
}

export function statusLabel(status: Exclude<InterviewStatusTab, 'all'>) {
  return { unassigned: '待安排', scheduled: '已安排', awaiting_feedback: '待反馈', completed: '已完成' }[status];
}

export function interviewLocalDateKey(value: string | null) {
  if (!value) return '';
  const date = new Date(value.endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter(Boolean) as string[])].sort();

export function deriveInterviewFilterOptions(rows: InterviewManagementRow[]) {
  return {
    jobs: unique(rows.map((row) => row.job_title)),
    interviewers: [...new Map(rows.filter((row) => row.interviewer_id).map((row) => [String(row.interviewer_id), row.interviewer_name || '未命名面试官'])).entries()],
    rounds: [...new Set(rows.map((row) => row.round_sequence).filter((value): value is number => Boolean(value)))].sort((a, b) => a - b),
    cities: unique(rows.map((row) => row.job_city)),
    departments: unique(rows.map((row) => row.job_department)),
  };
}

export function activeInterviewFilterCount(filters: InterviewFilters) {
  return [filters.jobTitle, filters.interviewerId, filters.dateFrom || filters.dateTo, filters.roundSequence, filters.city, filters.department].filter(Boolean).length;
}

export function filterInterviewRows(
  rows: InterviewManagementRow[],
  activeTab: InterviewStatusTab,
  query: string,
  filters: InterviewFilters,
) {
  const keyword = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (activeTab !== 'all' && rowStatus(row) !== activeTab) return false;
    if (keyword && ![row.name_masked, row.job_title, row.job_department, row.interviewer_name]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword))) return false;
    if (filters.jobTitle && row.job_title !== filters.jobTitle) return false;
    if (filters.interviewerId && String(row.interviewer_id || '') !== filters.interviewerId) return false;
    if (filters.roundSequence && String(row.round_sequence || '') !== filters.roundSequence) return false;
    if (filters.city && row.job_city !== filters.city) return false;
    if (filters.department && row.job_department !== filters.department) return false;
    const day = interviewLocalDateKey(row.scheduled_at);
    if (filters.dateFrom && (!day || day < filters.dateFrom)) return false;
    if (filters.dateTo && (!day || day > filters.dateTo)) return false;
    return true;
  });
}
```

- [ ] **Step 4: 运行契约、类型检查并确认通过**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: `readdy_interview_balanced_workspace: OK`。

Run: `npm --prefix readdy-frontend run type-check`

Expected: exit 0。

- [ ] **Step 5: 提交筛选模型**

```bash
git add readdy-frontend/src/pages/interviews/workbench.ts frontend/tests/readdy_interview_balanced_workspace.test.mjs
git commit -m "feat: add interview workbench filters"
```

### Task 2: 单排工具栏和隐藏式筛选浮层

**Files:**
- Create: `readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx`
- Create: `readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx`
- Modify: `frontend/tests/readdy_interview_balanced_workspace.test.mjs`

- [ ] **Step 1: 扩展失败契约**

```js
const toolbar = read('readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx');
const popover = read('readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx');
for (const label of ['搜索候选人、岗位或面试官', '筛选', '列表', '日历']) assert.ok(toolbar.includes(label));
for (const label of ['岗位', '面试官', '日期范围', '面试轮次', '城市', '部门', '重置全部']) assert.ok(popover.includes(label));
assert.match(toolbar, /Escape/);
assert.match(popover, /onApply/);
assert.match(toolbar, /activeInterviewFilterCount/);
assert.match(toolbar, /data-interview-filter-root/);
```

- [ ] **Step 2: 运行并确认组件缺失导致失败**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: FAIL，提示无法读取 `InterviewWorkbenchToolbar.tsx`。

- [ ] **Step 3: 实现浮层的暂存、取消和应用接口**

```tsx
interface InterviewFilterPopoverProps {
  filters: InterviewFilters;
  options: ReturnType<typeof deriveInterviewFilterOptions>;
  resultCount: number;
  onChange: (filters: InterviewFilters) => void;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}

export default function InterviewFilterPopover(props: InterviewFilterPopoverProps) {
  const update = (field: keyof InterviewFilters, value: string) => {
    props.onChange({ ...props.filters, [field]: value });
  };

  return (
    <div role="dialog" aria-label="筛选面试任务" className="absolute right-0 top-11 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-background-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">筛选面试任务</h3><button type="button" onClick={props.onReset}>重置全部</button></div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <label className="text-xs">岗位<select value={props.filters.jobTitle} onChange={(event) => update('jobTitle', event.target.value)}><option value="">全部岗位</option>{props.options.jobs.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs">面试官<select value={props.filters.interviewerId} onChange={(event) => update('interviewerId', event.target.value)}><option value="">全部面试官</option>{props.options.interviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-xs">面试轮次<select value={props.filters.roundSequence} onChange={(event) => update('roundSequence', event.target.value)}><option value="">全部轮次</option>{props.options.rounds.map((value) => <option key={value} value={value}>第 {value} 轮</option>)}</select></label>
        <label className="text-xs">城市<select value={props.filters.city} onChange={(event) => update('city', event.target.value)}><option value="">全部城市</option>{props.options.cities.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs">部门<select value={props.filters.department} onChange={(event) => update('department', event.target.value)}><option value="">全部部门</option>{props.options.departments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <fieldset className="col-span-3 grid grid-cols-2 gap-3"><legend className="text-xs">日期范围</legend><input type="date" value={props.filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} aria-label="面试开始日期" /><input type="date" value={props.filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} aria-label="面试结束日期" /></fieldset>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={props.onCancel}>取消</button>
        <button type="button" onClick={props.onApply}>查看 {props.resultCount} 条结果</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 实现一整排工具栏**

```tsx
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface ToolbarProps {
  activeTab: InterviewStatusTab;
  counts: Record<InterviewStatusTab, number>;
  search: string;
  filterCount: number;
  resultCount: number;
  viewMode: InterviewViewMode;
  onTabChange: (tab: InterviewStatusTab) => void;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onCloseFilters: () => void;
  onViewModeChange: (mode: InterviewViewMode) => void;
  filterPopover: ReactNode;
}

const statusTabs: Array<{ key: InterviewStatusTab; label: string }> = [
  { key: 'all', label: '全部' }, { key: 'unassigned', label: '待安排' },
  { key: 'scheduled', label: '已安排' }, { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

export default function InterviewWorkbenchToolbar({ counts, activeTab, search, filterCount, resultCount, viewMode, onTabChange, onSearchChange, onToggleFilters, onCloseFilters, onViewModeChange, filterPopover }: ToolbarProps) {
  const filterRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onCloseFilters();
    const closeOnOutside = (event: MouseEvent) => {
      if (filterRootRef.current && !filterRootRef.current.contains(event.target as Node)) onCloseFilters();
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOnOutside);
    return () => { window.removeEventListener('keydown', closeOnEscape); window.removeEventListener('mousedown', closeOnOutside); };
  }, [onCloseFilters]);
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-background-200 pb-3">
      <div role="tablist" aria-label="面试任务状态" className="flex shrink-0 items-center gap-1">
        {statusTabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => onTabChange(tab.key)}>{tab.label} {counts[tab.key]}</button>)}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <label className="relative w-[260px] min-w-[180px]"><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索候选人、岗位或面试官" /></label>
        <div ref={filterRootRef} data-interview-filter-root className="relative"><button type="button" aria-haspopup="dialog" onClick={onToggleFilters}>筛选{filterCount > 0 && <span>{filterCount}</span>}</button>{filterPopover}</div>
        <span className="whitespace-nowrap text-xs text-foreground-400">{resultCount} 条</span>
        <div className="flex rounded-lg bg-background-100 p-1"><button type="button" onClick={() => onViewModeChange('list')}>列表</button><button type="button" onClick={() => onViewModeChange('calendar')}>日历</button></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 运行契约、Lint 和类型检查**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: OK。

Run: `npm --prefix readdy-frontend run lint`

Expected: exit 0。

Run: `npm --prefix readdy-frontend run type-check`

Expected: exit 0。

- [ ] **Step 6: 提交工具栏**

```bash
git add readdy-frontend/src/pages/interviews/components/InterviewFilterPopover.tsx readdy-frontend/src/pages/interviews/components/InterviewWorkbenchToolbar.tsx frontend/tests/readdy_interview_balanced_workspace.test.mjs
git commit -m "feat: add compact interview filter toolbar"
```

### Task 3: 平衡双行表格和动作收敛

**Files:**
- Create: `readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx`
- Modify: `frontend/tests/readdy_interview_balanced_workspace.test.mjs`

- [ ] **Step 1: 增加失败契约**

```js
const table = read('readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx');
for (const label of ['候选人 / 应聘岗位', '轮次', '面试安排', '面试官', '状态', '操作']) assert.ok(table.includes(label));
for (const action of ['安排面试', '调整安排', '确认已面试', '催反馈', '查看反馈']) assert.ok(table.includes(action));
assert.match(table, /更多操作/);
assert.doesNotMatch(table, /@\/mocks\//);
```

- [ ] **Step 2: 运行并确认表格组件缺失**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: FAIL，提示无法读取表格文件。

- [ ] **Step 3: 实现真实行和按状态主操作**

```tsx
interface Props {
  rows: InterviewManagementRow[];
  actionRowId: number | null;
  onOpenDetails: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
  onConfirmConducted: (row: InterviewManagementRow) => void;
  onRemind: (row: InterviewManagementRow) => void;
}

type RowActionProps = Omit<Props, 'rows' | 'actionRowId'> & { row: InterviewManagementRow };

function roundLabel(row: InterviewManagementRow) {
  return row.round_sequence ? `第 ${row.round_sequence} 轮` : '轮次待定';
}

function RowActions({ row, ...actions }: RowActionProps) {
  const status = rowStatus(row);
  if (status === 'unassigned') return <button onClick={() => actions.onSchedule(row)}>安排面试</button>;
  if (status === 'awaiting_feedback') return <button onClick={() => actions.onRemind(row)}>催反馈</button>;
  if (status === 'completed') return <button onClick={() => actions.onOpenDetails(row)}>查看反馈</button>;
  if (interviewHasStarted(row.scheduled_at)) return <><button onClick={() => actions.onSchedule(row)}>调整</button><button onClick={() => actions.onConfirmConducted(row)}>确认已面试</button></>;
  return <button onClick={() => actions.onSchedule(row)}>调整安排</button>;
}

function MoreActions({ row, onOpenDetails, onSchedule }: Pick<RowActionProps, 'row' | 'onOpenDetails' | 'onSchedule'>) {
  const [open, setOpen] = useState(false);
  return <div className="relative"><button type="button" aria-label={`${row.name_masked}更多操作`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal size={16} /></button>{open && <div role="menu" className="absolute right-0 top-9 z-20 w-32 rounded-lg border bg-white p-1 shadow-lg"><button role="menuitem" onClick={() => onOpenDetails(row)}>查看详情</button>{rowStatus(row) === 'scheduled' && <button role="menuitem" onClick={() => onSchedule(row)}>调整或取消</button>}</div>}</div>;
}

export default function InterviewManagementTable(props: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-background-200 bg-white">
      <table className="w-full min-w-[980px] table-fixed">
        <thead><tr><th>候选人 / 应聘岗位</th><th>轮次</th><th>面试安排</th><th>面试官</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{props.rows.map((row) => {
          const status = rowStatus(row);
          return <tr key={`${row.demand_id}-${row.candidate_id}-${row.assignment_id || 'new'}`}>
            <td><button type="button" onClick={() => props.onOpenDetails(row)}><span>{row.name_masked}</span><small>{row.job_title} · {row.job_department || '部门未填写'}</small></button></td>
            <td>{roundLabel(row)}</td>
            <td>{formatInterviewDateTime(row.scheduled_at)}</td>
            <td>{row.interviewer_name || '面试官待安排'}</td>
            <td><span>{statusLabel(status)}</span></td>
            <td><div className="flex justify-end gap-2"><RowActions row={row} onOpenDetails={props.onOpenDetails} onSchedule={props.onSchedule} onConfirmConducted={props.onConfirmConducted} onRemind={props.onRemind} /><MoreActions row={row} onOpenDetails={props.onOpenDetails} onSchedule={props.onSchedule} /></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 运行契约、Lint 和类型检查**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: OK。

Run: `npm --prefix readdy-frontend run lint`

Expected: exit 0。

Run: `npm --prefix readdy-frontend run type-check`

Expected: exit 0。

- [ ] **Step 5: 提交表格**

```bash
git add readdy-frontend/src/pages/interviews/components/InterviewManagementTable.tsx frontend/tests/readdy_interview_balanced_workspace.test.mjs
git commit -m "feat: balance interview management table"
```

### Task 4: 真实日历视图

**Files:**
- Create: `readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx`
- Modify: `frontend/tests/readdy_interview_balanced_workspace.test.mjs`

- [ ] **Step 1: 增加失败契约**

```js
const calendar = read('readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx');
assert.match(calendar, /InterviewManagementRow/);
assert.match(calendar, /待安排/);
assert.match(calendar, /今天/);
assert.match(calendar, /onOpenDetails/);
assert.doesNotMatch(calendar, /@\/mocks\//);
```

- [ ] **Step 2: 运行并确认真实日历缺失**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: FAIL，提示无法读取日历文件。

- [ ] **Step 3: 实现月历分组和待安排区**

```tsx
interface Props {
  rows: InterviewManagementRow[];
  onOpenDetails: (row: InterviewManagementRow) => void;
  onSchedule: (row: InterviewManagementRow) => void;
}

function formatInterviewTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export default function InterviewManagementCalendar({ rows, onOpenDetails, onSchedule }: Props) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const scheduled = rows.filter((row) => row.scheduled_at);
  const unassigned = rows.filter((row) => !row.scheduled_at && rowStatus(row) === 'unassigned');
  const grouped = useMemo(() => scheduled.reduce<Record<string, InterviewManagementRow[]>>((result, row) => {
    const key = interviewLocalDateKey(row.scheduled_at);
    (result[key] ||= []).push(row);
    return result;
  }, {}), [scheduled]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const result: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= total; day += 1) result.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (result.length % 7) result.push(null);
    return result;
  }, [month]);

  const dateKey = (date: Date) => {
    const year = date.getFullYear();
    const monthValue = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${monthValue}-${day}`;
  };

  return <div className="space-y-4">
    {unassigned.length > 0 && <section aria-label="待安排面试"><div>{unassigned.length} 位候选人等待安排</div>{unassigned.slice(0, 4).map((row) => <button key={`${row.demand_id}-${row.candidate_id}`} onClick={() => onSchedule(row)}>{row.name_masked}</button>)}</section>}
    <section className="rounded-xl border border-background-200 bg-white p-4">
      <header className="flex items-center justify-between"><h3>{month.getFullYear()}年{month.getMonth() + 1}月</h3><div><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>上个月</button><button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>今天</button><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>下个月</button></div></header>
      <div className="mt-4 grid grid-cols-7">{['日', '一', '二', '三', '四', '五', '六'].map((label) => <div key={label}>{label}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((day, index) => day ? <div key={dateKey(day)} className="min-h-28 border"><span>{day.getDate()}</span>{(grouped[dateKey(day)] || []).slice(0, 3).map((row) => <button type="button" key={`${row.demand_id}-${row.candidate_id}-${row.assignment_id}`} onClick={() => onOpenDetails(row)}>{formatInterviewTime(row.scheduled_at)} {row.name_masked}</button>)}</div> : <div key={`empty-${index}`} />)}</div>
    </section>
  </div>;
}
```

- [ ] **Step 4: 运行契约、Lint 和类型检查**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: OK。

Run: `npm --prefix readdy-frontend run lint`

Expected: exit 0。

Run: `npm --prefix readdy-frontend run type-check`

Expected: exit 0。

- [ ] **Step 5: 提交日历**

```bash
git add readdy-frontend/src/pages/interviews/components/InterviewManagementCalendar.tsx frontend/tests/readdy_interview_balanced_workspace.test.mjs
git commit -m "feat: add real interview calendar view"
```

### Task 5: 接入页面并保留完整真实工作流

**Files:**
- Modify: `readdy-frontend/src/pages/interviews/page.tsx`
- Modify: `frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs`
- Modify: `frontend/tests/readdy_interview_balanced_workspace.test.mjs`

- [ ] **Step 1: 写集成失败契约**

```js
const page = read('readdy-frontend/src/pages/interviews/page.tsx');
for (const component of ['InterviewWorkbenchToolbar', 'InterviewManagementTable', 'InterviewManagementCalendar', 'filterInterviewRows']) assert.match(page, new RegExp(component));
assert.match(page, /viewMode === ['"]list['"]/);
assert.match(page, /draftFilters/);
assert.match(page, /appliedFilters/);
assert.doesNotMatch(page, /@\/mocks\//);
```

同时调整 `readdy_mysql_pilot_interview_ui_contract.test.mjs`，让真实按钮文案可以存在于拆分后的表格组件，但仍要求页面保留 `interviewsApi.listManagementRows`、`pipelineApi.moveCandidate`、详情决策和真实弹窗。

- [ ] **Step 2: 运行两个契约并确认集成尚未完成**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: FAIL，提示页面未接入新组件。

Run: `node frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs`

Expected: OK，证明现有真实流程尚未被破坏。

- [ ] **Step 3: 把页面内筛选和列表 JSX 替换为新组件**

```tsx
const [viewMode, setViewMode] = useState<InterviewViewMode>('list');
const [filtersOpen, setFiltersOpen] = useState(false);
const [appliedFilters, setAppliedFilters] = useState(emptyInterviewFilters);
const [draftFilters, setDraftFilters] = useState(emptyInterviewFilters);
const filterOptions = useMemo(() => deriveInterviewFilterOptions(rows), [rows]);
const visibleRows = useMemo(() => filterInterviewRows(rows, activeTab, search, appliedFilters), [activeTab, appliedFilters, rows, search]);

<InterviewWorkbenchToolbar
  activeTab={activeTab}
  counts={counts}
  search={search}
  filterCount={activeInterviewFilterCount(appliedFilters)}
  resultCount={visibleRows.length}
  viewMode={viewMode}
  onTabChange={setActiveTab}
  onSearchChange={setSearch}
  onToggleFilters={() => { setDraftFilters(appliedFilters); setFiltersOpen((open) => !open); }}
  onCloseFilters={() => setFiltersOpen(false)}
  onViewModeChange={setViewMode}
  filterPopover={filtersOpen ? <InterviewFilterPopover filters={draftFilters} options={filterOptions} resultCount={filterInterviewRows(rows, activeTab, search, draftFilters).length} onChange={setDraftFilters} onReset={() => setDraftFilters(emptyInterviewFilters)} onCancel={() => setFiltersOpen(false)} onApply={() => { setAppliedFilters(draftFilters); setFiltersOpen(false); }} /> : null}
/>
{viewMode === 'list'
  ? <InterviewManagementTable rows={visibleRows} actionRowId={actionRowId} onOpenDetails={setSelectedRow} onSchedule={openSchedule} onConfirmConducted={setConfirmConductedRow} onRemind={(row) => void runAssignmentAction(row, 'remind')} />
  : <InterviewManagementCalendar rows={visibleRows} onOpenDetails={setSelectedRow} onSchedule={openSchedule} />}
```

- [ ] **Step 4: 保留现有详情和动作函数，不复制业务逻辑**

确认以下函数仍只存在于页面且由子组件回调：`loadWorkbench`、`saveSchedule`、`cancelSchedule`、`runAssignmentAction`、`openFollowUpSchedule`、`moveAfterInterview`。确认 `ScheduleInterviewModal`、确认已面试弹窗、反馈后四个下一步按钮不被删除。

筛选无结果时保留当前上下文，并给出明确重置入口：

```tsx
{!loading && !loadError && visibleRows.length === 0 && (
  <div className="rounded-xl border border-background-200 bg-white py-16 text-center">
    <CalendarDays className="mx-auto text-foreground-300" size={28} />
    <p className="mt-3 text-sm font-medium text-foreground-700">没有符合当前条件的面试任务</p>
    <button type="button" onClick={() => { setSearch(''); setAppliedFilters(emptyInterviewFilters); }} className="mt-3 text-sm text-primary-600">重置筛选</button>
  </div>
)}
```

- [ ] **Step 5: 运行契约、前端全量静态测试和构建**

Run: `node frontend/tests/readdy_interview_balanced_workspace.test.mjs`

Expected: OK。

Run: `node frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs`

Expected: `readdy_mysql_pilot_interview_ui_contract: OK`。

Run: `node --test frontend/tests/*.test.mjs`

Expected: 0 failed。

Run: `npm --prefix readdy-frontend run lint`

Expected: exit 0。

Run: `npm --prefix readdy-frontend run type-check`

Expected: exit 0。

Run: `npm --prefix readdy-frontend run build`

Expected: exit 0。

- [ ] **Step 6: 提交页面集成**

```bash
git add readdy-frontend/src/pages/interviews/page.tsx frontend/tests/readdy_mysql_pilot_interview_ui_contract.test.mjs frontend/tests/readdy_interview_balanced_workspace.test.mjs
git commit -m "feat: integrate balanced interview workspace"
```

### Task 6: 双角色浏览器验收和全量回归

**Files:**
- No code changes expected.

- [ ] **Step 1: 招聘专员桌面验收**

打开 `http://127.0.0.1:5190/interviews`，使用 `hr01`：

- 默认列表、筛选关闭、顶部仅一排。
- 搜索与六项组合筛选能找到演示候选人。
- 筛选角标、结果数、重置、取消和点击外部关闭正确。
- 列表与日历切换后数据数量和筛选口径一致。
- 逐项确认安排、调整/取消、确认已面试、催反馈、查看反馈入口仍在。
- 打开已完成详情，确认下一轮、增加面试官、进入 Offer、淘汰仍在。

- [ ] **Step 2: 面试官回归验收**

使用 `interviewer01` 打开 `http://127.0.0.1:5190/interviewer/interviews`，确认待面试、待反馈、填写评价、修改评价、JD 和简历不受招聘专员页面改造影响。

- [ ] **Step 3: 运行后端全量测试**

Run: `.venv/bin/pytest backend/tests -q`

Expected: 0 failed。

- [ ] **Step 4: 检查差异和工作树边界**

Run: `git diff --check`

Expected: 无空白错误。

Run: `git status --short`

Expected: 原先未提交的 `backend/seed_dev.py`、`backend/tests/test_seed_dev_demand_scope.py`、`backend/scripts/add_interview_demo_data.py` 保持原样，不混入本次前端提交。

- [ ] **Step 5: 如验收无需修复，记录最终证据**

最终交付报告必须列出前端测试数量、后端测试数量、Lint、类型检查、构建和两角色浏览器验收结果；不得仅用“已跑通”代替证据。
