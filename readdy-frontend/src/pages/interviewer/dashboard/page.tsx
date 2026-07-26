import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { interviewsApi } from '@/features/interviews/api';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type { InterviewAssignment } from '@/features/interviews/types';

export default function InterviewerDashboardPage() {
  const navigate = useNavigate();
  const { name } = useCompanyAuth();
  const [reviews, setReviews] = useState<BusinessReviewTask[]>([]);
  const [assignments, setAssignments] = useState<InterviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

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

  const work = useMemo(() => ({
    pendingReviews: reviews.filter((item) => item.status === 'pending'),
    upcoming: assignments.filter((item) => !item.feedback_submitted && item.status !== 'awaiting_feedback'),
    feedback: assignments.filter((item) => !item.feedback_submitted && (item.status === 'awaiting_feedback' || item.is_overdue)),
    completed: assignments.filter((item) => item.feedback_submitted),
  }), [assignments, reviews]);

  return (
    <div className="space-y-5 p-6" data-ui="real-interviewer-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground-900">工作台</h1>
          <p className="mt-1 text-sm text-foreground-500">你好，{name || '面试官'}。这里只展示真实分配给你的任务。</p>
        </div>
        <button type="button" onClick={() => void loadWork()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-600 disabled:opacity-60">
          <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">部分数据暂不可用</p>
          <p className="mt-1 text-xs">{errors.join('、')}，请刷新重试。</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['待业务筛选', work.pendingReviews.length, 'ri-file-search-line', '/interviewer/screening'],
          ['待参加面试', work.upcoming.length, 'ri-calendar-event-line', '/interviewer/interviews'],
          ['待提交评价', work.feedback.length, 'ri-survey-line', '/interviewer/interviews'],
          ['已完成面试', work.completed.length, 'ri-checkbox-circle-line', '/interviewer/interviews'],
        ].map(([label, count, icon, path]) => (
          <button key={String(label)} type="button" onClick={() => navigate(String(path))} className="rounded-xl border border-background-200 bg-white p-4 text-left hover:border-primary-300 hover:bg-primary-50/30">
            <div className="flex items-center justify-between"><span className="text-sm text-foreground-500">{label}</span><i className={`${icon} text-lg text-primary-600`} /></div>
            <p className="mt-2 text-2xl font-bold text-foreground-900">{loading ? '—' : count}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground-900">待业务筛选</h2>
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
            {!loading && work.pendingReviews.length === 0 && <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有待业务筛选的简历</div>}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground-900">我的面试任务</h2>
            <p className="mt-0.5 text-xs text-foreground-500">站内日程为真实记录；企业微信日历仍待接入</p>
          </div>
          <div className="divide-y divide-background-100">
            {[...work.feedback, ...work.upcoming].slice(0, 8).map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(`/interviewer/interviews?demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.status === 'awaiting_feedback' || item.is_overdue ? 'bg-violet-100 text-violet-700' : 'bg-primary-100 text-primary-700'}`}><i className={item.status === 'awaiting_feedback' || item.is_overdue ? 'ri-survey-line' : 'ri-calendar-event-line'} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground-900">{item.name_masked || `候选人 #${item.candidate_id}`}</span><span className="mt-0.5 block truncate text-xs text-foreground-500">{item.job_title || `岗位 #${item.job_id}`} · {formatInterviewDateTime(item.scheduled_at)}</span></span>
                <span className="text-xs font-medium text-primary-600">{item.status === 'awaiting_feedback' || item.is_overdue ? '去评价' : '查看'}</span>
              </button>
            ))}
            {!loading && assignments.length === 0 && <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有分配给你的面试</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
