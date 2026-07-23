import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Inbox,
  KanbanSquare,
  LineChart,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { BiManagerAlert, InterviewAssignment, Role } from '../types';

interface RoleInfo {
  label: string;
  duty: string;
  icon: LucideIcon;
  action: { to: string; label: string };
}

const ROLE_INFO: Record<Role, RoleInfo> = {
  recruiter: {
    label: '招聘专员',
    duty: '管理招聘需求与候选人，跟进筛选、面试和 Offer',
    icon: UserCog,
    action: { to: '/upload', label: '上传简历' },
  },
  manager: {
    label: '招聘经理',
    duty: '关注团队招聘进度与卡点，协调责任人完成需求',
    icon: LineChart,
    action: { to: '/bi', label: '查看进度与卡点' },
  },
  admin: {
    label: '管理员',
    duty: '保障账号、权限与招聘流程稳定运行',
    icon: ShieldCheck,
    action: { to: '/bi', label: '查看进度与卡点' },
  },
  interviewer: {
    label: '面试官',
    duty: '处理分配给我的面试安排与反馈',
    icon: ClipboardCheck,
    action: { to: '/interviews', label: '查看我的面试' },
  },
};

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
    to: '/pipeline',
    label: '跟进候选人流程',
    desc: '推进初筛、面试、Offer 和淘汰沉淀',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/interviews',
    label: '我的面试',
    desc: '查看安排并填写评分和评价',
    icon: ClipboardCheck,
    roles: ['interviewer'],
  },
  {
    to: '/bi',
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
  recruiter: ['/upload', '/demands', '/pipeline'],
  manager: ['/bi', '/pipeline', '/agent'],
  admin: ['/bi', '/admin/settings', '/agent'],
  interviewer: ['/interviews'],
};

function workflowActionsForRole(role: Role): WorkflowAction[] {
  const allowed = WORKFLOW_ACTIONS.filter((item) => item.roles.includes(role));
  return ACTION_ORDER_BY_ROLE[role]
    .map((to) => allowed.find((item) => item.to === to))
    .filter((item): item is WorkflowAction => item !== undefined);
}

interface InterviewerTaskStats {
  pendingFeedback: number | null;
  todayInterviews: number | null;
  submittedFeedback: number | null;
  overdueFeedback: number | null;
}

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

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

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
    overdueFeedback: activeAssignments.filter(
      (item) => item.is_overdue && !item.feedback_submitted,
    ).length,
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
    const wantsOwnBi = role === 'recruiter' && userId !== null;
    const wantsInterviewTasks = role === 'interviewer';
    const candidatesP = wantsInterviewTasks ? Promise.resolve([]) : api.listCandidates();
    const jobsP = wantsInterviewTasks ? Promise.resolve([]) : api.listJobs();
    const biP = wantsTeamBi
      ? api.biOverview()
      : wantsOwnBi
        ? api.biStaff(userId)
        : Promise.resolve(null);
    const assignmentsP = wantsInterviewTasks
      ? api.listInterviewAssignments()
      : Promise.resolve<InterviewAssignment[]>([]);

    Promise.allSettled([candidatesP, jobsP, biP, assignmentsP]).then(
      ([candidatesR, jobsR, biR, assignmentsR]) => {
        if (!active) return;

        const next: DashboardStats = { ...EMPTY_STATS };
        const nextErrors: DashboardErrors = {};

        if (candidatesR.status === 'fulfilled') {
          next.candidates = candidatesR.value.length;
        }
        if (candidatesR.status === 'rejected') {
          nextErrors.candidates = '候选人数据暂不可用';
        }
        if (jobsR.status === 'fulfilled') {
          next.jobs = jobsR.value.length;
        }
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
            next.activeDemands = biR.value.demands.filter(
              (item) => item.status === 'pending' || item.status === 'active',
            ).length;
            next.activeCandidates = valueOrNull(funnel.pipeline_total);
            next.businessReview = valueOrNull(funnel.business_review);
            next.interview = valueOrNull(funnel.interview);
            next.offer = valueOrNull(funnel.offer);
            next.outstandingFeedback = biR.value.demands
              .filter((item) => item.status === 'pending' || item.status === 'active')
              .reduce((total, item) => total + item.outstanding_feedback, 0);
            next.alerts = biR.value.alerts;
          }
        }
        if (biR.status === 'rejected' && (wantsTeamBi || wantsOwnBi)) {
          nextErrors.bi = '招聘进度数据暂不可用';
        }
        if (role === 'recruiter' && userId === null) {
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

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#edf0f2] bg-white shadow-[0_8px_28px_rgba(16,24,40,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 border-b border-[#edf0f2] px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-bold text-[#171a1f]">{title}</span>
        <span className="flex items-center gap-3">
          {right}
          <ChevronDown
            className={`h-4 w-4 text-[#9aa0a8] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && children}
    </section>
  );
}

function StatusCard({
  to,
  value,
  label,
  icon: Icon,
  tone,
}: {
  to: string;
  value: number | null;
  label: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-[92px] items-center gap-3 rounded-xl border border-[#edf0f2] bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-[#b9ead7] hover:shadow-sm"
    >
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none text-[#171a1f]">
            {value === null ? '—' : value}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-[#666b73]">{label}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
      </div>
    </Link>
  );
}

function DataUnavailableCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#ffe0bd] bg-[#fff7ef] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-3 text-sm text-[#a95e20]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="block font-bold">数据暂不可用</span>
          <span className="mt-1 block text-[#7b818b]">{message}，这不是业务数据为 0。</span>
        </span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#f2c99f] bg-white px-4 text-sm font-bold text-[#a95e20] hover:border-[#e3a665]"
      >
        <RefreshCw className="h-4 w-4" />
        重新加载
      </button>
    </div>
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
  if (error) {
    return (
      <section>
        <h2 className="mb-3 text-base font-bold text-[#171a1f]">管理提醒</h2>
        <DataUnavailableCard message={error} onRetry={onRetry} />
      </section>
    );
  }

  return (
    <CollapsibleSection
      title="管理提醒"
      right={
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            alerts.length > 0
              ? 'bg-[#fff0e7] text-[#ff7b43]'
              : 'bg-[#e8f7f1] text-[#168a5b]'
          }`}
        >
          {loading ? '加载中' : alerts.length > 0 ? `${alerts.length} 项待协调` : '暂无明显卡点'}
        </span>
      }
    >
      {loading ? (
        <div className="flex items-center gap-3 px-6 py-5 text-sm font-semibold text-[#7b818b]">
          <Clock3 className="h-4 w-4" />
          正在加载管理提醒…
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-5 text-sm font-semibold text-[#7b818b]">
          <CheckCircle2 className="h-4 w-4 text-[#168a5b]" />
          当前没有需要协调的招聘需求卡点或待补反馈。
        </div>
      ) : (
        <div className="divide-y divide-[#f0f1f2]">
          {alerts.slice(0, 5).map((alert) => (
            <Link
              key={`${alert.kind}-${alert.demand_id}-${alert.candidate_id}-${alert.stage}`}
              to={alert.action_path}
              className="group flex items-start gap-4 px-6 py-4 transition hover:bg-[#fbfcfc]"
            >
              <span
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  alert.priority === 'high'
                    ? 'bg-[#ffe9d8] text-[#ff7b43]'
                    : 'bg-[#e8f7f1] text-[#168a5b]'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#171a1f]">{alert.title}</span>
                  <span className="rounded-md bg-[#f5f6f6] px-2 py-1 text-xs font-bold text-[#666b73]">
                    {alertKindLabel(alert.kind)}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-[#666b73]">{alert.detail}</span>
                {alert.kind === 'pending_interview_feedback' && (
                  <span className="mt-1 block text-xs text-[#8a8f98]">
                    应补反馈面试官：{alert.interviewer_name || '未知面试官'}
                    {alert.owner_name ? ` · 协同负责人：${alert.owner_name}` : ''}
                  </span>
                )}
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
            </Link>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function RecruiterWorkloadPanel({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: DashboardStats;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-[#171a1f]">我的当前工作盘子</h2>
          <p className="mt-1 text-sm font-semibold text-[#7b818b]">
            展示当前在手需求与待办，不用于历史绩效、排名或奖金
          </p>
        </div>
        <DataUnavailableCard message={error} onRetry={onRetry} />
      </section>
    );
  }

  const cards = [
    { label: '活动需求', value: stats.activeDemands, to: '/demands?status=active' },
    { label: '当前流程人数', value: stats.activeCandidates, to: '/pipeline' },
    { label: '业务待反馈', value: stats.businessReview, to: '/pipeline?stage=business_review' },
    { label: '面试中', value: stats.interview, to: '/pipeline?stage=interview' },
    { label: 'Offer 跟进', value: stats.offer, to: '/pipeline?stage=offer' },
    { label: '待补反馈', value: stats.outstandingFeedback, to: '/interviews?focus=pending' },
  ];

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-bold text-[#171a1f]">我的当前工作盘子</h2>
        <p className="mt-1 text-sm font-semibold text-[#7b818b]">
          展示当前在手需求与待办，不用于历史绩效、排名或奖金
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="rounded-xl border border-[#edf0f2] bg-white p-4 shadow-[0_8px_28px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-[#b9ead7]"
          >
            <p className="text-xs font-bold text-[#8a8f98]">{card.label}</p>
            <p className="mt-3 text-2xl font-black text-[#171a1f]">
              {loading || card.value === null ? '—' : card.value}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TodoCard({
  to,
  label,
  value,
  desc,
  icon: Icon,
  urgent,
}: {
  to: string;
  label: string;
  value: number | null;
  desc: string;
  icon: LucideIcon;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-xl border border-[#edf0f2] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#b9ead7] hover:shadow-sm"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          urgent ? 'bg-[#ffe9d8] text-[#ff7b43]' : 'bg-[#d8f2e7] text-[#168a5b]'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-bold text-[#171a1f]">{label}</span>
          <span className="text-xl font-black text-[#171a1f]">{value === null ? '—' : value}</span>
        </span>
        <span className="mt-1 block text-sm font-semibold text-[#7b818b]">{desc}</span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
    </Link>
  );
}

function RecruiterTodoPanel({ stats }: { stats: DashboardStats }) {
  const businessReview = valueOrNull(stats.businessReview);
  const interview = valueOrNull(stats.interview);
  const feedbackPending = valueOrNull(stats.outstandingFeedback);
  const offer = valueOrNull(stats.offer);

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-[#171a1f]">今日待办</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TodoCard
          to="/pipeline?stage=business_review"
          label="业务待反馈"
          value={businessReview}
          desc="推动用人部门确认"
          icon={Inbox}
          urgent={Boolean(businessReview)}
        />
        <TodoCard
          to="/pipeline?stage=interview"
          label="面试中跟进"
          value={interview}
          desc="关注候选人当前进展"
          icon={KanbanSquare}
        />
        <TodoCard
          to="/interviews?focus=pending"
          label="待补反馈"
          value={feedbackPending}
          desc="催补面试结论"
          icon={Clock3}
          urgent={Boolean(feedbackPending)}
        />
        <TodoCard
          to="/pipeline?stage=offer"
          label="Offer 跟进"
          value={offer}
          desc="跟进发放与入职"
          icon={CheckCircle2}
        />
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { name, role, userId } = useAuth();
  const { stats, loading, errors, reload } = useDashboardStats(role, userId);

  if (!role) return null;

  const info = ROLE_INFO[role];
  const RoleIcon = info.icon;
  const actions = workflowActionsForRole(role);
  const showManagementAlerts = role === 'manager' || role === 'admin';
  const showRecruiterPanels = role === 'recruiter';
  const showInterviewerKpis = role === 'interviewer';
  const summaryError = showInterviewerKpis
    ? errors.assignments
    : errors.candidates ?? errors.jobs;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-[#dcefe7] bg-[linear-gradient(135deg,#f7fcfa,#edf8f3)] p-6 shadow-[0_8px_28px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#168a5b] text-white shadow-sm">
            <RoleIcon className="h-6 w-6" />
          </span>
          <span>
            <h1 className="text-2xl font-black tracking-normal text-[#171a1f]">
              欢迎回来，{name}
            </h1>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#168a5b] shadow-sm">
                {info.label}
              </span>
              <span className="text-sm font-semibold text-[#666b73]">{info.duty}</span>
            </span>
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e9e1] bg-white px-4 text-sm font-bold text-[#666b73] hover:border-[#a9d7c4]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '加载中' : '重新加载'}
          </button>
          <Link
            to={info.action.to}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#33a474] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#258d61]"
          >
            {info.action.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </span>
      </section>

      {summaryError && <DataUnavailableCard message={summaryError} onRetry={reload} />}

      <div className="grid gap-3 md:grid-cols-4">
        {showInterviewerKpis ? (
          <>
            <StatusCard
              to="/interviews?focus=pending"
              value={stats.interviewerTasks.pendingFeedback}
              label="待我反馈"
              icon={Clock3}
              tone="bg-[#ffe9d8] text-[#ff7b43]"
            />
            <StatusCard
              to="/interviews"
              value={stats.interviewerTasks.todayInterviews}
              label="今日面试"
              icon={ClipboardCheck}
              tone="bg-[#e6f7f0] text-[#168a5b]"
            />
            <StatusCard
              to="/interviews"
              value={stats.interviewerTasks.submittedFeedback}
              label="已反馈"
              icon={CheckCircle2}
              tone="bg-[#d8f2e7] text-[#168a5b]"
            />
            <StatusCard
              to="/interviews?focus=pending"
              value={stats.interviewerTasks.overdueFeedback}
              label="超时待反馈"
              icon={AlertTriangle}
              tone="bg-[#fff0e7] text-[#ff7b43]"
            />
          </>
        ) : (
          <>
            <StatusCard
              to="/candidates"
              value={stats.candidates}
              label="候选人总数"
              icon={UsersRound}
              tone="bg-[#d8f2e7] text-[#168a5b]"
            />
            <StatusCard
              to="/jobs"
              value={stats.jobs}
              label="岗位总数"
              icon={Briefcase}
              tone="bg-[#e8f0e5] text-[#6f845f]"
            />
            <StatusCard
              to="/pipeline"
              value={stats.activeCandidates}
              label="当前流程人数"
              icon={KanbanSquare}
              tone="bg-[#e6f7f0] text-[#168a5b]"
            />
            <StatusCard
              to="/demands?status=active"
              value={stats.activeDemands}
              label="活动需求"
              icon={Briefcase}
              tone="bg-[#ffe9d8] text-[#ff7b43]"
            />
          </>
        )}
      </div>

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
        />
      )}

      {showRecruiterPanels && !errors.bi && <RecruiterTodoPanel stats={stats} />}

      <section>
        <h2 className="mb-3 text-base font-bold text-[#171a1f]">常用动作</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-start gap-4 rounded-xl border border-[#edf0f2] bg-white p-5 shadow-[0_8px_28px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-[#b9ead7]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d8f2e7] text-[#168a5b]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-bold text-[#171a1f]">
                    {item.label}
                    <ArrowRight className="h-4 w-4 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-[#7b818b]">
                    {item.desc}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
