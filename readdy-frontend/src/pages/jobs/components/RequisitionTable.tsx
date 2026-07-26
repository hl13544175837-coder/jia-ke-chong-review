import { useState, useRef, useEffect, useMemo } from 'react';
import type { RequisitionRow } from '@/features/demands/types';

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
  onRowClick: (req: RequisitionTableProps['data'][0]) => void;
  onStatusChange: (id: string, newStatusCode: string, reason: string) => Promise<void>;
  statusTransitions: Record<string, { advance: { to: string; label: string } | null; rollback: { to: string; label: string } | null }>;
  statusExtraActions: Record<string, { to: string; label: string; icon: string }[]>;
  onSelectCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onViewCandidates: (req: RequisitionTableProps['data'][0]) => void;
  onStageCountClick: (req: RequisitionTableProps['data'][0], stage: 'feedback' | 'interview' | 'offer') => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filters: { department: string; owner: string; city: string; status: string; stage: string };
  onFilterChange: (key: string, value: string) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

const statusLabelMap: Record<string, string> = {
  active: '招聘中',
  pending: '需求待确认',
  paused: '已暂停',
  filled: '已完成',
  cancelled: '已取消',
  closed: '已关闭',
};

const sortModes = [
  { value: 'newest', label: '最新发布' },
  { value: 'priority', label: '优先级' },
];

// priority display config
const priorityConfig: Record<string, { label: string; className: string }> = {
  '紧急': { label: '紧急', className: 'bg-accent-100 text-accent-700' },
  '高': { label: '高', className: 'bg-primary-100 text-primary-700' },
  '普通': { label: '普通', className: 'bg-secondary-100 text-secondary-700' },
};

export default function RequisitionTable({
  data,
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
  sortField,
  sortDirection,
  onSortChange,
}: RequisitionTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; to: string; label: string } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [headerFilterOpen, setHeaderFilterOpen] = useState<'department' | 'owner' | 'status' | 'stage' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const deptFilterRef = useRef<HTMLDivElement | null>(null);
  const ownerFilterRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const stageFilterRef = useRef<HTMLDivElement | null>(null);

  // 从当前表格数据动态推导筛选选项，更真实
  const deptOptions = useMemo(() => {
    const unique = Array.from(new Set(data.map((r) => r.department)));
    return [
      { value: '', label: '全部部门' },
      ...unique.map((d) => ({ value: d, label: d })),
    ];
  }, [data]);

  const cityOptions = useMemo(() => {
    const unique = Array.from(new Set(data.map((r) => r.city)));
    return [
      { value: '', label: '全部城市' },
      ...unique.map((c) => ({ value: c, label: c })),
    ];
  }, [data]);

  const ownerOptions = useMemo(() => {
    const unique = Array.from(new Set(data.map((r) => r.owner)));
    return [
      { value: '', label: '全部负责人' },
      ...unique.map((o) => ({ value: o, label: o })),
    ];
  }, [data]);

  const statusOptions = useMemo(() => [
    { value: '', label: '全部状态' },
    { value: 'active', label: '招聘中' },
    { value: 'pending', label: '需求待确认' },
    { value: 'paused', label: '已暂停' },
    { value: 'filled', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
    { value: 'closed', label: '已关闭' },
  ], []);

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
    if (!headerFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      let targetRef: { current: HTMLDivElement | null } | null = null;
      if (headerFilterOpen === 'department') targetRef = deptFilterRef;
      else if (headerFilterOpen === 'owner') targetRef = ownerFilterRef;
      else if (headerFilterOpen === 'status') targetRef = statusFilterRef;
      else if (headerFilterOpen === 'stage') targetRef = stageFilterRef;
      if (targetRef?.current && !targetRef.current.contains(e.target as Node)) {
        setHeaderFilterOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [headerFilterOpen]);

  const isDeadlineSortActive = sortField === 'deadline';

  const renderSortArrow = (active: boolean) => {
    if (!active) return null;
    if (sortDirection === 'asc') {
      return <i className="ri-arrow-up-s-line ml-1 text-xs text-primary-500"></i>;
    }
    return <i className="ri-arrow-down-s-line ml-1 text-xs text-primary-500"></i>;
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        {/* Toolbar: search + filters */}
        <div className="px-5 py-3 border-b border-background-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-foreground-400 text-sm"></i>
            </div>
            <input
              type="text"
              placeholder="搜索需求编号、职位或负责人"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50 transition-all"
            />
          </div>
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
                  {/* 需求 / 职位 — sortable by newest / priority / name */}
                  <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">
                    <div className="flex flex-col gap-1.5">
                      <span>需求 / 职位</span>
                      <div className="flex items-center gap-0.5">
                        {sortModes.map((mode) => (
                          <button
                            key={mode.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSortChange(mode.value);
                            }}
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                              sortField === mode.value
                                ? 'bg-primary-500 text-white'
                                : 'bg-background-100 text-foreground-500 hover:bg-background-200'
                            }`}
                          >
                            {mode.label}
                            {sortField === mode.value && renderSortArrow(true)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </th>
                  {/* 部门与城市 */}
                  <th className="text-left px-5 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeaderFilterOpen(headerFilterOpen === 'department' ? null : 'department');
                      }}
                      className={`flex items-center gap-1 transition-colors cursor-pointer ${
                        (filters.department || filters.city) ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      部门与城市
                      <i className={`${(filters.department || filters.city) ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${(filters.department || filters.city) ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                    </button>
                    {headerFilterOpen === 'department' && (
                      <div
                        ref={deptFilterRef}
                        className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[160px] max-h-72 overflow-y-auto flex flex-col"
                      >
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-foreground-400 uppercase tracking-wider">
                          部门
                        </div>
                        {deptOptions.map((d) => (
                          <button
                            key={`dept-${d.value}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterChange('department', d.value);
                              setHeaderFilterOpen(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                              filters.department === d.value
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                        <div className="border-t border-background-100 my-1"></div>
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-foreground-400 uppercase tracking-wider">
                          城市
                        </div>
                        {cityOptions.map((c) => (
                          <button
                            key={`city-${c.value}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterChange('city', c.value);
                              setHeaderFilterOpen(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                              filters.city === c.value
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  {/* 负责人 */}
                  <th className="text-left px-5 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeaderFilterOpen(headerFilterOpen === 'owner' ? null : 'owner');
                      }}
                      className={`flex items-center gap-1 transition-colors cursor-pointer ${
                        filters.owner ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      负责人
                      <i className={`${filters.owner ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${filters.owner ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                    </button>
                    {headerFilterOpen === 'owner' && (
                      <div
                        ref={ownerFilterRef}
                        className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[120px] flex flex-col"
                      >
                        {ownerOptions.map((o) => (
                          <button
                            key={o.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterChange('owner', o.value);
                              setHeaderFilterOpen(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                              filters.owner === o.value
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  {/* HC / 截止日期 — sortable by deadline */}
                  <th
                    className="text-left px-5 py-3 text-xs font-medium whitespace-nowrap cursor-pointer select-none group"
                    onClick={() => onSortChange('deadline')}
                  >
                    <span className={`transition-colors ${isDeadlineSortActive ? 'text-primary-600' : 'text-foreground-500 group-hover:text-foreground-700'}`}>
                      HC / 截止日期
                    </span>
                    {isDeadlineSortActive && renderSortArrow(true)}
                  </th>
                  {/* 阶段进度 */}
                  <th className="text-center px-5 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeaderFilterOpen(headerFilterOpen === 'stage' ? null : 'stage');
                      }}
                      className={`flex items-center gap-1 transition-colors cursor-pointer mx-auto ${
                        filters.stage ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      阶段进度
                      <i className={`${filters.stage ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${filters.stage ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                    </button>
                    {headerFilterOpen === 'stage' && (
                      <div
                        ref={stageFilterRef}
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[140px] flex flex-col"
                      >
                        {stageOptions.map((s) => (
                          <button
                            key={s.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterChange('stage', s.value);
                              setHeaderFilterOpen(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                              filters.stage === s.value
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  {/* 状态 */}
                  <th className="text-left px-5 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeaderFilterOpen(headerFilterOpen === 'status' ? null : 'status');
                      }}
                      className={`flex items-center gap-1 transition-colors cursor-pointer ${
                        filters.status ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      状态
                      <i className={`${filters.status ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm ${filters.status ? 'text-primary-500' : 'text-foreground-400'}`}></i>
                    </button>
                    {headerFilterOpen === 'status' && (
                      <div
                        ref={statusFilterRef}
                        className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 py-1 min-w-[140px] flex flex-col"
                      >
                        {statusOptions.map((s) => (
                          <button
                            key={s.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterChange('status', s.value);
                              setHeaderFilterOpen(null);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                              filters.status === s.value
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  {/* 操作 */}
                  <th className="text-center px-3 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">
                    操作
                  </th>
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
                          {req.status}
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
