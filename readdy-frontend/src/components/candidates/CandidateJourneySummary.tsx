import { BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDot, FileCheck2, MessageSquareText, XCircle } from 'lucide-react';
import type { CandidateJourney } from '@/features/candidates/types';

const approvalLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const reviewLabels: Record<string, string> = {
  pending: '待处理',
  approved: '已通过',
  rejected: '不合适',
  needs_info: '待补充',
};

const offerLabels: Record<string, string> = {
  draft: '草稿',
  pending: '审批中',
  approved: '待发放',
  rejected: '已退回',
  sent: '已发放',
  accepted: '已接受',
  declined: '已拒绝',
  withdrawn: '已撤回',
  expired: '已过期',
  onboarded: '已入职',
};

const interviewStatusLabels: Record<string, string> = {
  scheduled: '已安排',
  awaiting_feedback: '待反馈',
  feedback_submitted: '评价已提交',
  completed: '已完成',
  cancelled: '已取消',
};

function formatDate(value: string | null) {
  if (!value) return '时间未记录';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

function statusTone(value: string) {
  if (['approved', 'accepted', 'onboarded', 'completed', 'feedback_submitted'].includes(value)) return 'bg-emerald-50 text-emerald-700';
  if (['rejected', 'declined', 'expired', 'withdrawn'].includes(value)) return 'bg-stone-100 text-stone-600';
  return 'bg-amber-50 text-amber-700';
}

export default function CandidateJourneySummary({
  journey,
  interviewOnly = false,
}: {
  journey: CandidateJourney;
  interviewOnly?: boolean;
}) {
  const approval = journey.demand_approval;
  const offerStageFallback = journey.current_stage === 'offer'
    ? '已进入 Offer，待登记 OA 结果'
    : journey.current_stage === 'onboarded'
      ? '已进入入职阶段'
      : '暂未进入 Offer';
  return (
    <section data-ui="candidate-journey-summary" className="rounded-lg border border-background-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><BriefcaseBusiness size={16} />{interviewOnly ? '历史面试评价与操作记录' : '完整招聘过程'}</h3>
          <p className="mt-1 text-xs text-foreground-500">{journey.job_title || '岗位未显示'} · 只读记录</p>
        </div>
        <span className="rounded-full bg-background-100 px-2.5 py-1 text-xs text-foreground-600">需求 #{journey.demand_id}</span>
      </div>

      <div className="mt-4 space-y-4">
        {!interviewOnly && <div className="rounded-lg bg-background-50 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-700"><FileCheck2 size={14} />需求审核记录</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(approval.status)}`}>{approvalLabels[approval.status] || approval.status}</span>
          </div>
          <div className="mt-2 grid gap-2 text-xs text-foreground-600 sm:grid-cols-2">
            <p>提交：{approval.submitted_by_name || '未记录'} · {formatDate(approval.submitted_at)}</p>
            <p>审核：{approval.reviewed_by_name || '尚未审核'} · {formatDate(approval.reviewed_at)}</p>
          </div>
          {approval.reason && <p className="mt-2 text-xs text-foreground-600">审核说明：{approval.reason}</p>}
        </div>}

        {!interviewOnly && <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-700"><MessageSquareText size={14} />业务筛选</p>
          {journey.business_reviews.length > 0 ? (
            <div className="mt-2 space-y-2">
              {journey.business_reviews.map((item) => (
                <div key={item.id} className="rounded-lg border border-background-100 px-3 py-2.5 text-xs text-foreground-600">
                  <div className="flex items-center justify-between gap-2"><span>{item.reviewer_name || '业务负责人未记录'}</span><span className={`rounded-full px-2 py-0.5 ${statusTone(item.status)}`}>{reviewLabels[item.status] || item.status}</span></div>
                  <p className="mt-1">推送：{formatDate(item.created_at)}{item.decided_at ? ` · 处理：${formatDate(item.decided_at)}` : ''}</p>
                  {(item.business_note || item.hr_note) && <p className="mt-1 text-foreground-700">{item.business_note || item.hr_note}</p>}
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-xs text-foreground-400">暂无业务筛选记录</p>}
        </div>}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-700"><CalendarClock size={14} />面试过程</p>
            <p className="text-[11px] text-foreground-400">各轮评价独立提交，提交后可只读参考</p>
          </div>
          {journey.interview_rounds.length > 0 ? (
            <div className="mt-2 space-y-2">
              {journey.interview_rounds.map((item) => {
                const feedbackFailed = item.feedback?.passed === false;
                const feedbackPassed = item.feedback?.passed === true;
                const RoundIcon = feedbackFailed ? XCircle : item.feedback ? CheckCircle2 : CircleDot;
                const resultLabel = feedbackFailed
                  ? '未通过'
                  : feedbackPassed
                    ? '通过'
                    : item.feedback
                      ? '已评价'
                      : item.status === 'awaiting_feedback'
                        ? '待反馈'
                        : item.status === 'scheduled'
                          ? '已安排'
                          : item.status === 'completed'
                            ? '已完成'
                            : interviewStatusLabels[item.status] || item.status || '状态未记录';
                return (
                  <div data-ui="interview-round-node" key={item.assignment_id} className="grid gap-2 rounded-lg border border-background-200 bg-white px-3 py-3 text-xs text-foreground-600 sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-start">
                    <span className="flex items-center gap-1.5 font-medium text-foreground-800"><RoundIcon size={14} className={feedbackFailed ? 'text-red-500' : item.feedback ? 'text-emerald-600' : 'text-amber-500'} />第 {item.round_sequence} 轮</span>
                    <div>
                      <p>{item.interviewer_name || '面试官未记录'} · {formatDate(item.scheduled_at)}</p>
                      <p className="mt-1 text-foreground-500">{item.location || '地点未记录'}{item.feedback?.note ? ` · 评价：${item.feedback.note}` : ''}</p>
                    </div>
                    <span className={`w-fit rounded-full px-2 py-0.5 ${feedbackFailed ? 'bg-red-50 text-red-700' : statusTone(item.feedback ? 'completed' : item.status)}`}>{resultLabel}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="mt-2 text-xs text-foreground-400">暂无面试记录</p>}
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-700"><CircleDot size={14} />操作记录</p>
          {journey.activity.length > 0 ? (
            <div className="mt-2 space-y-2">
              {journey.activity.map((item) => (
                <div key={item.id} className="rounded-lg border border-background-100 px-3 py-2.5 text-xs text-foreground-600">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-foreground-800">{item.title}</span><span>{formatDate(item.occurred_at)}</span></div>
                  <p className="mt-1">{item.actor_name} · {item.detail}</p>
                  <p className="mt-1 text-foreground-500">原因：{item.reason}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-xs text-foreground-400">暂无操作记录</p>}
        </div>

        {!interviewOnly && <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-700"><CheckCircle2 size={14} />Offer</p>
          {journey.offers.length > 0 ? (
            <div className="mt-2 space-y-2">
              {journey.offers.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-background-100 px-3 py-2.5 text-xs text-foreground-600">
                  <span>{item.salary_range || '薪资未填写'}{item.onboard_date ? ` · 预计入职 ${item.onboard_date}` : ''}</span>
                  <span className={`rounded-full px-2 py-0.5 ${statusTone(item.status)}`}>{offerLabels[item.status] || item.status}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-xs text-foreground-400">{offerStageFallback}</p>}

          {journey.timeline.length > 0 && (
            <details className="mt-3 rounded-lg bg-background-50 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-600"><CircleDot size={13} />查看全部流程节点</summary>
              <div className="mt-2 space-y-2 border-l border-background-300 pl-3">
                {journey.timeline.map((item, index) => <p key={`${item.stage}-${item.ts}-${index}`} className="text-xs text-foreground-500"><span className="font-medium text-foreground-700">{item.stage}</span> · {formatDate(item.ts)}{item.updated_by_name ? ` · ${item.updated_by_name}` : ''}{item.note ? ` · ${item.note}` : ''}</p>)}
              </div>
            </details>
          )}
        </div>}
      </div>
    </section>
  );
}
