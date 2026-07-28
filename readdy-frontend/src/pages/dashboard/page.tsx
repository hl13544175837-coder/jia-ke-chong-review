import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Clock3,
  FileUp,
  RefreshCw,
} from 'lucide-react';
import { useCompanyAuth } from '@/auth/companyAuth';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { demandsApi } from '@/features/demands/api';
import { interviewsApi } from '@/features/interviews/api';
import { offersApi } from '@/features/offers/api';
import type { OfferStatus } from '@/features/offers/types';
import { useToast } from '@/hooks/useToast';
import { buildDashboardSummary, type DashboardFacts, type DemandRiskLevel } from './summary';
import {
  canOpenDashboardStage,
  dashboardStageDrilldown,
  type DashboardStage,
} from './stageDrilldown';
import FunnelChart from './components/FunnelChart';
import MonthlyPerformancePanel from './components/MonthlyPerformancePanel';

const emptyFacts: DashboardFacts = {
  demands: [],
  interviews: [],
  offers: [],
  reviews: [],
};

const offerStatusLabels: Record<OfferStatus, string> = {
  draft: '草稿待提交',
  pending: '等待主管审批',
  approved: '待发放',
  rejected: '主管退回修改',
  sent: '等待候选人回复',
  accepted: '待确认入职',
  declined: '已拒绝',
  withdrawn: '已撤回',
  expired: '已过期',
  onboarded: '已入职',
};

type TaskTone = 'amber' | 'green' | 'red' | 'blue';

interface DashboardTaskItem {
  key: string;
  tag: string;
  title: string;
  detail: string;
  time: string;
  actionLabel: string;
  tone: TaskTone;
  urgent: boolean;
  priority: number;
  action: () => void;
}

interface WaitingItem {
  key: string;
  title: string;
  owner: string;
  startedAt: string | null;
  actionLabel: string;
  action: () => void | Promise<void>;
  assignmentId?: number | null;
}

const taskToneClasses: Record<TaskTone, { icon: string; badge: string }> = {
  amber: { icon: 'bg-amber-50 text-amber-700', badge: 'bg-amber-50 text-amber-700' },
  green: { icon: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-50 text-emerald-700' },
  red: { icon: 'bg-red-50 text-red-700', badge: 'bg-red-50 text-red-700' },
  blue: { icon: 'bg-sky-50 text-sky-700', badge: 'bg-sky-50 text-sky-700' },
};

const riskClasses: Record<DemandRiskLevel, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-emerald-50 text-emerald-700',
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '上午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function currentMonthLabel() {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date());
}

function backendDate(value: string | null | undefined) {
  if (!value) return null;
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const parsed = new Date(hasExplicitZone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clockLabel(value: string | null) {
  const parsed = backendDate(value);
  if (!parsed) return '待定';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

function shortDateLabel(value: string | null | undefined) {
  if (!value) return '时间待定';
  const parsed = value.length === 10 ? new Date(`${value}T00:00:00`) : backendDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(parsed);
}

function waitingDuration(value: string | null) {
  const parsed = backendDate(value);
  if (!parsed) return '待确认';
  const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
  if (days === 0) return '今天';
  return `${days} 天`;
}

function isDueTodayOrOverdue(value: string | null | undefined) {
  if (!value) return false;
  const parsed = value.length === 10 ? new Date(`${value}T23:59:59`) : backendDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return parsed.getTime() < tomorrow.getTime();
}

function SectionCard({
  title,
  meta,
  action,
  children,
  className = '',
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-background-200 bg-white shadow-[0_8px_28px_rgba(44,62,52,0.035)] ${className}`}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-background-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground-900">{title}</h2>
          {meta}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { name, role, userId } = useCompanyAuth();
  const [facts, setFacts] = useState<DashboardFacts>(emptyFacts);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [remindingAssignmentId, setRemindingAssignmentId] = useState<number | null>(null);

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

  const taskItems = useMemo<DashboardTaskItem[]>(() => [
    ...summary.pendingApprovals.map((demand) => ({
      key: `approval-${demand.id}`,
      tag: '待审核',
      title: `${demand.job_title} · ${demand.job_city || '城市未填写'}`,
      detail: '新增招聘需求等待审核确认',
      time: demand.target_date ? `截止 ${shortDateLabel(demand.target_date)}` : '截止日期待定',
      actionLabel: '去审核',
      tone: 'amber' as const,
      urgent: false,
      priority: 100,
      action: () => navigate('/jobs', { state: { fromDashboard: true, tab: 'pendingApproval', openTitle: demand.request_no } }),
    })),
    ...summary.completionDemands.map((demand) => ({
      key: `completion-${demand.id}`,
      tag: demand.metrics.over_headcount > 0 ? '超出 HC' : 'HC 已达成',
      title: `${demand.job_title} · ${demand.job_city || '城市未填写'}`,
      detail: demand.metrics.over_headcount > 0
        ? `已超出 HC ${demand.metrics.over_headcount} 人，请核对历史记录`
        : '招聘目标已达成，等待确认是否结束需求',
      time: demand.target_date ? `截止 ${shortDateLabel(demand.target_date)}` : '日期待定',
      actionLabel: '核对需求',
      tone: (demand.metrics.over_headcount > 0 ? 'amber' : 'green') as TaskTone,
      urgent: false,
      priority: demand.metrics.over_headcount > 0 ? 95 : 70,
      action: () => navigate(`/jobs?demand=${demand.id}`),
    })),
    ...assignedBusinessReviews.map((item) => ({
      key: `review-${item.id}`,
      tag: '待业务筛选',
      title: `${item.candidate.name_masked} · ${item.demand.job_title}`,
      detail: '请查看完整简历并给出业务筛选结论',
      time: item.due_at ? `截止 ${shortDateLabel(item.due_at)}` : '截止日期待定',
      actionLabel: '去筛选',
      tone: (isDueTodayOrOverdue(item.due_at) ? 'red' : 'blue') as TaskTone,
      urgent: isDueTodayOrOverdue(item.due_at),
      priority: 80,
      action: () => navigate(`/interviewer/screening?task=${item.id}`),
    })),
    ...summary.myOfferActions.map((item) => ({
      key: `offer-${item.id}`,
      tag: '待处理 Offer',
      title: `${item.candidate_name} · ${item.position}`,
      detail: offerStatusLabels[item.status],
      time: item.onboard_date ? `预计入职 ${shortDateLabel(item.onboard_date)}` : '时间待确认',
      actionLabel: '处理 Offer',
      tone: 'green' as const,
      urgent: false,
      priority: 60,
      action: () => navigate(`/offers?demand=${item.demand_id}&candidate=${item.candidate_id}&from=dashboard`),
    })),
  ].sort((left, right) => right.priority - left.priority), [
    assignedBusinessReviews,
    navigate,
    summary.completionDemands,
    summary.myOfferActions,
    summary.pendingApprovals,
  ]);

  const remindFeedback = useCallback(async (assignmentId: number) => {
    if (remindingAssignmentId) return;
    setRemindingAssignmentId(assignmentId);
    try {
      const result = await interviewsApi.remindFeedback(assignmentId);
      showToast(result.deduplicated ? '15 分钟内已经提醒过，不再重复打扰' : '已提醒面试官提交反馈');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '提醒失败，请稍后重试');
    } finally {
      setRemindingAssignmentId(null);
    }
  }, [remindingAssignmentId, showToast]);

  const waitingItems = useMemo<WaitingItem[]>(() => [
    ...reviewsWaitingForOthers.map((item) => ({
      key: `waiting-review-${item.id}`,
      title: `${item.candidate.name_masked} · 业务筛选`,
      owner: item.reviewer_name || '业务负责人未显示',
      startedAt: item.created_at,
      actionLabel: '去跟进',
      action: () => navigate(
        `/candidates?demand=${item.demand_id}&candidate=${item.candidate_id}`,
        { state: { fromDashboard: true, demandId: item.demand_id, targetStage: 'business_review' } },
      ),
    })),
    ...summary.waitingFeedback.map((item) => ({
      key: `waiting-feedback-${item.assignment_id}`,
      title: `${item.name_masked} · 面试反馈`,
      owner: item.interviewer_name || '面试官未显示',
      startedAt: item.scheduled_at,
      actionLabel: '催反馈',
      assignmentId: item.assignment_id,
      action: () => item.assignment_id ? remindFeedback(item.assignment_id) : undefined,
    })),
    ...summary.waitingOfferActions.map((item) => ({
      key: `waiting-offer-${item.id}`,
      title: `${item.candidate_name} · ${offerStatusLabels[item.status]}`,
      owner: item.status === 'pending' ? (item.approver_name || '审批人未显示') : '候选人',
      startedAt: item.updated_at || item.created_at,
      actionLabel: '去跟进',
      action: () => navigate(`/offers?demand=${item.demand_id}&candidate=${item.candidate_id}&from=dashboard`),
    })),
  ], [navigate, remindFeedback, reviewsWaitingForOthers, summary.waitingFeedback, summary.waitingOfferActions]);

  const attentionItems = ([
    summary.pendingApprovals.length > 0 ? { label: `${summary.pendingApprovals.length} 个需求待审核`, tone: 'amber' } : null,
    summary.overdueFeedback.length > 0 ? { label: `${summary.overdueFeedback.length} 份面试反馈逾期`, tone: 'red' } : null,
    summary.demandProgress.filter((item) => item.demand.metrics.over_headcount > 0).length > 0
      ? { label: `${summary.demandProgress.filter((item) => item.demand.metrics.over_headcount > 0).length} 个岗位超出 HC`, tone: 'amber' }
      : null,
  ] as Array<{ label: string; tone: 'amber' | 'red' } | null>)
    .filter((item): item is { label: string; tone: 'amber' | 'red' } => Boolean(item));

  const urgentTaskCount = taskItems.filter((item) => item.urgent).length;
  const dashboardFunnel = useMemo(() => {
    const resumes = summary.activeDemands.reduce((total, item) => total + item.metrics.recommended_count, 0);
    const stages = [
      { stage: '简历库', count: resumes, key: 'hr_screening' as const },
      { stage: '初筛', count: summary.stageSummary.aiScreening, key: 'ai_screening' as const },
      { stage: '业务筛选', count: summary.stageSummary.businessReview, key: 'business_review' as const },
      { stage: '面试', count: summary.stageSummary.interview, key: 'interview' as const },
      { stage: 'Offer', count: summary.stageSummary.offer, key: 'offer' as const },
      { stage: '入职', count: summary.stageSummary.onboarding, key: 'onboarding' as const },
    ];
    return stages.map((item, index) => ({
      stage: item.stage,
      count: item.count,
      key: item.key,
      conversionRate: index === 0 ? null : (stages[index - 1].count > 0
        ? Math.round((item.count / stages[index - 1].count) * 1000) / 10
        : 0),
    }));
  }, [summary.activeDemands, summary.stageSummary]);

  const openDemandAction = (item: (typeof summary.demandProgress)[number]) => {
    if (item.nextAction === '管理面试') {
      navigate(`/interviews?demand=${item.demand.id}&from=dashboard`);
      return;
    }
    if (item.nextAction === '推进 Offer') {
      navigate(`/offers?demand=${item.demand.id}&from=dashboard`);
      return;
    }
    if (item.nextAction === '跟进反馈') {
      navigate('/candidates', { state: { fromDashboard: true, demandId: item.demand.id, targetStage: 'business_review' } });
      return;
    }
    navigate(`/jobs?demand=${item.demand.id}`);
  };

  const openDemandMetric = (item: (typeof summary.demandProgress)[number], stage: 'business-review' | 'interview' | 'offer' | 'onboarded') => {
    if (stage === 'business-review') {
      navigate('/candidates', { state: { fromDashboard: true, demandId: item.demand.id, targetStage: 'business_review' } });
      return;
    }
    if (stage === 'interview') {
      navigate(`/interviews?demand=${item.demand.id}&from=dashboard`);
      return;
    }
    const tab = stage === 'onboarded' ? '&tab=onboard' : '';
    navigate(`/offers?demand=${item.demand.id}${tab}&from=dashboard`);
  };

  const openStage = (stage: DashboardStage) => {
    const destination = dashboardStageDrilldown(stage);
    if (destination.kind === 'candidate') {
      navigate('/candidates', { state: destination.state });
      return;
    }
    navigate(destination.to);
  };

  const openFunnelStage = (stage: string) => {
    const target = dashboardFunnel.find((item) => item.stage === stage);
    if (target) openStage(target.key);
  };

  return (
    <div className="min-h-full bg-[#faf9f7] px-4 pb-8 pt-5 sm:px-6" data-ui="real-recruitment-dashboard">
      <div className="mx-auto max-w-[1540px] space-y-4">
        <header>
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground-900">
                {greeting()}，{name || (role === 'manager' ? '招聘经理' : '招聘专员')}。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-600">
                <CalendarDays size={15} aria-hidden="true" />
                {currentMonthLabel()}
              </span>
              <button
                type="button"
                onClick={() => navigate('/jobs', { state: { fromDashboard: true, openCreate: true } })}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-600 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                <CirclePlus size={15} aria-hidden="true" />新建需求
              </button>
              <button
                type="button"
                onClick={() => navigate('/candidates', { state: { fromDashboard: true, openUpload: true } })}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-300 bg-white px-3.5 text-sm font-medium text-primary-700 transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
              >
                <FileUp size={15} aria-hidden="true" />导入简历
              </button>
              <button
                type="button"
                onClick={() => navigate('/interviews?status=unassigned&from=dashboard')}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-300 bg-white px-3.5 text-sm font-medium text-primary-700 transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
              >
                <CalendarDays size={15} aria-hidden="true" />安排面试
              </button>
              <button
                type="button"
                onClick={() => void loadFacts()}
                disabled={loading}
                aria-label="刷新工作台"
                title="刷新工作台"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-200 bg-white text-foreground-500 transition hover:bg-background-50 disabled:opacity-50"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">部分数据暂不可用</p>
            <p className="mt-1 text-xs">{errors.join('、')}，页面保留上次成功结果，请刷新重试。</p>
          </div>
        )}

        {attentionItems.length > 0 && (
          <aside className="flex flex-wrap items-center gap-2 rounded-xl border border-background-200 bg-white px-4 py-2.5" aria-label="需要关注">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <AlertTriangle size={15} aria-hidden="true" />需要关注
            </span>
            {attentionItems.map((item) => (
              <span key={item.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                {item.label}
              </span>
            ))}
          </aside>
        )}

        <FunnelChart items={dashboardFunnel} onStageClick={openFunnelStage} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.95fr)]">
          <SectionCard
            title="待处理事项"
            meta={(
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                {taskItems.length} 项{urgentTaskCount > 0 ? ` · ${urgentTaskCount} 项紧急` : ''}
              </span>
            )}
          >
            <div className="divide-y divide-background-100">
              {taskItems.slice(0, 4).map((item) => {
                const tone = taskToneClasses[item.tone];
                return (
                  <article key={item.key} className="grid min-h-[66px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-background-50/70">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone.icon}`} aria-hidden="true">
                      <i className={item.tone === 'red' ? 'ri-error-warning-line' : item.tone === 'amber' ? 'ri-file-list-3-line' : item.tone === 'blue' ? 'ri-user-search-line' : 'ri-checkbox-circle-line'} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>{item.tag}</span>
                        <p className="truncate text-sm font-semibold text-foreground-900">{item.title}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-500">
                        <span>{item.detail}</span>
                        <span>{item.time}</span>
                      </div>
                    </div>
                    <button type="button" onClick={item.action} className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary-300 bg-white px-3 text-xs font-medium text-primary-700 transition hover:bg-primary-50">
                      {item.actionLabel}<ChevronRight size={13} aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
              {!loading && taskItems.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-foreground-500">当前没有需要你处理的事项</div>
              )}
              {loading && taskItems.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-foreground-500">正在加载待处理事项...</div>
              )}
            </div>
            {taskItems.length > 4 && (
              <button type="button" onClick={() => navigate('/jobs')} className="flex w-full items-center justify-center gap-1 border-t border-background-100 py-2.5 text-xs font-medium text-foreground-600 hover:bg-background-50 hover:text-primary-700">
                查看全部 {taskItems.length} 项<ChevronRight size={13} aria-hidden="true" />
              </button>
            )}
          </SectionCard>

          <SectionCard
            title="今日面试"
            action={<button type="button" onClick={() => navigate('/interviews?status=scheduled&from=dashboard')} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800">查看完整日程<ChevronRight size={13} /></button>}
          >
            <div className="divide-y divide-background-100">
              {summary.todayInterviews.slice(0, 3).map((item) => {
                const started = (backendDate(item.scheduled_at)?.getTime() ?? Number.MAX_SAFE_INTEGER) <= Date.now();
                return (
                  <button key={item.assignment_id} type="button" onClick={() => navigate(`/interviews?demand=${item.demand_id}&candidate=${item.candidate_id}&from=dashboard`)} className="grid min-h-[78px] w-full grid-cols-[50px_12px_minmax(0,1fr)] items-start gap-2 px-4 py-3 text-left transition hover:bg-background-50/70">
                    <span className="pt-1 text-sm font-medium text-foreground-700">{clockLabel(item.scheduled_at)}</span>
                    <span className="relative mt-1.5 flex h-full justify-center"><span className="z-10 h-2.5 w-2.5 rounded-full bg-primary-500 ring-4 ring-primary-50" /><span className="absolute bottom-[-18px] top-3 w-px bg-primary-100" /></span>
                    <span className="min-w-0">
                      <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-foreground-900">{item.name_masked}</span><span className={`text-xs font-medium ${started ? 'text-primary-700' : 'text-amber-600'}`}>{started ? '已开始' : '待开始'}</span></span>
                      <span className="mt-1 block truncate text-xs text-foreground-500">{item.job_title} · {item.job_city || '城市未填写'}</span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-400">面试官：{item.interviewer_name || '待确认'}</span>
                    </span>
                  </button>
                );
              })}
              {!loading && summary.todayInterviews.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-foreground-500">今天暂无已安排面试</div>
              )}
              {loading && summary.todayInterviews.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-foreground-500">正在加载今日面试...</div>
              )}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.95fr)]">
          <SectionCard
            title="我的岗位进展"
            action={<button type="button" onClick={() => navigate('/jobs')} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800">查看全部岗位<ChevronRight size={13} /></button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-background-50/60 text-left text-[11px] font-medium text-foreground-400">
                  <tr>
                    <th className="px-4 py-2.5">岗位名称</th>
                    <th className="px-3 py-2.5 text-center">HC</th>
                    <th className="px-3 py-2.5 text-center">业务筛选</th>
                    <th className="px-3 py-2.5 text-center">面试</th>
                    <th className="px-3 py-2.5 text-center">Offer</th>
                    <th className="px-3 py-2.5 text-center">已入职</th>
                    <th className="px-3 py-2.5 text-center">风险</th>
                    <th className="px-4 py-2.5 text-right">下一步</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-100">
                  {summary.demandProgress.slice(0, 5).map((item) => (
                    <tr key={item.demand.id} className="h-[52px] hover:bg-background-50/70">
                      <td className="px-4 py-2.5"><button type="button" onClick={() => navigate(`/jobs?demand=${item.demand.id}`)} className="max-w-[220px] truncate text-left text-sm font-semibold text-foreground-900 hover:text-primary-700">{item.demand.job_title}</button><p className="mt-0.5 text-[11px] text-foreground-400">{item.demand.job_department} · {item.demand.job_city}</p></td>
                      <td className="px-3 py-2.5 text-center text-sm font-medium text-foreground-800">{item.demand.metrics.onboarded_count}/{item.demand.headcount}</td>
                      <td className="px-3 py-2.5 text-center"><button type="button" data-ui="dashboard-drilldown-business-review" disabled={item.demand.metrics.business_review_count <= 0} onClick={() => openDemandMetric(item, 'business-review')} className="rounded px-2 py-1 text-sm text-foreground-600 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-45">{item.demand.metrics.business_review_count}</button></td>
                      <td className="px-3 py-2.5 text-center"><button type="button" data-ui="dashboard-drilldown-interview" disabled={item.demand.metrics.interview_count <= 0} onClick={() => openDemandMetric(item, 'interview')} className="rounded px-2 py-1 text-sm text-foreground-600 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-45">{item.demand.metrics.interview_count}</button></td>
                      <td className="px-3 py-2.5 text-center"><button type="button" data-ui="dashboard-drilldown-offer" disabled={item.demand.metrics.offer_count <= 0} onClick={() => openDemandMetric(item, 'offer')} className="rounded px-2 py-1 text-sm text-foreground-600 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-45">{item.demand.metrics.offer_count}</button></td>
                      <td className="px-3 py-2.5 text-center"><button type="button" data-ui="dashboard-drilldown-onboarded" disabled={item.demand.metrics.onboarded_count <= 0} onClick={() => openDemandMetric(item, 'onboarded')} className="rounded px-2 py-1 text-sm text-foreground-600 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-default disabled:opacity-45">{item.demand.metrics.onboarded_count}</button></td>
                      <td className="px-3 py-2.5 text-center"><span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium ${riskClasses[item.risk.level]}`}>{item.risk.label}</span></td>
                      <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => openDemandAction(item)} className="h-8 whitespace-nowrap rounded-lg border border-primary-300 bg-white px-3 text-xs font-medium text-primary-700 hover:bg-primary-50">{item.nextAction}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && summary.demandProgress.length === 0 && <div className="px-5 py-12 text-center text-sm text-foreground-500">暂无生效招聘需求</div>}
              {loading && summary.demandProgress.length === 0 && <div className="px-5 py-12 text-center text-sm text-foreground-500">正在加载岗位进展...</div>}
            </div>
          </SectionCard>

          <div className="grid gap-4">
            <SectionCard title="阶段概况">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 sm:grid-cols-5 xl:grid-cols-1">
                {[
                  ['HR 初筛', summary.stageSummary.hrScreening, 'ri-file-search-line', 'bg-stone-100 text-stone-600', 'hr_screening'],
                  ['AI 筛选', summary.stageSummary.aiScreening, 'ri-robot-2-line', 'bg-sky-50 text-sky-700', 'ai_screening'],
                  ['业务筛选', summary.stageSummary.businessReview, 'ri-user-search-line', 'bg-amber-50 text-amber-700', 'business_review'],
                  ['面试', summary.stageSummary.interview, 'ri-checkbox-circle-line', 'bg-emerald-50 text-emerald-700', 'interview'],
                  ['Offer', summary.stageSummary.offer, 'ri-mail-line', 'bg-primary-50 text-primary-700', 'offer'],
                  ['待入职', summary.stageSummary.onboarding, 'ri-user-follow-line', 'bg-emerald-50 text-emerald-800', 'onboarding'],
                ].map(([label, value, icon, tone, stage]) => (
                  <button key={String(label)} type="button" disabled={!canOpenDashboardStage(Number(value))} onClick={() => openStage(stage as DashboardStage)} className="flex items-center justify-between rounded-lg px-1 py-0.5 text-left hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent">
                    <span className="inline-flex items-center gap-2 text-xs text-foreground-600"><span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}><i className={String(icon)} /></span>{label}</span>
                    <span className="text-sm font-semibold text-foreground-900">{value} 人</span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="等待他人">
              <div className="divide-y divide-background-100">
                {waitingItems.slice(0, 3).map((item) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0"><p className="truncate text-xs font-medium text-foreground-800">{item.title}</p><p className="mt-1 truncate text-[11px] text-foreground-400">{item.owner} · 已等待 <span className={waitingDuration(item.startedAt).includes('天') ? 'text-red-600' : ''}>{waitingDuration(item.startedAt)}</span></p></div>
                    <button type="button" disabled={Boolean(item.assignmentId && remindingAssignmentId === item.assignmentId)} onClick={() => void item.action()} className="h-7 rounded-md border border-primary-300 bg-white px-2.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50">{item.assignmentId && remindingAssignmentId === item.assignmentId ? '提醒中' : item.actionLabel}</button>
                  </div>
                ))}
                {!loading && waitingItems.length === 0 && <div className="px-5 py-8 text-center text-sm text-foreground-500">当前没有等待他人处理的事项</div>}
                {loading && waitingItems.length === 0 && <div className="px-5 py-8 text-center text-sm text-foreground-500">正在加载协同事项...</div>}
              </div>
            </SectionCard>
          </div>
        </div>

        <MonthlyPerformancePanel />
      </div>
    </div>
  );
}
