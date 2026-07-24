import { useEffect, useMemo } from 'react';
import type { CandidateTimeline, CandidateHistoryEvent } from '@/mocks/interviews';

const eventIconMap: Record<CandidateHistoryEvent['type'], string> = {
  resume_in: 'ri-file-text-line',
  ai_screen: 'ri-robot-line',
  recruiter_screen: 'ri-user-search-line',
  interview_arrange: 'ri-calendar-schedule-line',
  interview_done: 'ri-chat-check-line',
  scorecard: 'ri-survey-line',
  result: 'ri-flag-line',
};

const eventColorMap: Record<CandidateHistoryEvent['type'], string> = {
  resume_in: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  ai_screen: 'bg-secondary-100 text-secondary-700 border-secondary-200',
  recruiter_screen: 'bg-accent-100 text-accent-700 border-accent-200',
  interview_arrange: 'bg-primary-100 text-primary-700 border-primary-200',
  interview_done: 'bg-primary-100 text-primary-700 border-primary-200',
  scorecard: 'bg-accent-100 text-accent-700 border-accent-200',
  result: 'bg-secondary-100 text-secondary-700 border-secondary-200',
};

function parseScoreFromDetail(detail: string): number | null {
  const match = detail.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? parseFloat(match[1]) : null;
}

function isPositiveResult(label: string): boolean {
  return /通过|接受|入职/.test(label);
}

function isNegativeResult(label: string): boolean {
  return /不通过|被拒|拒绝/.test(label);
}

interface ScoreSummary {
  roundLabel: string;
  score: number;
  detail: string;
}

interface Props {
  timeline: CandidateTimeline;
  onClose: () => void;
}

export default function CandidateHistoryPanel({ timeline, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const scoreSummaries = useMemo<ScoreSummary[]>(() => {
    return timeline.events
      .filter(e => e.type === 'scorecard')
      .map(e => {
        const score = parseScoreFromDetail(e.detail);
        const roundMatch = e.eventLabel.match(/(.+?评分)/);
        const roundLabel = roundMatch ? roundMatch[1] : e.eventLabel;
        return { roundLabel, score: score ?? 0, detail: e.detail };
      });
  }, [timeline.events]);

  const hasInterviews = timeline.events.some(e => e.type === 'interview_done');
  const finalResultEvent = [...timeline.events].reverse().find(e => e.type === 'result');
  const hasFinalResult = finalResultEvent && (isPositiveResult(finalResultEvent.eventLabel) || isNegativeResult(finalResultEvent.eventLabel));

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/25"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 z-50 h-full w-[520px] bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-background-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-primary-600">{timeline.name.charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-lg font-heading font-bold text-foreground-900">{timeline.name}</h2>
              <p className="text-xs text-foreground-500">{timeline.position}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-background-100 text-foreground-400 hover:text-foreground-700 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Basic Info Card */}
          <div className="bg-background-50 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400">当前阶段</span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                hasFinalResult
                  ? isPositiveResult(finalResultEvent!.eventLabel)
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-red-50 text-red-700'
                  : 'bg-primary-50 text-primary-700'
              }`}>
                {timeline.currentStage}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400">简历入库时间</span>
              <span className="text-sm font-medium text-foreground-800">{timeline.resumeReceivedAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-400">来源渠道</span>
              <span className="text-sm font-medium text-foreground-800">{timeline.applicationSource}</span>
            </div>
          </div>

          {/* Interviewer Summary */}
          {hasInterviews && (
            <div className="bg-background-50 rounded-xl p-4">
              <p className="text-xs font-medium text-foreground-500 mb-3 flex items-center gap-1.5">
                <i className="ri-user-search-line text-foreground-400"></i>
                面试官信息
              </p>
              <div className="space-y-2">
                {timeline.events
                  .filter(e => e.type === 'interview_done' || (e.type === 'interview_arrange' && e.eventLabel.includes('安排')))
                  .reduce<{ round: string; interviewer: string; date: string; isDone: boolean }[]>((acc, e, idx) => {
                    const roundMatch = e.eventLabel.match(/(.)面/);
                    const roundName = roundMatch ? `${roundMatch[1]}面` : `第${idx + 1}轮`;

                    const interviewerMatch = e.detail.match(/面试官[：:]\s*(.+?)[（(]/);
                    const interviewer = interviewerMatch ? interviewerMatch[1] : '待定';

                    const isDone = e.type === 'interview_done';

                    const exists = acc.find(a => a.round === roundName);
                    if (exists) {
                      if (isDone) {
                        exists.interviewer = interviewer;
                        exists.isDone = true;
                        exists.date = e.date;
                      }
                    } else {
                      acc.push({ round: roundName, interviewer, date: e.date, isDone });
                    }
                    return acc;
                  }, [])
                  .map((info, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${info.isDone ? 'bg-primary-400' : 'bg-amber-400'}`}></span>
                        <span className="text-foreground-600 font-medium">{info.round}</span>
                      </div>
                      <span className="text-foreground-800">{info.interviewer}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Score Summary Cards */}
          {scoreSummaries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground-500 flex items-center gap-1.5">
                <i className="ri-survey-line text-foreground-400"></i>
                各轮评分
              </p>
              <div className="grid grid-cols-2 gap-3">
                {scoreSummaries.map((s, idx) => (
                  <div key={idx} className="bg-accent-50 rounded-xl p-4">
                    <p className="text-xs text-accent-700 font-medium mb-1">{s.roundLabel}</p>
                    <p className="text-2xl font-heading font-bold text-accent-700">{s.score.toFixed(1)}</p>
                    <p className="text-[11px] text-accent-500 mt-0.5">满分 10.0</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Result Card */}
          {hasFinalResult && finalResultEvent && (
            <div className={`rounded-xl p-4 ${
              isPositiveResult(finalResultEvent.eventLabel) ? 'bg-primary-50' : 'bg-red-50'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <i className={`text-lg ${
                  isPositiveResult(finalResultEvent.eventLabel)
                    ? 'ri-check-double-line text-primary-600'
                    : 'ri-close-circle-line text-red-600'
                }`}></i>
                <p className={`text-sm font-semibold ${
                  isPositiveResult(finalResultEvent.eventLabel) ? 'text-primary-700' : 'text-red-700'
                }`}>
                  {finalResultEvent.eventLabel}
                </p>
              </div>
              <p className={`text-xs leading-relaxed ${
                isPositiveResult(finalResultEvent.eventLabel) ? 'text-primary-600' : 'text-red-600'
              }`}>
                {finalResultEvent.detail}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-heading font-semibold text-foreground-800 mb-4 flex items-center gap-2">
              <i className="ri-history-line text-foreground-400"></i>
              完整历程
            </h3>
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-background-200 rounded-full" />
              <div className="space-y-5">
                {timeline.events.map((event, idx) => (
                  <div key={idx} className="relative flex gap-4">
                    <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${eventColorMap[event.type]}`}>
                      <i className={`${eventIconMap[event.type]} text-sm`}></i>
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground-800">{event.eventLabel}</span>
                        <span className="text-[11px] text-foreground-400">{event.date}</span>
                      </div>
                      <p className="text-sm text-foreground-500 leading-relaxed">{event.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}