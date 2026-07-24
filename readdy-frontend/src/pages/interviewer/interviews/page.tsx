import { useState, useMemo, useRef } from 'react';
import { myInterviews, CURRENT_INTERVIEWER, myPositions } from '@/mocks/interviewer';
import type { InterviewerInterview } from '@/mocks/interviewer';
import { positionScoreDimensions } from '@/mocks/interviews';
import type { Interview } from '@/mocks/interviews';
import InterviewDetailDrawer from './components/InterviewDetailDrawer';
import PositionDetailPopover from './components/PositionDetailPopover';
import ScorecardModal from '@/pages/dashboard/interviews/components/ScorecardModal';
import RescheduleModal from '@/pages/interviewer/dashboard/components/RescheduleModal';

const statusTabs = [
  { key: 'all', label: '全部' },
  { key: '待确认', label: '待确认' },
  { key: '待面试', label: '待面试' },
  { key: '待反馈', label: '待提交反馈' },
  { key: '已完成', label: '已完成' },
];

type ViewMode = 'list' | 'calendar';
type FilterColumn = 'position' | 'stage' | 'time' | 'type' | null;

const timeFilterOptions = [
  { key: 'this_week', label: '本周' },
  { key: 'next_week', label: '下周' },
  { key: 'this_month', label: '本月' },
];

export default function InterviewerInterviewsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailInterview, setDetailInterview] = useState<InterviewerInterview | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'info' | 'position' | 'feedback' | 'history' | 'resume'>('info');
  const [scorecardData, setScorecardData] = useState<Interview | null>(null);

  // Column filter states
  const [activeFilterColumn, setActiveFilterColumn] = useState<FilterColumn>(null);
  const [filterPosition, setFilterPosition] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<string | null>(null);
  const [filterTime, setFilterTime] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  // Position popover state
  const [positionPopover, setPositionPopover] = useState<{
    interview: InterviewerInterview;
    anchorRect: DOMRect;
  } | null>(null);
  const [rescheduleInterview, setRescheduleInterview] = useState<InterviewerInterview | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);

  const buildScorecardInterview = (iv: InterviewerInterview): Interview => {
    const dimNames = positionScoreDimensions[iv.position] || ['综合能力'];
    const defaultScores = dimNames.map(d => ({ dimension: d, score: null as number | null, max: 10, note: '' }));
    return {
      id: iv.id,
      candidateName: iv.candidateName,
      candidateAvatar: iv.candidateAvatar,
      position: iv.position,
      stage: iv.stage,
      interviewer: iv.interviewer || CURRENT_INTERVIEWER.name,
      interviewerId: iv.interviewerId || CURRENT_INTERVIEWER.id,
      interviewerRole: CURRENT_INTERVIEWER.role,
      scheduledAt: iv.scheduledAt,
      scheduledEndAt: iv.scheduledEndAt,
      type: iv.type,
      location: iv.location,
      status: '待面试反馈',
      scores: iv.scores && iv.scores.length > 0 ? iv.scores : defaultScores,
      overall: iv.overall || null,
      feedback: iv.feedback || '',
      recruiter: '',
      source: '',
      jdSent: iv.jdSent,
      scorecardSent: iv.scorecardSent,
      wecomSynced: false,
      candidateNotified: false,
      interviewerNotified: false,
      reqId: iv.reqId,
      reqName: iv.reqName,
      submittedBy: '',
      submittedByRole: '',
    };
  };

  const [availability, setAvailability] = useState({
    monday: { am: true, pm: true },
    tuesday: { am: true, pm: true },
    wednesday: { am: true, pm: true },
    thursday: { am: true, pm: true },
    friday: { am: true, pm: true },
  });

  const tabCounts = useMemo(() => ({
    all: myInterviews.length,
    '待确认': myInterviews.filter(iv => iv.status === '待确认').length,
    '待面试': myInterviews.filter(iv => iv.status === '待面试').length,
    '待反馈': myInterviews.filter(iv => iv.status === '待反馈').length,
    '已完成': myInterviews.filter(iv => iv.status === '已完成').length,
  }), []);

  // All unique positions and stages for filter options
  const allPositions = useMemo(() => {
    const set = new Set(myInterviews.map(iv => iv.position));
    return Array.from(set).sort();
  }, []);

  const allStages = useMemo(() => {
    const set = new Set(myInterviews.map(iv => iv.stage));
    return Array.from(set).sort();
  }, []);

  const allTypes = useMemo(() => {
    const set = new Set(myInterviews.map(iv => iv.type));
    return Array.from(set).sort();
  }, []);

  const filteredInterviews = useMemo(() => {
    let data = [...myInterviews];

    // Tab filter
    if (activeTab !== 'all') {
      data = data.filter(iv => iv.status === activeTab);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(iv =>
        iv.candidateName.toLowerCase().includes(q) ||
        iv.position.toLowerCase().includes(q) ||
        iv.reqName.toLowerCase().includes(q)
      );
    }

    // Position filter
    if (filterPosition) {
      data = data.filter(iv => iv.position === filterPosition);
    }

    // Stage filter
    if (filterStage) {
      data = data.filter(iv => iv.stage === filterStage);
    }

    // Type filter
    if (filterType) {
      data = data.filter(iv => iv.type === filterType);
    }

    // Time filter
    if (filterTime) {
      const now = new Date('2026-07-19');
      const dayOfWeek = now.getDay(); // 0=Sun, July 19 2026 is Sunday

      const getMonday = (d: Date) => {
        const result = new Date(d);
        const day = result.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        result.setDate(result.getDate() + diff);
        return result;
      };

      const monday = getMonday(now);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const nextMonday = new Date(monday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextSunday.getDate() + 6);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      data = data.filter(iv => {
        const d = new Date(iv.scheduledAt);
        switch (filterTime) {
          case 'this_week': return d >= monday && d <= sunday;
          case 'next_week': return d >= nextMonday && d <= nextSunday;
          case 'this_month': return d >= monthStart && d <= monthEnd;
          default: return true;
        }
      });
    }

    return data;
  }, [activeTab, searchQuery, filterPosition, filterStage, filterTime, filterType]);

  const handleColumnHeaderClick = (column: FilterColumn, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeFilterColumn === column) {
      setActiveFilterColumn(null);
    } else {
      setActiveFilterColumn(column);
    }
  };

  const handleFilterSelect = (type: 'position' | 'stage' | 'time' | 'type', value: string) => {
    if (type === 'position') {
      setFilterPosition(prev => prev === value ? null : value);
    } else if (type === 'stage') {
      setFilterStage(prev => prev === value ? null : value);
    } else if (type === 'time') {
      setFilterTime(prev => prev === value ? null : value);
    } else if (type === 'type') {
      setFilterType(prev => prev === value ? null : value);
    }
    setActiveFilterColumn(null);
  };

  const clearAllFilters = () => {
    setFilterPosition(null);
    setFilterStage(null);
    setFilterTime(null);
    setFilterType(null);
    setActiveFilterColumn(null);
  };

  const handleStageClick = (iv: InterviewerInterview) => {
    setDetailInitialTab('history');
    setDetailInterview(iv);
  };

  const handlePositionClick = (iv: InterviewerInterview, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPositionPopover({ interview: iv, anchorRect: rect });
  };

  const handleCandidateClick = (iv: InterviewerInterview) => {
    setDetailInitialTab('info');
    setDetailInterview(iv);
  };

  const hasActiveFilters = filterPosition || filterStage || filterTime || filterType;

  const getStatusBadge = (status: InterviewerInterview['status']) => {
    switch (status) {
      case '待面试': return 'bg-accent-100 text-accent-700';
      case '待确认': return 'bg-accent-100 text-accent-700';
      case '待反馈': return 'bg-primary-100 text-primary-700';
      case '已完成': return 'bg-background-200 text-foreground-400';
    }
  };

  const getStatusLabel = (status: InterviewerInterview['status']) => {
    switch (status) {
      case '待面试': return '待面试';
      case '待确认': return '待确认';
      case '待反馈': return '待提交反馈';
      case '已完成': return '已完成';
    }
  };

  const dayLabels: Record<string, string> = {
    monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五',
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground-900">我的面试</h1>
          <p className="text-sm text-foreground-500 mt-0.5">管理你的面试日程与反馈</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAvailabilityOpen(!availabilityOpen)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              availabilityOpen
                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                : 'bg-white border border-background-200 text-foreground-600 hover:bg-background-50'
            }`}
          >
            <i className="ri-time-line text-sm"></i>
            可用时间设置
          </button>
          <div className="flex items-center gap-1 bg-background-100 rounded-full p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${viewMode === 'list' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              <i className="ri-list-check text-sm"></i> 列表
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1 ${viewMode === 'calendar' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              <i className="ri-calendar-line text-sm"></i> 日历
            </button>
          </div>
        </div>
      </div>

      {/* Availability settings */}
      {availabilityOpen && (
        <div className="bg-white rounded-xl border border-background-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground-900 text-sm">设置面试可用时间</h3>
            <span className="text-xs text-foreground-500">HR会根据你的可用时间安排面试</span>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(availability).map(([day, slots]) => (
              <div key={day} className="text-center">
                <p className="text-sm font-medium text-foreground-700 mb-2">{dayLabels[day]}</p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setAvailability(prev => ({
                      ...prev,
                      [day]: { ...prev[day as keyof typeof prev], am: !slots.am },
                    }))}
                    className={`w-full py-1.5 text-xs rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      slots.am
                        ? 'bg-primary-50 border-primary-200 text-primary-700'
                        : 'bg-background-50 border-background-200 text-foreground-400'
                    }`}
                  >
                    上午
                  </button>
                  <button
                    onClick={() => setAvailability(prev => ({
                      ...prev,
                      [day]: { ...prev[day as keyof typeof prev], pm: !slots.pm },
                    }))}
                    className={`w-full py-1.5 text-xs rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      slots.pm
                        ? 'bg-primary-50 border-primary-200 text-primary-700'
                        : 'bg-background-50 border-background-200 text-foreground-400'
                    }`}
                  >
                    下午
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-background-100 rounded-full p-1 w-fit">
        {statusTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-background-100 text-foreground-600' : 'bg-background-200/70 text-foreground-400'
            }`}>
              {tabCounts[tab.key as keyof typeof tabCounts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Active Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-[300px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <i className="ri-search-line text-foreground-400 text-sm"></i>
          </div>
          <input
            type="text"
            placeholder="搜索候选人、岗位..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-foreground-400 hover:text-foreground-600 cursor-pointer">
              <i className="ri-close-circle-fill text-sm"></i>
            </button>
          )}
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterPosition && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent-50 text-accent-700 border border-accent-200">
                岗位：{filterPosition}
                <button onClick={() => setFilterPosition(null)} className="hover:text-accent-900 cursor-pointer">
                  <i className="ri-close-line text-xs"></i>
                </button>
              </span>
            )}
            {filterStage && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                轮次：{filterStage}
                <button onClick={() => setFilterStage(null)} className="hover:text-primary-900 cursor-pointer">
                  <i className="ri-close-line text-xs"></i>
                </button>
              </span>
            )}
            {filterTime && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 border border-secondary-200">
                {timeFilterOptions.find(o => o.key === filterTime)?.label}
                <button onClick={() => setFilterTime(null)} className="hover:text-secondary-900 cursor-pointer">
                  <i className="ri-close-line text-xs"></i>
                </button>
              </span>
            )}
            {filterType && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                形式：{filterType}
                <button onClick={() => setFilterType(null)} className="hover:text-amber-900 cursor-pointer">
                  <i className="ri-close-line text-xs"></i>
                </button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap"
            >
              清除全部
            </button>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="text-xs text-foreground-500">
        共 <strong className="text-foreground-800">{filteredInterviews.length}</strong> 条记录
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-200 bg-background-50/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</th>
                  <th className="text-left px-4 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => handleColumnHeaderClick('position', e)}
                      className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        filterPosition ? 'text-accent-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      应聘岗位
                      <i className={`ri-arrow-down-s-line text-[11px] transition-transform ${activeFilterColumn === 'position' ? 'rotate-180' : ''} ${filterPosition ? 'text-accent-500' : ''}`}></i>
                    </button>
                    {/* Position filter dropdown */}
                    {activeFilterColumn === 'position' && (
                      <div
                        ref={filterRef}
                        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1.5 z-30 min-w-[180px] animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {allPositions.map(pos => (
                          <button
                            key={pos}
                            onClick={() => handleFilterSelect('position', pos)}
                            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors flex items-center justify-between ${
                              filterPosition === pos
                                ? 'bg-accent-50 text-accent-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {pos}
                            {filterPosition === pos && <i className="ri-check-line text-xs"></i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => handleColumnHeaderClick('stage', e)}
                      className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        filterStage ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      面试轮次
                      <i className={`ri-arrow-down-s-line text-[11px] transition-transform ${activeFilterColumn === 'stage' ? 'rotate-180' : ''} ${filterStage ? 'text-primary-500' : ''}`}></i>
                    </button>
                    {/* Stage filter dropdown */}
                    {activeFilterColumn === 'stage' && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1.5 z-30 min-w-[140px] animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {allStages.map(stage => (
                          <button
                            key={stage}
                            onClick={() => handleFilterSelect('stage', stage)}
                            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors flex items-center justify-between ${
                              filterStage === stage
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {stage}
                            {filterStage === stage && <i className="ri-check-line text-xs"></i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium whitespace-nowrap relative">
                    <button
                      onClick={(e) => handleColumnHeaderClick('time', e)}
                      className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        filterTime ? 'text-secondary-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      时间
                      <i className={`ri-arrow-down-s-line text-[11px] transition-transform ${activeFilterColumn === 'time' ? 'rotate-180' : ''} ${filterTime ? 'text-secondary-500' : ''}`}></i>
                    </button>
                    {/* Time filter dropdown */}
                    {activeFilterColumn === 'time' && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1.5 z-30 min-w-[120px] animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {timeFilterOptions.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => handleFilterSelect('time', opt.key)}
                            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors flex items-center justify-between ${
                              filterTime === opt.key
                                ? 'bg-secondary-50 text-secondary-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {opt.label}
                            {filterTime === opt.key && <i className="ri-check-line text-xs"></i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap relative">
                    <button
                      onClick={(e) => handleColumnHeaderClick('type', e)}
                      className={`inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        filterType ? 'text-amber-600' : 'text-foreground-500 hover:text-foreground-700'
                      }`}
                    >
                      方式/地点
                      <i className={`ri-arrow-down-s-line text-[11px] transition-transform ${activeFilterColumn === 'type' ? 'rotate-180' : ''} ${filterType ? 'text-amber-500' : ''}`}></i>
                    </button>
                    {/* Type filter dropdown */}
                    {activeFilterColumn === 'type' && (
                      <div
                        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-background-200 py-1.5 z-30 min-w-[150px] animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {allTypes.map(t => (
                          <button
                            key={t}
                            onClick={() => handleFilterSelect('type', t)}
                            className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap transition-colors flex items-center justify-between ${
                              filterType === t
                                ? 'bg-amber-50 text-amber-700 font-medium'
                                : 'text-foreground-600 hover:bg-background-50'
                            }`}
                          >
                            {t}
                            {filterType === t && <i className="ri-check-line text-xs"></i>}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">状态</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-100">
                {filteredInterviews.map((iv) => (
                  <tr key={iv.id} className="hover:bg-background-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleCandidateClick(iv)}
                        className="flex items-center gap-3 cursor-pointer group w-full text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-600">{iv.candidateAvatar}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground-900 group-hover:text-primary-600 transition-colors">{iv.candidateName}</span>
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => handlePositionClick(iv, e)}
                        className="text-sm text-foreground-600 hover:text-accent-600 transition-colors cursor-pointer whitespace-nowrap underline decoration-dotted underline-offset-2"
                      >
                        {iv.position}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleStageClick(iv)}
                        className="text-sm text-foreground-600 hover:text-primary-600 transition-colors cursor-pointer whitespace-nowrap underline decoration-dotted underline-offset-2"
                        title="点击查看过往面试评价"
                      >
                        {iv.stage}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-foreground-700 whitespace-nowrap">{iv.scheduledAt.slice(0, 10)}</p>
                      <p className="text-xs text-foreground-400 mt-0.5">{iv.scheduledAt.slice(11, 16)} - {iv.scheduledEndAt.slice(11, 16)}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground-600 whitespace-nowrap">
                      <button
                        onClick={() => handleCandidateClick(iv)}
                        className="text-left cursor-pointer group"
                        title="点击查看详情"
                      >
                        <span className="text-sm text-foreground-600 group-hover:text-primary-600 transition-colors">{iv.type}</span>
                        <br /><span className="text-xs text-foreground-400 group-hover:text-primary-500 transition-colors">{iv.location}</span>
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${getStatusBadge(iv.status)}`}>
                        {getStatusLabel(iv.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {iv.status === '待确认' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setRescheduleInterview(iv); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-200 hover:bg-amber-50 text-amber-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            申请改约
                          </button>
                          <button
                            onClick={() => { setDetailInitialTab('info'); setDetailInterview(iv); }}
                            className="px-3 py-1.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            确认时间
                          </button>
                        </div>
                      )}
                      {iv.status === '待面试' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setRescheduleInterview(iv); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-200 hover:bg-amber-50 text-amber-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            申请改约
                          </button>
                          <button
                            onClick={() => { setDetailInitialTab('info'); setDetailInterview(iv); }}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            查看详情
                          </button>
                        </div>
                      )}
                      {iv.status === '待反馈' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setDetailInitialTab('info'); setDetailInterview(iv); }}
                            className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            查看详情
                          </button>
                          <button
                            onClick={() => setScorecardData(buildScorecardInterview(iv))}
                            className="px-3 py-1.5 text-xs font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          >
                            提交反馈
                          </button>
                        </div>
                      )}
                      {iv.status === '已完成' && (
                        <button
                          onClick={() => { setDetailInitialTab('info'); setDetailInterview(iv); }}
                          className="px-3 py-1.5 text-xs font-medium bg-white border border-background-200 hover:bg-background-50 text-foreground-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          查看反馈
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredInterviews.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
                <i className="ri-calendar-event-line text-2xl text-foreground-400"></i>
              </div>
              <p className="text-sm text-foreground-500 font-medium">暂无面试记录</p>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="mt-2 text-xs text-primary-500 hover:text-primary-600 cursor-pointer">
                  清除筛选条件
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <div className="p-5">
            <div className="grid grid-cols-7 gap-2 mb-3">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-foreground-500 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 2;
                const dateStr = day > 0 && day <= 31 ? `2026-07-${String(day).padStart(2, '0')}` : '';
                const dayInterviews = dateStr ? filteredInterviews.filter(iv => iv.scheduledAt.startsWith(dateStr)) : [];
                const isToday = dateStr === '2026-07-19';
                return (
                  <div
                    key={i}
                    className={`min-h-[80px] rounded-lg border p-1.5 ${
                      day > 0 && day <= 31
                        ? isToday
                          ? 'border-primary-300 bg-primary-50/50'
                          : 'border-background-200 bg-white'
                        : 'border-transparent bg-transparent'
                    }`}
                  >
                    {day > 0 && day <= 31 && (
                      <>
                        <span className={`text-xs font-medium ${isToday ? 'text-primary-600' : 'text-foreground-500'}`}>{day}</span>
                        {dayInterviews.map(iv => (
                          <button
                            key={iv.id}
                            onClick={() => { setDetailInitialTab('info'); setDetailInterview(iv); }}
                            className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] truncate cursor-pointer block w-full text-left ${
                              iv.status === '待反馈' ? 'bg-primary-100 text-primary-700' :
                              iv.status === '待面试' ? 'bg-accent-100 text-accent-700' :
                              iv.status === '待确认' ? 'bg-accent-50 text-accent-600' :
                              'bg-background-100 text-foreground-400'
                            }`}
                          >
                            {iv.scheduledAt.slice(11, 16)} {iv.candidateName}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Interview Detail Drawer */}
      {detailInterview && (
        <InterviewDetailDrawer
          interview={detailInterview}
          onClose={() => setDetailInterview(null)}
          initialTab={detailInitialTab}
          onReschedule={() => {
            setRescheduleInterview(detailInterview);
            setDetailInterview(null);
          }}
        />
      )}

      {/* Position Detail Popover */}
      {positionPopover && (
        <PositionDetailPopover
          interview={positionPopover.interview}
          position={myPositions.find(p => p.id === positionPopover.interview.reqId)}
          anchorRect={positionPopover.anchorRect}
          onClose={() => setPositionPopover(null)}
          onViewFullDetail={() => {
            setDetailInitialTab('position');
            setDetailInterview(positionPopover.interview);
            setPositionPopover(null);
          }}
        />
      )}

      {/* Scorecard Modal */}
      {scorecardData && (
        <ScorecardModal
          interview={scorecardData}
          mode="edit"
          onClose={() => setScorecardData(null)}
          onSave={(_scores, _overall, _feedback) => {
            setScorecardData(null);
          }}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleInterview && (
        <RescheduleModal
          interview={rescheduleInterview}
          onClose={() => setRescheduleInterview(null)}
          onConfirm={(_newDate, _newStartTime, _newEndTime, _reason) => {
            setRescheduleInterview(null);
          }}
        />
      )}
    </div>
  );
}