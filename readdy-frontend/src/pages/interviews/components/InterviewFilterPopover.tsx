import type { InterviewFilterOptions, InterviewFilters } from '../workbench';

interface InterviewFilterPopoverProps {
  filters: InterviewFilters;
  options: InterviewFilterOptions;
  resultCount: number;
  onChange: (filters: InterviewFilters) => void;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}

const controlClass = 'mt-1.5 h-9 w-full rounded-lg border border-background-300 bg-white px-2.5 text-xs text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

export default function InterviewFilterPopover({
  filters,
  options,
  resultCount,
  onChange,
  onReset,
  onCancel,
  onApply,
}: InterviewFilterPopoverProps) {
  const update = (field: keyof InterviewFilters, value: string) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <div
      role="dialog"
      aria-label="筛选面试任务"
      className="absolute right-0 top-11 z-40 w-[min(440px,calc(100vw-2rem))] rounded-xl border border-background-200 bg-white p-4 shadow-[0_18px_50px_rgba(32,55,44,0.18)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground-900">筛选面试任务</h3>
          <p className="mt-0.5 text-xs text-foreground-400">组合条件，快速缩小候选人范围</p>
        </div>
        <button type="button" onClick={onReset} className="text-xs font-medium text-primary-600 hover:text-primary-700">重置全部</button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <label className="text-xs font-medium text-foreground-600">
          岗位
          <select value={filters.jobTitle} onChange={(event) => update('jobTitle', event.target.value)} className={controlClass}>
            <option value="">全部岗位</option>
            {options.jobs.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground-600">
          面试官
          <select value={filters.interviewerId} onChange={(event) => update('interviewerId', event.target.value)} className={controlClass}>
            <option value="">全部面试官</option>
            {options.interviewers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground-600">
          面试轮次
          <select value={filters.roundSequence} onChange={(event) => update('roundSequence', event.target.value)} className={controlClass}>
            <option value="">全部轮次</option>
            {options.rounds.map((value) => <option key={value} value={value}>第 {value} 轮</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground-600">
          城市
          <select value={filters.city} onChange={(event) => update('city', event.target.value)} className={controlClass}>
            <option value="">全部城市</option>
            {options.cities.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground-600">
          部门
          <select value={filters.department} onChange={(event) => update('department', event.target.value)} className={controlClass}>
            <option value="">全部部门</option>
            {options.departments.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="text-xs font-medium text-foreground-600">
          日期范围
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <input type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} aria-label="面试开始日期" className="h-9 min-w-0 rounded-lg border border-background-300 bg-white px-2 text-[11px] text-foreground-700 outline-none focus:border-primary-400" />
            <input type="date" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} aria-label="面试结束日期" className="h-9 min-w-0 rounded-lg border border-background-300 bg-white px-2 text-[11px] text-foreground-700 outline-none focus:border-primary-400" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-background-100 pt-3">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-medium text-foreground-500 hover:bg-background-100">取消</button>
        <button type="button" onClick={onApply} className="rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-600">查看 {resultCount} 条结果</button>
      </div>
    </div>
  );
}
