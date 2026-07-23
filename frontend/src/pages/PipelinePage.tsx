// 面试管理页 — 按招聘需求管理每位候选人的当前阶段，
// 并支持在右侧详情中推进、淘汰、跳转阶段与加入新候选人。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarDays,
  Eye,
  KanbanSquare,
  List,
  Search,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  Card,
  useToast,
} from '../components/ui';
import type {
  CandidateDispositionInput,
  InterviewAssignment,
  InterviewerOption,
  InterviewRound,
  PipelineStage,
  PipelineBoardCandidate,
  RecruitmentDemand,
} from '../types';
import { STAGES, stageLabel } from '../lib/pipelineStages';
import { AddToPipeline } from '../components/pipeline/AddToPipeline';
import { PipelineCandidatePanel } from '../components/pipeline/PipelineCandidatePanel';

function formatDemandOption(demand: RecruitmentDemand) {
  return [
    demand.request_no || `REQ-${demand.id}`,
    demand.job_title,
    demand.job_department,
    demand.job_city,
    demand.owner_hr_name,
  ].filter(Boolean).join(' · ');
}

const PREFERRED_STAGE_ORDER: PipelineStage[] = [
  'business_review',
  'interview',
  'offer',
  'ai_screen',
  'pending',
  'transferred',
  'rejected',
  'onboarded',
];

function parseStageParam(value: string | null): PipelineStage | null {
  if (!value) return null;
  return STAGES.some((stage) => stage.key === value) ? (value as PipelineStage) : null;
}

interface PendingMove {
  candidateId: number;
  toStage: PipelineStage;
}

type InterviewMenu = 'candidate' | 'job' | 'city' | 'department' | 'round' | 'schedule' | 'action' | null;
type ViewMode = 'list' | 'calendar';

const ROUND_LABELS: Record<string, string> = {
  round_1: '一面',
  round_2: '二面',
  round_3: '三面',
  additional: '加面',
  hr: 'HR 面',
  business: '业务面',
  technical: '技术面',
  interview_first: '一面',
  interview_second: '二面',
  interview_final: '终面',
};

const ROUND_ACTIONS: InterviewRound[] = ['round_1', 'round_2', 'round_3', 'hr'];
const EMPTY_PIPELINE_CANDIDATES: PipelineBoardCandidate[] = [];
const EMPTY_ASSIGNMENTS: InterviewAssignment[] = [];

function candidateInitial(name: string) {
  return name.replace(/^候选人\s*/, '').trim().slice(0, 1) || '候';
}

function roundForCandidate(candidate: PipelineBoardCandidate): InterviewRound {
  return candidate.stage === 'offer' ? 'round_2' : 'round_1';
}

function roundLabel(round: string | null | undefined) {
  return round ? ROUND_LABELS[round] ?? round : '一面';
}

function latestAssignment(assignments: InterviewAssignment[], candidateId: number) {
  return assignments
    .filter((assignment) => assignment.candidate_id === candidateId && assignment.status !== 'cancelled')
    .sort((a, b) => {
      const left = new Date(a.scheduled_at ?? a.created_at ?? 0).getTime();
      const right = new Date(b.scheduled_at ?? b.created_at ?? 0).getTime();
      return right - left;
    })[0] ?? null;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function formatTimeInput(value: string | null | undefined) {
  if (!value) return '10:00';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '10:00' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatSchedule(value: string | null | undefined) {
  if (!value) return '尚未安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HeaderFilter({
  label,
  menu,
  openMenu,
  onOpen,
  children,
}: {
  label: string;
  menu: InterviewMenu;
  openMenu: InterviewMenu;
  onOpen: (menu: InterviewMenu) => void;
  children?: React.ReactNode;
}) {
  return (
    <th className="relative px-6 py-4 font-semibold text-[#5f646d]">
      <button
        type="button"
        onClick={() => onOpen(openMenu === menu ? null : menu)}
        className="inline-flex items-center gap-1 hover:text-[#168a5b]"
      >
        {label}
        <span className="text-xs text-[#9aa0a8]">▾</span>
      </button>
      {openMenu === menu && children}
    </th>
  );
}

function FilterMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-5 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-[#edf0f2] bg-white py-2 shadow-xl">
      {children}
    </div>
  );
}

function FilterItem({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-[#eef8f3] ${
        active ? 'bg-[#e9f7f1] text-[#168a5b]' : 'text-[#4f555d]'
      }`}
    >
      {children}
    </button>
  );
}

function InterviewAdjustModal({
  candidate,
  demand,
  assignment,
  interviewers,
  saving,
  onClose,
  onCancel,
  onSubmit,
}: {
  candidate: PipelineBoardCandidate;
  demand: RecruitmentDemand;
  assignment: InterviewAssignment | null;
  interviewers: InterviewerOption[];
  saving: boolean;
  onClose: () => void;
  onCancel: (assignment: InterviewAssignment) => void;
  onSubmit: (payload: {
    interviewerId: number;
    date: string;
    time: string;
    duration: string;
    mode: string;
    location: string;
  }) => void;
}) {
  const defaultInterviewer = assignment?.interviewer_id ?? demand.default_interviewer_id ?? interviewers[0]?.id ?? 0;
  const [interviewerId, setInterviewerId] = useState(String(defaultInterviewer));
  const [date, setDate] = useState(formatDateInput(assignment?.scheduled_at));
  const [time, setTime] = useState(formatTimeInput(assignment?.scheduled_at));
  const [duration, setDuration] = useState('60');
  const [mode, setMode] = useState(assignment?.location?.includes('视频') ? 'video' : assignment?.location?.includes('微信') ? 'wechat' : 'offline');
  const [location, setLocation] = useState(assignment?.location || '');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[calc(100vh-48px)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 flex items-start justify-between border-b border-[#edf0f2] px-7 py-6">
          <div>
            <h2 className="text-2xl font-bold text-[#171a1f]">{assignment ? '查看面试安排' : '安排面试'}</h2>
            <p className="mt-2 text-sm font-semibold text-[#777c84]">
              {candidate.name_masked} · {demand.job_title} · {roundLabel(assignment?.round ?? roundForCandidate(candidate))}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f4f5f6]" aria-label="关闭调整面试">
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset
          disabled={Boolean(assignment)}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-7 py-6 disabled:opacity-75"
        >
          {assignment && (
            <p className="rounded-xl border border-[#ffd9bd] bg-[#fff7ef] px-4 py-3 text-sm font-semibold text-[#a85c2e]">
              已有生效中的面试安排。如需改期、更换面试官或调整轮次，请先取消原任务并填写原因，再重新安排。
            </p>
          )}
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#303133]">面试官 <span className="text-[#f05a48]">*</span></span>
            <select
              value={interviewerId}
              onChange={(event) => setInterviewerId(event.target.value)}
              className="h-14 w-full rounded-xl border border-[#edf0f2] bg-white px-4 font-semibold outline-none focus:border-[#33a474]"
            >
              <option value="">请选择面试官</option>
              {interviewers.map((interviewer) => (
                <option key={interviewer.id} value={interviewer.id}>
                  {interviewer.name}{interviewer.email ? ` · ${interviewer.email}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-[#303133]">面试日期 <span className="text-[#f05a48]">*</span></span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-14 w-full rounded-xl border border-[#edf0f2] px-4 text-lg outline-none focus:border-[#33a474]" />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold text-[#303133]">开始时间 <span className="text-[#f05a48]">*</span></span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-14 w-full rounded-xl border border-[#edf0f2] px-4 text-lg outline-none focus:border-[#33a474]" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#303133]">预计时长</span>
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className="h-14 w-full rounded-xl border border-[#edf0f2] px-4 text-lg outline-none">
              <option value="30">30 分钟</option>
              <option value="45">45 分钟</option>
              <option value="60">60 分钟</option>
              <option value="90">90 分钟</option>
            </select>
          </label>

          <div>
            <p className="mb-3 text-sm font-bold text-[#303133]">面试方式</p>
            <div className="flex flex-wrap gap-3">
              {[
                ['offline', '线下面试'],
                ['video', '视频面试'],
                ['wechat', '企业微信会议'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`h-12 rounded-xl px-5 font-bold ${
                    mode === key ? 'bg-[#33a474] text-white' : 'bg-[#f6f5f2] text-[#555b64] hover:bg-[#ecefeb]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[#303133]">会议室 <span className="text-[#f05a48]">*</span></span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className="h-14 w-full rounded-xl border border-[#edf0f2] px-4 text-lg outline-none focus:border-[#33a474]" />
          </label>

          <p className="rounded-2xl bg-[#fbfaf8] px-5 py-4 text-sm font-semibold text-[#6b717a]">
            保存后系统会生成面试任务，并按当前通知配置向面试官发送通知；投递失败可在面试任务中重试。
          </p>
        </fieldset>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f2] bg-white px-7 py-5">
          {assignment ? (
            <Button
              type="button"
              variant="danger"
              loading={saving}
              disabled={saving}
              className="border border-[#ffb6ad] bg-white text-[#f04438] hover:bg-[#fff1ef]"
              onClick={() => onCancel(assignment)}
            >
              <XCircle className="h-4 w-4" />
              取消面试
            </Button>
          ) : <span />}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
            {!assignment && (
              <Button
                type="button"
                loading={saving}
                disabled={saving || !interviewerId || !date || !time || !location.trim()}
                onClick={() => onSubmit({
                  interviewerId: Number(interviewerId),
                  date,
                  time,
                  duration,
                  mode,
                  location,
                })}
              >
                <CalendarCheck className="h-4 w-4" />
                确认安排
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InterviewActionDrawer({
  candidate,
  demand,
  assignment,
  currentRound,
  onClose,
  onSchedule,
  onManageProcess,
  onRoundChange,
  onShowDetail,
}: {
  candidate: PipelineBoardCandidate;
  demand: RecruitmentDemand;
  assignment: InterviewAssignment | null;
  currentRound: InterviewRound;
  onClose: () => void;
  onSchedule: () => void;
  onManageProcess: () => void;
  onRoundChange: (round: InterviewRound) => void;
  onShowDetail: () => void;
}) {
  const scheduled = Boolean(assignment?.scheduled_at);
  const feedbackDone = Boolean(assignment?.feedback_submitted);
  const primaryLabel = !scheduled ? '安排面试' : feedbackDone ? '管理流程结果' : '查看或取消安排';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] justify-end overflow-hidden bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="flex-1 cursor-default" aria-label="关闭面试处理面板" onClick={onClose} />
      <aside className="h-[100dvh] max-h-[100dvh] w-full max-w-[460px] overflow-y-auto overscroll-contain bg-white shadow-2xl">
        <header className="border-b border-[#edf0f2] px-7 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#33a474]">面试处理</p>
              <h2 className="mt-1 text-2xl font-bold text-[#171a1f]">{candidate.name_masked}</h2>
              <p className="mt-1 text-sm font-semibold text-[#777c84]">
                {demand.job_title} · {demand.job_department || '未记录部门'} · {demand.job_city || '未记录城市'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f4f5f6]" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="px-7 py-5 pb-8">
          <div className="rounded-2xl bg-[#f7faf8] p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-[#8a8f98]">面试轮次</p>
                <p className="mt-1 font-bold text-[#303133]">{roundLabel(currentRound)}</p>
              </div>
              <div>
                <p className="font-semibold text-[#8a8f98]">当前状态</p>
                <p className="mt-1 font-bold text-[#303133]">{feedbackDone ? '反馈已提交' : scheduled ? '待面试反馈' : '尚未安排'}</p>
              </div>
              <div>
                <p className="font-semibold text-[#8a8f98]">面试官</p>
                <p className="mt-1 font-bold text-[#303133]">{assignment?.interviewer_name || demand.default_interviewer_name || '待安排'}</p>
              </div>
              <div>
                <p className="font-semibold text-[#8a8f98]">面试时间</p>
                <p className="mt-1 font-bold text-[#303133]">{formatSchedule(assignment?.scheduled_at)}</p>
              </div>
            </div>
            {assignment?.location && (
              <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#5f646d]">
                地点：{assignment.location}
              </p>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-[#edf0f2] p-4">
            <p className="font-bold text-[#171a1f]">选择面试轮次</p>
            <p className="mt-1 text-sm font-semibold text-[#8a8f98]">选择后进入安排页；只有保存成功才会写入面试任务。</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {ROUND_ACTIONS.map((round) => (
                <button
                  key={round}
                  type="button"
                  onClick={() => onRoundChange(round)}
                  className={`h-10 rounded-xl text-sm font-bold transition ${
                    currentRound === round
                      ? 'bg-[#33a474] text-white'
                      : 'bg-[#f6f5f2] text-[#555b64] hover:bg-[#eef8f3] hover:text-[#168a5b]'
                  }`}
                >
                  {roundLabel(round)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Button
              type="button"
              className="h-12 w-full justify-center"
              onClick={feedbackDone ? onManageProcess : onSchedule}
            >
              <CalendarCheck className="h-4 w-4" />
              {primaryLabel}
            </Button>
            <button
              type="button"
              onClick={onShowDetail}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#edf0f2] font-bold text-[#303133] hover:bg-[#f7f8f8]"
            >
              <Eye className="h-4 w-4" />
              查看候选人档案
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-[#edf0f2] p-4">
            <p className="font-bold text-[#171a1f]">推荐处理顺序</p>
            <ol className="mt-3 space-y-2 text-sm font-semibold text-[#6b717a]">
              <li>1. 先确认是否已有准确的面试时间和面试官。</li>
              <li>2. 面试结束后优先补反馈，再决定是否推进下一轮。</li>
              <li>3. 查看档案只作为辅助，不在列表里抢主操作位置。</li>
            </ol>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function CandidateDetailDialog({
  candidate,
  demand,
  assignment,
  round,
  onClose,
  onProcess,
}: {
  candidate: PipelineBoardCandidate;
  demand: RecruitmentDemand;
  assignment: InterviewAssignment | null;
  round: InterviewRound;
  onClose: () => void;
  onProcess: () => void;
}) {
  const detailRows = [
    ['候选人', candidate.name_masked],
    ['招聘需求', demand.request_no || '未记录需求编号'],
    ['应聘岗位', demand.job_title || '未记录岗位'],
    ['城市', demand.job_city || '未记录城市'],
    ['部门', demand.job_department || '未记录部门'],
    ['招聘负责人', demand.owner_hr_name || '未分配负责人'],
    ['当前阶段', STAGES.find((stage) => stage.key === candidate.stage)?.label ?? candidate.stage],
    ['面试轮次', roundLabel(round)],
    ['面试官', assignment?.interviewer_name || demand.default_interviewer_name || '尚未安排'],
    ['面试时间', formatSchedule(assignment?.scheduled_at)],
    ['面试地点', assignment?.location || '尚未安排'],
    ['最近更新', formatSchedule(candidate.updated_at)],
    ['操作人', candidate.updated_by_name || '未记录'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#edf0f2] px-6 py-5">
          <div>
            <p className="text-sm font-bold text-[#33a474]">候选人详情</p>
            <h2 className="mt-2 text-2xl font-bold text-[#171a1f]">{candidate.name_masked}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f4f5f6]" aria-label="关闭候选人详情">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-6">
          <table className="w-full overflow-hidden rounded-xl border border-[#edf0f2] text-sm">
            <tbody>
              {detailRows.map(([label, value]) => (
                <tr key={label} className="border-b border-[#edf0f2] last:border-0">
                  <th className="w-36 bg-[#f8faf9] px-4 py-3 text-left font-bold text-[#6b717a]">{label}</th>
                  <td className="px-4 py-3 font-semibold text-[#303133]">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>关闭</Button>
            <Button type="button" onClick={onProcess}>
              <CalendarCheck className="h-4 w-4" />
              处理面试
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JobDetailDrawer({
  candidate,
  demand,
  assignment,
  round,
  onClose,
  onShowCandidate,
  onProcess,
}: {
  candidate: PipelineBoardCandidate;
  demand: RecruitmentDemand;
  assignment: InterviewAssignment | null;
  round: InterviewRound;
  onClose: () => void;
  onShowCandidate: () => void;
  onProcess: () => void;
}) {
  const planned = Math.max(demand.headcount ?? 1, 1);
  const onboarded = Math.max(demand.metrics?.onboarded_count ?? 0, 0);
  const remaining = Math.max(planned - onboarded, 0);
  const progressCards = [
    ['已推荐', `${demand.metrics?.recommended_count ?? 0}人`],
    ['面试中', `${demand.metrics?.interview_count ?? 0}人`],
    ['Offer中', `${demand.metrics?.offer_count ?? 0}人`],
    ['已入职', `${onboarded}人`],
  ];
  const infoRows = [
    ['所属部门', demand.job_department || '未记录部门'],
    ['工作城市', demand.job_city || '未记录城市'],
    ['招聘负责人', demand.owner_hr_name || '未分配负责人'],
    ['薪资范围', '未设置'],
    ['计划招聘', `${planned}人`],
    ['已入职', `${onboarded}人`],
    ['剩余HC', `${remaining}人`],
    ['面试轮次', roundLabel(round)],
    ['招聘开始日期', demand.created_at ? formatSchedule(demand.created_at).slice(0, 10) : '未记录'],
    ['计划关闭日期', demand.target_date || '未设置'],
  ];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal="true">
      <button type="button" className="flex-1 cursor-default" aria-label="关闭岗位详情" onClick={onClose} />
      <aside className="flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl">
        <header className="border-b border-[#edf0f2] px-8 py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-bold text-[#171a1f]">{demand.job_title || '当前岗位'}</h2>
                <span className="rounded-lg bg-[#dff6ec] px-3 py-1 text-sm font-bold text-[#168a5b]">
                  {demand.status === 'active' ? '招聘中' : demand.status === 'pending' ? '待确认' : demand.status === 'filled' ? '已完成' : '已关闭'}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-[#777c84]">
                {demand.job_department || '未记录部门'} · {demand.job_city || '未记录城市'} · 招聘负责人：{demand.owner_hr_name || '未分配负责人'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[#8a8f98] hover:bg-[#f4f5f6]" aria-label="关闭岗位详情">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex border-b border-[#edf0f2] px-8">
          {['岗位信息', `候选人（${assignment ? 1 : 0}）`, '招聘进展'].map((tab, index) => (
            <span
              key={tab}
              className={`mr-8 border-b-2 py-4 text-sm font-bold ${index === 0 ? 'border-[#33a474] text-[#168a5b]' : 'border-transparent text-[#6b717a]'}`}
            >
              {tab}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-7">
          <section>
            <h3 className="text-lg font-bold text-[#171a1f]">基本信息</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {infoRows.map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-[#fafafa] px-5 py-4">
                  <p className="text-sm font-bold text-[#9aa0a8]">{label}</p>
                  <p className="mt-2 text-lg font-bold text-[#171a1f]">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="text-lg font-bold text-[#171a1f]">关联招聘需求</h3>
            <div className="mt-3 rounded-2xl bg-[#fafafa] px-5 py-4 text-lg font-bold text-[#171a1f]">
              {demand.job_title || '当前岗位'}招聘需求
            </div>
          </section>

          <section className="mt-7">
            <h3 className="text-lg font-bold text-[#171a1f]">招聘进展</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              {progressCards.map(([label, value], index) => (
                <div key={label} className={`rounded-2xl border px-4 py-5 text-center ${index === 1 ? 'border-[#ffd9bd] bg-[#fff7ef]' : 'border-[#cdebdc] bg-[#f4fbf7]'}`}>
                  <p className="text-sm font-bold text-[#6b717a]">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#171a1f]">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-2xl border border-[#edf0f2] p-5">
            <h3 className="text-lg font-bold text-[#171a1f]">当前候选人</h3>
            <div className="mt-4 flex items-center justify-between gap-4">
              <button type="button" onClick={onShowCandidate} className="flex items-center gap-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ddf4ea] font-bold text-[#168a5b]">
                  {candidateInitial(candidate.name_masked)}
                </span>
                <span>
                  <span className="block font-bold text-[#171a1f]">{candidate.name_masked}</span>
                  <span className="block text-sm font-semibold text-[#8a8f98]">{roundLabel(round)} · {formatSchedule(assignment?.scheduled_at)}</span>
                </span>
              </button>
              <Button type="button" size="sm" onClick={onProcess}>处理面试</Button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function PipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const demandParam = Number(searchParams.get('demand'));
  const jobParam = Number(searchParams.get('job'));
  const candidateParam = Number(searchParams.get('candidate'));
  const requestedStage = parseStageParam(searchParams.get('stage'));
  const requestedAllStages = searchParams.get('stage') === 'all';
  const requestedDemandId = Number.isFinite(demandParam) && demandParam > 0 ? demandParam : null;
  const requestedJobId = Number.isFinite(jobParam) && jobParam > 0 ? jobParam : null;
  const highlightedCandidateId =
    Number.isFinite(candidateParam) && candidateParam > 0 ? candidateParam : null;

  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100 }),
    [],
  );
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(requestedDemandId);

  const demandItems = demandsAsync.data?.items ?? [];
  const hasCompleteVisibleDemandList =
    demandsAsync.data !== null && demandsAsync.data.total === demandItems.length;
  const selectedDemand =
    selectedDemandId !== null
      ? demandItems.find((demand) => demand.id === selectedDemandId) ?? null
      : null;
  const legacyJobDemands =
    selectedDemandId === null && requestedJobId !== null
      ? demandItems.filter((demand) => demand.job_id === requestedJobId)
      : [];
  const effectiveDemand =
    selectedDemand ??
    (selectedDemandId !== null
      ? null
      : requestedJobId !== null
        ? hasCompleteVisibleDemandList && legacyJobDemands.length === 1
          ? legacyJobDemands[0]
          : null
        : demandItems[0] ?? null);
  const effectiveDemandId = effectiveDemand?.id ?? null;
  const effectiveJobId = effectiveDemand?.job_id ?? null;
  const demandResolutionError =
    !demandsAsync.loading && !demandsAsync.error
      ? selectedDemandId !== null && selectedDemand === null
        ? '该招聘需求不存在或你无权查看，请从下拉列表选择可访问的需求。'
        : selectedDemandId === null && requestedJobId !== null && !hasCompleteVisibleDemandList
          ? '这个旧岗位链接无法在当前列表中安全确认唯一需求，系统不会替你猜。请选择具体招聘需求。'
        : selectedDemandId === null && requestedJobId !== null && legacyJobDemands.length > 1
          ? '这个旧岗位链接对应多个招聘需求，系统不会替你猜。请选择具体招聘需求。'
          : selectedDemandId === null && requestedJobId !== null && legacyJobDemands.length === 0
            ? '这个旧岗位链接没有可访问的招聘需求，请从下拉列表重新选择。'
            : null
      : null;

  const boardAsync = useAsync(
    () =>
      effectiveDemandId !== null
        ? api.getDemandPipelineBoard(effectiveDemandId)
        : Promise.resolve(null),
      [effectiveDemandId],
  );
  const assignmentsAsync = useAsync(
    () =>
      effectiveDemandId !== null
        ? api.listInterviewAssignments({ demand_id: effectiveDemandId })
        : Promise.resolve([] as InterviewAssignment[]),
    [effectiveDemandId],
  );
  const interviewersAsync = useAsync(() => api.listInterviewers(), []);

  const toast = useToast();
  const [openMenu, setOpenMenu] = useState<InterviewMenu>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('全部');
  const [cityFilter, setCityFilter] = useState('全部');
  const [roundFilter, setRoundFilter] = useState('全部');
  const [scheduleFilter, setScheduleFilter] = useState('全部');
  const [roundOverrides, setRoundOverrides] = useState<Record<number, InterviewRound>>({});
  const [detailCandidate, setDetailCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [jobDetailCandidate, setJobDetailCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [actionCandidate, setActionCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [adjustCandidate, setAdjustCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [savingInterview, setSavingInterview] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showProcessPanel, setShowProcessPanel] = useState(false);
  const [activeStage, setActiveStage] = useState<PipelineStage>(requestedStage ?? 'pending');
  const [showAllStages, setShowAllStages] = useState(requestedAllStages);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
    highlightedCandidateId,
  );
  const [showAddToPipeline, setShowAddToPipeline] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [recentlyMovedCandidateId, setRecentlyMovedCandidateId] = useState<number | null>(null);
  const autoStageKeyRef = useRef<string | null>(null);

  const candidates = boardAsync.data?.candidates ?? EMPTY_PIPELINE_CANDIDATES;
  const assignments = assignmentsAsync.data ?? EMPTY_ASSIGNMENTS;
  const assignmentByCandidateId = useMemo(() => {
    const map = new Map<number, InterviewAssignment | null>();
    candidates.forEach((candidate) => {
      map.set(candidate.candidate_id, latestAssignment(assignments, candidate.candidate_id));
    });
    return map;
  }, [assignments, candidates]);
  const effectiveRoundForCandidate = useCallback(
    (candidate: PipelineBoardCandidate, assignment?: InterviewAssignment | null) =>
      roundOverrides[candidate.candidate_id] ?? (assignment?.round as InterviewRound | undefined) ?? roundForCandidate(candidate),
    [roundOverrides],
  );
  const departmentOptions = useMemo(
    () => Array.from(new Set(['全部', effectiveDemand?.job_department || '未记录部门'])),
    [effectiveDemand],
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(['全部', effectiveDemand?.job_city || '未记录城市'])),
    [effectiveDemand],
  );
  const filteredInterviewCandidates = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const assignment = assignmentByCandidateId.get(candidate.candidate_id) ?? null;
      const text = [
        candidate.name_masked,
        effectiveDemand?.job_title,
        effectiveDemand?.job_department,
        effectiveDemand?.job_city,
        assignment?.interviewer_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (normalizedSearch && !text.includes(normalizedSearch)) return false;
      if (departmentFilter !== '全部' && effectiveDemand?.job_department !== departmentFilter) return false;
      if (cityFilter !== '全部' && effectiveDemand?.job_city !== cityFilter) return false;
      if (roundFilter !== '全部' && roundLabel(effectiveRoundForCandidate(candidate, assignment)) !== roundFilter) return false;
      if (scheduleFilter === '尚未安排' && assignment?.scheduled_at) return false;
      if (scheduleFilter === '已安排' && !assignment?.scheduled_at) return false;
      return true;
    });
  }, [assignmentByCandidateId, candidates, cityFilter, departmentFilter, effectiveDemand, effectiveRoundForCandidate, roundFilter, scheduleFilter, searchQuery]);
  const calendarItems = useMemo(
    () =>
      filteredInterviewCandidates
        .map((candidate) => ({
          candidate,
          assignment: assignmentByCandidateId.get(candidate.candidate_id) ?? null,
        }))
        .filter((item) => Boolean(item.assignment?.scheduled_at))
        .sort((a, b) => {
          const left = new Date(a.assignment?.scheduled_at ?? 0).getTime();
          const right = new Date(b.assignment?.scheduled_at ?? 0).getTime();
          return left - right;
        }),
    [assignmentByCandidateId, filteredInterviewCandidates],
  );
  const highlightedCandidate = highlightedCandidateId
    ? candidates.find((c) => c.candidate_id === highlightedCandidateId)
    : null;

  useEffect(() => {
    setSelectedDemandId(requestedDemandId);
    setPendingMove(null);
    setRecentlyMovedCandidateId(null);
    setActiveStage(requestedStage ?? 'pending');
    setShowAllStages(requestedAllStages);
    setSelectedCandidateId(highlightedCandidateId);
    setShowAddToPipeline(false);
  }, [highlightedCandidateId, requestedAllStages, requestedDemandId, requestedStage]);

  // 已在本招聘需求流程中的候选人 id 集合（供"加入流程"排除）。
  const existingIds = useMemo(
    () => new Set(candidates.map((c) => c.candidate_id)),
    [candidates],
  );

  // 按阶段分桶。
  const byStage = useMemo(() => {
    const map: Partial<Record<PipelineStage, PipelineBoardCandidate[]>> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const c of candidates) {
      (map[c.stage] ??= []).push(c);
    }
    return map;
  }, [candidates]);

  const stageCounts = useMemo(
    () =>
      STAGES.reduce<Partial<Record<PipelineStage, number>>>((acc, stage) => {
        acc[stage.key] = byStage[stage.key]?.length ?? 0;
        return acc;
      }, {}),
    [byStage],
  );
  const activeCandidates = useMemo(
    () => showAllStages ? candidates : (byStage[activeStage] ?? []),
    [activeStage, byStage, candidates, showAllStages],
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.candidate_id === selectedCandidateId) ?? null;

  useEffect(() => {
    if (highlightedCandidate) {
      setShowAllStages(false);
      setActiveStage(highlightedCandidate.stage);
      setSelectedCandidateId(highlightedCandidate.candidate_id);
    }
  }, [highlightedCandidate]);

  useEffect(() => {
    if (showAllStages || pendingMove || highlightedCandidate || boardAsync.loading || boardAsync.error) return;
    if (effectiveDemandId === null || candidates.length === 0) return;

    const autoStageKey = [
      effectiveDemandId,
      requestedStage ?? 'auto',
      candidates.map((candidate) => `${candidate.candidate_id}:${candidate.stage}`).join(','),
    ].join('|');
    if (autoStageKeyRef.current === autoStageKey) return;
    autoStageKeyRef.current = autoStageKey;

    const requestedStageHasCandidates =
      requestedStage !== null && (stageCounts[requestedStage] ?? 0) > 0;
    const nextStage =
      requestedStageHasCandidates
        ? requestedStage
        : PREFERRED_STAGE_ORDER.find((stage) => (stageCounts[stage] ?? 0) > 0) ?? activeStage;

    if (nextStage !== activeStage) {
      setActiveStage(nextStage);
      setSelectedCandidateId(byStage[nextStage]?.[0]?.candidate_id ?? null);
      setSearchParams({ demand: String(effectiveDemandId), stage: nextStage }, { replace: true });
      return;
    }

    if (
      selectedCandidateId === null ||
      !byStage[nextStage]?.some((candidate) => candidate.candidate_id === selectedCandidateId)
    ) {
      setSelectedCandidateId(byStage[nextStage]?.[0]?.candidate_id ?? null);
    }
  }, [
    activeStage,
    boardAsync.error,
    boardAsync.loading,
    byStage,
    candidates,
    effectiveDemandId,
    highlightedCandidate,
    pendingMove,
    requestedStage,
    showAllStages,
    selectedCandidateId,
    setSearchParams,
    stageCounts,
  ]);

  useEffect(() => {
    if (!pendingMove) return;
    const movedCandidate = candidates.find(
      (candidate) =>
        candidate.candidate_id === pendingMove.candidateId &&
        candidate.stage === pendingMove.toStage,
    );
    if (!movedCandidate) return;
    setShowAllStages(false);
    setActiveStage(pendingMove.toStage);
    setSelectedCandidateId(pendingMove.candidateId);
    setRecentlyMovedCandidateId(pendingMove.candidateId);
    setPendingMove(null);
    setBusyId(null);
  }, [candidates, pendingMove]);

  useEffect(() => {
    if (!recentlyMovedCandidateId) return;
    const timer = window.setTimeout(() => {
      setRecentlyMovedCandidateId((current) =>
        current === recentlyMovedCandidateId ? null : current,
      );
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [recentlyMovedCandidateId]);

  useEffect(() => {
    if (!pendingMove || boardAsync.loading || !boardAsync.error) return;
    setPendingMove(null);
    setBusyId(null);
  }, [boardAsync.error, boardAsync.loading, pendingMove]);

  useEffect(() => {
    if (pendingMove) {
      return;
    }
    if (activeCandidates.length === 0) {
      setSelectedCandidateId(null);
      return;
    }
    if (
      selectedCandidateId === null ||
      !activeCandidates.some((candidate) => candidate.candidate_id === selectedCandidateId)
    ) {
      setSelectedCandidateId(activeCandidates[0].candidate_id);
    }
  }, [activeCandidates, pendingMove, selectedCandidateId]);

  const handleMove = useCallback(
    async (
      candidateId: number,
      toStage: PipelineStage,
      note?: string,
      disposition?: CandidateDispositionInput,
    ) => {
      if (effectiveDemandId === null) return;
      setBusyId(candidateId);
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      try {
        const result = await api.movePipeline({
          candidate_id: candidateId,
          demand_id: effectiveDemandId,
          stage: toStage,
          note,
          disposition,
        });
        setPendingMove({ candidateId, toStage });
        toast.success(`${result.name_masked || '候选人'} 已更新至「${stageLabel(toStage)}」`);
        boardAsync.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '流程操作失败');
        setBusyId(null);
      }
    },
    [boardAsync, effectiveDemandId, toast],
  );

  const handleDemandChange = useCallback(
    (demandId: number) => {
      setSelectedDemandId(demandId);
      setSearchParams({ demand: String(demandId), stage: showAllStages ? 'all' : activeStage });
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      setSelectedCandidateId(null);
      setShowAddToPipeline(false);
      setShowProcessPanel(false);
    },
    [activeStage, setSearchParams, showAllStages],
  );

  const handleSaveInterview = useCallback(async (payload: {
    interviewerId: number;
    date: string;
    time: string;
    duration: string;
    mode: string;
    location: string;
  }) => {
    if (!adjustCandidate || !effectiveDemandId || !effectiveJobId) return;
    setSavingInterview(true);
    try {
      const scheduledAt = new Date(`${payload.date}T${payload.time}:00`).toISOString();
      const round = effectiveRoundForCandidate(
        adjustCandidate,
        assignmentByCandidateId.get(adjustCandidate.candidate_id) ?? null,
      );
      await api.createInterviewAssignment({
        candidate_id: adjustCandidate.candidate_id,
        demand_id: effectiveDemandId,
        job_id: effectiveJobId,
        round,
        round_sequence: round === 'round_3' ? 3 : round === 'round_2' ? 2 : 1,
        is_primary: true,
        interviewer_id: payload.interviewerId,
        scheduled_at: scheduledAt,
        location: payload.mode === 'offline' ? payload.location : `${payload.location} · ${payload.mode === 'video' ? '视频面试' : '企业微信会议'}`,
        note: `${payload.duration} 分钟`,
      });
      toast.success('面试安排已保存');
      setAdjustCandidate(null);
      setActionCandidate(null);
      assignmentsAsync.reload();
      boardAsync.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存面试安排失败');
    } finally {
      setSavingInterview(false);
    }
  }, [adjustCandidate, assignmentByCandidateId, assignmentsAsync, boardAsync, effectiveDemandId, effectiveJobId, effectiveRoundForCandidate, toast]);

  const handleCancelInterview = useCallback(async (assignment: InterviewAssignment) => {
    const reason = window.prompt('请输入取消面试安排的原因');
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error('取消面试安排需要填写原因');
      return;
    }
    setSavingInterview(true);
    try {
      await api.cancelInterviewAssignment(assignment.id, reason.trim());
      toast.success('面试安排已取消，可以重新安排');
      setAdjustCandidate(null);
      setActionCandidate(null);
      assignmentsAsync.reload();
      boardAsync.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消面试安排失败');
    } finally {
      setSavingInterview(false);
    }
  }, [assignmentsAsync, boardAsync, toast]);

  return (
    <div className="space-y-6">
      {demandsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载招聘需求…
        </div>
      )}

      {!demandsAsync.loading && demandsAsync.error && (
        <ErrorState message={demandsAsync.error.message} onRetry={demandsAsync.reload} />
      )}

      {!demandsAsync.loading && !demandsAsync.error && demandItems.length === 0 && (
        <Card>
          <EmptyState
            icon={KanbanSquare}
            title="暂无招聘需求"
            description="请先创建具体招聘需求，再加入候选人并推进流程"
            action={
              <Link to="/demands">
                <Button variant="secondary" size="sm">
                  新建招聘需求
                </Button>
              </Link>
            }
          />
        </Card>
      )}

      {!demandsAsync.loading && !demandsAsync.error && demandItems.length > 0 && (
        <>
          {/* 招聘需求选择 + 匹配入口 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label htmlFor="demand-select" className="text-sm font-medium text-ink">
                当前招聘需求
              </label>
              <select
                id="demand-select"
                className="h-10 min-w-0 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:min-w-[360px]"
                value={effectiveDemandId ?? ''}
                onChange={(e) => handleDemandChange(Number(e.target.value))}
              >
                {effectiveDemandId === null && (
                  <option value="" disabled>
                    请选择具体招聘需求
                  </option>
                )}
                {demandItems.map((demand) => (
                  <option key={demand.id} value={demand.id}>
                    {formatDemandOption(demand)}
                  </option>
                ))}
              </select>
              {boardAsync.loading && <Spinner size="sm" />}
            </div>

            {effectiveDemandId !== null && effectiveJobId !== null && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddToPipeline((value) => !value)}
                  aria-expanded={showAddToPipeline}
                >
                  <UserPlus className="h-4 w-4" />
                  添加候选人
                </Button>
                <Link to={`/jobs/${effectiveJobId}/match?demand=${effectiveDemandId}`}>
                  <Button type="button" variant="ghost" size="sm">
                    去匹配更多候选人 →
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {demandResolutionError && (
            <Card>
              <EmptyState
                icon={KanbanSquare}
                title="无法定位招聘需求"
                description={demandResolutionError}
              />
            </Card>
          )}

          {/* 加入候选人到流程 */}
          {!demandResolutionError && effectiveDemandId !== null && effectiveJobId !== null && showAddToPipeline && (
            <AddToPipeline
              demandId={effectiveDemandId}
              jobId={effectiveJobId}
              existingIds={existingIds}
              onAdded={() => {
                boardAsync.reload();
                setShowAddToPipeline(false);
              }}
              onClose={() => setShowAddToPipeline(false)}
            />
          )}

          {highlightedCandidate && (
            <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              已定位到 {highlightedCandidate.name_masked}。下一步可在右侧详情推进主流程，
              面试轮次和反馈请进入「面试任务」记录。
            </div>
          )}

          <div className="rounded-xl border border-[#dcefe7] bg-[#f7fcfa] px-4 py-3 text-sm font-semibold text-[#4f665b]">
            流程提示：业务评审阶段由用人部门提交业务反馈；确认通过后，招聘专员再安排面试。
          </div>

          {/* 面试管理工作区 */}
          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.loading && boardAsync.error && (
            <ErrorState message={boardAsync.error.message} onRetry={boardAsync.reload} />
          )}

          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.error && (
            <div className="rounded-2xl border border-[#edf0f2] bg-white">
              <div className="flex flex-wrap items-center justify-end gap-3 border-b border-[#edf0f2] px-6 py-5">
                <label className="relative block w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9aa0a8]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索候选人、岗位、面试官"
                    className="h-11 w-full rounded-xl border border-[#edf0f2] bg-white pl-11 pr-4 text-sm outline-none focus:border-[#33a474] focus:ring-2 focus:ring-[#33a474]/15"
                  />
                </label>
                <span className="text-sm font-bold text-[#303133]">共 {filteredInterviewCandidates.length} 条</span>
                <div className="flex rounded-full bg-[#f6f5f2] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold ${viewMode === 'list' ? 'bg-white text-[#171a1f] shadow-sm' : 'text-[#666b73]'}`}
                  >
                    <List className="h-4 w-4" />
                    列表
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('calendar')}
                    className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold ${viewMode === 'calendar' ? 'bg-white text-[#171a1f] shadow-sm' : 'text-[#666b73]'}`}
                  >
                    <CalendarDays className="h-4 w-4" />
                    日历
                  </button>
                </div>
              </div>

              {viewMode === 'calendar' ? (
                <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-3">
                  {calendarItems.map(({ candidate, assignment }) => {
                    const interviewerName = assignment?.interviewer_name || effectiveDemand?.default_interviewer_name || '待定面试官';
                    return (
                      <div key={candidate.candidate_id} className="rounded-xl border border-[#edf0f2] bg-[#fbfcfc] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#8a8f98]">{formatSchedule(assignment?.scheduled_at)}</p>
                            <button
                              type="button"
                              onClick={() => setDetailCandidate(candidate)}
                              className="mt-2 text-left text-lg font-bold text-[#171a1f] hover:text-[#168a5b] hover:underline"
                            >
                              {candidate.name_masked}
                            </button>
                          </div>
                          <span className="rounded-lg bg-[#e9f2e3] px-3 py-1 text-sm font-bold text-[#607a55]">
                            {roundLabel(effectiveRoundForCandidate(candidate, assignment))}
                          </span>
                        </div>
                        <div className="mt-4 space-y-2 text-sm font-semibold text-[#5f646d]">
                          <button
                            type="button"
                            onClick={() => setJobDetailCandidate(candidate)}
                            className="font-semibold text-[#5f646d] hover:text-[#168a5b] hover:underline"
                          >
                            {effectiveDemand?.job_title || '未记录岗位'} · {effectiveDemand?.job_city || '未记录城市'}
                          </button>
                          <p>面试官：{interviewerName}</p>
                          <p>地点：{assignment?.location || '待定'}</p>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button type="button" size="sm" onClick={() => setAdjustCandidate(candidate)}>
                            <CalendarCheck className="h-4 w-4" />
                            调整面试
                          </Button>
                          <button
                            type="button"
                            onClick={() => setDetailCandidate(candidate)}
                            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-bold text-[#168a5b] hover:bg-[#e9f7f1]"
                          >
                            查看档案
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {calendarItems.length === 0 && (
                    <div className="col-span-full py-16 text-center text-sm text-[#8a8f98]">
                      当前筛选下暂无已安排面试，切回列表可继续安排。
                    </div>
                  )}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white">
                    <tr className="border-b border-[#edf0f2]">
                      <HeaderFilter label="候选人" menu="candidate" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          <FilterItem active={!searchQuery} onClick={() => { setSearchQuery(''); setOpenMenu(null); }}>全部候选人</FilterItem>
                          {candidates.slice(0, 8).map((candidate) => (
                            <FilterItem key={candidate.candidate_id} onClick={() => { setSearchQuery(candidate.name_masked); setOpenMenu(null); }}>
                              {candidate.name_masked}
                            </FilterItem>
                          ))}
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="应聘岗位" menu="job" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          <FilterItem active onClick={() => setOpenMenu(null)}>{effectiveDemand?.job_title || '全部岗位'}</FilterItem>
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="城市" menu="city" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          {cityOptions.map((city) => (
                            <FilterItem key={city} active={cityFilter === city} onClick={() => { setCityFilter(city); setOpenMenu(null); }}>{city}</FilterItem>
                          ))}
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="部门" menu="department" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          {departmentOptions.map((department) => (
                            <FilterItem key={department} active={departmentFilter === department} onClick={() => { setDepartmentFilter(department); setOpenMenu(null); }}>{department}</FilterItem>
                          ))}
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="面试轮次" menu="round" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          {['全部', '一面', '二面', '三面', 'HR 面'].map((round) => (
                            <FilterItem key={round} active={roundFilter === round} onClick={() => { setRoundFilter(round); setOpenMenu(null); }}>{round}</FilterItem>
                          ))}
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="面试安排" menu="schedule" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          {['全部', '尚未安排', '已安排'].map((item) => (
                            <FilterItem key={item} active={scheduleFilter === item} onClick={() => { setScheduleFilter(item); setOpenMenu(null); }}>{item}</FilterItem>
                          ))}
                        </FilterMenu>
                      </HeaderFilter>
                      <HeaderFilter label="操作" menu="action" openMenu={openMenu} onOpen={setOpenMenu}>
                        <FilterMenu>
                          <FilterItem active={scheduleFilter === '全部'} onClick={() => { setScheduleFilter('全部'); setOpenMenu(null); }}>全部操作</FilterItem>
                          <FilterItem onClick={() => { setScheduleFilter('尚未安排'); setOpenMenu(null); }}>待安排</FilterItem>
                          <FilterItem onClick={() => { setScheduleFilter('已安排'); setOpenMenu(null); }}>待调整</FilterItem>
                        </FilterMenu>
                      </HeaderFilter>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInterviewCandidates.map((candidate) => {
                      const assignment = assignmentByCandidateId.get(candidate.candidate_id) ?? null;
                      const scheduled = Boolean(assignment?.scheduled_at);
                      const interviewerName = assignment?.interviewer_name || effectiveDemand?.default_interviewer_name || '尚未安排';
                      const rowRound = roundLabel(effectiveRoundForCandidate(candidate, assignment));
                      return (
                        <tr key={candidate.candidate_id} className="border-b border-[#f1f2f3] hover:bg-[#fbfcfc]">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ddf4ea] text-sm font-bold text-[#168a5b]">
                                {candidateInitial(candidate.name_masked)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setDetailCandidate(candidate)}
                                className="font-bold text-[#171a1f] hover:text-[#168a5b] hover:underline"
                              >
                                {candidate.name_masked}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => setJobDetailCandidate(candidate)}
                              className="font-semibold text-[#4f555d] hover:text-[#168a5b] hover:underline"
                            >
                              {effectiveDemand?.job_title || '未记录岗位'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => setDetailCandidate(candidate)}
                              className="font-semibold text-[#4f555d] hover:text-[#168a5b] hover:underline"
                            >
                              {effectiveDemand?.job_city || '未记录城市'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => setDetailCandidate(candidate)}
                              className="font-semibold text-[#4f555d] hover:text-[#168a5b] hover:underline"
                            >
                              {effectiveDemand?.job_department || '未记录部门'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => setDetailCandidate(candidate)}
                              className="rounded-lg bg-[#e9f2e3] px-3 py-1.5 font-bold text-[#607a55] hover:bg-[#dcebd4]"
                            >
                              {rowRound}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            {scheduled ? (
                              <button
                                type="button"
                                onClick={() => setDetailCandidate(candidate)}
                                className="flex items-center gap-3 text-left hover:text-[#168a5b]"
                              >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ddf4ea] text-sm font-bold text-[#168a5b]">
                                  {candidateInitial(interviewerName)}
                                </span>
                                <div>
                                  <p className="font-bold text-[#303133]">{interviewerName}</p>
                                  <p className="text-sm text-[#8a8f98]">{formatSchedule(assignment?.scheduled_at)}</p>
                                </div>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDetailCandidate(candidate)}
                                className="font-semibold text-[#8a8f98] hover:text-[#168a5b] hover:underline"
                              >
                                尚未安排
                              </button>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedCandidateId(candidate.candidate_id);
                                  setShowProcessPanel(true);
                                }}
                              >
                                管理流程
                              </Button>
                              <Button type="button" size="sm" onClick={() => setActionCandidate(candidate)}>
                                <CalendarCheck className="h-4 w-4" />
                                处理面试
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredInterviewCandidates.length === 0 && (
                  <div className="py-16 text-center text-sm text-[#8a8f98]">
                    当前筛选下暂无候选人，可调整筛选或添加候选人。
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* 空流程提示 */}
          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.loading && !boardAsync.error && candidates.length === 0 && (
            <p className="text-center text-sm text-muted-soft">
              本招聘需求中暂无候选人，可先点击「添加候选人」或去匹配更多候选人。
            </p>
          )}

          {adjustCandidate && effectiveDemand && (
            <InterviewAdjustModal
              candidate={adjustCandidate}
              demand={effectiveDemand}
              assignment={assignmentByCandidateId.get(adjustCandidate.candidate_id) ?? null}
              interviewers={interviewersAsync.data ?? []}
              saving={savingInterview}
              onClose={() => setAdjustCandidate(null)}
              onCancel={handleCancelInterview}
              onSubmit={handleSaveInterview}
            />
          )}

          {actionCandidate && effectiveDemand && (
            <InterviewActionDrawer
              candidate={actionCandidate}
              demand={effectiveDemand}
              assignment={assignmentByCandidateId.get(actionCandidate.candidate_id) ?? null}
              currentRound={effectiveRoundForCandidate(
                actionCandidate,
                assignmentByCandidateId.get(actionCandidate.candidate_id) ?? null,
              )}
              onClose={() => setActionCandidate(null)}
              onSchedule={() => {
                setActionCandidate(null);
                setAdjustCandidate(actionCandidate);
              }}
              onManageProcess={() => {
                setSelectedCandidateId(actionCandidate.candidate_id);
                setShowProcessPanel(true);
                setActionCandidate(null);
              }}
              onRoundChange={(round) => {
                setRoundOverrides((current) => ({ ...current, [actionCandidate.candidate_id]: round }));
                toast.success(`已选择${roundLabel(round)}，保存面试安排后生效`);
                setAdjustCandidate(actionCandidate);
                setActionCandidate(null);
              }}
              onShowDetail={() => {
                setDetailCandidate(actionCandidate);
                setActionCandidate(null);
              }}
            />
          )}

          {jobDetailCandidate && effectiveDemand && (
            <JobDetailDrawer
              candidate={jobDetailCandidate}
              demand={effectiveDemand}
              assignment={assignmentByCandidateId.get(jobDetailCandidate.candidate_id) ?? null}
              round={effectiveRoundForCandidate(
                jobDetailCandidate,
                assignmentByCandidateId.get(jobDetailCandidate.candidate_id) ?? null,
              )}
              onClose={() => setJobDetailCandidate(null)}
              onShowCandidate={() => {
                setDetailCandidate(jobDetailCandidate);
                setJobDetailCandidate(null);
              }}
              onProcess={() => {
                setActionCandidate(jobDetailCandidate);
                setJobDetailCandidate(null);
              }}
            />
          )}

          {detailCandidate && effectiveDemand && (
            <CandidateDetailDialog
              candidate={detailCandidate}
              demand={effectiveDemand}
              assignment={assignmentByCandidateId.get(detailCandidate.candidate_id) ?? null}
              round={effectiveRoundForCandidate(
                detailCandidate,
                assignmentByCandidateId.get(detailCandidate.candidate_id) ?? null,
              )}
              onClose={() => setDetailCandidate(null)}
              onProcess={() => {
                setActionCandidate(detailCandidate);
                setDetailCandidate(null);
              }}
            />
          )}

          {showProcessPanel
            && selectedCandidate
            && effectiveDemandId !== null
            && effectiveJobId !== null
            && createPortal(
              <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="dialog" aria-modal="true">
                <button
                  type="button"
                  className="flex-1 cursor-default"
                  aria-label="关闭流程管理"
                  onClick={() => setShowProcessPanel(false)}
                />
                <aside className="h-full w-full max-w-[460px] overflow-y-auto bg-[#f7f8f8] p-5 shadow-2xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#33a474]">候选人流程管理</p>
                      <h2 className="mt-1 text-xl font-bold text-[#171a1f]">{selectedCandidate.name_masked}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProcessPanel(false)}
                      className="rounded-full p-2 text-[#8a8f98] hover:bg-white"
                      aria-label="关闭流程管理"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <PipelineCandidatePanel
                    candidate={selectedCandidate}
                    demandId={effectiveDemandId}
                    jobId={effectiveJobId}
                    busy={
                      busyId === selectedCandidate.candidate_id
                      || pendingMove?.candidateId === selectedCandidate.candidate_id
                    }
                    onMove={handleMove}
                    onTransferred={() => {
                      toast.success('已转入目标需求；原需求保留「已转出」记录');
                      boardAsync.reload();
                    }}
                  />
                </aside>
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
