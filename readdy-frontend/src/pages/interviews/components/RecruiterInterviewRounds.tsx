import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  History,
  MapPin,
  MessageSquareText,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { CandidateJourney } from '@/features/candidates/types';
import type { InterviewManagementRow, InterviewRescheduleRequest } from '@/features/interviews/types';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';

interface RecruiterInterviewRoundsProps {
  journey: CandidateJourney | null;
  row: InterviewManagementRow;
  rescheduleHistory: InterviewRescheduleRequest[];
  loading?: boolean;
  error?: string;
}

const STAGE_LABELS: Record<string, string> = {
  pending: '待筛选',
  ai_screen: 'AI 初筛',
  business_review: '业务筛选',
  interview: '面试中',
  offer: 'Offer',
  onboarded: '已入职',
  rejected: '已淘汰',
  transferred: '已转派',
};

const ROUND_STATUS_LABELS: Record<string, string> = {
  scheduled: '已安排',
  awaiting_feedback: '待反馈',
  feedback_submitted: '评价已提交',
  completed: '已完成',
  cancelled: '已取消',
};

function roundResult(round: CandidateJourney['interview_rounds'][number]): { label: string; tone: string; positive: boolean } {
  const f = round.feedback;
  if (f?.passed === true) return { label: '通过', tone: 'bg-emerald-50 text-emerald-700', positive: true };
  if (f?.passed === false) return { label: '未通过', tone: 'bg-red-50 text-red-700', positive: false };
  if (f) return { label: '已评价', tone: 'bg-blue-50 text-blue-700', positive: true };
  if (round.status === 'awaiting_feedback') return { label: '待反馈', tone: 'bg-amber-50 text-amber-700', positive: false };
  return { label: ROUND_STATUS_LABELS[round.status] || round.status || '状态未记录', tone: 'bg-stone-100 text-stone-600', positive: false };
}

function formatDateTime(value: string | null): string {
  if (!value) return '时间未记录';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed);
}

export default function RecruiterInterviewRounds({
  journey,
  row,
  rescheduleHistory,
  loading = false,
  error = '',
}: RecruiterInterviewRoundsProps) {
  const [openRoundId, setOpenRoundId] = useState<number | null>(null);

  useEffect(() => {
    if (!journey) return;
    // 默认展开"当前需处理的轮次"；若都已反馈，则展开最新一轮
    const needFeedback = journey.interview_rounds.find((r) => r.status === 'awaiting_feedback');
    const target = needFeedback ?? journey.interview_rounds[journey.interview_rounds.length - 1];
    setOpenRoundId(target ? target.assignment_id : null);
  }, [journey]);

  const rounds = useMemo(() => {
    const list = journey?.interview_rounds ? [...journey.interview_rounds].sort((a, b) => a.round_sequence - b.round_sequence) : [];
    return list;
  }, [journey]);

  const doneRounds = rounds.filter((r) => r.feedback).length;
  const latest = rounds[rounds.length - 1];
  const latestFeedback = latest?.feedback;

  const stageLabel = STAGE_LABELS[row.pipeline_stage || journey?.current_stage || ''] || journey?.current_stage || '进行中';
  const latestConclusion = latestFeedback
    ? (latestFeedback.passed === true ? `${latest.interviewer_name || '面试官'}判定通过` : latestFeedback.passed === false ? '本轮未通过' : '已提交评价')
    : latest?.status === 'awaiting_feedback'
      ? `待${latest.interviewer_name || '面试官'}提交反馈`
      : '暂无可展示结论';
  const nextStep = row.pipeline_stage === 'offer'
    ? '进入 Offer 阶段'
    : row.pipeline_stage === 'rejected'
      ? '流程已结束（已淘汰）'
      : row.pipeline_stage === 'onboarded'
        ? '候选人已入职'
        : latest?.status === 'awaiting_feedback'
          ? '等待本轮面试官反馈'
          : latest && !latest.feedback && latest.status === 'scheduled'
            ? '等待面试进行'
            : '待推进下一轮或进入 Offer';

  const roundHistory = (assignmentId: number) =>
    rescheduleHistory.filter((h) => h.assignment_id === assignmentId);

  if (loading) return <p className="py-12 text-center text-sm text-foreground-500">正在加载面试评价...</p>;
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p>{error}</p>
      </div>
    );
  }
  if (!journey) return <p className="rounded-lg bg-background-50 px-4 py-8 text-center text-sm text-foreground-500">暂无历史面试评价</p>;

  return (
    <div className="space-y-4">
      {/* 顶部摘要 */}
      <section data-ui="recruiter-round-summary" className="rounded-lg border border-background-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><BriefcaseBusiness size={16} />候选人摘要</h3>
          <span className="rounded-full bg-background-100 px-2.5 py-1 text-xs text-foreground-600">需求 #{journey.demand_id}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-foreground-400">候选人</dt><dd className="mt-0.5 font-medium text-foreground-800">{journey.name_masked}</dd></div>
          <div><dt className="text-xs text-foreground-400">应聘岗位</dt><dd className="mt-0.5 text-foreground-700">{journey.job_title || row.job_title || '未显示'}</dd></div>
          <div><dt className="text-xs text-foreground-400">当前阶段</dt><dd className="mt-0.5 text-foreground-700">{stageLabel}</dd></div>
          <div><dt className="text-xs text-foreground-400">已完成轮数</dt><dd className="mt-0.5 text-foreground-700">{doneRounds} / {rounds.length || 0} 轮</dd></div>
          <div><dt className="text-xs text-foreground-400">最新结论</dt><dd className="mt-0.5 text-foreground-700">{latestConclusion}</dd></div>
          <div><dt className="text-xs text-foreground-400">当前下一步</dt><dd className="mt-0.5 text-foreground-700">{nextStep}</dd></div>
        </dl>
      </section>

      {/* 按轮次纵向折叠 */}
      <section data-ui="recruiter-round-list" className="space-y-2">
        {rounds.length === 0 ? (
          <p className="rounded-lg bg-background-50 px-4 py-8 text-center text-sm text-foreground-500">暂无面试轮次</p>
        ) : (
          rounds.map((round) => {
            const res = roundResult(round);
            const isOpen = openRoundId === round.assignment_id;
            const history = roundHistory(round.assignment_id);
            const f = round.feedback;
            return (
              <div key={round.assignment_id} className={`overflow-hidden rounded-lg border ${isOpen ? 'border-background-300 bg-white' : 'border-background-200 bg-white'}`}>
                <button
                  type="button"
                  onClick={() => setOpenRoundId(isOpen ? null : round.assignment_id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <span data-ui="round-chevron">{isOpen ? <ChevronDown size={16} className="shrink-0 text-foreground-400" /> : <ChevronRight size={16} className="shrink-0 text-foreground-400" />}</span>
                  <span className="w-16 shrink-0 text-sm font-medium text-foreground-800">第 {round.round_sequence} 轮</span>
                  <span className="inline-flex items-center gap-1 text-xs text-foreground-600"><UserRound size={13} />{round.interviewer_name || '面试官未记录'}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-foreground-500"><CalendarClock size={13} />{formatDateTime(round.scheduled_at)}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs ${res.tone}`}>{res.label}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-background-100 px-4 py-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                      <div><dt className="text-xs text-foreground-400">面试时间</dt><dd className="mt-0.5 text-foreground-700">{formatDateTime(round.scheduled_at)}</dd></div>
                      <div><dt className="text-xs text-foreground-400">地点 / 会议链接</dt><dd className="mt-0.5 inline-flex items-center gap-1 text-foreground-700"><MapPin size={13} />{round.location || '待确认'}</dd></div>
                      <div><dt className="text-xs text-foreground-400">面试官</dt><dd className="mt-0.5 inline-flex items-center gap-1 text-foreground-700"><UserRound size={13} />{round.interviewer_name || '待安排'}</dd></div>
                      <div><dt className="text-xs text-foreground-400">面试结果</dt><dd className="mt-0.5 text-foreground-700">{res.label}</dd></div>
                      <div><dt className="text-xs text-foreground-400">评分</dt><dd className="mt-0.5 text-foreground-700">{f?.score != null ? f.score : '未评分'}</dd></div>
                      <div><dt className="text-xs text-foreground-400">提交人 / 提交时间</dt><dd className="mt-0.5 text-foreground-700">{f?.interviewer_name || '未记录'}{f?.created_at ? ` · ${formatDateTime(f.created_at)}` : ''}</dd></div>
                    </dl>

                    <div className="mt-3 space-y-2 text-sm">
                      <div className="rounded-lg bg-background-50 px-3 py-2">
                        <p className="text-xs font-medium text-foreground-700">优势</p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground-700">{f?.strengths || '未填写'}</p>
                      </div>
                      <div className="rounded-lg bg-background-50 px-3 py-2">
                        <p className="text-xs font-medium text-foreground-700">顾虑</p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground-700">{f?.concerns || '未填写'}</p>
                      </div>
                      <div className="rounded-lg bg-background-50 px-3 py-2">
                        <p className="text-xs font-medium text-foreground-700">完整评价</p>
                        <p className="mt-1 whitespace-pre-wrap text-foreground-700">{f?.note || '未填写'}</p>
                      </div>
                    </div>

                    {round.note && (
                      <p className="mt-3 rounded-lg bg-background-50 px-3 py-2 text-xs text-foreground-600">安排备注：{round.note}</p>
                    )}

                    {history.length > 0 && (
                      <details className="mt-3 rounded-lg bg-background-50 px-3 py-2" open={false}>
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-600"><History size={13} />查看该轮排期变更（{history.length}）</summary>
                        <div className="mt-2 space-y-1.5">
                          {history.map((h) => (
                            <p key={`${h.assignment_id}-${h.requested_at}-${h.id}`} className="text-xs text-foreground-500">
                              {h.source === 'recruiter_direct' ? '招聘专员调整' : `${h.requester_name || '面试官'}申请改约`}
                              {h.final_scheduled_at ? ` · 改至 ${formatDateTime(h.final_scheduled_at)}` : ''}
                              {h.processor_name ? ` · ${h.processor_name}: ${h.processor_note || '已处理'}` : ''}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* 底部：完整操作记录 + 完整流程（默认折叠） */}
      <details data-ui="recruiter-full-record" className="rounded-lg border border-background-200 bg-white px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground-700"><History size={15} />查看完整操作记录与流程</summary>
        <div className="mt-3 space-y-3 text-xs text-foreground-600">
          {journey.activity.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-foreground-700"><CircleDot size={13} />操作记录</p>
              <div className="mt-2 space-y-2">
                {journey.activity.map((item) => (
                  <div key={item.id} className="rounded-lg border border-background-100 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-foreground-800">{item.title}</span><span>{formatDateTime(item.occurred_at)}</span></div>
                    <p className="mt-1">{item.actor_name} · {item.detail}</p>
                    {item.reason && <p className="mt-1 text-foreground-500">原因：{item.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {journey.business_reviews.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-foreground-700"><MessageSquareText size={13} />业务筛选</p>
              <div className="mt-2 space-y-2">
                {journey.business_reviews.map((item) => (
                  <div key={item.id} className="rounded-lg border border-background-100 px-3 py-2.5">
                    <p>{item.reviewer_name || '业务负责人未记录'} · {formatDateTime(item.created_at)}{item.decided_at ? ` · 处理：${formatDateTime(item.decided_at)}` : ''}</p>
                    {(item.business_note || item.hr_note) && <p className="mt-1 text-foreground-700">{item.business_note || item.hr_note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {journey.offers.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-semibold text-foreground-700"><CheckCircle2 size={13} />Offer</p>
              <div className="mt-2 space-y-2">
                {journey.offers.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-background-100 px-3 py-2.5">
                    <span>{item.salary_range || '薪资未填写'}{item.onboard_date ? ` · 预计入职 ${item.onboard_date}` : ''}</span>
                    <span className="rounded-full bg-background-100 px-2 py-0.5">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {journey.demand_approval?.status && (
            <div className="rounded-lg bg-background-50 px-3 py-2">
              <p className="font-semibold text-foreground-700">需求审核</p>
              <p className="mt-1">提交：{journey.demand_approval.submitted_by_name || '未记录'} · {formatDateTime(journey.demand_approval.submitted_at)}；审核：{journey.demand_approval.reviewed_by_name || '尚未审核'} · {formatDateTime(journey.demand_approval.reviewed_at)}</p>
            </div>
          )}

          {journey.timeline.length > 0 && (
            <div className="rounded-lg bg-background-50 px-3 py-2">
              <p className="font-semibold text-foreground-700">完整流程节点</p>
              <div className="mt-2 space-y-1.5 border-l border-background-300 pl-3">
                {journey.timeline.map((item, index) => (
                  <p key={`${item.stage}-${item.ts}-${index}`}>
                    <span className="font-medium text-foreground-700">{item.stage}</span> · {formatDateTime(item.ts)}{item.updated_by_name ? ` · ${item.updated_by_name}` : ''}{item.note ? ` · ${item.note}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
