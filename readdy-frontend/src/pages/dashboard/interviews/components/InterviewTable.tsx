import { useState, useRef, useEffect, useMemo } from 'react';
import type { Interview } from '@/mocks/interviews';

interface InterviewTableProps {
  interviews: Interview[];
  onRowClick: (interview: Interview) => void;
  onSchedule: (interview: Interview) => void;
  onViewAdjust: (interview: Interview) => void;
  onRemind: (interview: Interview) => void;
  onViewFeedback: (interview: Interview, mode: 'view' | 'edit') => void;
  onProcessResult: (interview: Interview) => void;
  onViewResult: (interview: Interview) => void;
  onCancel: (interview: Interview) => void;
  onReschedule: (interview: Interview) => void;
  onViewHistory: (interview: Interview) => void;
  onMarkComplete: (interview: Interview) => void;
  onConfirmComplete: (interview: Interview) => void;
  onMarkNoShow: (interview: Interview) => void;
  onRestoreInterview: (interview: Interview) => void;
  userRole: string;
  stageFilter: string;
  onStageFilterChange: (stage: string) => void;
  availableStages: string[];
  candidateFilter: string;
  onCandidateFilterChange: (candidate: string) => void;
  availableCandidates: string[];
  positionFilter: string;
  onPositionFilterChange: (position: string) => void;
  availablePositions: string[];
  cityFilter: string;
  onCityFilterChange: (city: string) => void;
  availableCities: string[];
  departmentFilter: string;
  onDepartmentFilterChange: (department: string) => void;
  availableDepartments: string[];
  scheduledAtFilter: string;
  onScheduledAtFilterChange: (date: string) => void;
  availableScheduledDates: string[];
}

const statusBadgeStyles: Record<string, string> = {
  '待安排': 'bg-amber-50 text-amber-700 border border-amber-200',
  '待面试': 'bg-primary-50 text-primary-700 border border-primary-200',
  '待面试反馈': 'bg-accent-50 text-accent-700 border border-accent-200',
  '待处理结果': 'bg-primary-50 text-primary-700 border border-primary-200',
  '已处理': 'bg-background-100 text-foreground-500 border border-background-200',
  '已取消': 'bg-red-50 text-red-600 border border-red-200',
};

const statusOptions = ['待安排', '待面试', '待面试反馈', '待处理结果', '已处理'];

type SortKey = 'candidate' | 'position' | 'city' | 'department' | 'stage' | 'scheduledAt' | 'status';
type SortDir = 'asc' | 'desc';

export default function InterviewTable({
  interviews,
  onRowClick,
  onSchedule,
  onViewAdjust,
  onRemind,
  onViewFeedback,
  onProcessResult,
  onViewResult,
  onCancel,
  onReschedule,
  onViewHistory,
  onMarkComplete,
  onConfirmComplete,
  onMarkNoShow,
  onRestoreInterview,
  userRole,
  stageFilter,
  onStageFilterChange,
  availableStages,
  candidateFilter,
  onCandidateFilterChange,
  availableCandidates,
  positionFilter,
  onPositionFilterChange,
  availablePositions,
  cityFilter,
  onCityFilterChange,
  availableCities,
  departmentFilter,
  onDepartmentFilterChange,
  availableDepartments,
  scheduledAtFilter,
  onScheduledAtFilterChange,
  availableScheduledDates,
}: InterviewTableProps) {
  const [moreMenuFor, setMoreMenuFor] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [stageFilterOpen, setStageFilterOpen] = useState(false);
  const [candidateFilterOpen, setCandidateFilterOpen] = useState(false);
  const [positionFilterOpen, setPositionFilterOpen] = useState(false);
  const [cityFilterOpen, setCityFilterOpen] = useState(false);
  const [departmentFilterOpen, setDepartmentFilterOpen] = useState(false);
  const [scheduledAtFilterOpen, setScheduledAtFilterOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const stageFilterRef = useRef<HTMLDivElement>(null);
  const candidateFilterRef = useRef<HTMLDivElement>(null);
  const positionFilterRef = useRef<HTMLDivElement>(null);
  const cityFilterRef = useRef<HTMLDivElement>(null);
  const departmentFilterRef = useRef<HTMLDivElement>(null);
  const scheduledAtFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuFor(null);
      }
      if (statusFilterRef.current && !statusFilterRef.current.contains(e.target as Node)) {
        setStatusFilterOpen(false);
      }
      if (stageFilterRef.current && !stageFilterRef.current.contains(e.target as Node)) {
        setStageFilterOpen(false);
      }
      if (candidateFilterRef.current && !candidateFilterRef.current.contains(e.target as Node)) {
        setCandidateFilterOpen(false);
      }
      if (positionFilterRef.current && !positionFilterRef.current.contains(e.target as Node)) {
        setPositionFilterOpen(false);
      }
      if (cityFilterRef.current && !cityFilterRef.current.contains(e.target as Node)) {
        setCityFilterOpen(false);
      }
      if (departmentFilterRef.current && !departmentFilterRef.current.contains(e.target as Node)) {
        setDepartmentFilterOpen(false);
      }
      if (scheduledAtFilterRef.current && !scheduledAtFilterRef.current.contains(e.target as Node)) {
        setScheduledAtFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isInterviewer = userRole === 'interviewer';

  const sortedInterviews = useMemo(() => {
    if (!sortKey) return interviews;
    const sorted = [...interviews].sort((a, b) => {
      let valA: string, valB: string;
      switch (sortKey) {
        case 'candidate':
          valA = a.candidateName;
          valB = b.candidateName;
          break;
        case 'position':
          valA = a.position;
          valB = b.position;
          break;
        case 'city':
          valA = a.city;
          valB = b.city;
          break;
        case 'department':
          valA = a.department;
          valB = b.department;
          break;
        case 'stage':
          valA = a.stage;
          valB = b.stage;
          break;
        case 'scheduledAt':
          valA = a.scheduledAt || '';
          valB = b.scheduledAt || '';
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        default:
          return 0;
      }
      const cmp = valA.localeCompare(valB, 'zh-Hans-CN');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [interviews, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function renderScheduleCell(iv: Interview) {
    switch (iv.status) {
      case '待安排':
        return <span className="text-sm text-foreground-400">尚未安排</span>;
      case '待面试':
        return (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-semibold text-primary-600">{iv.interviewer?.charAt(0) || '?'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground-800 whitespace-nowrap">{iv.interviewer || '待定'}</p>
              <p className="text-xs text-foreground-400 whitespace-nowrap">{iv.scheduledAt}</p>
            </div>
          </div>
        );
      case '待面试反馈':
        return <span className="text-sm text-foreground-600">等待<span className="font-medium text-foreground-800">{iv.interviewer}</span>反馈</span>;
      case '待处理结果':
        return <span className="text-sm text-foreground-500">反馈已完成，等待处理</span>;
      case '已处理':
        return (
          <div className="min-w-0">
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-0.5 ${iv.overall === '通过' ? 'bg-primary-50 text-primary-700 border border-primary-200' : iv.overall === '不通过' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-background-100 text-foreground-500 border border-background-200'}`}>
              {iv.overall || '已处理'}
            </span>
            {iv.scheduledAt && <p className="text-xs text-foreground-400 whitespace-nowrap">{iv.scheduledAt}</p>}
          </div>
        );
      case '已取消':
        return (
          <div className="min-w-0">
            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 mb-0.5">
              已取消
            </span>
            {iv.scheduledAt && <p className="text-xs text-foreground-400 whitespace-nowrap line-through">{iv.scheduledAt}</p>}
          </div>
        );
      default:
        return <span className="text-sm text-foreground-400">—</span>;
    }
  }

  function getMoreActions(iv: Interview): { label: string; icon: string; onClick: () => void }[] {
    const actions: { label: string; icon: string; onClick: () => void }[] = [];
    const close = () => setMoreMenuFor(null);
    switch (iv.status) {
      case '待安排':
        if (!isInterviewer) {
          actions.push({ label: '取消', icon: 'ri-close-circle-line', onClick: () => { close(); onCancel(iv); } });
        }
        break;
      case '待面试':
        if (!isInterviewer) {
          actions.push({ label: '改期', icon: 'ri-calendar-check-line', onClick: () => { close(); onReschedule(iv); } });
        }
        actions.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => { close(); onViewHistory(iv); } });
        break;
      case '待面试反馈':
        actions.push({ label: '查看反馈', icon: 'ri-survey-line', onClick: () => { close(); onViewFeedback(iv, 'view'); } });
        actions.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => { close(); onViewHistory(iv); } });
        break;
      case '待处理结果':
        actions.push({ label: '查看反馈', icon: 'ri-survey-line', onClick: () => { close(); onViewFeedback(iv, 'view'); } });
        actions.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => { close(); onViewHistory(iv); } });
        break;
      case '已处理':
        actions.push({ label: '查看反馈', icon: 'ri-survey-line', onClick: () => { close(); onViewFeedback(iv, 'view'); } });
        actions.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => { close(); onViewHistory(iv); } });
        break;
      case '已取消':
        if (!isInterviewer) {
          actions.push({ label: '恢复面试', icon: 'ri-refresh-line', onClick: () => { close(); onRestoreInterview(iv); } });
        }
        actions.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => { close(); onViewHistory(iv); } });
        break;
    }
    return actions;
  }

  function renderFilterDropdown(
    ref: React.RefObject<HTMLDivElement | null>,
    isOpen: boolean,
    onToggle: () => void,
    filterValue: string,
    onSelect: (val: string) => void,
    options: string[],
    label: string,
  ) {
    const hasActiveFilter = filterValue !== '';
    return (
      <div ref={ref} className="relative inline-flex items-center gap-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-medium text-foreground-500 whitespace-nowrap cursor-pointer hover:text-foreground-800 transition-colors group"
        >
          {label}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="cursor-pointer hover:text-foreground-700"
        >
          <i className={`ri-filter-3-line text-[10px] ${hasActiveFilter || isOpen ? 'text-primary-500' : 'text-foreground-300'} group-hover:text-foreground-500`}></i>
        </button>
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-40 w-40 max-h-56 overflow-y-auto flex flex-col">
            <button
              onClick={() => { onSelect(''); onToggle(); }}
              className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors whitespace-nowrap ${!filterValue ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
            >
              全部
            </button>
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onSelect(opt); onToggle(); }}
                className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors whitespace-nowrap ${filterValue === opt ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600 hover:bg-background-50'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-background-200 bg-background-50/50">
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  candidateFilterRef, candidateFilterOpen,
                  () => setCandidateFilterOpen(!candidateFilterOpen),
                  candidateFilter, onCandidateFilterChange,
                  availableCandidates, '候选人',
                )}
              </th>
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  positionFilterRef, positionFilterOpen,
                  () => setPositionFilterOpen(!positionFilterOpen),
                  positionFilter, onPositionFilterChange,
                  availablePositions, '应聘岗位',
                )}
              </th>
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  cityFilterRef, cityFilterOpen,
                  () => setCityFilterOpen(!cityFilterOpen),
                  cityFilter, onCityFilterChange,
                  availableCities, '城市',
                )}
              </th>
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  departmentFilterRef, departmentFilterOpen,
                  () => setDepartmentFilterOpen(!departmentFilterOpen),
                  departmentFilter, onDepartmentFilterChange,
                  availableDepartments, '部门',
                )}
              </th>
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  stageFilterRef, stageFilterOpen,
                  () => setStageFilterOpen(!stageFilterOpen),
                  stageFilter, onStageFilterChange,
                  availableStages, '面试轮次',
                )}
              </th>
              <th className="text-left px-5 py-3">
                {renderFilterDropdown(
                  scheduledAtFilterRef, scheduledAtFilterOpen,
                  () => setScheduledAtFilterOpen(!scheduledAtFilterOpen),
                  scheduledAtFilter, onScheduledAtFilterChange,
                  availableScheduledDates, '面试安排',
                )}
              </th>
              <th className="text-center px-5 py-3">
                <div ref={statusFilterRef} className="relative inline-flex items-center gap-1">
                  <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">操作</span>
                  <button
                    onClick={() => setStatusFilterOpen(!statusFilterOpen)}
                    className="cursor-pointer hover:text-foreground-700"
                  >
                    <i className={`ri-filter-3-line text-[10px] ${statusFilterOpen ? 'text-primary-500' : 'text-foreground-300'} hover:text-foreground-500`}></i>
                  </button>
                  {statusFilterOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-40 w-32 overflow-hidden flex flex-col">
                      {statusOptions.map(status => (
                        <button
                          key={status}
                          onClick={() => { handleSort('status'); setStatusFilterOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-foreground-600 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-background-100">
            {sortedInterviews.map(iv => {
              const moreActions = getMoreActions(iv);
              return (
                <tr
                  key={iv.id}
                  onClick={() => onRowClick(iv)}
                  className="hover:bg-background-50/30 transition-colors cursor-pointer"
                >
                  {/* 候选人 */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-primary-600">{iv.candidateAvatar}</span>
                      </div>
                      <span className="text-sm font-medium text-foreground-900 whitespace-nowrap">{iv.candidateName}</span>
                    </div>
                  </td>
                  {/* 应聘岗位 */}
                  <td className="px-5 py-3">
                    <span className="text-sm text-foreground-600 whitespace-nowrap">{iv.position}</span>
                  </td>
                  {/* 城市 */}
                  <td className="px-5 py-3">
                    <span className="text-sm text-foreground-600 whitespace-nowrap">{iv.city || '—'}</span>
                  </td>
                  {/* 部门 */}
                  <td className="px-5 py-3">
                    <span className="text-sm text-foreground-600 whitespace-nowrap">{iv.department || '—'}</span>
                  </td>
                  {/* 面试轮次 */}
                  <td className="px-5 py-3">
                    <span className="inline-block text-xs font-medium px-2 py-1 rounded bg-secondary-100 text-secondary-700 whitespace-nowrap">
                      {iv.stage}
                    </span>
                  </td>
                  {/* 面试安排 */}
                  <td className="px-5 py-3">
                    {renderScheduleCell(iv)}
                  </td>
                  {/* 操作 */}
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                      {/* 待安排 → 安排面试 */}
                      {iv.status === '待安排' && (
                        <button
                          onClick={() => onSchedule(iv)}
                          className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <i className="ri-calendar-schedule-line mr-1"></i>
                          安排面试
                        </button>
                      )}

                      {/* 待面试 → 查看/调整 + 确认已完成 + 未进行 */}
                      {iv.status === '待面试' && (
                        <>
                          <button
                            onClick={() => onViewAdjust(iv)}
                            className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <i className="ri-eye-line mr-1"></i>
                            查看/调整
                          </button>
                          <button
                            onClick={() => onConfirmComplete(iv)}
                            className="px-3 py-1.5 text-xs bg-accent-500 hover:bg-accent-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <i className="ri-check-double-line mr-1"></i>
                            确认已完成
                          </button>
                          <button
                            onClick={() => onMarkNoShow(iv)}
                            className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <i className="ri-close-circle-line mr-1"></i>
                            未进行
                          </button>
                        </>
                      )}

                      {/* 待反馈 */}
                      {iv.status === '待面试反馈' && (
                        isInterviewer ? (
                          <button
                            onClick={() => onViewFeedback(iv, 'edit')}
                            className="px-3 py-1.5 text-xs bg-accent-500 hover:bg-accent-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                          >
                            <i className="ri-survey-line mr-1"></i>
                            去评分
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => onRemind(iv)}
                              className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                            >
                              <i className="ri-notification-3-line mr-1"></i>
                              催反馈
                            </button>
                            <button
                              onClick={() => onViewFeedback(iv, 'view')}
                              className="px-3 py-1.5 text-xs bg-background-100 hover:bg-background-200 text-foreground-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                            >
                              <i className="ri-survey-line mr-1"></i>
                              查看反馈
                            </button>
                          </>
                        )
                      )}

                      {/* 待处理结果 → 处理结果 */}
                      {iv.status === '待处理结果' && (
                        <button
                          onClick={() => onProcessResult(iv)}
                          className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <i className="ri-arrow-right-circle-line mr-1"></i>
                          处理结果
                        </button>
                      )}

                      {/* 已处理 → 查看结果 */}
                      {iv.status === '已处理' && (
                        <button
                          onClick={() => onViewResult(iv)}
                          className="px-3 py-1.5 text-xs bg-background-100 hover:bg-background-200 text-foreground-700 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <i className="ri-eye-line mr-1"></i>
                          查看结果
                        </button>
                      )}

                      {/* 已取消 → 恢复面试 */}
                      {iv.status === '已取消' && (
                        <button
                          onClick={() => onRestoreInterview(iv)}
                          className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <i className="ri-refresh-line mr-1"></i>
                          恢复面试
                        </button>
                      )}

                      {/* More menu */}
                      {moreActions.length > 0 && (
                        <div ref={moreMenuFor === iv.id ? moreMenuRef : undefined} className="relative">
                          <button
                            onClick={() => setMoreMenuFor(moreMenuFor === iv.id ? null : iv.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 hover:text-foreground-600 cursor-pointer transition-colors"
                          >
                            <i className="ri-more-2-fill text-sm"></i>
                          </button>
                          {moreMenuFor === iv.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-30 w-[140px] overflow-hidden flex flex-col">
                              {moreActions.map((action, idx) => (
                                <button
                                  key={idx}
                                  onClick={action.onClick}
                                  className="w-full text-left px-3 py-2 text-sm text-foreground-700 hover:bg-background-50 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap"
                                >
                                  <i className={`${action.icon} text-xs text-foreground-400`}></i>
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {interviews.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-calendar-schedule-line text-foreground-400 text-xl"></i>
                  </div>
                  <p className="text-sm text-foreground-500">暂无面试记录</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}