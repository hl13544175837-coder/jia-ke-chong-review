import { useState } from 'react';
import type { Interview, ScoreDimension } from '@/mocks/interviews';
import { candidateTimelines } from '@/mocks/interviews';

interface InterviewDetailDrawerProps {
  interview: Interview;
  onClose: () => void;
  onReschedule?: (interview: Interview) => void;
  onViewScorecard?: (interview: Interview) => void;
  onViewHistory?: (interview: Interview) => void;
  onProcessResult?: (interview: Interview) => void;
  onSchedule?: (interview: Interview) => void;
  onRemind?: (interview: Interview) => void;
  onCancel?: (interview: Interview) => void;
  onMarkComplete?: (interview: Interview) => void;
  userRole: string;
}

const statusLabelMap: Record<string, string> = {
  '待安排': '待安排',
  '待面试': '待面试',
  '待面试反馈': '待反馈',
  '待处理结果': '待处理',
  '已处理': '已处理',
};

const statusColorMap: Record<string, string> = {
  '待安排': 'bg-amber-50 text-amber-700 border border-amber-200',
  '待面试': 'bg-primary-50 text-primary-700 border border-primary-200',
  '待面试反馈': 'bg-accent-50 text-accent-700 border border-accent-200',
  '待处理结果': 'bg-primary-50 text-primary-700 border border-primary-200',
  '已处理': 'bg-background-100 text-foreground-500 border border-background-200',
};

export default function InterviewDetailDrawer({
  interview,
  onClose,
  onReschedule,
  onViewScorecard,
  onViewHistory,
  onProcessResult,
  onSchedule,
  onRemind,
  onCancel,
  onMarkComplete,
  userRole,
}: InterviewDetailDrawerProps) {
  const [activeSection, setActiveSection] = useState<'info' | 'feedback' | 'history'>('info');
  const timeline = candidateTimelines[interview.candidateName];

  const getStatusLabel = (status: string) => statusLabelMap[status] || status;

  const hasScores = interview.scores && interview.scores.some(s => s.score !== null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}></div>
      <div className="relative w-full max-w-[520px] bg-white shadow-xl h-full overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 border-b border-background-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-600">{interview.candidateAvatar}</span>
            </div>
            <div>
              <h3 className="text-base font-heading font-bold text-foreground-900">{interview.candidateName}</h3>
              <p className="text-xs text-foreground-500">{interview.position}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background-100 cursor-pointer transition-colors">
            <i className="ri-close-line text-foreground-500"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColorMap[interview.status]}`}>
              {getStatusLabel(interview.status)}
            </span>
            {((interview.status === '待处理结果' || interview.status === '已处理') && interview.overall) && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${interview.overall === '通过' ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {interview.overall}
              </span>
            )}
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit">
            <button
              onClick={() => setActiveSection('info')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${activeSection === 'info' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              面试信息
            </button>
            <button
              onClick={() => setActiveSection('feedback')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${activeSection === 'feedback' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              反馈内容
            </button>
            <button
              onClick={() => setActiveSection('history')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors ${activeSection === 'history' ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'}`}
            >
              操作记录
            </button>
          </div>

          {/* Info Section */}
          {activeSection === 'info' && (
            <div className="space-y-4">
              {/* Candidate Summary */}
              <div className="bg-background-50 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">候选人摘要</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-foreground-400">候选人</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.candidateName}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">当前状态</p>
                    <p className="text-sm font-medium text-foreground-800">{getStatusLabel(interview.status)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">应聘岗位</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.position}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">招聘需求</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.reqName || '未关联'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">来源</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.source || '未标注'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">招聘专员</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.recruiter}</p>
                  </div>
                </div>
              </div>

              {/* Interview Details */}
              <div className="bg-background-50 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">面试详情</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-foreground-400">面试轮次</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.stage}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">面试形式</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.type || '待定'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">面试官</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.interviewer || '待定'}</p>
                    {interview.interviewerRole && (
                      <p className="text-[11px] text-foreground-400">{interview.interviewerRole}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-foreground-400">面试时间</p>
                    <p className="text-sm font-medium text-foreground-800">
                      {interview.scheduledAt || '待安排'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-foreground-400">面试地点</p>
                    <p className="text-sm font-medium text-foreground-800">{interview.location || '待定'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Section */}
          {activeSection === 'feedback' && (
            <div className="space-y-4">
              {hasScores ? (
                <>
                  <div className="bg-background-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">维度评分</h4>
                    <div className="space-y-2.5">
                      {interview.scores.filter((s: ScoreDimension) => s.score !== null).map((s: ScoreDimension) => (
                        <div key={s.dimension} className="flex items-center justify-between">
                          <span className="text-sm text-foreground-700">{s.dimension}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-1.5 bg-background-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${(s.score || 0) >= 8 ? 'bg-primary-400' : (s.score || 0) >= 6 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width: `${((s.score || 0) / s.max) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-semibold text-foreground-800 w-6 text-right">{s.score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {interview.feedback && (
                    <div className="bg-background-50 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-foreground-500 uppercase tracking-wide">综合评价</h4>
                      <p className="text-sm text-foreground-700 leading-relaxed">{interview.feedback}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-background-50 rounded-xl p-8 text-center">
                  <div className="w-10 h-10 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
                    <i className="ri-survey-line text-foreground-400"></i>
                  </div>
                  <p className="text-sm text-foreground-500">暂无反馈内容</p>
                  <p className="text-xs text-foreground-400 mt-1">面试完成后将在此展示评分与反馈</p>
                </div>
              )}
            </div>
          )}

          {/* History Section */}
          {activeSection === 'history' && (
            <div className="space-y-4">
              {timeline ? (
                <div className="relative pl-6 border-l-2 border-background-200 space-y-4">
                  {timeline.events.map((event, idx) => (
                    <div key={idx} className="relative">
                      <div className={`absolute -left-[25px] w-2.5 h-2.5 rounded-full border-2 border-white ${
                        event.type === 'result' ? 'bg-primary-400' :
                        event.type === 'scorecard' ? 'bg-accent-400' :
                        event.type === 'interview_done' ? 'bg-primary-400' :
                        event.type === 'interview_arrange' ? 'bg-amber-400' :
                        'bg-background-300'
                      }`}></div>
                      <div>
                        <p className="text-[11px] text-foreground-400">{event.date}</p>
                        <p className="text-sm font-medium text-foreground-800 mt-0.5">{event.eventLabel}</p>
                        <p className="text-xs text-foreground-500 mt-1 leading-relaxed">{event.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-background-50 rounded-xl p-8 text-center">
                  <p className="text-sm text-foreground-500">暂无操作记录</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-background-200 px-6 py-4 flex items-center gap-3">
          {interview.status === '待安排' && (
            <>
              <button
                onClick={() => onSchedule?.(interview)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <i className="ri-calendar-schedule-line mr-1.5"></i>
                安排面试
              </button>
              {userRole !== 'interviewer' && (
                <button
                  onClick={() => onCancel?.(interview)}
                  className="px-4 py-2.5 text-sm font-medium text-foreground-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  取消
                </button>
              )}
            </>
          )}
          {interview.status === '待面试' && (
            <>
              <button
                onClick={() => onReschedule?.(interview)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <i className="ri-eye-line mr-1.5"></i>
                查看/调整
              </button>
              <button
                onClick={() => onMarkComplete?.(interview)}
                className="px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <i className="ri-check-double-line mr-1.5"></i>
                标记完成
              </button>
              {userRole !== 'interviewer' && (
                <button
                  onClick={() => onViewHistory?.(interview)}
                  className="px-4 py-2.5 text-sm font-medium text-foreground-500 hover:bg-background-100 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <i className="ri-history-line mr-1.5"></i>
                  历史记录
                </button>
              )}
            </>
          )}
          {interview.status === '待面试反馈' && (
            <>
              {userRole !== 'interviewer' ? (
                <>
                  <button
                    onClick={() => onRemind?.(interview)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <i className="ri-notification-3-line mr-1.5"></i>
                    催反馈
                  </button>
                  <button
                    onClick={() => onViewScorecard?.(interview)}
                    className="px-4 py-2.5 text-sm font-medium text-foreground-500 hover:bg-background-100 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    查看反馈
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onViewScorecard?.(interview)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-accent-500 hover:bg-accent-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <i className="ri-survey-line mr-1.5"></i>
                  去评分
                </button>
              )}
            </>
          )}
          {interview.status === '待处理结果' && (
            <button
              onClick={() => onProcessResult?.(interview)}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <i className="ri-arrow-right-circle-line mr-1.5"></i>
              处理面试结果
            </button>
          )}
          {interview.status === '已处理' && (
            <button
              onClick={() => onViewScorecard?.(interview)}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-background-100 hover:bg-background-200 text-foreground-700 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <i className="ri-eye-line mr-1.5"></i>
              查看结果
            </button>
          )}
        </div>
      </div>
    </div>
  );
}