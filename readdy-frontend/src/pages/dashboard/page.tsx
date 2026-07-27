import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { demandsApi } from '@/features/demands/api';
import { interviewsApi } from '@/features/interviews/api';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import { offersApi } from '@/features/offers/api';
import type { OfferStatus } from '@/features/offers/types';
import { buildDashboardSummary, type DashboardFacts } from './summary';

const emptyFacts: DashboardFacts = {
  demands: [],
  interviews: [],
  offers: [],
  reviews: [],
};

const offerStatusLabels: Record<OfferStatus, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '待发放',
  sent: '待回复',
  accepted: '待入职',
  declined: '已拒绝',
  withdrawn: '已撤回',
  expired: '已过期',
  onboarded: '已入职',
};

type DashboardPanel = 'headcount' | 'tasks' | 'waiting' | 'interviews';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { name, role, userId } = useCompanyAuth();
  const [facts, setFacts] = useState<DashboardFacts>(emptyFacts);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<DashboardPanel | null>(null);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      demandsApi.listDemands(),
      interviewsApi.listManagementRows(),
      offersApi.listOffers(),
      businessReviewsApi.listForHr(),
    ]);
    const labels = ['需求', '面试', 'Offer', '业务筛选'];
    setErrors(results.flatMap((result, index) => (
      result.status === 'rejected' ? [`${labels[index]}数据暂不可用`] : []
    )));
    setFacts((current) => ({
      demands: results[0].status === 'fulfilled' ? results[0].value.items : current.demands,
      interviews: results[1].status === 'fulfilled' ? results[1].value : current.interviews,
      offers: results[2].status === 'fulfilled' ? results[2].value.items : current.offers,
      reviews: results[3].status === 'fulfilled' ? results[3].value.items : current.reviews,
    }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFacts();
    const refresh = () => void loadFacts();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadFacts]);

  const summary = useMemo(() => buildDashboardSummary(facts, role), [facts, role]);
  const assignedBusinessReviews = useMemo(
    () => summary.pendingReviews.filter((item) => item.reviewer_id === userId),
    [summary.pendingReviews, userId],
  );
  const reviewsWaitingForOthers = useMemo(
    () => summary.pendingReviews.filter((item) => item.reviewer_id !== userId),
    [summary.pendingReviews, userId],
  );
  const myTaskCount = summary.myTaskCount + assignedBusinessReviews.length;
  const waitingOthersCount = Math.max(0, summary.waitingOthersCount - assignedBusinessReviews.length);

  const togglePanel = (panel: DashboardPanel) => {
    setExpandedPanel((current) => (current === panel ? null : panel));
  };

  const cards: Array<{
    panel: DashboardPanel;
    controls: string;
    label: string;
    value: number;
    note: string;
    icon: string;
  }> = [
    {
      panel: 'headcount',
      controls: 'dashboard-headcount-panel',
      label: '剩余 HC',
      value: summary.gap,
      note: `${summary.activeDemands.length} 个生效需求`,
      icon: 'ri-briefcase-line',
    },
    {
      panel: 'tasks',
      controls: 'dashboard-tasks-panel',
      label: '我的待办',
      value: myTaskCount,
      note: '需要你推进或确认',
      icon: 'ri-checkbox-circle-line',
    },
    {
      panel: 'waiting',
      controls: 'dashboard-waiting-panel',
      label: '等待他人处理',
      value: waitingOthersCount,
      note: '业务反馈、面试评价或外部回复',
      icon: 'ri-time-line',
    },
    {
      panel: 'interviews',
      controls: 'dashboard-interviews-panel',
      label: '近期面试',
      value: summary.scheduledInterviews.length,
      note: '已创建站内日程',
      icon: 'ri-calendar-event-line',
    },
  ];

  return (
    <div className="space-y-5 p-6" data-ui="real-recruitment-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground-900">工作台</h1>
          <p className="mt-1 text-sm text-foreground-500">
            {greeting()}，{name || (role === 'manager' ? '招聘经理' : '招聘专员')}。这里展示当前账号可见的真实招聘数据。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadFacts()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-60"
        >
          <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">部分数据暂不可用</p>
          <p className="mt-1 text-xs">{errors.join('、')}，页面保留上次成功结果，请刷新重试。</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            aria-expanded={expandedPanel === card.panel}
            aria-controls={card.controls}
            onClick={() => togglePanel(card.panel)}
            className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
              expandedPanel === card.panel
                ? 'border-primary-300 bg-primary-50/60'
                : 'border-background-200 bg-white hover:border-primary-200 hover:bg-background-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-500">{card.label}</span>
              <span className="flex items-center gap-2 text-primary-600">
                <i className={`${card.icon} text-lg`} />
                <i className={expandedPanel === card.panel ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground-900">{loading ? '—' : card.value}</p>
            <p className="mt-1 text-xs text-foreground-400">{card.note}</p>
          </button>
        ))}
      </div>

      {(expandedPanel === 'tasks' || expandedPanel === 'waiting') && (
        <div className="grid gap-5">
          {expandedPanel === 'tasks' && (
            <section id="dashboard-tasks-panel" className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">我的待办</h2>
              <p className="mt-0.5 text-xs text-foreground-500">只放当前需要你亲自推进或确认的事项</p>
            </div>
          </div>
          <div className="divide-y divide-background-100">
            {summary.pendingApprovals.length > 0 && (
              <button type="button" onClick={() => navigate('/jobs')} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><i className="ri-shield-check-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{summary.pendingApprovals.length} 个需求待你审核</span><span className="mt-0.5 block text-xs text-foreground-500">审核通过后才能正式进入招聘流程</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            )}
            {summary.completionDemands.slice(0, 3).map((demand) => (
              <button key={`completion-${demand.id}`} type="button" onClick={() => navigate(`/jobs?demand=${demand.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-700"><i className="ri-flag-line" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground-900">
                    {demand.metrics.over_headcount > 0
                      ? `${demand.job_title} 已超出 HC ${demand.metrics.over_headcount} 人`
                      : `${demand.job_title} HC 已达成`}
                  </span>
                  <span className="mt-0.5 block text-xs text-foreground-500">请核对入职记录，并确认是否完成或调整需求</span>
                </span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {assignedBusinessReviews.map((item) => (
              <button key={`assigned-review-${item.id}`} type="button" onClick={() => navigate(`/interviewer/screening?task=${item.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><i className="ri-file-search-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.candidate.name_masked} 需要你业务筛选</span><span className="mt-0.5 block text-xs text-foreground-500">{item.demand.job_title} · 查看简历后给出结论</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {summary.myOfferActions.slice(0, 3).map((item) => (
              <button key={`offer-${item.id}`} type="button" onClick={() => navigate('/offers')} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><i className="ri-mail-send-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.candidate_name} 的 Offer 需要你处理</span><span className="mt-0.5 block text-xs text-foreground-500">{item.position} · 当前状态 {offerStatusLabels[item.status]}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {!loading && myTaskCount === 0 && (
              <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有需要你处理的待办</div>
            )}
          </div>
            </section>
          )}

          {expandedPanel === 'waiting' && (
            <section id="dashboard-waiting-panel" className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="border-b border-background-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">等待他人处理</h2>
              <p className="mt-0.5 text-xs text-foreground-500">这些事项已经交出去，当前重点是跟进而不是重复操作</p>
            </div>
          </div>
          <div className="divide-y divide-background-100">
            {reviewsWaitingForOthers.slice(0, 3).map((item) => (
              <button key={`review-${item.id}`} type="button" onClick={() => navigate(`/candidates?demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700"><i className="ri-file-search-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.candidate.name_masked} 等待业务筛选</span><span className="mt-0.5 block text-xs text-foreground-500">{item.demand.job_title} · {item.reviewer_name || '业务负责人未显示'}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {summary.waitingFeedback.slice(0, 3).map((item) => (
              <button key={`feedback-${item.assignment_id}`} type="button" onClick={() => navigate(`/interviews?demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><i className="ri-survey-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.name_masked} 等待面试反馈</span><span className="mt-0.5 block text-xs text-foreground-500">{item.job_title} · {item.interviewer_name || '面试官未填写'}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {summary.waitingOfferActions.slice(0, 3).map((item) => (
              <button key={`waiting-offer-${item.id}`} type="button" onClick={() => navigate('/offers')} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><i className="ri-hourglass-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.candidate_name} 的 Offer {item.status === 'pending' ? '等待主管审批' : item.status === 'sent' ? '等待候选人回复' : '等待招聘专员推进'}</span><span className="mt-0.5 block text-xs text-foreground-500">{item.position} · 当前状态 {offerStatusLabels[item.status]}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {!loading && waitingOthersCount === 0 && (
              <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有正在等待他人处理的事项</div>
            )}
          </div>
            </section>
          )}
        </div>
      )}

      {expandedPanel === 'headcount' && (
        <section id="dashboard-headcount-panel" className="overflow-hidden rounded-xl border border-background-200 bg-white">
        <div className="border-b border-background-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground-900">生效需求进展</h2>
          <p className="mt-0.5 text-xs text-foreground-500">按需求查看 HC、业务筛选、面试、Offer 与入职进度</p>
        </div>
        <div className="grid divide-y divide-background-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
          {summary.activeDemands.slice(0, 6).map((demand) => (
            <button key={demand.id} type="button" onClick={() => navigate(`/jobs?demand=${demand.id}`)} className="block px-5 py-4 text-left hover:bg-background-50">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground-900">{demand.job_title}</span>
                <span className="whitespace-nowrap text-xs text-foreground-500">HC {demand.metrics.onboarded_count}/{demand.headcount}{demand.metrics.accepted_offer_count > 0 ? ` · 已锁 ${demand.metrics.accepted_offer_count}` : ''}</span>
              </div>
              <p className="mt-1 text-xs text-foreground-500">{demand.request_no} · {demand.job_city} · {demand.owner_hr_name}</p>
              <p className="mt-2 text-xs text-foreground-400">业务筛选 {demand.metrics.business_review_count} · 面试 {demand.metrics.interview_count} · Offer {demand.metrics.offer_count} · 入职 {demand.metrics.onboarded_count}</p>
            </button>
          ))}
          {!loading && summary.activeDemands.length === 0 && (
            <div className="px-5 py-12 text-sm text-foreground-500">暂无生效需求，请先在需求审核中创建或审批需求</div>
          )}
        </div>
        </section>
      )}

      {expandedPanel === 'interviews' && (
        <section id="dashboard-interviews-panel" className="rounded-xl border border-background-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground-900">近期已排面试</h2>
          <p className="mt-0.5 text-xs text-foreground-500">站内日程是真实数据；企业微信和外部日历仍待接入</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary.scheduledInterviews.slice(0, 6).map((item) => (
            <button key={item.assignment_id} type="button" onClick={() => navigate(`/interviews?demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="rounded-lg border border-background-200 p-3 text-left hover:border-primary-300">
              <p className="text-sm font-medium text-foreground-900">{item.name_masked} · {item.job_title}</p>
              <p className="mt-1 text-xs text-foreground-500">{formatInterviewDateTime(item.scheduled_at)} · {item.interviewer_name || '面试官待确认'}</p>
            </button>
          ))}
          {!loading && summary.scheduledInterviews.length === 0 && <p className="text-sm text-foreground-500">暂无已排面试</p>}
        </div>
        </section>
      )}
    </div>
  );
}
