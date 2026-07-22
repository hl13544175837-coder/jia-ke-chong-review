// Readdy 工作台：保留旧后端真实数据、角色边界和分区错误态。

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCog,
  LineChart,
  ShieldCheck,
  ClipboardCheck,
  ArrowRight,
  Upload,
  Briefcase,
  KanbanSquare,
  BarChart3,
  Settings,
  Sparkles,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, DrawerShell } from '../components/ui';
import { Reveal, AnimatedNumber } from '../components/motion';
import type { BiManagerAlert, InterviewAssignment, Role } from '../types';

// ─── 角色信息 ─────────────────────────────────────────────────────────────────

interface RoleInfo {
  label: string;
  duty: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  action: { to: string; label: string };
}

const ROLE_INFO: Record<Role, RoleInfo> = {
  recruiter: {
    label: '招聘专员',
    duty: '管理招聘需求与候选人，跟进筛选、面试和 Offer',
    icon: UserCog,
    accent: 'bg-blue-50 text-accent-blue',
    gradient: 'linear-gradient(135deg, var(--enterprise-brand), var(--enterprise-brand-dark))',
    action: { to: '/upload', label: '上传简历' },
  },
  manager: {
    label: '招聘主管',
    duty: '关注团队招聘进度与卡点，协调责任人完成需求',
    icon: LineChart,
    accent: 'bg-purple-50 text-accent-purple',
    gradient: 'linear-gradient(135deg, #c47b55, #9a5c3e)',
    action: { to: '/analytics', label: '查看进度与卡点' },
  },
  admin: {
    label: '管理员',
    duty: '保障账号、权限与招聘流程稳定运行',
    icon: ShieldCheck,
    accent: 'bg-brand-50 text-ink',
    gradient: 'linear-gradient(135deg, #4f5b56, #303b37)',
    action: { to: '/analytics', label: '查看进度与卡点' },
  },
  interviewer: {
    label: '面试官',
    duty: '处理分配给我的面试安排与反馈',
    icon: ClipboardCheck,
    accent: 'bg-teal-50 text-teal-700',
    gradient: 'linear-gradient(135deg, var(--enterprise-brand), var(--enterprise-brand-dark))',
    action: { to: '/interviewer/interviews', label: '查看我的面试' },
  },
};

// ─── 角色常用动作 ─────────────────────────────────────────────────────────────

interface WorkflowAction {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  roles: Role[];
}

const WORKFLOW_ACTIONS: WorkflowAction[] = [
  {
    to: '/upload',
    label: '上传简历',
    desc: '把新候选人放进简历库，解析失败也能重试',
    icon: Upload,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/demands',
    label: '管理招聘需求',
    desc: '按需求跟进 HC、进度、卡点和负责人',
    icon: Briefcase,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/kanban',
    label: '跟进候选人流程',
    desc: '推进初筛、面试、Offer、淘汰沉淀',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/interviewer/interviews',
    label: '我的面试',
    desc: '查看安排并填写反馈',
    icon: ClipboardCheck,
    roles: ['interviewer'],
  },
  {
    to: '/analytics',
    label: '查看进度看板',
    desc: '查看需求进度、卡点和责任协同',
    icon: BarChart3,
    roles: ['manager', 'admin'],
  },
  {
    to: '/agent',
    label: '问 AI 助手',
    desc: '用自然语言查询候选人、岗位和流程',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/admin/settings',
    label: '系统设置',
    desc: '管理账号、审计日志和 AI 助手边界',
    icon: Settings,
    roles: ['admin'],
  },
];

const ACTION_ORDER_BY_ROLE: Record<Role, string[]> = {
  recruiter: ['/upload', '/demands', '/kanban'],
  manager: ['/analytics', '/kanban', '/agent'],
  admin: ['/analytics', '/admin/settings', '/agent'],
  interviewer: ['/interviewer/interviews'],
};

function workflowActionsForRole(role: Role): WorkflowAction[] {
  const allowed = WORKFLOW_ACTIONS.filter((item) => item.roles.includes(role));
  return ACTION_ORDER_BY_ROLE[role]
    .map((to) => allowed.find((item) => item.to === to))
    .filter((item): item is WorkflowAction => Boolean(item));
}

// ─── KPI 数据 ─────────────────────────────────────────────────────────────────

interface DashboardStats {
  candidates: number | null;
  jobs: number | null;
  activeDemands: number | null;
  activeCandidates: number | null;
  businessReview: number | null;
  interview: number | null;
  offer: number | null;
  outstandingFeedback: number | null;
  alerts: BiManagerAlert[];
  interviewerTasks: InterviewerTaskStats;
}

interface DashboardErrors {
  candidates?: string;
  jobs?: string;
  bi?: string;
  assignments?: string;
}

interface InterviewerTaskStats {
  pendingFeedback: number | null;
  todayInterviews: number | null;
  submittedFeedback: number | null;
  overdueFeedback: number | null;
}

interface DashboardKpiDetail {
  label: string;
  value: number | null;
  description: string;
  to: string;
  actionLabel: string;
}

const EMPTY_STATS: DashboardStats = {
  candidates: null,
  jobs: null,
  activeDemands: null,
  activeCandidates: null,
  businessReview: null,
  interview: null,
  offer: null,
  outstandingFeedback: null,
  alerts: [],
  interviewerTasks: {
    pendingFeedback: null,
    todayInterviews: null,
    submittedFeedback: null,
    overdueFeedback: null,
  },
};

function isToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

function buildInterviewerTaskStats(assignments: InterviewAssignment[]): InterviewerTaskStats {
  const activeAssignments = assignments.filter((item) => {
    const status = (item.status || 'scheduled').trim().toLowerCase();
    return !['cancelled', 'canceled'].includes(status);
  });
  return {
    pendingFeedback: activeAssignments.filter((item) => !item.feedback_submitted).length,
    todayInterviews: activeAssignments.filter((item) => isToday(item.scheduled_at)).length,
    submittedFeedback: activeAssignments.filter((item) => item.feedback_submitted).length,
    overdueFeedback: activeAssignments.filter((item) => item.is_overdue && !item.feedback_submitted).length,
  };
}

function useDashboardStats(
  role: Role | null,
  userId: number | null,
): {
  stats: DashboardStats;
  loading: boolean;
  errors: DashboardErrors;
  reload: () => void;
} {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<DashboardErrors>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!role) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setErrors({});
    setStats(EMPTY_STATS);

    const wantsTeamBi = role === 'manager' || role === 'admin';
    const wantsOwnBi = role === 'recruiter' && userId != null;
    const wantsInterviewTasks = role === 'interviewer';

    const candidatesP = wantsInterviewTasks ? Promise.resolve([]) : api.listCandidates();
    const jobsP = wantsInterviewTasks ? Promise.resolve([]) : api.listJobs();
    const biP = wantsTeamBi
      ? api.biOverview()
      : wantsOwnBi
        ? api.biStaff(userId as number)
        : Promise.resolve(null);
    const assignmentsP = wantsInterviewTasks
      ? api.listInterviewAssignments()
      : Promise.resolve([] as InterviewAssignment[]);

    Promise.allSettled([candidatesP, jobsP, biP, assignmentsP]).then(
      ([candidatesR, jobsR, biR, assignmentsR]) => {
        if (!active) return;
        const next: DashboardStats = { ...EMPTY_STATS };
        const nextErrors: DashboardErrors = {};
        if (candidatesR.status === 'fulfilled') next.candidates = candidatesR.value.length;
        if (candidatesR.status === 'rejected') {
          nextErrors.candidates = '候选人数据暂不可用';
        }
        if (jobsR.status === 'fulfilled') next.jobs = jobsR.value.length;
        if (jobsR.status === 'rejected') {
          nextErrors.jobs = '岗位数据暂不可用';
        }
        if (assignmentsR.status === 'fulfilled' && wantsInterviewTasks) {
          next.interviewerTasks = buildInterviewerTaskStats(assignmentsR.value);
        }
        if (assignmentsR.status === 'rejected' && wantsInterviewTasks) {
          nextErrors.assignments = '面试任务数据暂不可用';
        }
        if (biR.status === 'fulfilled' && biR.value) {
          if ('workload' in biR.value) {
            const workload = biR.value.workload;
            next.activeDemands = valueOrNull(workload.active_demands);
            next.activeCandidates = valueOrNull(workload.active_candidates);
            next.businessReview = valueOrNull(workload.business_review);
            next.interview = valueOrNull(workload.interview);
            next.offer = valueOrNull(workload.offer);
            next.outstandingFeedback = valueOrNull(workload.outstanding_feedback);
          } else {
            const funnel = biR.value.funnel;
            next.activeDemands = biR.value.demands.filter((item) =>
              item.status === 'pending' || item.status === 'active').length;
            next.activeCandidates = valueOrNull(funnel.pipeline_total);
            next.businessReview = valueOrNull(funnel.business_review);
            next.interview = valueOrNull(funnel.interview);
            next.offer = valueOrNull(funnel.offer);
            next.outstandingFeedback = biR.value.demands
              .filter((item) => item.status === 'pending' || item.status === 'active')
              .reduce(
              (total, item) => total + item.outstanding_feedback,
              0,
            );
            next.alerts = biR.value.alerts;
          }
        }
        if (biR.status === 'rejected' && (wantsTeamBi || wantsOwnBi)) {
          nextErrors.bi = '招聘进度数据暂不可用';
        }
        if (role === 'recruiter' && userId == null) {
          nextErrors.bi = '账户信息暂不可用';
        }
        setStats(next);
        setErrors(nextErrors);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [reloadKey, role, userId]);

  return {
    stats,
    loading,
    errors,
    reload: () => setReloadKey((value) => value + 1),
  };
}

// ─── 子组件 ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
  onActivate,
}: {
  label: string;
  value: number | null;
  accent?: string;
  onActivate?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={!onActivate || value === null}
      className="w-full overflow-hidden rounded-xl border border-[#e8e7e1] bg-white text-left shadow-[0_1px_2px_rgba(24,35,31,0.03)] transition-shadow hover:shadow-[0_8px_24px_rgba(24,35,31,0.07)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-80"
      aria-label={onActivate && value !== null ? `${label} ${value}，查看明细` : undefined}
    >
      <div className="relative px-5 py-5">
        {accent && (
          <div
            className="absolute -right-3 -top-3 h-14 w-14 rounded-full opacity-[0.08]"
            style={{ background: accent }}
          />
        )}
        <p className="text-xs font-medium tracking-wide text-[#777b78]">{label}</p>
        <div className="mt-2 text-3xl font-bold tabular-nums text-[#292b2a]">
          {value === null ? (
            <span className="text-[#aaaDA9]">—</span>
          ) : (
            <AnimatedNumber value={value} />
          )}
        </div>
      </div>
    </button>
  );
}

function alertKindLabel(kind: string): string {
  if (kind === 'stale_pipeline') return '流程卡住';
  if (kind === 'pending_interview_feedback') return '反馈待补';
  if (kind === 'business_feedback_overdue') return '业务反馈超时';
  if (kind === 'business_feedback_pending') return '业务待反馈';
  if (kind === 'demand_overdue') return '需求逾期';
  if (kind === 'hr_no_recommendation') return '尚未推荐';
  if (kind === 'no_active_candidates') return '当前无在流程候选人';
  if (kind === 'hc_completion_suggested') return 'HC 已满足';
  return '待处理';
}

function alertTone(priority: string): 'danger' | 'warning' | 'neutral' {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}

function DataUnavailableCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card variant="elevated">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-danger-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">数据暂不可用</p>
            <p className="mt-1 text-muted">{message}，这不是业务数据为 0。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-9 items-center justify-center rounded-md border border-hairline px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          重新加载
        </button>
      </div>
    </Card>
  );
}

function ManagementAlerts({
  alerts,
  loading,
  error,
  onRetry,
}: {
  alerts: BiManagerAlert[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const [selectedManagementAlert, setSelectedManagementAlert] = useState<BiManagerAlert | null>(null);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">管理提醒</h2>
          <p className="mt-1 text-sm text-muted">自动标出需要管理者关注的招聘卡点</p>
        </div>
        <Badge tone={loading ? 'neutral' : error ? 'danger' : alerts.length > 0 ? 'warning' : 'success'}>
          {loading ? '加载中' : error ? '数据不可用' : alerts.length > 0 ? `${alerts.length} 项待处理` : '暂无明显卡点'}
        </Badge>
      </div>
      {error ? (
        <DataUnavailableCard message={error} onRetry={onRetry} />
      ) : (
        <Card variant="elevated" className="overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
              <Clock3 className="h-4 w-4" />
              正在加载管理提醒…
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
              <Clock3 className="h-4 w-4 text-success-600" />
              当前没有需要协调的 Demand 卡点或待补反馈。
            </div>
          ) : (
            <div className="divide-y divide-hairline-soft">
              {alerts.slice(0, 4).map((alert) => (
                <button
                  type="button"
                  data-ui="dashboard-management-alert-trigger"
                  key={`${alert.kind}-${alert.demand_id}-${alert.candidate_id}-${alert.stage}`}
                  onClick={() => setSelectedManagementAlert(alert)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-soft focus:outline-none focus-visible:bg-surface-soft"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{alert.title}</span>
                      <Badge tone={alertTone(alert.priority)}>{alertKindLabel(alert.kind)}</Badge>
                    </span>
                    <span className="mt-1 block text-sm text-muted">{alert.detail}</span>
                    {alert.kind === 'pending_interview_feedback' && (
                      <span className="mt-1 block text-xs text-muted">
                        应补反馈面试官：{alert.interviewer_name || '未知面试官'}
                        {alert.owner_name ? ` · 协同负责人：${alert.owner_name}` : ''}
                      </span>
                    )}
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <DrawerShell
        open={Boolean(selectedManagementAlert)}
        onClose={() => setSelectedManagementAlert(null)}
        title={selectedManagementAlert?.title ?? '管理提醒'}
        eyebrow="管理提醒详情"
        description="当前页展示接口已返回的提醒事实"
        size="md"
        testId="dashboard-management-alert-drawer"
        footer={selectedManagementAlert ? (
          <div className="flex w-full items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedManagementAlert(null)}>关闭</Button>
            <Link
              to={selectedManagementAlert.action_path || '/director/progress'}
              onClick={() => setSelectedManagementAlert(null)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              进入完整工作台
            </Link>
          </div>
        ) : undefined}
      >
        {selectedManagementAlert && (
          <div className="space-y-5">
            <section className="rounded-lg border border-hairline bg-surface-soft px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={alertTone(selectedManagementAlert.priority)}>
                  {alertKindLabel(selectedManagementAlert.kind)}
                </Badge>
                {selectedManagementAlert.stage_label && (
                  <Badge tone="neutral">{selectedManagementAlert.stage_label}</Badge>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-body">{selectedManagementAlert.detail}</p>
            </section>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Demand</dt>
                <dd className="mt-1 font-medium text-ink">#{selectedManagementAlert.demand_id}</dd>
              </div>
              {selectedManagementAlert.candidate_name && (
                <div>
                  <dt className="text-muted">候选人</dt>
                  <dd className="mt-1 font-medium text-ink">{selectedManagementAlert.candidate_name}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">当前负责人</dt>
                <dd className="mt-1 font-medium text-ink">{selectedManagementAlert.owner_name || '未指定'}</dd>
              </div>
              {selectedManagementAlert.kind === 'pending_interview_feedback' && (
                <div>
                  <dt className="text-muted">应补反馈面试官</dt>
                  <dd className="mt-1 font-medium text-ink">{selectedManagementAlert.interviewer_name || '未记录'}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">停留时间</dt>
                <dd className="mt-1 font-medium text-ink">{selectedManagementAlert.age_days} 天</dd>
              </div>
            </dl>
          </div>
        )}
      </DrawerShell>
    </section>
  );
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function RecruiterWorkloadPanel({
  stats,
  loading,
  error,
  onRetry,
  onOpenKpi,
}: {
  stats: DashboardStats;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onOpenKpi: (detail: DashboardKpiDetail) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">我的当前工作盘子</h2>
          <p className="mt-1 text-sm text-muted">展示当前在手需求与待办，不用于历史绩效、排名或奖金</p>
        </div>
        <Badge tone="neutral">当前状态</Badge>
      </div>
      {error ? (
        <DataUnavailableCard message={error} onRetry={onRetry} />
      ) : (
        <Reveal
          className="grid grid-cols-2 gap-4 lg:grid-cols-6"
          stagger={0.05}
          y={14}
        >
          <KpiCard
            label="活动需求"
            value={loading ? null : valueOrNull(stats.activeDemands)}
            accent="#FF9500"
            onActivate={() => onOpenKpi({
              label: '活动需求',
              value: valueOrNull(stats.activeDemands),
              description: '当前由你负责、仍在推进的招聘需求。进入需求列表后可继续查看 HC、负责人和阶段进度。',
              to: '/demands',
              actionLabel: '查看招聘需求',
            })}
          />
          <KpiCard
            label="当前流程人数"
            value={loading ? null : valueOrNull(stats.activeCandidates)}
            accent="#007AFF"
            onActivate={() => onOpenKpi({
              label: '当前流程人数',
              value: valueOrNull(stats.activeCandidates),
              description: '当前仍在招聘流程中的候选人总数，可在看板中按 Demand 和阶段继续查看。',
              to: '/kanban',
              actionLabel: '查看招聘看板',
            })}
          />
          <KpiCard
            label="业务待反馈"
            value={loading ? null : valueOrNull(stats.businessReview)}
            accent="#5856D6"
            onActivate={() => onOpenKpi({
              label: '业务待反馈',
              value: valueOrNull(stats.businessReview),
              description: '已推荐给用人部门、正在等待业务反馈的候选人。',
              to: '/kanban',
              actionLabel: '打开看板并选择需求',
            })}
          />
          <KpiCard
            label="面试中"
            value={loading ? null : valueOrNull(stats.interview)}
            accent="#AF52DE"
            onActivate={() => onOpenKpi({
              label: '面试中',
              value: valueOrNull(stats.interview),
              description: '当前已进入面试阶段的候选人，可继续查看安排与反馈状态。',
              to: '/interviews',
              actionLabel: '查看面试管理',
            })}
          />
          <KpiCard
            label="Offer 跟进"
            value={loading ? null : valueOrNull(stats.offer)}
            accent="#34C759"
            onActivate={() => onOpenKpi({
              label: 'Offer 跟进',
              value: valueOrNull(stats.offer),
              description: '当前进入 Offer 阶段、仍需要审批或候选人回复的记录。',
              to: '/offers',
              actionLabel: '查看 Offer',
            })}
          />
          <KpiCard
            label="待补反馈"
            value={loading ? null : valueOrNull(stats.outstandingFeedback)}
            accent="#FF3B30"
            onActivate={() => onOpenKpi({
              label: '待补反馈',
              value: valueOrNull(stats.outstandingFeedback),
              description: '已经完成面试但反馈仍未补齐的任务，需要及时提醒对应面试官。',
              to: '/interviews?status=pending_feedback',
              actionLabel: '查看待补反馈',
            })}
          />
        </Reveal>
      )}
    </section>
  );
}

function TodoCard({
  to,
  label,
  value,
  desc,
  icon: Icon,
  tone,
  onActivate,
}: {
  to: string;
  label: string;
  value: number | null;
  desc: string;
  icon: LucideIcon;
  tone: 'neutral' | 'warning' | 'success';
  onActivate: (detail: DashboardKpiDetail) => void;
}) {
  const toneClass = {
    neutral: 'bg-surface-soft text-muted',
    warning: 'bg-warning-50 text-warning-700',
    success: 'bg-success-50 text-success-700',
  }[tone];

  return (
    <button
      type="button"
      data-ui="dashboard-todo-trigger"
      onClick={() => onActivate({
        label,
        value,
        description: desc,
        to,
        actionLabel: '进入完整工作台',
      })}
      disabled={value === null}
      className="group block w-full rounded-apple text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-80"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-3 px-5 py-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{label}</span>
              <span className="font-display text-xl tabular-nums text-ink">
                {value === null ? '—' : <AnimatedNumber value={value} />}
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted">{desc}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </Card>
    </button>
  );
}

function RecruiterTodoPanel({
  stats,
  onOpenKpi,
}: {
  stats: DashboardStats;
  onOpenKpi: (detail: DashboardKpiDetail) => void;
}) {
  const feedbackPending = valueOrNull(stats.outstandingFeedback);
  const businessReview = valueOrNull(stats.businessReview);
  const interview = valueOrNull(stats.interview);
  const offer = valueOrNull(stats.offer);

  return (
    <section>
      <h2 className="mb-4 font-display text-lg text-ink">今日待办</h2>
      <Reveal
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        stagger={0.05}
        y={14}
      >
        <TodoCard
          to="/kanban"
          label="业务待反馈"
          value={businessReview}
          desc="推动用人部门确认"
          icon={Inbox}
          tone={businessReview && businessReview > 0 ? 'warning' : 'success'}
          onActivate={onOpenKpi}
        />
        <TodoCard
          to="/kanban"
          label="面试中跟进"
          value={interview}
          desc="关注候选人当前进展"
          icon={KanbanSquare}
          tone={interview && interview > 0 ? 'neutral' : 'success'}
          onActivate={onOpenKpi}
        />
        <TodoCard
          to="/interviews?status=pending_feedback"
          label="待补反馈"
          value={feedbackPending}
          desc="催补面试结论"
          icon={Clock3}
          tone={feedbackPending && feedbackPending > 0 ? 'warning' : 'success'}
          onActivate={onOpenKpi}
        />
        <TodoCard
          to="/kanban"
          label="Offer跟进"
          value={offer}
          desc="跟进发放与入职"
          icon={CheckCircle2}
          tone={offer && offer > 0 ? 'neutral' : 'success'}
          onActivate={onOpenKpi}
        />
      </Reveal>
    </section>
  );
}

function FeatureCard({
  to,
  label,
  desc,
  icon: Icon,
  gradient,
}: {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  gradient: string;
}) {
  return (
    <Link
      to={to}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-apple"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-4 px-5 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110"
            style={{ background: gradient }}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink">{label}</span>
              <ArrowRight className="h-4 w-4 text-muted-soft transition-all duration-300 group-hover:translate-x-1 group-hover:text-ink" />
            </div>
            <p className="mt-1 text-sm text-muted">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ─── 页面 ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { name, role, userId } = useAuth();
  const { stats, loading, errors, reload } = useDashboardStats(role, userId);
  const [kpiDetail, setKpiDetail] = useState<DashboardKpiDetail | null>(null);

  if (!role) return null;

  const info = ROLE_INFO[role];
  const RoleIcon = info.icon;
  const showOperationalKpis = role === 'manager' || role === 'admin' || role === 'recruiter';
  const showManagementAlerts = role === 'manager' || role === 'admin';
  const showRecruiterPanels = role === 'recruiter';
  const showInterviewerKpis = role === 'interviewer';

  const actions = workflowActionsForRole(role);
  const summaryError = role === 'interviewer'
    ? errors.assignments
    : errors.candidates ?? errors.jobs;

  return (
    <div data-ui="readdy-dashboard" className="space-y-6">
      {/* A. 角色欢迎横幅 */}
      <Reveal as="section" y={12} stagger={0.1}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: info.gradient }}
            >
              <RoleIcon className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight text-[#292b2a]">
                欢迎回来，{name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="glass">{info.label}</Badge>
                <p className="text-sm text-[#777b78]">{info.duty}</p>
              </div>
            </div>
          </div>
          <Link
            to={info.action.to}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b8d6cb] focus-visible:ring-offset-2"
            style={{ background: info.gradient }}
          >
            {info.action.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>

      {/* B. KPI 统计卡片区 */}
      <section>
        {summaryError && (
          <div className="mb-4">
            <DataUnavailableCard message={summaryError} onRetry={reload} />
          </div>
        )}
        <Reveal
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          stagger={0.07}
          y={16}
        >
          {showInterviewerKpis ? (
            <>
              <KpiCard
                label="待我反馈"
                value={stats.interviewerTasks.pendingFeedback}
                accent="#FF9500"
                onActivate={() => setKpiDetail({
                  label: '待我反馈',
                  value: stats.interviewerTasks.pendingFeedback,
                  description: '已分配给你、尚未提交面试反馈的任务。',
                  to: '/interviewer/interviews',
                  actionLabel: '查看我的面试',
                })}
              />
              <KpiCard
                label="今日面试"
                value={stats.interviewerTasks.todayInterviews}
                accent="#007AFF"
                onActivate={() => setKpiDetail({
                  label: '今日面试',
                  value: stats.interviewerTasks.todayInterviews,
                  description: '安排在今天且尚未取消的面试任务。',
                  to: '/interviewer/interviews',
                  actionLabel: '查看今日安排',
                })}
              />
              <KpiCard
                label="已反馈"
                value={stats.interviewerTasks.submittedFeedback}
                accent="#34C759"
                onActivate={() => setKpiDetail({
                  label: '已反馈',
                  value: stats.interviewerTasks.submittedFeedback,
                  description: '你已经提交反馈的有效面试任务。',
                  to: '/interviewer/interviews',
                  actionLabel: '查看反馈记录',
                })}
              />
              <KpiCard
                label="超时待反馈"
                value={stats.interviewerTasks.overdueFeedback}
                accent="#FF3B30"
                onActivate={() => setKpiDetail({
                  label: '超时待反馈',
                  value: stats.interviewerTasks.overdueFeedback,
                  description: '已超过反馈时限、仍需要你补充评价的面试任务。',
                  to: '/interviewer/interviews',
                  actionLabel: '立即补反馈',
                })}
              />
            </>
          ) : (
            <>
              <KpiCard
                label="候选人总数"
                value={stats.candidates}
                accent="#007AFF"
                onActivate={() => setKpiDetail({
                  label: '候选人总数',
                  value: stats.candidates,
                  description: '当前账号权限范围内可查看的真实候选人数量。',
                  to: '/candidates',
                  actionLabel: '查看候选人库',
                })}
              />
              <KpiCard
                label="岗位总数"
                value={stats.jobs}
                accent="#5856D6"
                onActivate={() => setKpiDetail({
                  label: '岗位总数',
                  value: stats.jobs,
                  description: '当前权限范围内的岗位画像数量，招聘需求仍按 Demand 独立管理。',
                  to: '/job-templates',
                  actionLabel: '查看岗位画像',
                })}
              />
              {showOperationalKpis && (
                <KpiCard
                  label="当前流程人数"
                  value={stats.activeCandidates}
                  accent="#FF9500"
                  onActivate={() => setKpiDetail({
                    label: '当前流程人数',
                    value: stats.activeCandidates,
                    description: '当前仍处于招聘流程中的候选人，可按 Demand 和阶段继续查看。',
                    to: '/kanban',
                    actionLabel: '查看招聘看板',
                  })}
                />
              )}
              {showOperationalKpis && (
                <KpiCard
                  label="活动需求"
                  value={stats.activeDemands}
                  accent="#34C759"
                  onActivate={() => setKpiDetail({
                    label: '活动需求',
                    value: stats.activeDemands,
                    description: '当前仍在确认或招聘中的真实招聘需求。',
                    to: '/demands',
                    actionLabel: '查看招聘需求',
                  })}
                />
              )}
            </>
          )}
        </Reveal>
      </section>

      {showManagementAlerts && (
        <ManagementAlerts
          alerts={stats.alerts}
          loading={loading}
          error={errors.bi}
          onRetry={reload}
        />
      )}

      {showRecruiterPanels && (
        <RecruiterWorkloadPanel
          stats={stats}
          loading={loading}
          error={errors.bi}
          onRetry={reload}
          onOpenKpi={setKpiDetail}
        />
      )}

      {showRecruiterPanels && !errors.bi && (
        <RecruiterTodoPanel stats={stats} onOpenKpi={setKpiDetail} />
      )}

      {/* C. 常用动作 */}
      <section>
        <h2 className="mb-4 font-display text-lg text-ink">常用动作</h2>
        <Reveal
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          stagger={0.06}
          y={16}
        >
          {actions.map((item, i) => {
            const gradients = [
              'linear-gradient(135deg, #007AFF, #5856D6)',
              'linear-gradient(135deg, #AF52DE, #FF2D55)',
              'linear-gradient(135deg, #FF9500, #FF2D55)',
              'linear-gradient(135deg, #34C759, #5AC8FA)',
              'linear-gradient(135deg, #5856D6, #AF52DE)',
              'linear-gradient(135deg, #007AFF, #34C759)',
            ];
            return (
              <FeatureCard
                key={item.to}
                to={item.to}
                label={item.label}
                desc={item.desc}
                icon={item.icon}
                gradient={gradients[i % gradients.length]}
              />
            );
          })}
        </Reveal>
      </section>

      <DrawerShell
        open={Boolean(kpiDetail)}
        onClose={() => setKpiDetail(null)}
        title={kpiDetail?.label ?? '指标明细'}
        eyebrow="工作台指标"
        description="数字来自当前账号权限范围内的真实业务数据"
        size="md"
        testId="dashboard-kpi-drawer"
        footer={kpiDetail ? (
          <div className="flex w-full items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setKpiDetail(null)}>关闭</Button>
            <Link
              to={kpiDetail.to}
              onClick={() => setKpiDetail(null)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--enterprise-brand)] px-5 text-sm font-semibold text-white hover:bg-[var(--enterprise-brand-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {kpiDetail.actionLabel}
            </Link>
          </div>
        ) : undefined}
      >
        {kpiDetail && (
          <div className="space-y-5">
            <section className="rounded-lg border border-hairline bg-surface-soft px-5 py-5">
              <p className="text-sm text-muted">{kpiDetail.label}</p>
              <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">{kpiDetail.value ?? '—'}</p>
            </section>
            <section>
              <h3 className="text-sm font-semibold text-ink">这个数字代表什么</h3>
              <p className="mt-2 text-sm leading-6 text-body">{kpiDetail.description}</p>
            </section>
          </div>
        )}
      </DrawerShell>
    </div>
  );
}
