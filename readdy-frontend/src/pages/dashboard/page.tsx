import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StatsGrid from './components/StatsGrid';
import PositionsTable from './components/PositionsTable';
import SidePanels from './components/SidePanels';
import TodoPanel from './components/TodoPanel';
import { interviewerPool } from '@/mocks/interviews';
import { getRecruiterPerformance } from '@/mocks/resumePush';
import ResumePanel from '@/pages/jobs/components/ResumePanel';
import CandidateDetailDrawer from '@/pages/candidates/components/CandidateDetailDrawer';
import { allCandidateProfiles, type CandidateProfile } from '@/mocks/candidateProfiles';

const CURRENT_INTERVIEWER_ID = 'iv5';
const CURRENT_INTERVIEWER = interviewerPool.find(i => i.id === CURRENT_INTERVIEWER_ID) || interviewerPool[0];

const monthOptions = [
  { label: '2026年7月', value: '2026-07' },
  { label: '2026年6月', value: '2026-06' },
  { label: '2026年5月', value: '2026-05' },
  { label: '2026年4月', value: '2026-04' },
  { label: '2026年3月', value: '2026-03' },
  { label: '2026年2月', value: '2026-02' },
  { label: '2026年1月', value: '2026-01' },
  { label: '2025年12月', value: '2025-12' },
];

export default function DashboardPage() {
  const navigate = useNavigate();

  const currentRole = localStorage.getItem('zhipin-current-role') || 'recruiter';

  const getInitialMonth = () => {
    const saved = sessionStorage.getItem('dashboard_selectedMonth');
    if (saved) {
      const found = monthOptions.find(o => o.value === saved);
      if (found) return found;
    }
    return monthOptions[0];
  };

  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [detailProfile, setDetailProfile] = useState<CandidateProfile | null>(null);
  const [resumeProfile, setResumeProfile] = useState<CandidateProfile | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 招聘业绩统计 - 默认折叠
  const [perfCollapsed, setPerfCollapsed] = useState(true);

  // ── Recruiter Performance Stats ──
  const [perfRecruiterFilter, setPerfRecruiterFilter] = useState('');
  const [perfPositionFilter, setPerfPositionFilter] = useState('');
  const [perfSourceFilter, setPerfSourceFilter] = useState('');
  const [perfMonthFilter, setPerfMonthFilter] = useState('2026-07');
  const [perfDropdownOpen, setPerfDropdownOpen] = useState<string | null>(null);
  const perfDropdownRef = useRef<HTMLDivElement>(null);

  const performanceStats = useMemo(() => {
    if (currentRole === 'interviewer') return [];
    return getRecruiterPerformance(
      perfRecruiterFilter || undefined,
      perfPositionFilter || undefined,
      perfSourceFilter || undefined,
      perfMonthFilter || undefined
    );
  }, [currentRole, perfRecruiterFilter, perfPositionFilter, perfSourceFilter, perfMonthFilter]);

  const aggregatedPerf = useMemo(() => {
    if (performanceStats.length === 0) return null;
    const total = {
      collectedResumes: 0,
      pushedResumes: 0,
      approvedResumes: 0,
      actualInterviews: 0,
      passedInterviews: 0,
    };
    performanceStats.forEach(s => {
      total.collectedResumes += s.collectedResumes;
      total.pushedResumes += s.pushedResumes;
      total.approvedResumes += s.approvedResumes;
      total.actualInterviews += s.actualInterviews;
      total.passedInterviews += s.passedInterviews;
    });
    return {
      ...total,
      reviewPassRate: total.pushedResumes > 0 ? Math.round((total.approvedResumes / total.pushedResumes) * 100) : 0,
      interviewSuccessRate: total.actualInterviews > 0 ? Math.round((total.passedInterviews / total.actualInterviews) * 100) : 0,
    };
  }, [performanceStats]);

  const handleCandidateClick = useCallback((candidateId: number) => {
    const profile = allCandidateProfiles.find(p => p.candidateId === candidateId);
    if (profile) setDetailProfile(profile);
  }, []);

  const handleMonthChange = useCallback((option: typeof monthOptions[0]) => {
    setSelectedMonth(option);
    sessionStorage.setItem('dashboard_selectedMonth', option.value);
    setDropdownOpen(false);
  }, []);

  const saveScrollPosition = useCallback(() => {
    const pos = window.scrollY;
    sessionStorage.setItem('dashboard_scrollPosition', String(pos));
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('dashboard_scrollPosition');
    if (saved) {
      const pos = parseInt(saved, 10);
      if (!isNaN(pos) && pos > 0) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: pos, behavior: 'instant' });
        });
      }
      sessionStorage.removeItem('dashboard_scrollPosition');
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem('dashboard_selectedMonth', selectedMonth.value);
      sessionStorage.setItem('dashboard_scrollPosition', String(window.scrollY));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedMonth.value]);

  const navigateAndSave = useCallback((to: string, state?: Record<string, unknown>) => {
    saveScrollPosition();
    sessionStorage.setItem('dashboard_selectedMonth', selectedMonth.value);
    navigate(to, state ? { state } : undefined);
  }, [navigate, saveScrollPosition, selectedMonth.value]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '上午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  const getRoleGreeting = () => {
    if (currentRole === 'interviewer') {
      return `${getGreeting()}，${CURRENT_INTERVIEWER.name}。今日有 2 场面试待完成。`;
    }
    return `${getGreeting()}，张敏。`;
  };

  return (
    <div ref={scrollContainerRef} className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground-900">工作台</h1>
          <p className="text-sm text-foreground-500 mt-0.5">
            {getRoleGreeting()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-4 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-600 hover:bg-background-50 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-calendar-line text-base"></i>
              {selectedMonth.label}
              <i className={`ri-arrow-down-s-line text-sm transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-background-200 rounded-lg shadow-lg overflow-hidden z-50">
                {monthOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleMonthChange(option)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer whitespace-nowrap hover:bg-background-50 ${
                      selectedMonth.value === option.value
                        ? 'text-primary-600 bg-primary-50 font-medium'
                        : 'text-foreground-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 最紧急：待处理事项，固定首屏最顶 ── */}
      <TodoPanel onCandidateClick={handleCandidateClick} role={currentRole} />

      {/* ── 岗位进展 + 右侧面板（默认折叠）── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3">
          <PositionsTable />
        </div>
        <div className="xl:col-span-1">
          <SidePanels />
        </div>
      </div>

      {/* ── 数据概览（次要，沉到下方并默认折叠）── */}
      <StatsGrid role={currentRole} />

      {/* ── 招聘业绩统计（默认折叠）── */}
      {currentRole !== 'interviewer' && aggregatedPerf && (
        <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <button
            onClick={() => setPerfCollapsed(!perfCollapsed)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-background-50/50 transition-colors cursor-pointer text-left"
          >
            <div>
              <h3 className="font-semibold text-foreground-900 text-sm">招聘业绩统计</h3>
              <p className="text-xs text-foreground-500 mt-0.5">
                简历推送评审与面试转化数据 · {aggregatedPerf.collectedResumes} 收集 · {aggregatedPerf.pushedResumes} 推送 · {aggregatedPerf.reviewPassRate}% 通过
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-foreground-400">{aggregatedPerf.collectedResumes + aggregatedPerf.pushedResumes + aggregatedPerf.approvedResumes} 条数据</span>
              <i className={`${perfCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-sm text-foreground-400`}></i>
            </div>
          </button>

          {!perfCollapsed && (
            <div className="px-5 pb-5">
              {/* Stat Pills */}
              <div className="pt-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: '收集简历数', value: aggregatedPerf.collectedResumes, icon: 'ri-file-list-3-line', color: 'bg-secondary-50 text-secondary-700' },
                    { label: '推送简历数', value: aggregatedPerf.pushedResumes, icon: 'ri-send-plane-line', color: 'bg-accent-50 text-accent-700' },
                    { label: '同意面试数', value: aggregatedPerf.approvedResumes, icon: 'ri-check-line', color: 'bg-emerald-50 text-emerald-700' },
                    { label: '实际面试数', value: aggregatedPerf.actualInterviews, icon: 'ri-calendar-check-line', color: 'bg-primary-50 text-primary-700' },
                    { label: '面试通过数', value: aggregatedPerf.passedInterviews, icon: 'ri-verified-badge-line', color: 'bg-emerald-50 text-emerald-700' },
                    { label: '评审通过率', value: `${aggregatedPerf.reviewPassRate}%`, icon: 'ri-pie-chart-line', color: aggregatedPerf.reviewPassRate >= 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700' },
                  ].map((item) => (
                    <div key={item.label} className="bg-background-50 rounded-lg px-3 py-3 border border-background-200">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${item.color}`}>
                          <i className={`${item.icon} text-xs`}></i>
                        </div>
                        <span className="text-[11px] text-foreground-500">{item.label}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="bg-background-50 rounded-lg px-3 py-2.5 border border-background-200 flex items-center gap-3">
                    <span className="text-xs text-foreground-500">评审通过率</span>
                    <div className="flex-1 h-2 bg-background-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${aggregatedPerf.reviewPassRate}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-foreground-800">{aggregatedPerf.reviewPassRate}%</span>
                  </div>
                  <div className="bg-background-50 rounded-lg px-3 py-2.5 border border-background-200 flex items-center gap-3">
                    <span className="text-xs text-foreground-500">面试成功率</span>
                    <div className="flex-1 h-2 bg-background-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${aggregatedPerf.interviewSuccessRate}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-foreground-800">{aggregatedPerf.interviewSuccessRate}%</span>
                  </div>
                </div>
                {performanceStats.length > 1 && !perfRecruiterFilter && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-background-200">
                          <th className="text-left py-2 px-2 font-medium text-foreground-500">招聘专员</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">收集</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">推送</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">同意</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">面试</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">通过</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">评审通过率</th>
                          <th className="text-center py-2 px-2 font-medium text-foreground-500">面试成功率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performanceStats.map((s) => (
                          <tr key={s.recruiter} className="border-b border-background-100 hover:bg-background-50/50">
                            <td className="py-2.5 px-2 font-medium text-foreground-800">{s.recruiter}</td>
                            <td className="py-2.5 px-2 text-center text-foreground-600">{s.collectedResumes}</td>
                            <td className="py-2.5 px-2 text-center text-foreground-600">{s.pushedResumes}</td>
                            <td className="py-2.5 px-2 text-center text-foreground-600">{s.approvedResumes}</td>
                            <td className="py-2.5 px-2 text-center text-foreground-600">{s.actualInterviews}</td>
                            <td className="py-2.5 px-2 text-center text-foreground-600">{s.passedInterviews}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`font-medium ${s.reviewPassRate >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{s.reviewPassRate}%</span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`font-medium ${s.interviewSuccessRate >= 60 ? 'text-primary-600' : 'text-amber-600'}`}>{s.interviewSuccessRate}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Filters for perf stats */}
              <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-background-100">
                <span className="text-[11px] text-foreground-400">筛选：</span>
                <div ref={perfDropdownRef} className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPerfDropdownOpen(perfDropdownOpen === 'perfRecruiter' ? null : 'perfRecruiter'); }}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${perfRecruiterFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-background-200 bg-white text-foreground-500 hover:border-background-300'}`}
                    >
                      {perfRecruiterFilter || '招聘专员'}
                      <i className={`ml-1 ${perfDropdownOpen === 'perfRecruiter' ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-[10px]`}></i>
                    </button>
                    {perfDropdownOpen === 'perfRecruiter' && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-40 w-36 max-h-44 overflow-y-auto flex flex-col">
                        <button onClick={() => { setPerfRecruiterFilter(''); setPerfDropdownOpen(null); }} className="w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-background-50 text-foreground-600">全部</button>
                        {['张敏', '李华', '王磊'].map((r) => (
                          <button key={r} onClick={() => { setPerfRecruiterFilter(r); setPerfDropdownOpen(null); }} className={`w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-background-50 ${perfRecruiterFilter === r ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600'}`}>{r}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPerfDropdownOpen(perfDropdownOpen === 'perfSource' ? null : 'perfSource'); }}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${perfSourceFilter ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-background-200 bg-white text-foreground-500 hover:border-background-300'}`}
                    >
                      {perfSourceFilter || '渠道'}
                      <i className={`ml-1 ${perfDropdownOpen === 'perfSource' ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-[10px]`}></i>
                    </button>
                    {perfDropdownOpen === 'perfSource' && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-background-200 rounded-lg shadow-lg z-40 w-36 max-h-44 overflow-y-auto flex flex-col">
                        <button onClick={() => { setPerfSourceFilter(''); setPerfDropdownOpen(null); }} className="w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-background-50 text-foreground-600">全部</button>
                        {['PDF导入', '内部推荐', '猎头公司推荐', '外部收录'].map((s) => (
                          <button key={s} onClick={() => { setPerfSourceFilter(s); setPerfDropdownOpen(null); }} className={`w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-background-50 ${perfSourceFilter === s ? 'bg-primary-50 text-primary-700 font-medium' : 'text-foreground-600'}`}>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={perfMonthFilter}
                    onChange={(e) => setPerfMonthFilter(e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-background-200 bg-white text-foreground-500 cursor-pointer"
                  >
                    {monthOptions.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <CandidateDetailDrawer
        profile={detailProfile}
        onClose={() => setDetailProfile(null)}
        onViewResume={(p) => { setDetailProfile(null); setTimeout(() => setResumeProfile(p), 200); }}
        onAddToPosition={() => { navigate('/candidates'); }}
        onMoveToPool={() => { navigate('/candidates'); }}
        onRemoveFromPool={() => { navigate('/candidates'); }}
      />

      <ResumePanel candidate={resumeProfile?.candidate || null} onClose={() => setResumeProfile(null)} />
    </div>
  );
}