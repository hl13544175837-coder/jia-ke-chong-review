import { CalendarDays, List, Search } from 'lucide-react';
import FilterBar from '@/components/ui/FilterBar';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import {
  activeInterviewFilterCount,
  type InterviewFilterOptions,
  type InterviewFilters,
  type InterviewStatusTab,
  type InterviewViewMode,
} from '@/features/interviews/workbench';

interface InterviewWorkbenchToolbarProps {
  activeTab: InterviewStatusTab;
  counts: Record<InterviewStatusTab, number>;
  search: string;
  filters: InterviewFilters;
  filterOptions: InterviewFilterOptions;
  resultCount: number;
  viewMode: InterviewViewMode;
  onTabChange: (tab: InterviewStatusTab) => void;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: InterviewFilters) => void;
  onResetFilters: () => void;
  onViewModeChange: (mode: InterviewViewMode) => void;
}

const statusTabs: Array<{ key: InterviewStatusTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unassigned', label: '待安排' },
  { key: 'scheduled', label: '已安排' },
  { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

const controlClass = 'h-9 min-w-[132px] rounded-lg border border-background-300 bg-white px-3 text-xs text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

export default function InterviewWorkbenchToolbar({
  activeTab,
  counts,
  search,
  filters,
  filterOptions,
  resultCount,
  viewMode,
  onTabChange,
  onSearchChange,
  onFiltersChange,
  onResetFilters,
  onViewModeChange,
}: InterviewWorkbenchToolbarProps) {
  const update = (field: keyof InterviewFilters, value: string) => onFiltersChange({ ...filters, [field]: value });
  const hasFilters = activeInterviewFilterCount(filters) > 0 || Boolean(search);

  return (
    <section className="space-y-3 border-b border-background-200 pb-3" data-ui="interview-single-row-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <WorkspaceTabs
          items={statusTabs.map((tab) => ({ ...tab, count: counts[tab.key] }))}
          value={activeTab}
          onChange={onTabChange}
          ariaLabel="面试任务状态"
          className="min-w-0 flex-1"
        />
        <span className="whitespace-nowrap text-xs text-foreground-400">{resultCount} 条</span>
        <div className="flex items-center rounded-lg bg-background-100 p-1" aria-label="面试管理视图">
          <button type="button" onClick={() => onViewModeChange('list')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === 'list' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500'}`}><List size={13} />列表</button>
          <button type="button" onClick={() => onViewModeChange('calendar')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === 'calendar' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500'}`}><CalendarDays size={13} />日历</button>
        </div>
      </div>

      <FilterBar ariaLabel="面试查询条件">
        <label className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" />
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索候选人、岗位或面试官" className="h-9 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-xs text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100" />
        </label>
        <select aria-label="按岗位筛选" value={filters.jobTitle} onChange={(event) => update('jobTitle', event.target.value)} className={controlClass}>
          <option value="">全部岗位</option>{filterOptions.jobs.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="按部门筛选" value={filters.department} onChange={(event) => update('department', event.target.value)} className={controlClass}>
          <option value="">全部部门</option>{filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="按面试官筛选" value={filters.interviewerId} onChange={(event) => update('interviewerId', event.target.value)} className={controlClass}>
          <option value="">全部面试官</option>{filterOptions.interviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input type="date" aria-label="面试开始日期" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} className={controlClass} />
        <input type="date" aria-label="面试结束日期" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} className={controlClass} />
        <button type="button" disabled={!hasFilters} onClick={onResetFilters} className="h-9 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40">重置</button>
      </FilterBar>
    </section>
  );
}
