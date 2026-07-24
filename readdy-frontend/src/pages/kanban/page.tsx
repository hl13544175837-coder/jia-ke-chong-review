import { useState, useMemo } from 'react';
import { candidateList, type Candidate } from '@/mocks/candidates';
import ResumePanel from '@/pages/jobs/components/ResumePanel';
import AdvanceStageModal from '@/components/feature/AdvanceStageModal';
import RecruiterPanel from '@/pages/kanban/components/RecruiterPanel';
import BlockagePanel from '@/pages/kanban/components/BlockagePanel';
import { useToast } from '@/hooks/useToast';

const funnelStages = [
  { key: '待筛选', label: '简历收录', color: 'bg-primary-400', barColor: 'from-primary-400 to-primary-500' },
  { key: '初筛通过', label: '初筛通过', color: 'bg-primary-500', barColor: 'from-primary-500 to-primary-600' },
  { key: '一面', label: '一面', color: 'bg-accent-400', barColor: 'from-accent-400 to-accent-500' },
  { key: '二面', label: '二面', color: 'bg-accent-500', barColor: 'from-accent-500 to-accent-600' },
  { key: '终面', label: '终面', color: 'bg-secondary-400', barColor: 'from-secondary-400 to-secondary-500' },
  { key: '已发Offer', label: '已发Offer', color: 'bg-secondary-500', barColor: 'from-secondary-500 to-secondary-600' },
  { key: '已入职', label: '已入职', color: 'bg-primary-600', barColor: 'from-primary-600 to-primary-700' },
];

const sourceLabels: Record<string, string> = {
  'PDF导入': 'PDF导入',
  '内推': '内部推荐',
  '猎头推荐': '外部收录',
  '内部推荐': '内部推荐',
  '手动录入': '手动录入',
};

const reportingMonths = ['2026年6月', '2026年7月', '2026年8月'];

export default function KanbanPage() {
  const { showToast } = useToast();
  const [candidates] = useState<Candidate[]>([...candidateList]);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<Candidate | null>(null);
  const [advanceCandidate, setAdvanceCandidate] = useState<Candidate | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [viewTab, setViewTab] = useState<'overview' | 'recruiter' | 'blockage'>('blockage');
  const [reportingMonthIndex, setReportingMonthIndex] = useState(1);

  const totalCandidates = candidates.length;
  const hiredCount = candidates.filter((c) => c.stage === '已入职').length;
  const rejectedCount = candidates.filter((c) => c.stage === '已淘汰').length;
  const screeningPassCount = candidates.filter((c) =>
    ['初筛通过', '一面', '二面', '终面', '已发Offer', '已入职'].includes(c.stage)
  ).length;
  const offerCount = candidates.filter((c) =>
    ['已发Offer', '已入职'].includes(c.stage)
  ).length;

  const isBlocked = (c: Candidate) =>
    c.blockReason && c.blockReason !== '暂无' && c.blockReason !== '暂无明显阻塞';

  const blockedCandidates = useMemo(() => candidates.filter(isBlocked), [candidates]);
  const blockedCount = blockedCandidates.length;

  const funnelData = useMemo(() => {
    const data = funnelStages.map((s) => {
      const count = candidates.filter((c) => c.stage === s.key).length;
      const cumulativeCount = candidates.filter((c) => {
        const idx = funnelStages.findIndex((fs) => fs.key === c.stage);
        const stageIdx = funnelStages.findIndex((fs) => fs.key === s.key);
        return idx >= 0 && idx <= stageIdx;
      }).length;
      return { ...s, count, cumulativeCount };
    });
    const maxCumulative = Math.max(...data.map((d) => d.cumulativeCount), 1);
    return data.map((d) => ({ ...d, widthPct: (d.cumulativeCount / maxCumulative) * 100 }));
  }, [candidates]);

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    candidates.forEach((c) => {
      const label = sourceLabels[c.source] || c.source;
      map[label] = (map[label] || 0) + 1;
    });
    const max = Math.max(...Object.values(map), 1);
    return Object.entries(map).map(([name, count]) => ({ name, count, widthPct: (count / max) * 100 }));
  }, [candidates]);

  const passCount = totalCandidates - rejectedCount;
  const passPct = totalCandidates > 0 ? (passCount / totalCandidates) * 100 : 0;
  const rejectPct = totalCandidates > 0 ? (rejectedCount / totalCandidates) * 100 : 0;

  const stageCandidateList = useMemo(() => {
    if (!activeStage) return [];
    return candidates.filter((c) => c.stage === activeStage);
  }, [activeStage, candidates]);

  const uniqueRecruiters = useMemo(() => [...new Set(candidates.map((c) => c.recruiter || '未分配'))], [candidates]);
  const uniquePositions = useMemo(() => [...new Set(candidates.map((c) => c.position))], [candidates]);

  const handleAdvance = (candidate: Candidate) => {
    setAdvanceCandidate(candidate);
    setAdvanceOpen(true);
  };

  const handleConfirmAdvance = () => {
    setAdvanceOpen(false);
    setAdvanceCandidate(null);
  };

  const handleMonthChange = () => {
    const next = (reportingMonthIndex + 1) % reportingMonths.length;
    setReportingMonthIndex(next);
    showToast(`报表月份已切换为 ${reportingMonths[next]}`);
  };

  const tabs = [
    { key: 'blockage' as const, label: '阻塞分析', icon: 'ri-alert-line' },
    { key: 'recruiter' as const, label: '招聘专员', icon: 'ri-user-settings-line' },
    { key: 'overview' as const, label: '总览看板', icon: 'ri-dashboard-3-line' },
  ];

  return (
    <div className="min-h-screen bg-background-50">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground-900">招聘进度看板</h1>
            <p className="text-sm text-foreground-500 mt-1">
              招聘进度追踪 · {uniqueRecruiters.length} 位招聘专员 · {uniquePositions.length} 个在招岗位
              {blockedCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-accent-600 font-medium">
                  <i className="ri-error-warning-line"></i>
                  {blockedCount} 人阻塞中
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMonthChange}
              aria-label="2026年7月"
              title="点击切换报表月份"
              className="px-3 py-1.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-600 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-calendar-line mr-1"></i>
              {reportingMonths[reportingMonthIndex]}
            </button>
            <button
              onClick={() => showToast('报表已导出，请查看下载列表')}
              className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-line mr-1"></i>
              导出报表
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                viewTab === tab.key
                  ? 'bg-white text-foreground-900 shadow-sm'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              <i className={`${tab.icon} text-sm`}></i>
              {tab.label}
              {tab.key === 'blockage' && blockedCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent-500 text-white text-[10px] font-bold px-1">
                  {blockedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-foreground-500">简历总数</p>
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <i className="ri-inbox-archive-line text-sm text-primary-600"></i>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground-900">{totalCandidates}</p>
            <p className="text-xs text-foreground-400 mt-1">{uniquePositions.length} 个岗位</p>
          </div>

          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-foreground-500">初筛通过率</p>
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <i className="ri-search-line text-sm text-primary-600"></i>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground-900">{totalCandidates > 0 ? Math.round((screeningPassCount / totalCandidates) * 100) : 0}%</p>
            <p className="text-xs text-foreground-400 mt-1">{screeningPassCount} 人通过初筛</p>
          </div>

          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-foreground-500">Offer 转化率</p>
              <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center">
                <i className="ri-user-voice-line text-sm text-accent-600"></i>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground-900">{screeningPassCount > 0 ? Math.round((offerCount / screeningPassCount) * 100) : 0}%</p>
            <p className="text-xs text-foreground-400 mt-1">{offerCount} 人拿到 Offer</p>
          </div>

          <div className="bg-white rounded-xl border border-background-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-foreground-500">最终入职率</p>
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <i className="ri-check-double-line text-sm text-primary-600"></i>
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground-900">{totalCandidates > 0 ? Math.round((hiredCount / totalCandidates) * 100) : 0}%</p>
            <p className="text-xs text-foreground-400 mt-1">{hiredCount} 人入职 · {rejectedCount} 人淘汰</p>
          </div>

          <div className={`rounded-xl border p-5 ${blockedCount > 0 ? 'bg-accent-50/30 border-accent-200' : 'bg-white border-background-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-foreground-500">当前阻塞</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${blockedCount > 0 ? 'bg-accent-100' : 'bg-background-100'}`}>
                <i className={`text-sm ${blockedCount > 0 ? 'ri-error-warning-line text-accent-600' : 'ri-check-line text-foreground-400'}`}></i>
              </div>
            </div>
            <p className={`text-2xl font-bold ${blockedCount > 0 ? 'text-accent-600' : 'text-foreground-900'}`}>{blockedCount}</p>
            <p className="text-xs text-foreground-400 mt-1">
              {blockedCount > 0
                ? `${uniqueRecruiters.filter((r) => candidates.filter((c) => c.recruiter === r && isBlocked(c)).length > 0).length} 位专员有卡点`
                : '全员推进顺利'}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 pb-6">
        {viewTab === 'blockage' && (
          <BlockagePanel candidates={candidates} />
        )}

        {viewTab === 'recruiter' && (
          <RecruiterPanel candidates={candidates} />
        )}

        {viewTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Funnel */}
            <div className="xl:col-span-7">
              <div className="bg-white rounded-xl border border-background-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-foreground-900 text-base">招聘转化漏斗</h3>
                    <p className="text-xs text-foreground-500 mt-0.5">点击阶段查看候选人明细</p>
                  </div>
                  <span className="text-xs text-foreground-400">
                    总转化 {totalCandidates > 0 ? Math.round((hiredCount / totalCandidates) * 100) : 0}%
                  </span>
                </div>
                <div className="space-y-3">
                  {funnelData.map((item, index) => {
                    const prevItem = index > 0 ? funnelData[index - 1] : null;
                    const conversionRate = prevItem && prevItem.cumulativeCount > 0
                      ? Math.round((item.cumulativeCount / prevItem.cumulativeCount) * 100)
                      : 100;
                    const dropOff = prevItem ? prevItem.cumulativeCount - item.cumulativeCount : 0;
                    const isActive = activeStage === item.key;
                    return (
                      <div
                        key={item.key}
                        onClick={() => setActiveStage(isActive ? null : item.key)}
                        className={`group cursor-pointer rounded-xl border transition-all ${
                          isActive
                            ? 'border-primary-300 bg-primary-50/30 ring-1 ring-primary-200'
                            : 'border-transparent hover:bg-background-50'
                        }`}
                      >
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-medium text-foreground-500 w-16 text-right flex-shrink-0">
                              {item.label}
                            </span>
                            <div className="flex-1">
                              <div className="h-10 bg-background-100 rounded-lg overflow-hidden relative">
                                <div
                                  className={`h-full rounded-lg bg-gradient-to-r ${item.barColor} transition-all duration-700 flex items-center`}
                                  style={{ width: `${item.widthPct}%` }}
                                >
                                  <span className="text-sm font-bold text-white ml-3 drop-shadow-sm">
                                    {item.cumulativeCount}
                                  </span>
                                </div>
                                {dropOff > 0 && (
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-accent-600 font-medium">
                                    -{dropOff} 流失
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 w-20 text-right">
                              {index > 0 && (
                                <span className="text-xs font-semibold text-primary-600">{conversionRate}% 转化</span>
                              )}
                              {index === 0 && (
                                <span className="text-xs text-foreground-400">起点</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Side Panels */}
            <div className="xl:col-span-5 space-y-6">
              {/* Source Distribution */}
              <div className="bg-white rounded-xl border border-background-200 p-5">
                <h3 className="font-bold text-foreground-900 text-sm mb-4">简历来源分布</h3>
                <div className="space-y-3">
                  {sourceData.map((s) => (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-foreground-700">{s.name}</span>
                        <span className="text-xs font-semibold text-foreground-900">{s.count} 人 · {Math.round((s.count / totalCandidates) * 100)}%</span>
                      </div>
                      <div className="h-5 bg-background-100 rounded-md overflow-hidden">
                        <div
                          className="h-full bg-primary-400 rounded-md transition-all duration-700"
                          style={{ width: `${s.widthPct}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pass vs Rejected */}
              <div className="bg-white rounded-xl border border-background-200 p-5">
                <h3 className="font-bold text-foreground-900 text-sm mb-4">通过 vs 淘汰</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary-500"></div>
                      <span className="text-sm text-foreground-700">在流程中 / 已通过</span>
                    </div>
                    <span className="text-sm font-bold text-foreground-900">{passCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-accent-500"></div>
                      <span className="text-sm text-foreground-700">已淘汰</span>
                    </div>
                    <span className="text-sm font-bold text-foreground-900">{rejectedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary-600"></div>
                      <span className="text-sm text-foreground-700">已入职</span>
                    </div>
                    <span className="text-sm font-bold text-foreground-900">{hiredCount}</span>
                  </div>
                </div>
                <div className="mt-4 h-2.5 bg-background-100 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-primary-500 transition-all duration-700"
                    style={{ width: `${passPct}%` }}
                  ></div>
                  <div
                    className="h-full bg-accent-500 transition-all duration-700"
                    style={{ width: `${rejectPct}%` }}
                  ></div>
                </div>
              </div>

              {/* Stage Quick Look */}
              <div className="bg-white rounded-xl border border-background-200 p-5">
                <h3 className="font-bold text-foreground-900 text-sm mb-4">各阶段人数</h3>
                <div className="grid grid-cols-2 gap-2">
                  {funnelStages.map((s) => {
                    const count = candidates.filter((c) => c.stage === s.key).length;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setActiveStage(activeStage === s.key ? null : s.key)}
                        className={`text-left rounded-lg border p-2.5 transition-all cursor-pointer ${
                          activeStage === s.key
                            ? 'border-primary-300 bg-primary-50/30'
                            : 'border-background-200 hover:border-background-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-foreground-600">{s.label}</span>
                          <span className="text-base font-bold text-foreground-900">{count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Stage Detail List */}
        {activeStage && viewTab === 'overview' && (
          <div className="mt-6 bg-white rounded-xl border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-foreground-900 text-sm">
                  {funnelStages.find((s) => s.key === activeStage)?.label} 候选人明细
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-background-200 text-foreground-600">{stageCandidateList.length} 人</span>
              </div>
              <button
                onClick={() => setActiveStage(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-400 transition-colors cursor-pointer"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-background-200">
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">候选人</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">应聘职位</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">招聘专员</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">来源</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">阻塞状态</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-100">
                  {stageCandidateList.map((c) => (
                    <tr key={c.id} className="hover:bg-background-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-600">{c.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground-900">{c.name}</p>
                            <p className="text-xs text-foreground-400">{c.education}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground-700">{c.position}</td>
                      <td className="px-5 py-3 text-sm text-foreground-600">{c.recruiter || '-'}</td>
                      <td className="px-5 py-3 text-sm text-foreground-600">{c.source}</td>
                      <td className="px-5 py-3">
                        {isBlocked(c) ? (
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0"></span>
                            <span className="text-xs text-accent-600 max-w-[200px] truncate" title={c.blockReason}>
                              {c.blockReason?.length && c.blockReason.length > 25
                                ? c.blockReason.substring(0, 25) + '...'
                                : c.blockReason}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-foreground-400">正常</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setResumeCandidate(c)}
                            className="px-2.5 py-1 text-xs bg-background-100 hover:bg-background-200 rounded-md text-foreground-600 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            查看简历
                          </button>
                          <button
                            onClick={() => handleAdvance(c)}
                            className="px-2.5 py-1 text-xs bg-primary-50 hover:bg-primary-100 rounded-md text-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            推进流程
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ResumePanel candidate={resumeCandidate} onClose={() => setResumeCandidate(null)} />
      <AdvanceStageModal
        candidate={advanceCandidate ? { id: advanceCandidate.id, name: advanceCandidate.name, stage: advanceCandidate.stage } : null}
        isOpen={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        onConfirm={handleConfirmAdvance}
      />
    </div>
  );
}
