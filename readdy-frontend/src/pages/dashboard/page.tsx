import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { candidatesApi } from '@/features/candidates/api';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { interviewsApi } from '@/features/interviews/api';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { offersApi } from '@/features/offers/api';
import type { OfferRecord, OfferStatus } from '@/features/offers/types';

interface DashboardFacts {
  demands: RecruitmentDemand[];
  candidateTotal: number;
  interviews: InterviewManagementRow[];
  offers: OfferRecord[];
  reviews: BusinessReviewTask[];
}

const emptyFacts: DashboardFacts = {
  demands: [],
  candidateTotal: 0,
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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { name, role } = useCompanyAuth();
  const [facts, setFacts] = useState<DashboardFacts>(emptyFacts);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      demandsApi.listDemands(),
      candidatesApi.listCandidates({ page: 1, per_page: 1 }),
      interviewsApi.listManagementRows(),
      offersApi.listOffers(),
      businessReviewsApi.listForHr(),
    ]);
    const labels = ['需求', '候选人', '面试', 'Offer', '业务筛选'];
    setErrors(results.flatMap((result, index) => (
      result.status === 'rejected' ? [`${labels[index]}数据暂不可用`] : []
    )));
    setFacts((current) => ({
      demands: results[0].status === 'fulfilled' ? results[0].value.items : current.demands,
      candidateTotal: results[1].status === 'fulfilled' ? results[1].value.total : current.candidateTotal,
      interviews: results[2].status === 'fulfilled' ? results[2].value : current.interviews,
      offers: results[3].status === 'fulfilled' ? results[3].value.items : current.offers,
      reviews: results[4].status === 'fulfilled' ? results[4].value.items : current.reviews,
    }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFacts();
    const refresh = () => void loadFacts();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadFacts]);

  const summary = useMemo(() => {
    const activeDemands = facts.demands.filter((item) => item.status === 'active');
    const gap = activeDemands.reduce(
      (total, item) => total + item.metrics.remaining_headcount,
      0,
    );
    return {
      activeDemands,
      pendingApprovals: facts.demands.filter((item) => item.approval_status === 'pending').length,
      gap,
      pendingReviews: facts.reviews.filter((item) => item.status === 'pending'),
      waitingFeedback: facts.interviews.filter((item) => item.assignment_status === 'awaiting_feedback' && !item.feedback_submitted),
      scheduledInterviews: facts.interviews.filter((item) => item.assignment_status === 'scheduled'),
      offerActions: facts.offers.filter((item) => ['draft', 'pending', 'approved', 'sent', 'accepted'].includes(item.status)),
    };
  }, [facts]);

  const cards = [
    { label: '生效需求', value: summary.activeDemands.length, note: `还缺 ${summary.gap} 人`, icon: 'ri-briefcase-line', path: '/jobs' },
    { label: '候选人档案', value: facts.candidateTotal, note: '真实候选人总数', icon: 'ri-file-list-3-line', path: '/candidates' },
    { label: '待业务筛选', value: summary.pendingReviews.length, note: '等待业务负责人处理', icon: 'ri-file-search-line', path: '/candidates?stage=business_review' },
    { label: '待面试反馈', value: summary.waitingFeedback.length, note: '需要跟进面试官', icon: 'ri-survey-line', path: '/interviews' },
    { label: 'Offer 待处理', value: summary.offerActions.length, note: '草稿至待入职', icon: 'ri-mail-send-line', path: '/offers' },
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => navigate(card.path)}
            className="rounded-xl border border-background-200 bg-white p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-500">{card.label}</span>
              <i className={`${card.icon} text-lg text-primary-600`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground-900">{loading ? '—' : card.value}</p>
            <p className="mt-1 text-xs text-foreground-400">{card.note}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="flex items-center justify-between border-b border-background-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">现在最该处理</h2>
              <p className="mt-0.5 text-xs text-foreground-500">按流程阻塞程度排列，点击直接进入真实工作台</p>
            </div>
          </div>
          <div className="divide-y divide-background-100">
            {summary.pendingApprovals > 0 && (
              <button type="button" onClick={() => navigate('/jobs')} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><i className="ri-shield-check-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{summary.pendingApprovals} 个需求待审核</span><span className="mt-0.5 block text-xs text-foreground-500">审核通过后才能正式进入招聘流程</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            )}
            {summary.waitingFeedback.slice(0, 3).map((item) => (
              <button key={`feedback-${item.assignment_id}`} type="button" onClick={() => navigate(`/interviews?demand=${item.demand_id}&candidate=${item.candidate_id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><i className="ri-survey-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.name_masked} 等待面试反馈</span><span className="mt-0.5 block text-xs text-foreground-500">{item.job_title} · {item.interviewer_name || '面试官未填写'}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {summary.offerActions.slice(0, 3).map((item) => (
              <button key={`offer-${item.id}`} type="button" onClick={() => navigate('/offers')} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><i className="ri-mail-send-line" /></span>
                <span className="flex-1"><span className="block text-sm font-medium text-foreground-900">{item.candidate_name} 的 Offer 待处理</span><span className="mt-0.5 block text-xs text-foreground-500">{item.position} · 当前状态 {offerStatusLabels[item.status]}</span></span>
                <i className="ri-arrow-right-s-line text-foreground-400" />
              </button>
            ))}
            {!loading && summary.pendingApprovals === 0 && summary.waitingFeedback.length === 0 && summary.offerActions.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有阻塞流程的待办</div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
          <div className="flex items-center justify-between border-b border-background-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">生效需求进展</h2>
              <p className="mt-0.5 text-xs text-foreground-500">同一需求的候选人、面试、Offer 与入职数量</p>
            </div>
            <button type="button" onClick={() => navigate('/jobs')} className="text-xs font-medium text-primary-600">查看全部</button>
          </div>
          <div className="divide-y divide-background-100">
            {summary.activeDemands.slice(0, 6).map((demand) => (
              <button key={demand.id} type="button" onClick={() => navigate(`/jobs?demand=${demand.id}`)} className="block w-full px-5 py-4 text-left hover:bg-background-50">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground-900">{demand.job_title}</span>
                  <span className="whitespace-nowrap text-xs text-foreground-500">HC {demand.metrics.onboarded_count}/{demand.headcount}{demand.metrics.accepted_offer_count > 0 ? ` · 已锁 ${demand.metrics.accepted_offer_count}` : ''}</span>
                </div>
                <p className="mt-1 text-xs text-foreground-500">{demand.request_no} · {demand.job_city} · {demand.owner_hr_name}</p>
                <p className="mt-2 text-xs text-foreground-400">业务筛选 {demand.metrics.business_review_count} · 面试 {demand.metrics.interview_count} · Offer {demand.metrics.offer_count} · 入职 {demand.metrics.onboarded_count}</p>
              </button>
            ))}
            {!loading && summary.activeDemands.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-foreground-500">暂无生效需求，请先在需求审核中创建或审批需求</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-background-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground-900">近期已排面试</h2>
            <p className="mt-0.5 text-xs text-foreground-500">站内日程是真实数据；企业微信和外部日历仍待接入</p>
          </div>
          <button type="button" onClick={() => navigate('/interviews')} className="rounded-lg bg-foreground-900 px-3 py-2 text-xs font-medium text-white">进入面试管理</button>
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
    </div>
  );
}
