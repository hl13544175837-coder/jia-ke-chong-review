import { useState } from 'react';
import { myPositions, CURRENT_INTERVIEWER, myCandidates } from '@/mocks/interviewer';
import type { InterviewerPosition, InterviewerCandidate } from '@/mocks/interviewer';

export default function InterviewerJobsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<InterviewerCandidate | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const lookupCandidate = (candidateId: number): InterviewerCandidate | undefined => {
    return myCandidates.find(c => c.id === candidateId);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground-900">参与岗位</h1>
          <p className="text-sm text-foreground-500 mt-0.5">
            {CURRENT_INTERVIEWER.name} · {CURRENT_INTERVIEWER.role} · {CURRENT_INTERVIEWER.department}
          </p>
        </div>
        <span className="ml-auto text-xs px-2.5 py-1 bg-primary-50 text-primary-600 rounded-full font-medium whitespace-nowrap">只读模式</span>
      </div>

      {/* Role info banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl">
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-primary-600">{CURRENT_INTERVIEWER.avatar}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-primary-700">面试官：{CURRENT_INTERVIEWER.name}</p>
          <p className="text-xs text-primary-500">查看参与岗位的JD、面试流程与候选人情况，为面试做准备</p>
        </div>
      </div>

      {/* Position cards */}
      <div className="space-y-4">
        {myPositions.map((pos) => (
          <div key={pos.id} className="bg-white rounded-xl border border-background-200 overflow-hidden">
            {/* Card header */}
            <button
              onClick={() => toggleExpand(pos.id)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-background-50/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <i className="ri-briefcase-line text-lg text-primary-600"></i>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground-900">{pos.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-foreground-500">{pos.department} · {pos.city}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      pos.priority === '高' || pos.priority === '紧急'
                        ? 'bg-accent-100 text-accent-700'
                        : 'bg-background-100 text-foreground-500'
                    }`}>{pos.priority}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      pos.status === '招聘中' ? 'bg-primary-100 text-primary-700' : 'bg-background-100 text-foreground-500'
                    }`}>{pos.status}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-foreground-500">{pos.myRole}</span>
                <div className="w-5 h-5 flex items-center justify-center">
                  {expandedId === pos.id ? (
                    <i className="ri-arrow-up-s-line text-sm text-foreground-400"></i>
                  ) : (
                    <i className="ri-arrow-down-s-line text-sm text-foreground-400"></i>
                  )}
                </div>
              </div>
            </button>

            {/* Expanded content */}
            {expandedId === pos.id && (
              <div className="px-5 pb-5 space-y-5 border-t border-background-200 pt-4">
                {/* JD */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                    <i className="ri-file-text-line text-foreground-500"></i> 岗位JD
                  </h4>
                  <div className="bg-background-50 rounded-lg p-4 text-sm text-foreground-600 leading-relaxed whitespace-pre-line">{pos.jd}</div>
                </div>

                {/* Requirements */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                    <i className="ri-check-double-line text-foreground-500"></i> 任职要求
                  </h4>
                  <div className="bg-background-50 rounded-lg p-4 text-sm text-foreground-600 leading-relaxed whitespace-pre-line">{pos.requirements}</div>
                </div>

                {/* Interview Process */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                    <i className="ri-flow-chart text-foreground-500"></i> 面试流程
                  </h4>
                  <div className="bg-background-50 rounded-lg p-4">
                    <p className="text-sm text-foreground-600">{pos.interviewProcess}</p>
                  </div>
                </div>

                {/* Focus Points */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                    <i className="ri-focus-2-line text-foreground-500"></i> 考察重点
                  </h4>
                  <div className="space-y-2">
                    {pos.focusPoints.map((point, i) => (
                      <div key={i} className="flex items-start gap-2 bg-background-50 rounded-lg p-3">
                        <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-foreground-600">{point}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Assigned Candidates */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                    <i className="ri-team-line text-foreground-500"></i> 已分配候选人
                    <span className="text-xs text-foreground-400 font-normal">({pos.assignedCandidates.length} 人)</span>
                  </h4>
                  <div className="bg-background-50 rounded-lg divide-y divide-background-200">
                    {pos.assignedCandidates.map((cand) => (
                      <div
                        key={cand.id}
                        onClick={() => {
                          const full = lookupCandidate(cand.id);
                          if (full) setSelectedCandidate(full);
                        }}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background-100/70 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[11px] font-semibold text-primary-600">{cand.avatar}</span>
                        </div>
                        <span className="text-sm text-foreground-700 flex-1">{cand.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cand.stageColor}`}>{cand.stage}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Candidate Detail Drawer */}
      {selectedCandidate && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => setSelectedCandidate(null)}></div>
          <div className="fixed inset-y-0 right-0 w-full max-w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-background-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-600">{selectedCandidate.avatar}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">{selectedCandidate.name}</h2>
                  <p className="text-xs text-foreground-500">{selectedCandidate.position} · {selectedCandidate.experienceYears}经验 · {selectedCandidate.education}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Current Status */}
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${selectedCandidate.stageColor}`}>{selectedCandidate.currentStage}</span>
                  {selectedCandidate.myScore !== null && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary-50 text-primary-700">我的评分 {selectedCandidate.myScore}/10</span>
                  )}
                </div>
                <p className="text-sm text-accent-700 leading-relaxed">{selectedCandidate.latestActivity}</p>
              </div>

              {/* Resume Summary */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                  <i className="ri-file-text-line text-foreground-500"></i> 简历摘要
                </h4>
                <p className="text-sm text-foreground-600 leading-relaxed bg-background-50 rounded-lg p-3">{selectedCandidate.resumeSummary}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedCandidate.skills.map((s) => (
                    <span key={s} className="text-[11px] bg-secondary-100 text-secondary-700 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>

              {/* My Evaluation */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-2 flex items-center gap-2">
                  <i className="ri-star-line text-foreground-500"></i> 我的轮次与评价
                </h4>
                <div className="bg-background-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground-500">面试轮次</span>
                    <span className="text-sm font-semibold text-foreground-900">{selectedCandidate.myRound}</span>
                  </div>
                  {selectedCandidate.myScore !== null ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-foreground-500">我的评分</span>
                        <span className="text-lg font-bold text-primary-700">{selectedCandidate.myScore}/10</span>
                      </div>
                      <p className="text-sm text-foreground-600 leading-relaxed bg-primary-50 rounded-lg p-2.5">{selectedCandidate.myEvaluation}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-400">尚未提交评价</p>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground-900 mb-3 flex items-center gap-2">
                  <i className="ri-history-line text-foreground-500"></i> 招聘流程时间线
                </h4>
                <div className="relative pl-6">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-background-200"></div>
                  <div className="space-y-4">
                    {selectedCandidate.timeline.map((event, i) => (
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