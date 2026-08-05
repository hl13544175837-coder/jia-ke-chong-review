import { useMemo } from 'react';
import CollapsibleFilterBar from '@/components/ui/CollapsibleFilterBar';
import { FILTER_CONTROL_CLASS, FILTER_FIELD_CLASS } from '@/components/ui/FilterBar';
import type { RequisitionRow } from '@/features/demands/types';
import {
  buildDemandFilterOptions,
  type DemandSortDirection,
  type DemandSortField,
  type DemandWorkspaceFilters,
} from '../workbench';

interface RequisitionFiltersProps {
  optionSource: RequisitionRow[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filters: DemandWorkspaceFilters;
  onFilterChange: (key: keyof DemandWorkspaceFilters, value: string) => void;
  onReset: () => void;
  sortField: DemandSortField;
  sortDirection: DemandSortDirection;
  onSortFieldChange: (field: DemandSortField) => void;
  onSortDirectionToggle: () => void;
}

const stageOptions = [
  { value: '', label: '全部阶段' },
  { value: 'hasAny', label: '有候选人' },
  { value: 'none', label: '无候选人' },
  { value: 'feedback', label: '业务筛选中' },
  { value: 'interview', label: '面试中' },
  { value: 'offer', label: 'Offer中' },
];

export default function RequisitionFilters({
  optionSource,
  searchQuery,
  onSearchChange,
  filters,
  onFilterChange,
  onReset,
  sortField,
  sortDirection,
  onSortFieldChange,
  onSortDirectionToggle,
}: RequisitionFiltersProps) {
  const filterOptions = useMemo(() => buildDemandFilterOptions(optionSource), [optionSource]);
  const activeFilterEntries = ([
    ['department', '部门', filters.department],
    ['city', '城市', filters.city],
    ['owner', '负责人', filters.owner],
    ['stage', '阶段', filters.stage ? stageOptions.find((option) => option.value === filters.stage)?.label || filters.stage : ''],
    ['headcount', 'HC', filters.headcount === 'available' ? '仍有名额' : filters.headcount === 'reached' ? '已达成' : ''],
    ['deadline', '截止日期', filters.deadline === 'overdue' ? '已逾期' : filters.deadline === 'dueSoon' ? '7天内到期' : filters.deadline === 'unset' ? '未设置' : ''],
  ] as Array<[keyof DemandWorkspaceFilters, string, string]>).filter(([, , value]) => Boolean(value));
  const activeFilterCount = activeFilterEntries.length
    + (searchQuery.trim() ? 1 : 0)
    + (sortField !== 'newest' || sortDirection !== 'desc' ? 1 : 0);

  return (
    <CollapsibleFilterBar ariaLabel="招聘需求查询条件" activeFilterCount={activeFilterCount}>
      <label className={`${FILTER_FIELD_CLASS} relative`}>
        <span className="sr-only">搜索招聘需求</span>
        <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400" aria-hidden="true" />
        <input type="search" placeholder="搜索招聘需求" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} className={`${FILTER_CONTROL_CLASS} pl-9`} />
      </label>
      <select aria-label="按部门筛选" value={filters.department} onChange={(event) => onFilterChange('department', event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}>
        <option value="">全部部门</option>
        {filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select aria-label="按城市筛选" value={filters.city} onChange={(event) => onFilterChange('city', event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}>
        <option value="">全部城市</option>
        {filterOptions.cities.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select aria-label="按负责人筛选" value={filters.owner} onChange={(event) => onFilterChange('owner', event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}>
        <option value="">全部负责人</option>
        {filterOptions.owners.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select aria-label="按候选人阶段筛选" value={filters.stage} onChange={(event) => onFilterChange('stage', event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}>
        {stageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select aria-label="排序方式" value={sortField} onChange={(event) => onSortFieldChange(event.target.value as DemandSortField)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}>
        <option value="newest">最新发布</option>
        <option value="priority">优先级</option>
        <option value="deadline">截止日期</option>
      </select>
      <button type="button" onClick={onSortDirectionToggle} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS} inline-flex items-center justify-center gap-1.5 font-medium`}>
        <i className={sortDirection === 'desc' ? 'ri-sort-desc' : 'ri-sort-asc'} aria-hidden="true" />
        {sortDirection === 'desc' ? '降序' : '升序'}
      </button>
      <button type="button" onClick={onReset} disabled={activeFilterCount === 0} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS} font-medium hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40`}>
        <i className="ri-refresh-line mr-1" aria-hidden="true" />重置筛选
      </button>
      {activeFilterEntries.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-2" aria-label="当前筛选条件">
          <span className="text-xs text-foreground-400">当前筛选</span>
          {activeFilterEntries.map(([key, label, value]) => (
            <button
              type="button"
              key={key}
              aria-label={`移除${label}筛选`}
              onClick={() => onFilterChange(key, '')}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
            >
              {label}：{value}<i className="ri-close-line" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </CollapsibleFilterBar>
  );
}
