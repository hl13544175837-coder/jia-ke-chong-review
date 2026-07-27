import { useState, useRef, useEffect, useMemo } from 'react';
import type { RequisitionRow } from '@/features/demands/types';
import {
  buildDemandFilterOptions,
  demandStatusLabel,
  type DemandSortDirection,
  type DemandSortField,
  type DemandWorkspaceFilters,
} from '../workbench';

const statusBadgeStyles: Record<string, string> = {
  active: 'bg-primary-100 text-primary-700 border border-primary-200',
  pending: 'bg-accent-100 text-accent-700 border border-accent-200',
  paused: 'bg-secondary-100 text-secondary-700 border border-secondary-200',
  filled: 'bg-primary-50 text-primary-600 border border-primary-100',
  cancelled: 'bg-background-200 text-foreground-500 border border-background-300',
  closed: 'bg-background-200 text-foreground-500 border border-background-300',
};

interface RequisitionTableProps {
  data: RequisitionRow[];
  optionSource: RequisitionRow[];
  onRowClick: (req: RequisitionTableProps['data'][0]) => void;
  onStatusChange: (id: string, newStatusCode: string, reason: string) => Promise<void>;
  statusTransitions: Record<string, { advance: { to: string; label: string } | null; rollback: { to: string; label: string } | null }>;
  statusExtraActions: Record<string, { to: string; label: string; icon: string }[]>;
  onSelectCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onViewCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onStageCountClick: (req: RequisitionTableProps['data'][0], stage: 'feedback' | 'interview' | 'offer') => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filters: DemandWorkspaceFilters;
  onFilterChange: (key: keyof DemandWorkspaceFilters, value: string) => void;
  onClearFilters: () => void;
  sortField: DemandSortField;
  sortDirection: DemandSortDirection;
  onSortChange: (field: DemandSortField) => void;
}

const statusLabelMap: Record<string, string> = {
  active: '招聘中',
  pending: '需求待确认',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

const sortModes: Array<{ value: DemandSortField; label: string }> = [
  { value: 'newest', label: '最新发布' },
  { value: 'priority', label: '优先级' },
  { value: 'deadline', label: '截止日期' },
];

// priority display config
const priorityConfig: Record<string, { label: string; className: string }> = {
  '紧急': { label: '紧急', className: 'bg-accent-100 text-accent-700' },
  '高': { label: '高', className: 'bg-primary-100 text-primary-700' },
  '普通': { label: '普通', className: 'bg-secondary-100 text-secondary-700' },
};

export default function RequisitionTable({
  data,
  optionSource,
  onRowClick,
  onStatusChange,
  statusTransitions,
  statusExtraActions,
  onSelectCandidates,
  onViewCandidates,
  onStageCountClick,
  searchQuery,
  onSearchChange,
  filters,
  onFilterChange,
  onClearFilters,
  sortField,
  sortDirection,
  onSortChange,
}: RequisitionTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; to: string; label: string } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toolbarPanel, setToolbarPanel] = useState<'filters' | 'sort' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const filterOptions = useMemo(() => buildDemandFilterOptions(optionSource), [optionSource]);

  const stageOptions = useMemo(() => [
    { value: '', label: '全部' },
    { value: 'hasAny', label: '有候选人' },
    { value: 'none', label: '无候选人' },
    { value: 'feedback', label: '业务待反馈' },
    { value: 'interview', label: '面试中' },
    { value: 'offer', label: 'Offer中' },
  ], []);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId]);

  useEffect(() => {
    if (!toolbarPanel) return;
    const handleClick = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) setToolbarPanel(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [toolbarPanel]);

  const renderSortArrow = (active: boolean) => {
    if (!active) return null;
    if (sortDirection === 'asc') {
      return <i className="ri-arrow-up-s-line ml-1 text-xs text-primary-500"></i>;
    }
    return <i className="ri-arrow-down-s-line ml-1 text-xs text-primary-500"></i>;
  };

  const activeFilterEntries = ([
    ['department', '部门', filters.department],
    ['city', '城市', filters.city],
    ['owner', '负责人', filters.owner],
    ['stage', '阶段', filters.stage ? stageOptions.find((option) => option.value === filters.stage)?.label || filters.stage : ''],
  ] as Array<[keyof DemandWorkspaceFilters, string, string]>).filter(([, , value]) => Boolean(value));

  const removeFilter = (key: keyof DemandWorkspaceFilters) => onFilterChange(key, '');
  const activeSortLabel = sortModes.find((mode) => mode.value === sortField)?.label || '最新发布';
  const sortDirectionLabel = sortDirection === 'desc' ? '降序' : '升序';

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-background-200 bg-white">
        <div ref={toolbarRef} className="flex flex-wrap items-center gap-3 border-b border-background-100 px-5 py-3">
          <div className="relative min-w-[260px] flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-foreground-400 text-sm"></i>
            </div>
            <input
              type="text"
              placeholder="搜索需求编号、职位、负责人、部门或城市"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-xs text-foreground-400">{data.length} 条</span>
            <button
              type="button"
              aria-expanded={toolbarPanel === 'filters'}
              onClick={() => setToolbarPanel((current) => current === 'filters' ? null : 'filters')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                activeFilterEntries.length > 0
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-background-200 bg-white text-foreground-600 hover:bg-background-50'
              }`}
            >
              <i className="ri-filter-3-line"></i>
              筛选
              {activeFilterEntries.length > 0 && <span className="rounded-full bg-primary-500 px-1.5 text-[10px] text-white">{activeFilterEntries.length}</span>}
            </button>
            <button
              type="button"
              aria-expanded={toolbarPanel === 'sort'}
              onClick={() => setToolbarPanel((current) => current === 'sort' ? null : 'sort')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-background-200 bg-white px-3 text-sm font-medium text-foreground-600 transition-colors hover:bg-background-50"
            >
              <i className="ri-sort-desc"></i>
              排序：{activeSortLabel}
              <span className="text-xs text-primary-600">{sortDirectionLabel}</span>
            </button>
          </div>

          {toolbarPanel === 'filters' && (
            <div className="grid w-full grid-cols-1 gap-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="招聘需求筛选面板">
              <select aria-label="按部门筛选" value={filters.department} onChange={(event) => onFilterChange('department', event.target.value)} className="h-9 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-700 outline-none focus:border-primary-300">
                <option value="">全部部门</option>
                {filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select aria-label="按城市筛选" value={filters.city} onChange={(event) => onFilterChange('city', event.target.value)} className="h-9 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-700 outline-none focus:border-primary-300">
                <option value="">全部城市</option>
                {filterOptions.cities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select aria-label="按负责人筛选" value={filters.owner} onChange={(event) => onFilterChange('owner', event.target.value)} className="h-9 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-700 outline-none focus:border-primary-300">
                <option value="">全部负责人</option>
                {filterOptions.owners.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select aria-label="按候选人阶段筛选" value={filters.stage} onChange={(event) => onFilterChange('stage', event.target.value)} className="h-9 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-700 outline-none focus:border-primary-300">
                {stageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button type="button" onClick={onClearFilters} disabled={activeFilterEntries.length === 0} className="h-9 rounded-lg border border-background-200 bg-white px-3 text-sm font-medium text-foreground-600 transition-colors hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40">
                <i className="ri-refresh-line mr-1"></i>清空筛选
              </button>
            </div>
          )}

          {toolbarPanel === 'sort' && (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-background-200 bg-background-50 p-3" aria-label="招聘需求排序面板">
              <span className="mr-1 text-xs font-medium text-foreground-500">选择排序；再次点击当前项可切换方向</span>
              {sortModes.map((mode) => (
                <button
                  type="button"
                  key={mode.value}
                  aria-pressed={sortField === mode.value}
                  onClick={() => onSortChange(mode.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${sortField === mode.value ? 'bg-primary-500 text-white' : 'bg-white text-foreground-600 hover:bg-background-100'}`}
                >
                  {mode.label}{sortField === mode.value && renderSortArrow(true)}
                </button>
              ))}
            </div>
          )}

          {activeFilterEntries.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-background-100 pt-3" aria-label="当前筛选条件">
              <span className="text-xs text-foreground-400">当前筛选</span>
              {activeFilterEntries.map(([key, label, value]) => (
                <button
                  type="button"
                  key={key}
                  aria-label={`移除${label}筛选`}
                  onClick={() => removeFilter(key)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {label}：{value}<i className="ri-close-line"></i>
                </button>
              ))}
              <button type="button" onClick={onClearFilters} className="ml-1 text-xs font-medium text-foreground-500 underline-offset-2 hover:text-primary-700 hover:underline">清空筛选</button>
            </div>
          )}
        </div>

        {/* Table */}
        {data.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-file-list-line text-2xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500">暂无符合条件的招聘需求</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-200">
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">需求 / 职位</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">部门 / 城市</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">负责人</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">HC / 截止日期</th>
                  <th className="whitespace-nowrap px-5 py-3 text-center text-xs font-medium text-foreground-500">阶段进度</th>
                  <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium text-foreground-500">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-medium text-foreground-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {data.map((req) => {
                  const transitions = statusTransitions[req.statusCode];
                  const extras = statusExtraActions[req.statusCode] || [];
                  const canSelectCandidates = req.statusCode === 'pending' || req.statusCode === 'active';
                  const isClosedOrCompleted = ['filled', 'cancelled', 'closed'].includes(req.statusCode);
                  const hasActions = transitions && (transitions.advance || transitions.rollback || extras.length > 0);
                  const prio = priorityConfig[req.priority] || priorityConfig['普通'];

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-background-50/50 transition-colors"
                    >
                      <td className="px-5 py-4 cursor-pointer" onClick={() => onRowClick(req)}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground-900 hover:text-primary-600 transition-colors">{req.name}</p>
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${prio.className} whitespace-nowrap`}>
                            {prio.label}
                          </span>
                        </div>
                        {sortField === 'newest' && req.createdAt && (
                          <p className="text-xs text-foreground-400 mt-0.5">{req.createdAt} 发布</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground-600 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        <p>{req.department}</p>
                        <p className="text-xs text-foreground-400 mt-0.5">{req.city}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground-700 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        {req.owner}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap cursor-pointer" onClick={() => onRowClick(req)}>
                        <p className="text-sm text-foreground-800">
                          已入职 {req.filled} / {req.headcount}
                        </p>
                        {req.acceptedOffers > 0 && (
                          <p className="mt-0.5 text-xs text-amber-600">Offer 已接受锁定 {req.acceptedOffers}</p>
                        )}
                        <p className="text-xs text-foreground-400 mt-0.5">
                          {req.deadline || '未记录日期'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 justify-center text-xs">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'feedback');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap"
                            title={`查看${req.name}的业务待反馈候选人`}
                          >
                            <span className="font-semibold text-accent-600">{req.stageFeedback}</span>
                            <span className="text-xs">业务待反馈</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'interview');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap"
                            title={`查看${req.name}的面试中候选人`}
                          >
                            <span className="font-semibold text-primary-600">{req.stageInterview}</span>
                            <span className="text-xs">面试中</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStageCountClick(req, 'offer');
                            }}
                            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-background-100 text-foreground-600 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap"
                            title={`查看${req.name}的Offer中候选人`}
                          >
                            <span className="font-semibold text-primary-700">{req.stageOffer}</span>
                            <span className="text-xs">Offer中</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 cursor-pointer" onClick={() => onRowClick(req)}>
                        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap ${statusBadgeStyles[req.statusCode] || ''}`}>
                          {demandStatusLabel(req)}
                        </span>
                        {req.statusNote && (
                          <p className="text-xs text-foreground-400 mt-1">{req.statusNote}</p>
                        )}
                      </td>
                      <td className="px-3 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canSelectCandidates && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCandidates(req);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-user-add-line text-sm"></i>
                              选候选人
                            </button>
                          )}
                          {isClosedOrCompleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewCandidates(req);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-team-line text-sm"></i>
                              查看候选人
                            </button>
                          )}
                          {hasActions ? (
                            <div className="relative inline-block" ref={openMenuId === req.id ? menuRef : undefined}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === req.id ? null : req.id);
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-background-200 text-foreground-500 hover:text-foreground-700 transition-colors cursor-pointer"
                              >
                                <i className="ri-more-fill text-base"></i>
                              </button>
                              {openMenuId === req.id && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1">
                                  {transitions.advance && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: transitions.advance!.to, label: transitions.advance!.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className="ri-arrow-right-line text-primary-500"></i>
                                      {transitions.advance.label}
                                    </button>
                                  )}
                                  {extras.map((action) => (
                                    <button
                                      key={action.to}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: action.to, label: action.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-secondary-50 hover:text-secondary-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className={`${action.icon} text-secondary-500`}></i>
                                      {action.label}
                                    </button>
                                  ))}
                                  {transitions.rollback && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        setConfirmReason('');
                                        setActionError('');
                                        setConfirmAction({ id: req.id, to: transitions.rollback!.to, label: transitions.rollback!.label });
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-accent-50 hover:text-accent-700 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                                    >
                                      <i className="ri-arrow-go-back-line text-accent-500"></i>
                                      {transitions.rollback.label}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            !isClosedOrCompleted && <span className="text-xs text-foreground-300">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <>
          <div
            className="fixed inset-0 bg-foreground-900/30 z-40"
            onClick={() => { if (!actionBusy) setConfirmAction(null); }}
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm pointer-events-auto overflow-hidden">
              <div className="px-5 py-4 border-b border-background-200">
                <h3 className="text-base font-bold text-foreground-900">确认状态变更</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-foreground-600">
                  确定将该需求的状态从 <span className="font-semibold text-foreground-800">{statusLabelMap[data.find(r => r.id === confirmAction.id)?.statusCode || '']}</span> 变更为 <span className="font-semibold text-foreground-800">{statusLabelMap[confirmAction.to]}</span>？
                </p>
                <label className="block text-sm font-medium text-foreground-700">
                  {confirmAction.to === 'active' ? '恢复原因' : '关闭原因'}
                  <textarea
                    value={confirmReason}
                    onChange={(event) => { setConfirmReason(event.target.value); setActionError(''); }}
                    rows={3}
                    placeholder="请填写本次操作原因"
                    className="mt-2 w-full resize-none rounded-lg border border-background-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
                  />
                </label>
                {actionError && <p className="text-sm text-red-500" role="alert">{actionError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-background-200 flex items-center justify-end gap-3">
                <button
                  disabled={actionBusy}
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground-600 hover:bg-background-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  取消
                </button>
                <button
                  disabled={actionBusy}
                  onClick={async () => {
                    const reason = confirmReason.trim();
                    if (!reason) {
                      setActionError('请填写操作原因');
                      return;
                    }
                    setActionBusy(true);
                    try {
                      await onStatusChange(confirmAction.id, confirmAction.to, reason);
                      setConfirmAction(null);
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : '状态更新失败');
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {actionBusy ? '正在提交...' : '确认'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
