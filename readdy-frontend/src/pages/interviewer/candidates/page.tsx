import { useState, useMemo } from 'react';
import { myCandidates, CURRENT_INTERVIEWER } from '@/mocks/interviewer';
import type { InterviewerCandidate } from '@/mocks/interviewer';

export default function InterviewerCandidatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [detailCandidate, setDetailCandidate] = useState<InterviewerCandidate | null>(null);

  const filteredCandidates = useMemo(() => {
    let data = [...myCandidates];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.position.toLowerCase().includes(q)
      );
    }
    return data;
  }, [searchQuery]);

  const getStageBadge = (stage: string, color: string) => {
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${color}`}>{stage}</span>;
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-heading font-bold text-foreground-900">候选人进展</h1>
          <p className="text-sm text-foreground-500 mt-0.5">你参与面试的候选人进展跟踪</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-[300px]">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <i className="ri-search-line text-foreground-400 text-sm"></i>
        </div>
        <input
          type="text"
          placeholder="搜索候选人姓名、岗位..."
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

      {/* Count */}
      <div className="text-xs text-foreground-500">
        共 <strong className="text-foreground-800">{filteredCandidates.length}</strong> 位候选人
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-background-200 bg-background-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">应聘岗位</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">我的面试轮次</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">我的评价</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">当前阶段</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">最近动态</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-foreground-500 whitespace-nowrap">最终结果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {filteredCandidates.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setDetailCandidate(c)}
                  className="hover:bg-background-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary-600">{c.avatar}</span>
                      </div>
                      <span className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground-600 whitespace-nowrap">{c.position}</td>
                  <td className="px-4 py-4 text-sm text-foreground-600 whitespace-nowrap">{c.myRound}</td>
                  <td className="px-4 py-4">
                    {c.myScore !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground-900">{c.myScore}</span>
                        <span className="text-xs text-foreground-400">/10</span>
                        {c.myScore >= 8 && <span className="text-xs px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded font-medium">推荐</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-foreground-400">待评价</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {getStageBadge(c.currentStage, c.stageColor)}
                  </td>
                  <td className="px-4 py-4 text-sm text-foreground-600 max-w-[200px] truncate">{c.latestActivity}</td>
                  <td className="px-4 py-4">
                    {c.finalResult ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-background-200 text-foreground-500 whitespace-nowrap">{c.finalResult}</span>
                    ) : (
                      <span className="text-xs text-foreground-400">进行中</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCandidates.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-background-100 flex items-center justify-center mx-auto mb-4">
              <i className="ri-user-search-line text-2xl text-foreground-400"></i>
            </div>
            <p className="text-sm text-foreground-500 font-medium">暂无匹配的候选人</p>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {detailCandidate && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => setDetailCandidate(null)}></div>
          <div className="fixed inset-y-0 right-0 w-full max-w-[520px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-600">{detailCandidate.avatar}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">{detailCandidate.name}</h2>
                  <p className="text-xs text-foreground-500">{detailCandidate.position} · {detailCandidate.experienceYears}经验 · {detailCandidate.education}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailCandidate(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Resume Summary */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                  <i className="ri-file-text-line text-foreground-500"></i> 简历摘要
                </h4>
                <p className="text-sm text-foreground-600 leading-relaxed bg-background-50 rounded-lg p-3">{detailCandidate.resumeSummary}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {detailCandidate.skills.map((s) => (
                    <span key={s} className="text-[11px] bg-secondary-100 text-secondary-700 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>

              {/* My Evaluation */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                  <i className="ri-star-line text-foreground-500"></i> 我的评价
                </h4>
                {detailCandidate.myScore !== null ? (
                  <div className="bg-primary-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl font-bold text-primary-700">{detailCandidate.myScore}</span>
                      <span className="text-sm text-primary-500">/ 10</span>
                      {detailCandidate.myScore >= 8 && (
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full font-medium">推荐录用</span>
                      )}
                    </div>
                    <p className="text-sm text-primary-700 leading-relaxed">{detailCandidate.myEvaluation}</p>
                  </div>
                ) : (
                  <p className="text-sm text-foreground-400 bg-background-50 rounded-lg p-3">尚未提交评价</p>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-3 flex items-center gap-2">
                  <i className="ri-history-line text-foreground-500"></i> 招聘流程时间线
                </h4>
                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-background-200"></div>
                  <div className="space-y-4">
                    {detailCandidate.timeline.map((event, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute left-[-17px] top-1.5 w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                          event.event.includes('我完成') || event.event.includes('我的')
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-background-300 bg-white'
                        }`}></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-foreground-400">{event.date}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              event.event.includes('我完成') || event.event.includes('我的')
                                ? 'bg-primary-100 text-primary-700'
                                : 'bg-background-100 text-foreground-600'
                            }`}>{event.event}</span>
                          </div>
                          <p className="text-sm text-foreground-600 mt-0.5 leading-relaxed">{event.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Latest Update */}
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-accent-700 mb-1 flex items-center gap-2">
                  <i className="ri-bell-line"></i> 最新进展
                </h4>
                <p className="text-sm text-accent-700 leading-relaxed">{detailCandidate.latestActivity}</p>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
            .animate-slide-in {
              animation: slideIn 0.25s ease-out;
            }
          `}</style>
        </>
      )}
    </div>
  );
}