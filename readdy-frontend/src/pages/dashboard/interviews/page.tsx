import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { interviews as initialInterviews, interviewerPool, positionScoreDimensions, candidateTimelines } from '@/mocks/interviews';
import type { Interview, ScoreDimension } from '@/mocks/interviews';
import ScheduleModal from './components/ScheduleModal';
import ScorecardModal from './components/ScorecardModal';
import CandidateHistoryPanel from './components/CandidateHistoryPanel';
import InterviewDetailDrawer from './components/InterviewDetailDrawer';
import InterviewCalendarView from './components/InterviewCalendarView';
import InterviewTable from './components/InterviewTable';
import InterviewResultModal from './components/InterviewResultModal';
import { useToast } from '@/hooks/useToast';

function deriveFilterOpts(interviews: Array<Interview & { city: string; department: string }>) {
  return {
    positions: [...new Set(interviews.map(i => i.position))].sort(),
    interviewers: [...new Set(interviews.filter(i => i.interviewer).map(i => i.interviewer))].sort(),
    stages: [...new Set(interviews.map(i => i.stage))].sort(),
    candidates: [...new Set(interviews.map(i => i.candidateName))].sort(),
    cities: [...new Set(interviews.map(i => i.city))].sort(),
    departments: [...new Set(interviews.map(i => i.department))].sort(),
    scheduledDates: [...new Set(interviews.filter(i => i.scheduledAt).map(i => i.scheduledAt.split(' ')[0]))].sort(),
  };
}

const positionDefaults: Record<string, { city: string; department: string }> = {
  '产品经理': { city: '北京', department: '产品部' },
  '高级产品经理': { city: '北京', department: '产品部' },
  '前端开发工程师': { city: '上海', department: '技术研发部' },
  '后端开发工程师': { city: '上海', department: '技术研发部' },
  'Java开发工程师': { city: '北京', department: '技术研发部' },
  'UI/UX设计师': { city: '北京', department: '设计部' },
  '数据分析师': { city: '深圳', department: '数据部' },
  '测试工程师': { city: '北京', department: '技术研发部' },
  '市场运营专员': { city: '广州', department: '市场部' },
};

export default function InterviewsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as {
    fromDashboard?: boolean; tab?: string; candidateName?: string; candidateId?: number;
    fromCandidates?: boolean; position?: string; reqId?: string; reqName?: string;
    openDetail?: boolean;
  } | null;
  const fromDashboard = !!navState?.fromDashboard;
  const fromCandidates = !!navState?.fromCandidates;

  const [interviews, setInterviews] = useState<Interview[]>(initialInterviews);
  const enrichedInterviews = useMemo(() =>
    interviews.map(iv => ({
      ...iv,
      city: iv.city || positionDefaults[iv.position]?.city || '北京',
      department: iv.department || positionDefaults[iv.position]?.department || '其他',
    })), [interviews]);
  const filterOpts = useMemo(() => deriveFilterOpts(enrichedInterviews), [enrichedInterviews]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [candidateFilter, setCandidateFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [scheduledAtFilter, setScheduledAtFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Modal states
  const [scheduleTarget, setScheduleTarget] = useState<Interview | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'create' | 'adjust'>('create');
  const [scorecardTarget, setScorecardTarget] = useState<Interview | null>(null);
  const [scorecardMode, setScorecardMode] = useState<'view' | 'edit'>('view');
  const [remindTarget, setRemindTarget] = useState<Interview | null>(null);
  const [resultTarget, setResultTarget] = useState<Interview | null>(null);
  const [detailTarget, setDetailTarget] = useState<Interview | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [markCompleteTarget, setMarkCompleteTarget] = useState<Interview | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const candidateNavigationHandled = useRef(false);
  const dashboardNavigationHandled = useRef(false);
  const userRole = localStorage.getItem('zhipin-current-role') || 'recruiter';
  const { showToast } = useToast();

  // Auto highlight from candidates
  useEffect(() => {
    if (candidateNavigationHandled.current || !fromCandidates || !navState?.candidateId || !navState?.candidateName) return;
    candidateNavigationHandled.current = true;
    const found = interviews.find(iv => iv.candidateName === navState.candidateName || iv.id === navState.candidateId);
    if (found) {
      setSearchQuery(found.candidateName);
    }
  }, [fromCandidates, interviews, navState?.candidateId, navState?.candidateName]);

  // Auto open detail drawer from dashboard
  useEffect(() => {
    if (dashboardNavigationHandled.current || !fromDashboard || !navState?.openDetail || !navState?.candidateName) return;
    dashboardNavigationHandled.current = true;
    const found = interviews.find(iv => iv.candidateName === navState.candidateName);
    if (found) {
      setDetailTarget(found);
    }
  }, [fromDashboard, interviews, navState?.candidateName, navState?.openDetail]);

  // ─── Filtered data ─────────────────────────
  const filteredInterviews = useMemo(() => {
    let data = [...enrichedInterviews];

    if (stageFilter) {
      data = data.filter(iv => iv.stage === stageFilter);
    }
    if (candidateFilter) {
      data = data.filter(iv => iv.candidateName === candidateFilter);
    }
    if (positionFilter) {
      data = data.filter(iv => iv.position === positionFilter);
    }
    if (cityFilter) {
      data = data.filter(iv => iv.city === cityFilter);
    }
    if (departmentFilter) {
      data = data.filter(iv => iv.department === departmentFilter);
    }
    if (scheduledAtFilter) {
      data = data.filter(iv => iv.scheduledAt && iv.scheduledAt.startsWith(scheduledAtFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(iv =>
        iv.candidateName.toLowerCase().includes(q) ||
        iv.position.toLowerCase().includes(q) ||
        iv.interviewer.toLowerCase().includes(q)
      );
    }

    return data;
  }, [enrichedInterviews, stageFilter, candidateFilter, positionFilter, cityFilter, departmentFilter, scheduledAtFilter, searchQuery]);

  function clearAllFilters() {
    setStageFilter('');
    setCandidateFilter('');
    setPositionFilter('');
    setCityFilter('');
    setDepartmentFilter('');
    setScheduledAtFilter('');
    setSearchQuery('');
  }

  // ─── Handlers ──────────────────────────────

  const handleScheduleSave = (data: {
    interviewerId: string; interviewerName: string; interviewerRole: string;
    date: string; time: string; duration: string; type: string; location: string;
    wecomSync: boolean; notifyCandidate: boolean; notifyInterviewer: boolean;
  }) => {
    if (!scheduleTarget) return;
    const scheduledAt = `${data.date} ${data.time}`;
    const endTotal = parseInt(data.time.split(':')[0], 10) * 60 + parseInt(data.time.split(':')[1], 10) + parseInt(data.duration, 10);
    const endH = Math.floor(endTotal / 60);
    const endM = endTotal % 60;
    const scheduledEndAt = `${data.date} ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const isAdjust = scheduleMode === 'adjust';
    setInterviews(prev => prev.map(iv =>
      iv.id === scheduleTarget.id
        ? {
          ...iv,
          interviewer: data.interviewerName,
          interviewerId: data.interviewerId,
          interviewerRole: data.interviewerRole,
          scheduledAt,
          scheduledEndAt,
          type: data.type,
          location: data.location,
          ...(isAdjust ? {} : {
            status: '待面试' as const,
            scores: positionScoreDimensions[iv.position]?.map(d => ({ dimension: d, score: null, max: 10, note: '' })) || iv.scores,
          }),
          wecomSynced: data.wecomSync,
          candidateNotified: data.notifyCandidate,
          interviewerNotified: data.notifyInterviewer,
        }
        : iv
    ));
    setScheduleTarget(null);
    setScheduleMode('create');
    showToast(isAdjust ? '面试信息已更新' : '面试已成功安排');
  };

  const handleMarkComplete = (interview: Interview) => {
    setInterviews(prev => prev.map(iv =>
      iv.id === interview.id ? { ...iv, status: '待面试反馈' as const, jdSent: true, scorecardSent: true } : iv
    ));
    setMarkCompleteTarget(null);
  };

  const handleCancelInterview = (interview: Interview) => {
    setInterviews(prev => prev.map(iv =>
      iv.id === interview.id ? { ...iv, status: '已取消' as const } : iv
    ));
    setScheduleTarget(null);
    showToast('面试已取消');
  };

  const handleRestoreInterview = (interview: Interview) => {
    setInterviews(prev => prev.map(iv =>
      iv.id === interview.id ? { ...iv, status: '待面试' as const } : iv
    ));
    setScheduleTarget(null);
    showToast('面试已恢复');
  };

  const handleConfirmComplete = (interview: Interview) => {
    setInterviews(prev => prev.map(iv =>
      iv.id === interview.id ? { ...iv, status: '待面试反馈' as const, jdSent: true, scorecardSent: true } : iv
    ));
    showToast('面试已确认完成，进入待反馈阶段');
  };

  const handleMarkNoShow = (interview: Interview) => {
    setInterviews(prev => prev.map(iv =>
      iv.id === interview.id ? { ...iv, status: '已取消' as const } : iv
    ));
    showToast('已标记为未进行');
  };

  const handleScorecardSave = (scores: ScoreDimension[], overall: '通过' | '不通过', feedback: string) => {
    if (!scorecardTarget) return;
    const currentUser = localStorage.getItem('zhipin-current-role') || 'recruiter';
    let submittedBy = scorecardTarget.submittedBy;
    let submittedByRole = scorecardTarget.submittedByRole;
    if (!submittedBy) {
      if (currentUser === 'interviewer') {
        const cur = interviewerPool[0];
        submittedBy = cur.name;
        submittedByRole = `面试官 · ${cur.role}`;
      } else {
        submittedBy = currentUser === 'recruiter' ? '李华' : '张敏';
        submittedByRole = currentUser === 'recruiter' ? '招聘专员' : '招聘经理';
      }
    }
    setInterviews(prev => prev.map(iv =>
      iv.id === scorecardTarget.id
        ? { ...iv, scores, overall, feedback, status: '待处理结果' as const, submittedBy, submittedByRole }
        : iv
    ));
    setScorecardTarget(null);
  };

  const handleRemindScore = () => {
    if (!remindTarget) return;
    setRemindTarget(null);
  };

  const handleResultAction = (action: 'nextRound' | 'addInterview' | 'pushOffer' | 'reject', interview: Interview) => {
    if (action === 'pushOffer') {
      navigate('/offers', { state: { fromInterviews: true, candidateName: interview.candidateName, position: interview.position, reqId: interview.reqId, reqName: interview.reqName } });
    } else if (action === 'reject') {
      setInterviews(prev => prev.map(iv => iv.id === interview.id ? { ...iv, status: '已处理' as const, overall: '不通过' } : iv));
      setResultTarget(null);
    } else if (action === 'nextRound') {
      const stages = ['一面', '二面', '三面', '终面'];
      const idx = stages.indexOf(interview.stage);
      const nextStage = (idx >= 0 && idx < stages.length - 1) ? stages[idx + 1] : '终面';
      const newId = Math.max(...interviews.map(i => i.id), 0) + 1;
      const newInterview: Interview = {
        ...interview, id: newId, stage: nextStage, interviewer: '', interviewerId: '', interviewerRole: '',
        scheduledAt: '', scheduledEndAt: '', type: '线下面试', location: '', status: '待安排',
        scores: positionScoreDimensions[interview.position]?.map(d => ({ dimension: d, score: null, max: 10, note: '' })) || [],
        overall: null, feedback: '', jdSent: false, scorecardSent: false, wecomSynced: false,
        candidateNotified: false, interviewerNotified: false, submittedBy: '', submittedByRole: '',
      };
      setInterviews(prev => prev.map(iv => iv.id === interview.id ? { ...iv, status: '已处理' as const } : iv).concat(newInterview));
      setResultTarget(null);
    } else if (action === 'addInterview') {
      const newId = Math.max(...interviews.map(i => i.id), 0) + 1;
      const newInterview: Interview = {
        ...interview, id: newId, interviewer: '', interviewerId: '', interviewerRole: '',
        scheduledAt: '', scheduledEndAt: '', type: '线下面试', location: '', status: '待安排',
        scores: positionScoreDimensions[interview.position]?.map(d => ({ dimension: d, score: null, max: 10, note: '' })) || [],
        overall: null, feedback: '', jdSent: false, scorecardSent: false, wecomSynced: false,
        candidateNotified: false, interviewerNotified: false, submittedBy: '', submittedByRole: '',
      };
      setInterviews(prev => prev.map(iv => iv.id === interview.id ? { ...iv, status: '已处理' as const } : iv).concat(newInterview));
      setResultTarget(null);
    }
  };



  // ─── Render ────────────────────────────────

  const activeFilterTags: { key: string; label: string; onClear: () => void }[] = [];
  if (searchQuery.trim()) activeFilterTags.push({ key: 'search', label: `搜索: ${searchQuery}`, onClear: () => setSearchQuery('') });
  if (stageFilter) activeFilterTags.push({ key: 'stage', label: `轮次: ${stageFilter}`, onClear: () => setStageFilter('') });
  if (candidateFilter) activeFilterTags.push({ key: 'candidate', label: `候选人: ${candidateFilter}`, onClear: () => setCandidateFilter('') });
  if (positionFilter) activeFilterTags.push({ key: 'position', label: `岗位: ${positionFilter}`, onClear: () => setPositionFilter('') });
  if (cityFilter) activeFilterTags.push({ key: 'city', label: `城市: ${cityFilter}`, onClear: () => setCityFilter('') });
  if (departmentFilter) activeFilterTags.push({ key: 'department', label: `部门: ${departmentFilter}`, onClear: () => setDepartmentFilter('') });
  if (scheduledAtFilter) activeFilterTags.push({ key: 'scheduledAt', label: `面试日期: ${scheduledAtFilter}`, onClear: () => setScheduledAtFilter('') });

  return (
    <div className="p-6 space-y-4">
      {/* Breadcrumbs */}
      {fromDashboard && (
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer">
            <i className="ri-arrow-left-line"></i> 返回工作台
          </button>
          {navState?.candidateName && (
            <>
              <span className="text-foreground-300">/</span>
              <span className="text-sm font-medium text-foreground-900">处理候选人：{navState.candidateName}</span>
            </>
          )}
        </div>
      )}
      {fromCandidates && (
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/candidates')} className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer">
            <i className="ri-arrow-left-line"></i> 返回候选人库
          </button>
          {navState?.candidateName && (
            <>
              <span className="text-foreground-300">/</span>
              <span className="text-sm font-medium text-foreground-900">安排面试：{navState.candidateName}</span>
              {navState?.position && (
                <>
                  <span className="text-foreground-300">/</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">{navState.position}</span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Header bar: filters + search + view toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: active filter tags */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterTags.length > 0 && (
            <>
              {activeFilterTags.map(tag => (
                <span key={tag.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                  {tag.label}
                  <button onClick={tag.onClear} className="cursor-pointer hover:text-primary-900">
                    <i className="ri-close-line text-xs"></i>
                  </button>
                </span>
              ))}
              <button onClick={clearAllFilters} className="text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap transition-colors">
                清除全部
              </button>
            </>
          )}
        </div>

        {/* Right: search + result count + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative w-[240px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="ri-search-line text-foreground-400 text-sm"></i>
            </div>
            <input
              type="text"
              placeholder="搜索候选人、岗位、面试官..."
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

          <span className="text-xs text-foreground-500 whitespace-nowrap">
            共 <strong className="text-foreground-800">{filteredInterviews.length}</strong> 条
          </span>

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

      {/* Main Content */}
      <div ref={tableRef}>
        {viewMode === 'list' ? (
          <InterviewTable
            interviews={filteredInterviews}
            onRowClick={setDetailTarget}
            onSchedule={(iv) => { setScheduleTarget(iv); setScheduleMode('create'); }}
            onViewAdjust={(iv) => { setScheduleTarget(iv); setScheduleMode('adjust'); }}
            onRemind={setRemindTarget}
            onViewFeedback={(iv, mode) => { setScorecardTarget(iv); setScorecardMode(mode); }}
            onProcessResult={setResultTarget}
            onViewResult={(iv) => { setScorecardTarget(iv); setScorecardMode('view'); }}
            onCancel={(iv) => setInterviews(prev => prev.filter(i => i.id !== iv.id))}
            onReschedule={(iv) => { setScheduleTarget(iv); setScheduleMode('adjust'); }}
            onViewHistory={(iv) => setHistoryTarget(iv.candidateName)}
            onMarkComplete={setMarkCompleteTarget}
            onConfirmComplete={handleConfirmComplete}
            onMarkNoShow={handleMarkNoShow}
            onRestoreInterview={handleRestoreInterview}
            userRole={userRole}
            stageFilter={stageFilter}
            onStageFilterChange={setStageFilter}
            availableStages={filterOpts.stages}
            candidateFilter={candidateFilter}
            onCandidateFilterChange={setCandidateFilter}
            availableCandidates={filterOpts.candidates}
            positionFilter={positionFilter}
            onPositionFilterChange={setPositionFilter}
            availablePositions={filterOpts.positions}
            cityFilter={cityFilter}
            onCityFilterChange={setCityFilter}
            availableCities={filterOpts.cities}
            departmentFilter={departmentFilter}
            onDepartmentFilterChange={setDepartmentFilter}
            availableDepartments={filterOpts.departments}
            scheduledAtFilter={scheduledAtFilter}
            onScheduledAtFilterChange={setScheduledAtFilter}
            availableScheduledDates={filterOpts.scheduledDates}
          />
        ) : (
          <InterviewCalendarView
            interviews={filteredInterviews}
            onInterviewClick={setDetailTarget}
          />
        )}
      </div>

      {/* ─── Modals ──────────────────────────── */}

      {scheduleTarget && (
        <ScheduleModal
          interview={scheduleTarget}
          mode={scheduleMode}
          onClose={() => { setScheduleTarget(null); setScheduleMode('create'); }}
          onSave={handleScheduleSave}
          onCancelInterview={handleCancelInterview}
          onRestoreInterview={handleRestoreInterview}
        />
      )}

      {scorecardTarget && (
        <ScorecardModal
          interview={scorecardTarget}
          mode={scorecardMode}
          onClose={() => setScorecardTarget(null)}
          onSave={scorecardMode === 'edit' ? handleScorecardSave : undefined}
        />
      )}

      {detailTarget && (
        <InterviewDetailDrawer
          interview={detailTarget}
          onClose={() => setDetailTarget(null)}
          onSchedule={(iv) => { setDetailTarget(null); setScheduleTarget(iv); setScheduleMode('create'); }}
          onReschedule={(iv) => { setDetailTarget(null); setScheduleTarget(iv); setScheduleMode('adjust'); }}
          onViewScorecard={(iv) => { setDetailTarget(null); setScorecardTarget(iv); setScorecardMode('view'); }}
          onViewHistory={(iv) => { setDetailTarget(null); setHistoryTarget(iv.candidateName); }}
          onProcessResult={(iv) => { setDetailTarget(null); setResultTarget(iv); }}
          onRemind={(iv) => { setDetailTarget(null); setRemindTarget(iv); }}
          onCancel={(iv) => { setDetailTarget(null); setInterviews(prev => prev.filter(i => i.id !== iv.id)); }}
          onMarkComplete={(iv) => { setDetailTarget(null); setMarkCompleteTarget(iv); }}
          userRole={userRole}
        />
      )}

      {resultTarget && (
        <InterviewResultModal
          interview={resultTarget}
          onClose={() => setResultTarget(null)}
          onNextRound={(iv) => handleResultAction('nextRound', iv)}
          onAddInterview={(iv) => handleResultAction('addInterview', iv)}
          onPushOffer={(iv) => handleResultAction('pushOffer', iv)}
          onReject={(iv) => handleResultAction('reject', iv)}
        />
      )}

      {/* Remind Dialog */}
      {remindTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRemindTarget(null)}>
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-[420px] mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto rounded-full bg-accent-50 flex items-center justify-center mb-3">
                <i className="ri-notification-3-line text-accent-600 text-xl"></i>
              </div>
              <h3 className="text-lg font-heading font-bold text-foreground-900">提醒面试官评分</h3>
              <p className="text-sm text-foreground-500 mt-2">系统将发送评分提醒给 <strong>{remindTarget.interviewer}</strong></p>
              <div className="mt-4 p-4 bg-accent-50 rounded-xl text-left">
                <div className="flex items-start gap-2.5">
                  <i className="ri-information-line text-accent-500 mt-0.5"></i>
                  <div>
                    <p className="text-sm font-medium text-accent-700">提醒内容：</p>
                    <ul className="mt-2 space-y-1.5 text-xs text-accent-600">
                      <li className="flex items-center gap-1.5"><i className="ri-user-line text-[10px]"></i> 候选人：{remindTarget.candidateName}</li>
                      <li className="flex items-center gap-1.5"><i className="ri-briefcase-line text-[10px]"></i> 岗位：{remindTarget.position}</li>
                      <li className="flex items-center gap-1.5"><i className="ri-survey-line text-[10px]"></i> 请尽快完成维度评分</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRemindTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground-600 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors hover:bg-background-50">取消</button>
              <button onClick={handleRemindScore} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors">发送提醒</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Complete Dialog */}
      {markCompleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMarkCompleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-[420px] mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <i className="ri-check-double-line text-emerald-600 text-xl"></i>
              </div>
              <h3 className="text-lg font-heading font-bold text-foreground-900">确认面试完成</h3>
              <p className="text-sm text-foreground-500 mt-2">确认 <strong>{markCompleteTarget.candidateName}</strong> 与 <strong>{markCompleteTarget.interviewer}</strong> 的面试已完成？</p>
              <div className="mt-4 p-4 bg-primary-50 rounded-xl text-left">
                <div className="flex items-start gap-2.5">
                  <i className="ri-information-line text-primary-500 mt-0.5"></i>
                  <div>
                    <p className="text-sm font-medium text-primary-700">操作后将自动：</p>
                    <ul className="mt-2 space-y-1.5 text-xs text-primary-600">
                      <li className="flex items-center gap-1.5"><i className="ri-send-plane-line text-[10px]"></i> 发送岗位JD给面试官</li>
                      <li className="flex items-center gap-1.5"><i className="ri-survey-line text-[10px]"></i> 发送维度评分表给面试官</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMarkCompleteTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground-600 bg-white border border-background-300 rounded-lg cursor-pointer whitespace-nowrap transition-colors hover:bg-background-50">取消</button>
              <button onClick={() => handleMarkComplete(markCompleteTarget)} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors">确认完成</button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate History Panel */}
      {historyTarget && candidateTimelines[historyTarget] && (
        <CandidateHistoryPanel
          timeline={candidateTimelines[historyTarget]}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
