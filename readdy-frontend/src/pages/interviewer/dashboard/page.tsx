import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { useCompanyAuth } from '@/auth/companyAuth';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { interviewsApi } from '@/features/interviews/api';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import {
  localReminderKind,
  type LocalInterviewReminderKind,
} from '@/features/interviews/localReminders';
import type { InterviewAssignment } from '@/features/interviews/types';

const reminderPriority: Record<LocalInterviewReminderKind, number> = {
  needs_feedback: 0,
  needs_confirmation: 1,
  starting_soon: 2,
};

const reminderPresentation = {
  needs_feedback: {
    label: '待评价',
    action: '去评价',
    icon: 'ri-survey-line',
    tone: 'bg-violet-100 text-violet-700',
  },
  needs_confirmation: {
    label: '超时待确认',
    action: '去确认',
    icon: 'ri-timer-line',
    tone: 'bg-amber-100 text-amber-700',
  },
  starting_soon: {
    label: '两小时内开始',
    action: '查看',
    icon: 'ri-calendar-event-line',
    tone: 'bg-primary-100 text-primary-700',
  },
  other: {
    label: '其他任务',
    action: '查看',
    icon: 'ri-calendar-line',
    tone: 'bg-background-100 text-foreground-600',
  },
} as const;

export default function InterviewerDashboardPage() {
  const navigate = useNavigate();
  const { name } = useCompanyAuth();
  const [reviews, setReviews] = useState<BusinessReviewTask[]>([]);
  const [assignments, setAssignments] = useState<InterviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewLoadFailed, setReviewLoadFailed] = useState(false);
  const [interviewLoadFailed, setInterviewLoadFailed] = useState(false);

  const loadWork = useCallback(async () => {
    setLoading(true);
    const [reviewResult, interviewResult] = await Promise.allSettled([
      businessReviewsApi.listMine(),
      interviewsApi.listMyAssignments(),
    ]);
    setErrors([
      ...(reviewResult.status === 'rejected' ? ['业务筛选数据暂不可用'] : []),
      ...(interviewResult.status === 'rejected' ? ['面试数据暂不可用'] : []),
    ]);
    setReviewLoadFailed(reviewResult.status === 'rejected');
    setInterviewLoadFailed(interviewResult.status === 'rejected');
    if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value.items);
    if (interviewResult.status === 'fulfilled') setAssignments(interviewResult.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadWork();
    const refresh = () => void loadWork();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadWork]);

  const interviewWork = useMemo(() => assignments
    .filter((item) => !item.feedback_submitted)
    .map((item) => ({ item, kind: localReminderKind(item) }))
    .sort((left, right) => {
      const leftPriority = left.kind ? reminderPriority[left.kind] : 3;
      const rightPriority = right.kind ? reminderPriority[right.kind] : 3;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.item.scheduled_at || '').localeCompare(String(right.item.scheduled_at || ''));
    }), [assignments]);

  const work = useMemo(() => ({
    pendingReviews: reviews.filter((item) => item.status === 'pending'),
    needsFeedback: interviewWork.filter((entry) => entry.kind === 'needs_feedback'),
    needsConfirmation: interviewWork.filter((entry) => entry.kind === 'needs_confirmation'),
    startingSoon: interviewWork.filter((entry) => entry.kind === 'starting_soon'),
    urgentCount: interviewWork.filter((entry) => entry.kind !== null).length,
  }), [interviewWork, reviews]);

  return (
    <div className="space-y-5 p-6" data-ui="real-interviewer-dashboard">
      <PageHeader
        title="工作台"
        description={`你好，${name || '面试官'}。这里只展示真实分配给你的任务。`}
        actions={(
          <button type="button" onClick={() => void loadWork()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-600 disabled:opacity-60">
            <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />刷新
          </button>
        )}
      />

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">部分数据暂不可用</p>
          <p className="mt-1 text-xs">{errors.join('、')}，请刷新重试。</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['待面试官筛选', (loading || reviewLoadFailed) ? '—' : work.pendingReviews.length, 'ri-file-search-line', '/interviewer/screening'],
          ['待提交评价', (loading || interviewLoadFailed) ? '—' : work.needsFeedback.length, 'ri-survey-line', '/interviewer/interviews'],
          ['超时待确认', (loading || interviewLoadFailed) ? '—' : work.needsConfirmation.length, 'ri-timer-line', '/interviewer/interviews'],
          ['两小时内开始', (loading || interviewLoadFailed) ? '—' : work.startingSoon.length, 'ri-calendar-event-line', '/interviewer/interviews'],
        ].map(([label, count, icon, path]) => (
          <button key={String(label)} type="button" onClick={() => navigate(String(path))} className="rounded-xl border border-background-200 bg-white p-4 text-left hover:border-primary-300 hover:bg-primary-50/30">
            <div className="flex items-center justify-between"><span className="text-sm text-foreground-500">{label}</span><i className={`${icon} text-lg text-primary-600`} /></div>
            <p className="mt-2 text-2xl font-bold text-foreground-900">{count}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground-900">待面试官筛选</h2>
            <p className="mt-0.5 text-xs text-foreground-500">查看完整简历和需求后，再给出明确结论</p>
          </div>
          <div className="divide-y divide-background-100">
            {work.pendingReviews.map((task) => (
              <button key={task.id} type="button" onClick={() => navigate(`/interviewer/screening?task=${task.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-sm font-bold text-amber-700">{task.candidate.name_masked.slice(0, 1) || '候'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground-900">{task.candidate.name_masked}</span><span className="mt-0.5 block truncate text-xs text-foreground-500">{task.demand.job_title} · {task.demand.department || '部门未填写'}</span></span>
                <span className="text-xs font-medium text-primary-600">去筛选</span>
              </button>
            ))}
            {!loading && !reviewLoadFailed && work.pendingReviews.length === 0 && <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有待面试官筛选的简历</div>}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground-900">我的面试任务</h2>
            <p className="mt-0.5 text-xs text-foreground-500">按任务紧急程度排序，点击可直接处理</p>
          </div>
          <div className="divide-y divide-background-100">
            {!loading && !interviewLoadFailed && work.urgentCount === 0 && (
              <div className="bg-primary-50/40 px-5 py-3 text-sm text-primary-700">
                当前没有需要立即处理的面试
              </div>
            )}
            {interviewWork.slice(0, 8).map(({ item, kind }) => {
              const presentation = reminderPresentation[kind || 'other'];
              return (
                <button key={item.id} type="button" onClick={() => navigate(`/interviewer/interviews?assignment=${item.id}&demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${presentation.tone}`}><i className={presentation.icon} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground-900">{item.name_masked || `候选人 #${item.candidate_id}`}</span>
                      <span className="shrink-0 rounded-full bg-background-100 px-2 py-0.5 text-[11px] text-foreground-600">{presentation.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-foreground-500">{item.job_title || `岗位 #${item.job_id}`} · {formatInterviewDateTime(item.scheduled_at)}</span>
                  </span>
                  <span className="text-xs font-medium text-primary-600">{presentation.action}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
