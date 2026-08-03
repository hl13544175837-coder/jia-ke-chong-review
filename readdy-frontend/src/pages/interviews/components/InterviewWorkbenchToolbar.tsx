import { CalendarDays, List, Search, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import {
  activeInterviewFilterCount,
  type InterviewFilters,
  type InterviewStatusTab,
  type InterviewViewMode,
} from '@/features/interviews/workbench';

interface InterviewWorkbenchToolbarProps {
  activeTab: InterviewStatusTab;
  counts: Record<InterviewStatusTab, number>;
  search: string;
  filters: InterviewFilters;
  resultCount: number;
  viewMode: InterviewViewMode;
  filtersOpen: boolean;
  filterPopover: ReactNode;
  onTabChange: (tab: InterviewStatusTab) => void;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onCloseFilters: () => void;
  onViewModeChange: (mode: InterviewViewMode) => void;
}

const statusTabs: Array<{ key: InterviewStatusTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unassigned', label: '待安排' },
  { key: 'scheduled', label: '已安排' },
  { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

export default function InterviewWorkbenchToolbar({
  activeTab,
  counts,
  search,
  filters,
  resultCount,
  viewMode,
  filtersOpen,
  filterPopover,
  onTabChange,
  onSearchChange,
  onToggleFilters,
  onCloseFilters,
  onViewModeChange,
}: InterviewWorkbenchToolbarProps) {
  const filterRootRef = useRef<HTMLDivElement>(null);
  const filterCount = activeInterviewFilterCount(filters);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseFilters();
    };
    const closeOnOutside = (event: MouseEvent) => {
      if (filterRootRef.current && !filterRootRef.current.contains(event.target as Node)) onCloseFilters();
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOnOutside);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('mousedown', closeOnOutside);
    };
  }, [filtersOpen, onCloseFilters]);

  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-3 border-b border-background-200 pb-3" data-ui="interview-single-row-toolbar">
      <WorkspaceTabs
        items={statusTabs.map((tab) => ({ ...tab, count: counts[tab.key] }))}
        value={activeTab}
        onChange={onTabChange}
        ariaLabel="面试任务状态"
        className="max-w-[54%] shrink flex-nowrap"
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <label className="relative w-[clamp(180px,20vw,280px)]">
          <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索候选人、岗位或面试官"
            className="h-9 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-xs text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
        </label>

        <div ref={filterRootRef} data-interview-filter-root className="relative">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            onClick={onToggleFilters}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${filtersOpen || filterCount > 0 ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-background-300 bg-white text-foreground-600 hover:border-primary-200'}`}
          >
            <SlidersHorizontal size={14} />筛选
            {filterCount > 0 && <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] text-white">{filterCount}</span>}
          </button>
          {filterPopover}
        </div>

        <span className="whitespace-nowrap text-xs text-foreground-400">{resultCount} 条</span>
        <div className="flex items-center rounded-lg bg-background-100 p-1" aria-label="面试管理视图">
          <button type="button" onClick={() => onViewModeChange('list')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === 'list' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500'}`}><List size={13} />列表</button>
          <button type="button" onClick={() => onViewModeChange('calendar')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === 'calendar' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500'}`}><CalendarDays size={13} />日历</button>
        </div>
      </div>
    </div>
  );
}
