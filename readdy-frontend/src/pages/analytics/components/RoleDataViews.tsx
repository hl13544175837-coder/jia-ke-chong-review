import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewStatus, BusinessReviewTask } from '@/features/businessReviews/types';
import { interviewsApi } from '@/features/interviews/api';
import type { InterviewAssignment } from '@/features/interviews/types';
import type { AnalyticsOverview } from '@/features/analytics/types';
import MonthlyPerformancePanel from '@/features/analytics/components/MonthlyPerformancePanel';
import {
  dashboardStageDrilldown,
  type DashboardStage,
} from '@/features/analytics/stageDrilldown';

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round(value / total * 100));
}

function DataBoardShell({ children, dataUi }: { children: ReactNode; dataUi: string }) {
  return (
    <div className="min-h-full bg-background-50 px-4 pb-8 pt-5 sm:px-6" data-ui={dataUi}>
      <div className="mx-auto max-w-[1540px] space-y-4">{children}</div>
    </div>
  );
}

export function MonthlyPerformanceDataPanel() {
  const navigate = useNavigate();

  const openStage = (stage: DashboardStage) => {
    const destination = dashboardStageDrilldown(stage);
    if (destination.kind === 'candidate') {
      navigate('/candidates', { state: destination.state });
      return;
    }
    navigate(destination.to);
  };

  return <MonthlyPerformancePanel onStageClick={openStage} />;
}

interface ManagerTeamResponsibilityPanelProps {
  data: AnalyticsOverview;
  onOwnerClick: (ownerId: number) => void;
}

export function ManagerTeamResponsibilityPanel({ data, onOwnerClick }: ManagerTeamResponsibilityPanelProps) {
  const rows = useMemo(() => {
    const grouped = new Map<string, {
      ownerId: number | null;
      ownerName: string;
      demandCount: number;
      remainingHc: number;
      inProgress: number;
      blockedDemands: number;
      outstandingFeedback: number;
    }>();

    data.demands.forEach((demand) => {
      const key = `${demand.owner_hr_id ?? 'unassigned'}:${demand.owner_name}`;
      const current = grouped.get(key) ?? {
        ownerId: demand.owner_hr_id,
        ownerName: demand.owner_name || '未分配负责人',
        demandCount: 0,
        remainingHc: 0,
        inProgress: 0,
        blockedDemands: 0,
        outstandingFeedback: 0,
      };
      current.demandCount += 1;
      current.remainingHc += demand.remaining;
      current.inProgress += demand.in_progress;
      current.blockedDemands += demand.risk_flags.length > 0 ? 1 : 0;
      current.outstandingFeedback += demand.outstanding_feedback;
      grouped.set(key, current);
    });

    return Array.from(grouped.values()).sort((left, right) => (
      right.blockedDemands - left.blockedDemands
      || right.outstandingFeedback - left.outstandingFeedback
      || right.remainingHc - left.remainingHc
      || left.ownerName.localeCompare(right.ownerName, 'zh-CN')
    ));
  }, [data.demands]);

  return (
    <section data-ui="manager-team-responsibility" className="overflow-hidden rounded-xl border border-background-200 bg-white shadow-[0_8px_28px_rgba(44,62,52,0.035)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-background-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground-900">团队责任与卡点</h2>
          <p className="mt-0.5 text-xs text-foreground-500">按当前负责人汇总在招需求和待协同事项，不做个人排名</p>
        </div>
        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">{rows.length} 位负责人</span>
      </header>
      {rows.length ? (
        <div className="grid gap-2 p-3 lg:grid-cols-2">
          {rows.map((row) => (
            <button
              key={`${row.ownerId ?? 'unassigned'}-${row.ownerName}`}
              type="button"
              disabled={row.ownerId === null}
              onClick={() => row.ownerId !== null && onOwnerClick(row.ownerId)}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-background-200 px-4 py-3 text-left transition hover:border-primary-200 hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-default disabled:opacity-70"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground-900">{row.ownerName}</span>
                <span className="mt-1 block text-xs text-foreground-500">负责 {row.demandCount} 个岗位 · 剩余 HC {row.remainingHc} · 在途 {row.inProgress} 人</span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className={row.blockedDemands > 0 ? 'font-medium text-amber-700' : 'text-foreground-400'}>卡点 {row.blockedDemands}</span>
                <span className={row.outstandingFeedback > 0 ? 'font-medium text-red-700' : 'text-foreground-400'}>待补反馈 {row.outstandingFeedback}</span>
                {row.ownerId !== null && <i className="ri-arrow-right-s-line text-base text-foreground-300 transition group-hover:text-primary-600" aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-foreground-500">当前没有可汇总的在招需求</p>
      )}
    </section>
  );
}

export function RecruiterDataBoard() {
  return (
    <DataBoardShell dataUi="recruiter-data-board">
      <PageHeader
        title="数据看板"
        visuallyHiddenTitle
        description="查看自己的月度招聘进度与转化情况"
        actions={<span className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">数据范围：仅本人</span>}
      />
      <MonthlyPerformanceDataPanel />
    </DataBoardShell>
  );
}

const reviewStatuses: Array<{ key: BusinessReviewStatus; label: string; tone: string }> = [
  { key: 'pending', label: '待筛选', tone: 'bg-amber-400' },
  { key: 'approved', label: '已通过', tone: 'bg-primary-500' },
  { key: 'rejected', label: '不合适', tone: 'bg-red-400' },
  { key: 'needs_info', label: '待补充', tone: 'bg-sky-400' },
];

function MetricCard({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-background-200 bg-white p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-primary-200"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground-500">{label}</span>
        <i className={`${icon} text-lg text-primary-600`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground-900">{value}</p>
    </button>
  );
}

export function InterviewerDataBoard() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<BusinessReviewTask[]>([]);
  const [assignments, setAssignments] = useState<InterviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [reviewResult, interviewResult] = await Promise.allSettled([
      businessReviewsApi.listMine(),
      interviewsApi.listMyAssignments(),
    ]);
    setErrors([
      ...(reviewResult.status === 'rejected' ? ['筛选数据暂不可用'] : []),
      ...(interviewResult.status === 'rejected' ? ['面试数据暂不可用'] : []),
    ]);
    if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value.items);
    if (interviewResult.status === 'fulfilled') setAssignments(interviewResult.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);

  const summary = useMemo(() => {
    const feedbackSubmitted = assignments.filter((item) => item.feedback_submitted).length;
    return {
      pendingReviews: reviews.filter((item) => item.status === 'pending').length,
      completedReviews: reviews.filter((item) => item.status !== 'pending').length,
      feedbackSubmitted,
      feedbackPending: Math.max(0, assignments.length - feedbackSubmitted),
      firstRound: assignments.filter((item) => item.round_sequence === 1).length,
      secondRound: assignments.filter((item) => item.round_sequence === 2).length,
      otherRounds: assignments.filter((item) => ![1, 2].includes(item.round_sequence)).length,
    };
  }, [assignments, reviews]);

  const reviewTotal = reviews.length;
  const assignmentTotal = assignments.length;
  const displayValue = (value: number) => loading ? '—' : value;

  return (
    <DataBoardShell dataUi="interviewer-data-board">
      <PageHeader
        title="数据看板"
        visuallyHiddenTitle
        description="查看分配给自己的筛选与面试数据"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">数据范围：仅本人</span>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-200 bg-white px-3 text-sm text-foreground-600 transition hover:bg-background-50 disabled:opacity-60">
              <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />刷新
            </button>
          </div>
        )}
      />

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">部分数据暂不可用</p>
          <p className="mt-1 text-xs">{errors.join('、')}，页面保留上次成功结果，请刷新重试。</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="收到筛选任务" value={displayValue(reviewTotal)} icon="ri-file-search-line" onClick={() => navigate('/interviewer/screening')} />
        <MetricCard label="已完成筛选" value={displayValue(summary.completedReviews)} icon="ri-checkbox-circle-line" onClick={() => navigate('/interviewer/screening')} />
        <MetricCard label="收到面试任务" value={displayValue(assignmentTotal)} icon="ri-calendar-event-line" onClick={() => navigate('/interviewer/interviews')} />
        <MetricCard label="已提交评价" value={displayValue(summary.feedbackSubmitted)} icon="ri-survey-line" onClick={() => navigate('/interviewer/interviews')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-background-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground-900">筛选结论分布</h2>
            <p className="mt-0.5 text-xs text-foreground-500">只统计分配给我的业务筛选任务</p>
          </div>
          <div className="mt-5 space-y-4">
            {reviewStatuses.map((status) => {
              const count = reviews.filter((item) => item.status === status.key).length;
              return (
                <div key={status.key} className="grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-3 text-sm">
                  <span className="text-foreground-600">{status.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-background-100"><span className={`block h-full rounded-full ${status.tone}`} style={{ width: `${percent(count, reviewTotal)}%` }} /></span>
                  <span className="text-right font-medium text-foreground-800">{loading ? '—' : count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-background-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground-900">面试任务分布</h2>
            <p className="mt-0.5 text-xs text-foreground-500">按面试轮次和评价完成情况统计</p>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ['一面', summary.firstRound],
              ['二面', summary.secondRound],
              ['其他轮次', summary.otherRounds],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-background-50 px-3 py-3 text-center">
                <p className="text-xs text-foreground-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground-900">{loading ? '—' : value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-background-100 pt-4">
            <button type="button" onClick={() => navigate('/interviewer/interviews')} className="rounded-lg border border-background-200 px-3 py-3 text-left hover:bg-background-50">
              <p className="text-xs text-foreground-500">待提交评价</p>
              <p className="mt-1 text-lg font-semibold text-amber-700">{displayValue(summary.feedbackPending)}</p>
            </button>
            <button type="button" onClick={() => navigate('/interviewer/interviews')} className="rounded-lg border border-background-200 px-3 py-3 text-left hover:bg-background-50">
              <p className="text-xs text-foreground-500">已提交评价</p>
              <p className="mt-1 text-lg font-semibold text-primary-700">{displayValue(summary.feedbackSubmitted)}</p>
            </button>
          </div>
        </section>
      </div>
    </DataBoardShell>
  );
}
