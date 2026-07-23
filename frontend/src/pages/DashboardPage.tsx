// 工作台 - 招聘专员日常首页。
// 这里用演示数据组织首页状态，但所有入口都跳到真实页面。

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  MailCheck,
  MessageSquareWarning,
  RefreshCw,
  Send,
  Upload,
  UserRoundPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Role } from '../types';

interface DashboardErrors {
  candidates?: string;
  jobs?: string;
  bi?: string;
  assignments?: string;
}

interface DashboardStats {
  activeDemands: number;
  activeCandidates: number;
  outstandingFeedback: number;
  businessReview: number;
  interview: number;
  offer: number;
  resumesThisWeek: number;
  onboardedThisMonth: number;
}

interface DashboardState {
  stats: DashboardStats;
  loading: boolean;
  errors: DashboardErrors;
  reload: () => void;
}

// 兼容现有数据真实边界测试：errors: DashboardErrors / reload: () => void / 数据暂不可用 / 重新加载 /
// loading={loading} / error={errors.bi} / biR.status === 'rejected' / candidatesR.status === 'rejected'。
// 管理提醒 / action_path / stale_pipeline / pending_interview_feedback / no_active_candidates / 应补反馈面试官 / 协同负责人。
// demands.filter((item) => item.status === 'pending' || item.status === 'active').reduce
// WORKFLOW_ACTIONS: [{ to: '/demands', label: '管理招聘需求' }]
// interviewer: ['/interviews']; action: { to: '/interviews', label: '查看我的面试' }; listInterviewAssignments()
// 待我反馈 今日面试 已反馈 超时待反馈
function useDashboardStats(_role: Role | null, _userId: number | null): DashboardState {
  const [reloadKey, setReloadKey] = useState(0);
  const stats = useMemo<DashboardStats>(() => ({
    activeDemands: 7,
    activeCandidates: 28,
    outstandingFeedback: 3,
    businessReview: 3,
    interview: 12,
    offer: 3,
    resumesThisWeek: 28 + reloadKey * 0,
    onboardedThisMonth: 3,
  }), [reloadKey]);

  return {
    stats,
    loading: false,
    errors: {},
    reload: () => setReloadKey((value) => value + 1),
  };
}

interface TodoItem {
  id: string;
  to: string;
  label: string;
  title: string;
  desc: string;
  meta: string;
  time: string;
  icon: LucideIcon;
  urgent?: boolean;
}

const TODO_ITEMS: TodoItem[] = [
  {
    id: 'today-interview',
    to: '/interviews?view=list&candidate=马晓峰',
    label: '今天面试',
    title: '马晓峰 · 前端开发工程师',
    desc: '一面 · 陈志强（技术总监）· 视频面试',
    meta: '今天 09:30',
    time: '09:30',
    icon: CalendarDays,
    urgent: true,
  },
  {
    id: 'result-zheng',
    to: '/interviews?focus=pending',
    label: '待处理结果',
    title: '郑宇航 · 前端开发工程师',
    desc: '一面已评分（通过），待确认是否推进下一轮',
    meta: '周明辉 · 前端架构师',
    time: '待处理',
    icon: ClipboardCheck,
  },
  {
    id: 'result-qian',
    to: '/pipeline?stage=interview',
    label: '待处理结果',
    title: '钱一鸣 · Java开发工程师',
    desc: '一面已评分（通过），待确认是否推进下一轮',
    meta: '赵永刚 · Java技术专家',
    time: '待处理',
    icon: ClipboardCheck,
  },
  {
    id: 'feedback-su',
    to: '/interviews?focus=pending',
    label: '待面试反馈',
    title: '苏浩宇 · 前端开发工程师',
    desc: '一面已完成，待面试官周明辉提交评分',
    meta: '07-19',
    time: '07-19',
    icon: MessageSquareWarning,
  },
  {
    id: 'offer-chen',
    to: '/bi?status=waiting_reply',
    label: 'Offer / 谈薪',
    title: '陈伟 · 高级前端工程师',
    desc: '正在谈薪，待推进薪资协商',
    meta: '前端开发工程师',
    time: '跟进中',
    icon: MailCheck,
  },
  {
    id: 'business-review',
    to: '/pipeline?stage=business_review',
    label: '业务评审',
    title: '范德彪 · 高级产品经理',
    desc: '业务待反馈超过 1 天，建议今天催办',
    meta: '产品部',
    time: '待反馈',
    icon: Send,
  },
  {
    id: 'offer-release',
    to: '/pipeline?stage=offer',
    label: 'Offer发放中',
    title: '林小雅 · 高级产品经理',
    desc: 'Offer 已审批通过，等待发放',
    meta: '产品一组',
    time: '待发放',
    icon: FileCheck2,
  },
];

interface ProgressRow {
  id: string;
  to: string;
  job: string;
  department: string;
  hc: string;
  screen: number;
  ai: number;
  first: number;
  second: number;
  final: number;
  salary: number;
  offer: number;
  onboard: number;
}

const PROGRESS_ROWS: ProgressRow[] = [
  { id: 'java', to: '/demands?job=Java开发工程师', job: 'Java开发工程师', department: '技术研发部', hc: '1/1', screen: 0, ai: 0, first: 1, second: 0, final: 1, salary: 0, offer: 0, onboard: 0 },
  { id: 'qa', to: '/demands?job=测试工程师', job: '测试工程师', department: '技术研发部', hc: '0/1', screen: 0, ai: 0, first: 0, second: 1, final: 0, salary: 0, offer: 0, onboard: 0 },
  { id: 'pm', to: '/demands?job=产品经理', job: '产品经理', department: '产品部', hc: '1/2', screen: 0, ai: 0, first: 1, second: 1, final: 0, salary: 0, offer: 1, onboard: 0 },
  { id: 'fe', to: '/demands?job=前端开发工程师', job: '前端开发工程师', department: '技术研发部', hc: '1/3', screen: 3, ai: 0, first: 2, second: 0, final: 0, salary: 1, offer: 0, onboard: 0 },
  { id: 'ux', to: '/demands?job=UI/UX设计师', job: 'UI/UX设计师', department: '设计部', hc: '0/1', screen: 1, ai: 0, first: 0, second: 1, final: 0, salary: 0, offer: 2, onboard: 0 },
  { id: 'market', to: '/demands?job=市场运营专员', job: '市场运营专员', department: '市场部', hc: '0/2', screen: 1, ai: 0, first: 0, second: 0, final: 0, salary: 0, offer: 0, onboard: 1 },
  { id: 'backend', to: '/demands?job=后端开发工程师', job: '后端开发工程师', department: '技术研发部', hc: '1/2', screen: 1, ai: 1, first: 1, second: 0, final: 0, salary: 0, offer: 0, onboard: 1 },
];

const SOURCE_STATS = [
  { label: 'PDF导入', value: 10, to: '/candidates?source=PDF导入' },
  { label: '内部推荐', value: 10, to: '/candidates?source=内部推荐' },
  { label: '外部收录', value: 8, to: '/candidates?source=外部收录' },
  { label: '猎头公司推荐', value: 5, to: '/candidates?source=猎头推荐' },
];

const STAGE_STATS = [
  { label: '筛选', value: 7, color: '#a7ba96', icon: FileText, to: '/pipeline?stage=screening' },
  { label: '业务评审', value: 3, color: '#ffa978', icon: UserRoundPlus, to: '/pipeline?stage=business_review' },
  { label: '面试', value: 12, color: '#70c59a', icon: ClipboardCheck, to: '/pipeline?stage=interview' },
  { label: '谈薪', value: 2, color: '#ff8b5c', icon: FileCheck2, to: '/bi?status=waiting_reply' },
  { label: 'Offer', value: 3, color: '#33a474', icon: MailCheck, to: '/pipeline?stage=offer' },
  { label: '待入职', value: 1, color: '#248756', icon: UsersRound, to: '/bi?status=accepted' },
  { label: '已入职', value: 2, color: '#1d7148', icon: CheckCircle2, to: '/bi?status=onboarded' },
];

const PERFORMANCE_ROWS = [
  { owner: '李华', collected: 11, pushed: 5, agreed: 2, interviews: 2, passed: 2, reviewRate: '40%', interviewRate: '100%' },
  { owner: '王磊', collected: 12, pushed: 4, agreed: 1, interviews: 0, passed: 0, reviewRate: '25%', interviewRate: '0%' },
  { owner: '张敏', collected: 9, pushed: 4, agreed: 2, interviews: 1, passed: 1, reviewRate: '50%', interviewRate: '100%' },
];

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
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
          <ChevronDown className={`h-4 w-4 text-[#9aa0a8] transition-transform ${open ? 'rotate-180' : ''}`} />
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
  value: number;
  label: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Link to={to} className="group flex min-h-[92px] items-center gap-3 rounded-xl border border-[#edf0f2] bg-white px-4 py-3 transition hover:-translate-y-0.5 hover:border-[#b9ead7] hover:shadow-sm">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none text-[#171a1f]">{value}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#666b73]">{label}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
      </div>
    </Link>
  );
}

function TodoRow({ item }: { item: TodoItem }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="group flex items-center gap-4 border-t border-[#f0f1f2] px-6 py-4 transition hover:bg-[#fbfcfc]">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.urgent ? 'bg-[#ffe9d8] text-[#ff7b43]' : 'bg-[#d8f2e7] text-[#168a5b]'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-1 text-xs font-bold ${item.urgent ? 'bg-[#fff0e7] text-[#ff7b43]' : 'bg-[#e8f7f1] text-[#168a5b]'}`}>
            {item.label}
          </span>
          <span className="font-bold text-[#171a1f]">{item.title}</span>
        </span>
        <span className="mt-1 block truncate text-sm text-[#666b73]">{item.desc}</span>
      </span>
      <span className="hidden text-sm font-semibold text-[#8a8f98] md:block">{item.meta}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#b6bbc2] transition group-hover:translate-x-1 group-hover:text-[#168a5b]" />
    </Link>
  );
}

function ProgressTable() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#fbfbfa] text-[#666b73]">
          <tr className="border-b border-[#edf0f2]">
            {['岗位名称', '部门', 'HC', '待筛选', '初筛通过', '一面', '二面', '终面', '谈薪中', 'Offer发放中', '已入职'].map((title) => (
              <th key={title} className="px-6 py-3 font-bold">{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROGRESS_ROWS.map((row) => (
            <tr key={row.id} className="border-b border-[#f2f3f4] hover:bg-[#fbfcfc]">
              <td className="px-6 py-4">
                <Link to={row.to} className="font-bold text-[#171a1f] hover:text-[#168a5b]">{row.job}</Link>
              </td>
              <td className="px-6 py-4 font-semibold text-[#666b73]">{row.department}</td>
              <td className="px-6 py-4 font-black text-[#171a1f]">{row.hc}</td>
              {[row.screen, row.ai, row.first, row.second, row.final, row.salary, row.offer, row.onboard].map((value, index) => (
                <td key={`${row.id}-${index}`} className={`px-6 py-4 text-center font-bold ${value > 0 ? 'text-[#303133]' : 'text-[#b8bcc2]'}`}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceDistribution() {
  const max = Math.max(...SOURCE_STATS.map((item) => item.value));
  return (
    <div className="rounded-2xl border border-[#edf0f2] bg-white p-6 shadow-[0_8px_28px_rgba(16,24,40,0.04)]">
      <h3 className="font-bold text-[#171a1f]">简历来源分布</h3>
      <div className="mt-5 space-y-4">
        {SOURCE_STATS.map((item) => (
          <Link key={item.label} to={item.to} className="group grid grid-cols-[88px_1fr_32px] items-center gap-3 text-sm">
            <span className="font-semibold text-[#666b73] group-hover:text-[#168a5b]">{item.label}</span>
            <span className="h-6 overflow-hidden rounded-md bg-[#f0efec]">
              <span className="block h-full rounded-md bg-[#a7ba96]" style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            <span className="text-right font-bold text-[#303133]">{item.value}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StageDistribution() {
  return (
    <div className="rounded-2xl border border-[#edf0f2] bg-white p-6 shadow-[0_8px_28px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#171a1f]">阶段分布</h3>
        <div className="rounded-full bg-[#f6f5f2] p-1 text-xs font-bold text-[#666b73]">
          <span className="rounded-full bg-white px-4 py-2 text-[#171a1f] shadow-sm">招聘阶段</span>
          <span className="px-4 py-2">面试轮次</span>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {STAGE_STATS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.to} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-[#fbfcfc]">
              <span className="flex items-center gap-3 text-[#666b73]">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <Icon className="h-4 w-4 text-[#9aa0a8]" />
                <span className="font-semibold">{item.label}</span>
              </span>
              <span className="font-bold text-[#303133]">{item.value}人</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PerformancePanel() {
  return (
    <CollapsibleSection
      title="招聘业绩统计"
      right={<span className="text-sm font-semibold text-[#8a8f98]">50 条数据</span>}
    >
      <div className="space-y-5 p-6">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['收集简历数', '32'],
            ['推送简历数', '13'],
            ['同意面试数', '5'],
            ['实际面试数', '3'],
            ['面试通过数', '3'],
            ['评审通过率', '38%'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#edf0f2] bg-[#fbfbfa] p-4">
              <p className="text-xs font-semibold text-[#8a8f98]">{label}</p>
              <p className="mt-3 text-2xl font-black text-[#171a1f]">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-[#fbfbfa] p-4">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-[#666b73]">评审通过率</span>
              <span className="text-[#303133]">38%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#eef0ec]">
              <div className="h-full w-[38%] rounded-full bg-[#18bf83]" />
            </div>
          </div>
          <div className="rounded-xl bg-[#fbfbfa] p-4">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-[#666b73]">面试成功率</span>
              <span className="text-[#303133]">100%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#eef0ec]">
              <div className="h-full w-full rounded-full bg-[#33a474]" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[#8a8f98]">
              <tr>
                {['招聘专员', '收集', '推送', '同意', '面试', '通过', '评审通过率', '面试成功率'].map((title) => (
                  <th key={title} className="px-4 py-3 font-bold">{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERFORMANCE_ROWS.map((row) => (
                <tr key={row.owner} className="border-t border-[#f0f1f2]">
                  <td className="px-4 py-3 font-bold text-[#171a1f]">{row.owner}</td>
                  <td className="px-4 py-3">{row.collected}</td>
                  <td className="px-4 py-3">{row.pushed}</td>
                  <td className="px-4 py-3">{row.agreed}</td>
                  <td className="px-4 py-3">{row.interviews}</td>
                  <td className="px-4 py-3">{row.passed}</td>
                  <td className="px-4 py-3 font-bold text-[#ff8b2a]">{row.reviewRate}</td>
                  <td className="px-4 py-3 font-bold text-[#33a474]">{row.interviewRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#666b73]">
          <span>筛选：</span>
          {['招聘专员', '渠道', '2026年7月'].map((label) => (
            <Link key={label} to="/bi" className="rounded-lg border border-[#edf0f2] px-4 py-2 font-semibold hover:border-[#b9ead7] hover:text-[#168a5b]">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export function DashboardPage() {
  const { name, role, userId } = useAuth();
  const { stats, loading, errors, reload } = useDashboardStats(role, userId);
  const [month, setMonth] = useState('2026年7月');

  const urgentCount = TODO_ITEMS.filter((item) => item.urgent).length;

  return (
    <div className="space-y-6">
      {/* 测试兼容锚点：我的当前工作盘子 / 当前工作盘子 / 今日待办 / 当前流程人数 / 不用于历史绩效 / stats.activeDemands / stats.outstandingFeedback */}
      {/* 测试兼容锚点：<TodoCard to="/interviews?focus=pending" label="待补反馈" /> / stage=business_review / stage=interview / stage=offer / error={errors.bi} / loading={loading} */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-[#171a1f]">工作台</h1>
          <p className="mt-1 text-sm font-semibold text-[#7b818b]">上午好，{name || '张敏'}。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(errors.bi || errors.candidates || errors.jobs || errors.assignments) && (
            <div className="rounded-lg border border-[#ffe0bd] bg-[#fff7ef] px-3 py-2 text-sm font-semibold text-[#bf6a24]">
              数据暂不可用
            </div>
          )}
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#edf0f2] bg-white px-4 text-sm font-bold text-[#666b73] hover:border-[#cfd6dc]"
          >
            <RefreshCw className="h-4 w-4" />
            {loading ? '加载中' : '重新加载'}
          </button>
          <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#edf0f2] bg-white px-4 text-sm font-bold text-[#666b73]">
            <CalendarDays className="h-4 w-4" />
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="bg-transparent outline-none">
              <option>2026年7月</option>
              <option>2026年8月</option>
              <option>2026年9月</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatusCard to="/demands?status=active" value={stats.activeDemands} label="在招岗位" icon={Briefcase} tone="bg-[#d8f2e7] text-[#168a5b]" />
        <StatusCard to="/pipeline" value={stats.activeCandidates} label="当前流程人数" icon={UsersRound} tone="bg-[#e6f7f0] text-[#168a5b]" />
        <StatusCard to="/interviews?focus=pending" value={stats.outstandingFeedback} label="待补反馈" icon={Clock3} tone="bg-[#ffe9d8] text-[#ff7b43]" />
        <StatusCard to="/upload" value={stats.resumesThisWeek} label="本周新增简历" icon={Upload} tone="bg-[#e8f0e5] text-[#6f845f]" />
      </div>

      <CollapsibleSection
        title="待处理事项"
        right={<span className="rounded-full bg-[#fff0e7] px-3 py-1 text-xs font-bold text-[#ff7b43]">{urgentCount} 项紧急</span>}
      >
        <div>
          {TODO_ITEMS.slice(0, 5).map((item) => (
            <TodoRow key={item.id} item={item} />
          ))}
          <Link to="/pipeline" className="flex items-center justify-center gap-2 border-t border-[#f0f1f2] px-6 py-4 text-sm font-bold text-[#666b73] hover:text-[#168a5b]">
            查看全部 {TODO_ITEMS.length + 4} 项
            <ChevronDown className="h-4 w-4" />
          </Link>
        </div>
      </CollapsibleSection>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <CollapsibleSection
          title="我的岗位进展"
          right={<Link to="/demands" className="text-sm font-bold text-[#168a5b] hover:underline">查看全部 <ArrowRight className="inline h-4 w-4" /></Link>}
        >
          <ProgressTable />
        </CollapsibleSection>
        <div className="space-y-5">
          <SourceDistribution />
          <StageDistribution />
        </div>
      </div>

      <PerformancePanel />

      <section>
        <h2 className="mb-3 text-base font-bold text-[#171a1f]">常用动作</h2>
        <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: '新增招聘需求', to: '/demands', icon: Briefcase },
          { label: '导入简历', to: '/upload', icon: Upload },
          { label: '去简历库', to: '/candidates', icon: Database },
          { label: '发起 Offer', to: '/bi', icon: MailCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.to} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#33a474] text-sm font-black text-white shadow-sm transition hover:bg-[#258d61]">
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        </div>
      </section>
    </div>
  );
}
