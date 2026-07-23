// Readdy 视觉风格的面试管理页（招聘专员 / 经理 / 管理员视角）。
// 数据全部来自真实后端：面试任务(assignment)、面试记录(record)、招聘需求、面试官。
// 反馈提交只调用反馈接口，不会自动推进候选人主流程（后端语义如此）。

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Filter,
  List,
  MoreVertical,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  demandOptionLabel,
  INTERVIEW_ROUNDS,
  roundLabel,
} from '../lib/interviewRecords';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Spinner,
  useToast,
} from '../components/ui';
import { DrawerShell } from '../components/ui/DrawerShell';
import { FeedbackForm } from '../components/interview/FeedbackForm';
import type {
  InterviewAssignment,
  InterviewFeedbackResponse,
  InterviewListItem,
  InterviewManagementRow,
  InterviewRound,
  RecruitmentDemand,
} from '../types';

// ---- 状态语义 ----

type AssignmentStatusKey = 'scheduled' | 'pending_feedback' | 'done' | 'cancelled';

function assignmentStatus(item: InterviewAssignment): AssignmentStatusKey {
  const status = (item.status || 'scheduled').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (item.feedback_submitted || ['completed', 'feedback_submitted'].includes(status)) return 'done';
  // 面试不得因为时间经过而自动完成；只能由招聘专员明确确认已完成。
  if (status === 'awaiting_feedback') return 'pending_feedback';
  return 'scheduled';
}

const STATUS_META: Record<AssignmentStatusKey, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  scheduled: { label: '待面试', tone: 'info' },
  pending_feedback: { label: '待反馈', tone: 'warning' },
  done: { label: '已反馈', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

const ROUND_SEQUENCE_BY_ROUND: Partial<Record<InterviewRound, number>> = {
  round_1: 1,
  round_2: 2,
  round_3: 3,
  additional: 4,
};

function formatDateTime(value?: string | null) {
  if (!value) return '时间待定';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-hairline bg-canvas shadow-card-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-hairline bg-canvas px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted hover:bg-surface-soft hover:text-ink" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer && <div className="flex justify-end gap-3 border-t border-hairline px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---- 安排面试弹窗 ----

interface ScheduleSeed {
  demandId: number;
  candidateId: number;
  round?: InterviewRound;
}

function ScheduleModal({
  demands,
  interviewers,
  seed,
  onClose,
  onCreated,
}: {
  demands: RecruitmentDemand[];
  interviewers: { id: number; name: string }[];
  seed?: ScheduleSeed | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const schedulableDemands = useMemo(
    () => demands.filter((demand) => demand.status === 'pending' || demand.status === 'active'),
    [demands],
  );
  const seededDemand = schedulableDemands.find((item) => item.id === seed?.demandId);
  const seededInterviewerId = seededDemand?.default_interviewer_id ?? null;
  const [demandId, setDemandId] = useState(seed ? String(seed.demandId) : '');
  const [candidateId, setCandidateId] = useState(seed ? String(seed.candidateId) : '');
  const [round, setRound] = useState<InterviewRound>(seed?.round ?? 'round_1');
  const [roundSequence, setRoundSequence] = useState(String(ROUND_SEQUENCE_BY_ROUND[seed?.round ?? 'round_1'] ?? 1));
  const [isPrimary, setIsPrimary] = useState(true);
  const [interviewerId, setInterviewerId] = useState(
    seededInterviewerId !== null
      && interviewers.some((interviewer) => interviewer.id === seededInterviewerId)
      ? String(seededInterviewerId)
      : '',
  );
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const selectedDemandId = Number(demandId);
  const boardAsync = useAsync(
    () => selectedDemandId > 0
      ? api.getDemandPipelineBoard(selectedDemandId)
      : Promise.resolve(null),
    [selectedDemandId],
  );
  const demandCandidates = (boardAsync.data?.candidates ?? []).filter(
    (candidate) => candidate.stage === 'interview',
  );

  function selectDemand(nextDemandId: string) {
    setDemandId(nextDemandId);
    setCandidateId('');
    setError(null);
    setIsConflict(false);
    // 选中需求后自动带出默认面试官（仍需在启用面试官列表内）
    const demand = schedulableDemands.find((item) => String(item.id) === nextDemandId);
    const defaultId = demand?.default_interviewer_id ?? null;
    const defaultAvailable = defaultId !== null
      && interviewers.some((interviewer) => interviewer.id === defaultId);
    setInterviewerId(defaultAvailable && defaultId !== null ? String(defaultId) : '');
  }

  async function save() {
    const did = Number(demandId);
    const cid = Number(candidateId);
    const iid = Number(interviewerId);
    const sequence = Number(roundSequence);
    if (!did || !cid || !iid) {
      setError('请选择招聘需求、候选人和面试官');
      setIsConflict(false);
      return;
    }
    if (!Number.isInteger(sequence) || sequence < 1) {
      setError('轮次序号必须是大于 0 的整数');
      setIsConflict(false);
      return;
    }
    setSaving(true);
    setError(null);
    setIsConflict(false);
    try {
      await api.createInterviewAssignment({
        candidate_id: cid,
        demand_id: did,
        round,
        round_sequence: sequence,
        is_primary: isPrimary,
        interviewer_id: iid,
        scheduled_at: scheduledAt || undefined,
        location: location.trim(),
        note: note.trim(),
      });
      onCreated();
    } catch (cause) {
      // 时间冲突单独高亮展示，便于改期或更换面试官
      if (cause instanceof ApiError && cause.code === 'interviewer_schedule_conflict') {
        setIsConflict(true);
        setError(cause.message || '面试官该时间已有面试安排，请改期或更换面试官');
      } else {
        setError(cause instanceof Error ? cause.message : '保存失败，请重试');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="安排面试"
      description="只能为进行中（pending / active）的招聘需求安排，面试官须为已启用账号"
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} loading={saving} disabled={saving || interviewers.length === 0}>保存安排</Button>
        </>
      )}
    >
      <div className="space-y-5 px-6 py-6">
        {schedulableDemands.length === 0 && (
          <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
            暂无进行中（pending / active）的招聘需求，请先在需求管理中创建。
          </p>
        )}
        {interviewers.length === 0 && (
          <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700">
            暂无可选面试官，请管理员先创建或启用面试官账号。
          </p>
        )}

        <div>
          <Select
            id="readdy-interviews-demand"
            name="demand_id"
            label="招聘需求"
            value={demandId}
            onChange={(event) => selectDemand(event.target.value)}
          >
            <option value="">请选择招聘需求</option>
            {schedulableDemands.map((demand) => (
              <option key={demand.id} value={demand.id}>{demandOptionLabel(demand)}</option>
            ))}
          </Select>
          {demandId && (
            <Link to={`/kanban?demand=${selectedDemandId}`} className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
              去候选人流程查看该需求
            </Link>
          )}
        </div>

        <div>
          <Select
            id="readdy-interviews-candidate"
            name="candidate_id"
            label="候选人"
            value={candidateId}
            disabled={!demandId || boardAsync.loading}
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">请选择“面试中”阶段的候选人</option>
            {demandCandidates.map((candidate) => (
              <option key={candidate.candidate_id} value={candidate.candidate_id}>
                {candidate.name_masked}
              </option>
            ))}
          </Select>
          {boardAsync.error && <span className="mt-1 block text-xs text-danger-600">{boardAsync.error.message}</span>}
          {demandId && !boardAsync.loading && !boardAsync.error && demandCandidates.length === 0 && (
            <span className="mt-1 block text-xs text-muted">该需求暂时没有处于“面试中”阶段的候选人</span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="readdy-interviews-round"
            name="round"
            label="轮次"
            value={round}
            onChange={(event) => {
              const nextRound = event.target.value as InterviewRound;
              setRound(nextRound);
              const nextSequence = ROUND_SEQUENCE_BY_ROUND[nextRound];
              if (nextSequence) setRoundSequence(String(nextSequence));
            }}
          >
            {INTERVIEW_ROUNDS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </Select>
          <Input
            id="readdy-interviews-round-sequence"
            name="round_sequence"
            label="轮次序号"
            type="number"
            min={1}
            value={roundSequence}
            onChange={(event) => setRoundSequence(event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Select
              id="readdy-interviews-interviewer"
              name="interviewer_id"
              label="面试官"
              value={interviewerId}
              disabled={interviewers.length === 0}
              onChange={(event) => setInterviewerId(event.target.value)}
            >
              <option value="">请选择面试官</option>
              {interviewers.map((interviewer) => (
                <option key={interviewer.id} value={interviewer.id}>{interviewer.name}</option>
              ))}
            </Select>
            <span className="mt-1 block text-xs text-muted">选择需求后会带出默认面试官，仍可更换</span>
          </div>
          <Select
            id="readdy-interviews-responsibility"
            name="is_primary"
            label="面试责任"
            value={isPrimary ? 'primary' : 'supporting'}
            onChange={(event) => setIsPrimary(event.target.value === 'primary')}
          >
            <option value="primary">主面试官</option>
            <option value="supporting">辅助面试官</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="readdy-interviews-scheduled-at"
            name="scheduled_at"
            label="面试时间"
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />
          <Input
            id="readdy-interviews-location"
            name="location"
            label="地点 / 会议链接"
            value={location}
            placeholder="例：腾讯会议 123 或会议室 A"
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>

        <label className="block text-sm font-medium text-ink">
          安排备注（可选）
          <textarea
            id="readdy-interviews-note"
            name="note"
            className="mt-2 min-h-20 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="补充本轮面试的特殊说明"
          />
        </label>

        {error && (
          <p
            role="alert"
            className={`rounded-lg px-3 py-2 text-sm ${isConflict
              ? 'border border-warning-200 bg-warning-50 text-warning-700'
              : 'bg-danger-50 text-danger-700'}`}
          >
            {isConflict && <AlertTriangle className="mr-1 inline h-4 w-4 align-[-2px]" />}
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}

// ---- 取消面试弹窗（必填原因） ----

function CancelModal({
  assignment,
  onClose,
  onCancelled,
}: {
  assignment: InterviewAssignment;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!reason.trim()) {
      setError('取消面试必须填写原因，便于后续审计和复盘');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.cancelInterviewAssignment(assignment.id, reason.trim());
      onCancelled();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="取消面试"
      description={`${assignment.name_masked ?? `候选人 #${assignment.candidate_id}`} · ${assignment.job_title ?? `岗位 #${assignment.job_id}`} · ${roundLabel(assignment.round)}`}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>返回</Button>
          <Button variant="danger" onClick={confirm} loading={saving}>确认取消面试</Button>
        </>
      )}
    >
      <div className="space-y-4 px-6 py-6">
        <label className="block text-sm font-medium text-ink">
          取消原因（必填）
          <textarea
            id="readdy-interviews-cancel-reason"
            name="cancel_reason"
            className="mt-2 min-h-24 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="请填写具体取消原因"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      </div>
    </ModalShell>
  );
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AdjustModal({
  assignment,
  interviewers,
  onClose,
  onUpdated,
}: {
  assignment: InterviewAssignment;
  interviewers: { id: number; name: string }[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [interviewerId, setInterviewerId] = useState(String(assignment.interviewer_id));
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(assignment.scheduled_at));
  const [location, setLocation] = useState(assignment.location || '');
  const [note, setNote] = useState(assignment.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const nextInterviewerId = Number(interviewerId);
    if (!nextInterviewerId) {
      setError('请选择面试官');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateInterviewAssignment(assignment.id, {
        interviewer_id: nextInterviewerId,
        scheduled_at: scheduledAt || null,
        location: location.trim(),
        note: note.trim(),
      });
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '调整失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="查看 / 调整面试"
      description={`${assignment.name_masked ?? `候选人 #${assignment.candidate_id}`} · ${assignment.job_title ?? `岗位 #${assignment.job_id}`}`}
      onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} loading={saving}>保存调整</Button>
        </>
      )}
    >
      <div className="space-y-5 px-6 py-6">
        <Select
          id="readdy-interviews-adjust-interviewer"
          name="interviewer_id"
          label="面试官"
          value={interviewerId}
          onChange={(event) => setInterviewerId(event.target.value)}
        >
          {interviewers.map((interviewer) => (
            <option key={interviewer.id} value={interviewer.id}>{interviewer.name}</option>
          ))}
        </Select>
        <Input
          id="readdy-interviews-adjust-time"
          name="scheduled_at"
          label="面试时间"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
        <Input
          id="readdy-interviews-adjust-location"
          name="location"
          label="线上 / 线下、会议室或会议链接"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="例：线下面试 · 3A 会议室 / 腾讯会议链接"
        />
        <label className="block text-sm font-medium text-ink">
          备注
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      </div>
    </ModalShell>
  );
}

type HeaderFilterKey = 'candidate' | 'job' | 'city' | 'department' | 'round' | 'arrangement' | 'action';
type ManagementView = 'list' | 'calendar';
type ManagementRowState = 'unassigned' | 'scheduled' | 'awaiting_feedback' | 'pending_decision' | 'result' | 'cancelled';

const EMPTY_COLUMN_FILTERS: Record<HeaderFilterKey, string> = {
  candidate: '',
  job: '',
  city: '',
  department: '',
  round: '',
  arrangement: '',
  action: '',
};

function rowState(item: InterviewManagementRow): ManagementRowState {
  const status = String(item.assignment_status || 'unassigned').trim().toLowerCase();
  if (!item.assignment_id || status === 'unassigned') return 'unassigned';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (item.feedback_submitted) {
    // 聚合接口正常只返回主面试任务；这里仍防御旧数据中的辅助任务。
    if (item.is_primary === false && status === 'feedback_submitted') return 'awaiting_feedback';
    return item.pipeline_stage !== 'interview' ? 'result' : 'pending_decision';
  }
  if (status === 'awaiting_feedback' || status === 'feedback_submitted' || status === 'completed') {
    return status === 'awaiting_feedback' ? 'awaiting_feedback' : 'pending_decision';
  }
  return 'scheduled';
}

function arrangementLabel(item: InterviewManagementRow) {
  switch (rowState(item)) {
    case 'unassigned': return '尚未安排';
    case 'scheduled': return item.scheduled_at ? '已排期' : '已安排，时间待定';
    case 'awaiting_feedback': return `等待 ${item.interviewer_name || '面试官'} 反馈`;
    case 'pending_decision': return '反馈已完成，等待处理';
    case 'result': return item.feedback_passed === false ? '未通过' : '通过';
    case 'cancelled': return '已取消';
  }
}

function managementRoundLabel(item: InterviewManagementRow) {
  return item.round ? roundLabel(item.round) : '轮次待定';
}

function actionLabel(item: InterviewManagementRow) {
  switch (rowState(item)) {
    case 'unassigned': return '安排面试';
    case 'scheduled': return '查看/调整';
    case 'awaiting_feedback': return '催反馈';
    case 'pending_decision': return '处理结果';
    case 'result': return '查看结果';
    case 'cancelled': return '查看详情';
  }
}

function candidateInitial(name?: string | null) {
  const value = String(name || '候').trim();
  return value.slice(0, 1) || '候';
}

function formatManagementDate(value?: string | null) {
  if (!value) return '时间待定';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value)).replace(/\//g, '-');
}

function managementRowToAssignment(item: InterviewManagementRow): InterviewAssignment | null {
  if (!item.assignment_id || !item.interviewer_id || !item.round || !item.round_sequence) return null;
  return {
    id: item.assignment_id,
    candidate_id: item.candidate_id,
    name_masked: item.name_masked,
    demand_id: item.demand_id,
    job_id: item.job_id,
    job_title: item.job_title,
    round: item.round,
    round_sequence: item.round_sequence,
    is_primary: Boolean(item.is_primary),
    interviewer_id: item.interviewer_id,
    interviewer_name: item.interviewer_name,
    scheduled_at: item.scheduled_at,
    location: item.location || '',
    note: item.note || '',
    status: item.assignment_status,
    feedback_submitted: item.feedback_submitted,
    is_overdue: false,
    created_by_name: null,
    created_at: null,
  };
}

function HeaderFilterMenu({
  label,
  filterKey,
  open,
  value,
  options,
  toggleHeaderFilter,
  onSelect,
}: {
  label: string;
  filterKey: HeaderFilterKey;
  open: boolean;
  value: string;
  options: string[];
  toggleHeaderFilter: (key: HeaderFilterKey) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-left font-medium text-[#767c87] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          toggleHeaderFilter(filterKey);
        }}
      >
        {label}
        <Filter className={`h-3 w-3 ${value ? 'text-[var(--enterprise-brand)]' : 'text-[#aeb2b8]'}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}筛选`}
          className="absolute left-0 top-8 z-30 min-w-40 rounded-lg border border-hairline bg-canvas p-1.5 shadow-card-lg"
          onClick={(event) => event.stopPropagation()}
        >
          {['', ...options].map((option) => (
            <button
              key={option || '__all'}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(option);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-normal text-body hover:bg-surface-soft"
            >
              <span>{option || '全部'}</span>
              {value === option && <Check className="h-3.5 w-3.5 text-[var(--enterprise-brand)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type RowActionTone = 'green' | 'orange' | 'coral' | 'red' | 'light';
const ROW_ACTION_TONES: Record<RowActionTone, string> = {
  green: 'bg-[var(--enterprise-brand)] text-white hover:bg-[var(--enterprise-brand-dark)]',
  orange: 'bg-warning-500 text-white hover:bg-warning-600',
  coral: 'bg-[#ff8a65] text-white hover:bg-[#f47b56]',
  red: 'bg-danger-600 text-white hover:bg-danger-700',
  light: 'border border-[#ecece8] bg-[#f8f8f5] text-[#555b58] hover:bg-[#f0f0eb]',
};

function RowActionButton({
  tone,
  icon,
  children,
  onClick,
}: {
  tone: RowActionTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${ROW_ACTION_TONES[tone]}`}
    >
      {icon}
      {children}
    </button>
  );
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

/**
 * Readdy/Figma 最终版招聘侧面试管理。
 * 公司 AppShell、权限和鉴权保持原样，这里只复原页面内部的信息结构与交互。
 */
function FigmaInterviewManagementPage() {
  const { role, userId } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const canManage = role === 'recruiter' || role === 'manager' || role === 'admin';

  const [search, setSearch] = useState('');
  const [view, setView] = useState<ManagementView>('list');
  const [headerFilter, setHeaderFilter] = useState<HeaderFilterKey | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<HeaderFilterKey, string>>(EMPTY_COLUMN_FILTERS);
  const [scheduleSeed, setScheduleSeed] = useState<ScheduleSeed | null>(null);
  const [resolvedDemands, setResolvedDemands] = useState<RecruitmentDemand[]>([]);
  const [adjustTarget, setAdjustTarget] = useState<InterviewAssignment | null>(null);
  const [conductTarget, setConductTarget] = useState<InterviewAssignment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InterviewAssignment | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<InterviewAssignment | null>(null);
  const [detailTarget, setDetailTarget] = useState<InterviewAssignment | null>(null);
  const [moreOpen, setMoreOpen] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const managementAsync = useAsync(() => api.getInterviewManagementRows(), []);
  // 详情抽屉和旧深链继续读取真实 assignment；管理表格使用聚合接口避免 N+1。
  const assignmentsAsync = useAsync(() => api.listInterviewAssignments(), []);
  const recordsAsync = useAsync(() => api.listInterviews(), []);
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );
  const interviewersAsync = useAsync(() => api.listInterviewers(), []);

  const rows = useMemo(() => managementAsync.data ?? [], [managementAsync.data]);
  const assignments = useMemo(() => assignmentsAsync.data ?? [], [assignmentsAsync.data]);
  const records = useMemo(() => recordsAsync.data ?? [], [recordsAsync.data]);
  const demands = useMemo(() => demandsAsync.data?.items ?? [], [demandsAsync.data]);
  const interviewers = useMemo(() => interviewersAsync.data ?? [], [interviewersAsync.data]);
  const availableDemands = useMemo(() => {
    const byId = new Map(demands.map((item) => [item.id, item]));
    resolvedDemands.forEach((item) => byId.set(item.id, item));
    return [...byId.values()];
  }, [demands, resolvedDemands]);
  const assignmentById = useMemo(
    () => new Map(assignments.map((item) => [item.id, item])),
    [assignments],
  );

  function assignmentForRow(row: InterviewManagementRow) {
    if (!row.assignment_id) return null;
    return assignmentById.get(row.assignment_id) ?? managementRowToAssignment(row);
  }

  function toggleHeaderFilter(key: HeaderFilterKey) {
    setHeaderFilter((current) => current === key ? null : key);
  }

  function setColumnFilter(key: HeaderFilterKey, value: string) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setHeaderFilter(null);
  }

  const optionMap = useMemo(() => ({
    candidate: uniqueValues(rows.map((item) => item.name_masked)),
    job: uniqueValues(rows.map((item) => item.job_title)),
    city: uniqueValues(rows.map((item) => item.job_city)),
    department: uniqueValues(rows.map((item) => item.job_department)),
    round: uniqueValues(rows.map(managementRoundLabel)),
    arrangement: uniqueValues(rows.map(arrangementLabel)),
    action: uniqueValues(rows.map(actionLabel)),
  }), [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const demandQuery = Number(searchParams.get('demand'));
    const candidateQuery = Number(searchParams.get('candidate'));
    const statusQuery = searchParams.get('status');
    return rows.filter((item) => {
      const state = rowState(item);
      if (demandQuery > 0 && item.demand_id !== demandQuery) return false;
      if (candidateQuery > 0 && item.candidate_id !== candidateQuery) return false;
      if (statusQuery === 'scheduled' && state !== 'scheduled' && state !== 'unassigned') return false;
      if (statusQuery === 'pending_feedback' && state !== 'awaiting_feedback') return false;
      if (statusQuery === 'done' && state !== 'pending_decision' && state !== 'result') return false;
      if (statusQuery === 'cancelled' && state !== 'cancelled') return false;
      if (query) {
        const haystack = [
          item.name_masked,
          item.job_title,
          item.job_city,
          item.job_department,
          item.interviewer_name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (columnFilters.candidate && item.name_masked !== columnFilters.candidate) return false;
      if (columnFilters.job && item.job_title !== columnFilters.job) return false;
      if (columnFilters.city && item.job_city !== columnFilters.city) return false;
      if (columnFilters.department && item.job_department !== columnFilters.department) return false;
      if (columnFilters.round && managementRoundLabel(item) !== columnFilters.round) return false;
      if (columnFilters.arrangement && arrangementLabel(item) !== columnFilters.arrangement) return false;
      if (columnFilters.action && actionLabel(item) !== columnFilters.action) return false;
      return true;
    });
  }, [columnFilters, rows, search, searchParams]);

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, InterviewManagementRow[]>();
    filtered.forEach((item) => {
      const key = item.scheduled_at ? item.scheduled_at.slice(0, 10) : '待安排';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === '待安排') return 1;
      if (b === '待安排') return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  function reloadAll() {
    managementAsync.reload();
    assignmentsAsync.reload();
    recordsAsync.reload();
  }

  async function openSchedule(row: InterviewManagementRow) {
    setMoreOpen(null);
    if (interviewersAsync.loading) {
      toast.info('面试官列表正在加载，请稍候');
      return;
    }
    if (interviewersAsync.error) {
      toast.error(`面试官列表加载失败：${interviewersAsync.error.message}`);
      return;
    }
    try {
      if (!availableDemands.some((item) => item.id === row.demand_id)) {
        const demand = await api.getDemand(row.demand_id);
        setResolvedDemands((current) => current.some((item) => item.id === demand.id)
          ? current
          : [...current, demand]);
      }
      setScheduleSeed({ demandId: row.demand_id, candidateId: row.candidate_id, round: row.round ?? 'round_1' });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '招聘需求加载失败，请重试');
    }
  }

  function findFeedbackRecord(assignment: InterviewAssignment): InterviewListItem | null {
    return records.find((record) => record.type === 'feedback'
      && (record.assignment_id === assignment.id
        || (record.assignment_id == null
          && record.candidate_id === assignment.candidate_id
          && record.round === assignment.round
          && (assignment.demand_id === null
            ? record.job_id === assignment.job_id
            : record.demand_id === assignment.demand_id)))) ?? null;
  }

  function handleViewFeedback(assignment: InterviewAssignment) {
    setDetailTarget(assignment);
  }

  async function confirmConducted() {
    if (!conductTarget) return;
    setActionBusy(conductTarget.id);
    try {
      await api.markInterviewConducted(conductTarget.id);
      setConductTarget(null);
      reloadAll();
      toast.success('已确认面试完成，任务进入待反馈');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '确认失败，请重试');
    } finally {
      setActionBusy(null);
    }
  }

  async function remindFeedback(item: InterviewAssignment) {
    setActionBusy(item.id);
    try {
      const result = await api.remindInterviewFeedback(item.id);
      toast.success(result.deduplicated
        ? '15 分钟内已经提醒过，本次没有重复发送'
        : `已提醒${item.interviewer_name || '面试官'}提交反馈`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '提醒失败，请重试');
    } finally {
      setActionBusy(null);
    }
  }

  useEffect(() => {
    const candidateId = Number(searchParams.get('candidate'));
    if (!candidateId || detailTarget || rows.length === 0) return;
    const requested = rows.find((item) => item.candidate_id === candidateId && item.assignment_id);
    if (!requested) return;
    const assignment = requested.assignment_id
      ? assignmentById.get(requested.assignment_id) ?? managementRowToAssignment(requested)
      : null;
    if (assignment) setDetailTarget(assignment);
  }, [assignmentById, detailTarget, rows, searchParams]);

  const detailFeedback = detailTarget ? findFeedbackRecord(detailTarget) : null;
  const detailRecords = detailTarget
    ? records.filter((record) => record.candidate_id === detailTarget.candidate_id
      && (detailTarget.demand_id === null
        ? record.job_id === detailTarget.job_id
        : record.demand_id === detailTarget.demand_id))
    : [];

  function handleFeedbackSubmitted(result: InterviewFeedbackResponse) {
    setFeedbackTarget(null);
    reloadAll();
    toast.success(
      result.next_action === 'awaiting_hr_decision'
        ? '反馈已提交，等待招聘专员处理结果'
        : '反馈已提交，等待主面试官完成本轮',
    );
  }

  function renderRowActions(row: InterviewManagementRow, item: InterviewAssignment | null) {
    const state = rowState(row);
    const rowKey = `${row.candidate_id}-${row.demand_id}-${row.assignment_id ?? 'new'}`;
    return (
      <div className="relative flex min-w-max items-center gap-2" onClick={(event) => event.stopPropagation()}>
        {state === 'unassigned' && (
          /* 尚未安排 → 安排面试 */
          <RowActionButton
            tone="green"
            icon={<CalendarPlus className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation();
              void openSchedule(row);
            }}
          >安排面试</RowActionButton>
        )}
        {state === 'scheduled' && item && (
          /* 已排期 → 查看/调整、确认已完成、未进行 */
          <>
            <RowActionButton tone="green" icon={<Eye className="h-3.5 w-3.5" />} onClick={(event) => {
              event.stopPropagation();
              setAdjustTarget(item);
            }}>查看/调整</RowActionButton>
            <RowActionButton tone="coral" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={(event) => {
              event.stopPropagation();
              setConductTarget(item);
            }}>确认已完成</RowActionButton>
            <RowActionButton tone="red" icon={<XCircle className="h-3.5 w-3.5" />} onClick={(event) => {
              event.stopPropagation();
              setCancelTarget(item);
            }}>未进行</RowActionButton>
          </>
        )}
        {state === 'awaiting_feedback' && item && (
          /* 等待面试官反馈 → 催反馈、查看反馈 */
          <>
            <RowActionButton tone="orange" icon={<Bell className="h-3.5 w-3.5" />} onClick={(event) => {
              event.stopPropagation();
              void remindFeedback(item);
            }}>催反馈</RowActionButton>
            <RowActionButton tone="light" icon={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={(event) => {
              event.stopPropagation();
              setDetailTarget(item);
            }}>查看反馈</RowActionButton>
          </>
        )}
        {state === 'pending_decision' && item && (
          /* 反馈已完成，等待处理 → 处理结果 */
          <RowActionButton tone="green" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={(event) => {
            event.stopPropagation();
            handleViewFeedback(item);
          }}>处理结果</RowActionButton>
        )}
        {state === 'result' && item && (
          /* 通过 → 查看结果 */
          <RowActionButton tone="light" icon={<Eye className="h-3.5 w-3.5" />} onClick={(event) => {
            event.stopPropagation();
            handleViewFeedback(item);
          }}>查看结果</RowActionButton>
        )}
        {state === 'cancelled' && item && (
          <RowActionButton tone="light" icon={<Eye className="h-3.5 w-3.5" />} onClick={(event) => {
            event.stopPropagation();
            setDetailTarget(item);
          }}>查看详情</RowActionButton>
        )}
        <button
          type="button"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={moreOpen === rowKey}
          className="flex h-8 w-7 items-center justify-center rounded-md text-[#8c918d] hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={(event) => {
            event.stopPropagation();
            setMoreOpen((current) => current === rowKey ? null : rowKey);
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {moreOpen === rowKey && (
          <div role="menu" className="absolute right-0 top-9 z-40 w-40 rounded-lg border border-hairline bg-canvas p-1.5 shadow-card-lg">
            {item && (
              <button type="button" role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-soft" onMouseDown={() => setMoreOpen(null)} onClick={() => setDetailTarget(item)}>
                查看面试详情
              </button>
            )}
            {item && item.interviewer_id === userId && !item.feedback_submitted && (
              <button type="button" role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-soft" onMouseDown={() => setMoreOpen(null)} onClick={() => setFeedbackTarget(item)}>
                填写反馈
              </button>
            )}
            {!item && (
              <button type="button" role="menuitem" className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-soft" onClick={() => void openSchedule(row)}>
                安排本轮面试
              </button>
            )}
          </div>
        )}
        {item && actionBusy === item.id && <Spinner size="sm" />}
      </div>
    );
  }

  const loading = managementAsync.loading
    || assignmentsAsync.loading
    || recordsAsync.loading
    || demandsAsync.loading
    || interviewersAsync.loading;
  const loadError = managementAsync.error
    ?? assignmentsAsync.error
    ?? recordsAsync.error
    ?? demandsAsync.error
    ?? interviewersAsync.error;

  if (!canManage) {
    return (
      <div data-ui="readdy-interviews" className="mx-auto max-w-[1440px]">
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="当前账号无权限访问面试管理"
            description="面试管理面向招聘专员、招聘经理和管理员；面试官请前往专属工作区处理待反馈任务。"
            action={<Link to="/interviewer/interviews"><Button size="sm">去面试官工作区</Button></Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-interviews" className="mx-auto max-w-[1440px] space-y-5" onClick={() => {
      setHeaderFilter(null);
      setMoreOpen(null);
    }}>
      <div data-ui="interview-management-toolbar" className="flex flex-wrap items-center justify-end gap-4">
        <div className="relative w-full sm:w-[296px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a6aaa7]" />
          <input
            className="h-11 w-full rounded-lg border border-[#e8e8e3] bg-canvas pl-10 pr-9 text-sm text-ink outline-none placeholder:text-[#a6aaa7] focus:border-[var(--enterprise-brand)] focus:ring-2 focus:ring-brand-100"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setHeaderFilter(null); }}
            onClick={(event) => event.stopPropagation()}
            placeholder="搜索候选人、岗位、面试官..."
            aria-label="搜索候选人、岗位、面试官"
          />
          {search && (
            <button type="button" onClick={(event) => { event.stopPropagation(); setSearch(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label="清空搜索">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="whitespace-nowrap text-sm text-muted">共 <strong className="font-semibold text-ink">{filtered.length}</strong> 条</span>
        <div className="inline-flex h-11 items-center rounded-xl bg-[#f5f5f2] p-1" role="group" aria-label="面试管理视图">
          <button type="button" aria-label="列表视图" aria-pressed={view === 'list'} onClick={(event) => { event.stopPropagation(); setView('list'); }} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${view === 'list' ? 'bg-canvas text-ink shadow-apple-sm' : 'text-muted hover:text-ink'}`}>
            <List className="h-4 w-4" />列表
          </button>
          <button type="button" aria-label="日历视图" aria-pressed={view === 'calendar'} onClick={(event) => { event.stopPropagation(); setView('calendar'); }} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition ${view === 'calendar' ? 'bg-canvas text-ink shadow-apple-sm' : 'text-muted hover:text-ink'}`}>
            <CalendarDays className="h-4 w-4" />日历
          </button>
        </div>
      </div>

      <Card className="overflow-visible rounded-[14px] border-[#e8e8e3] shadow-none">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner />加载面试任务…</div>
        )}
        {!loading && loadError && (
          <div className="p-6"><ErrorState message={`面试数据加载失败：${loadError.message}`} onRetry={reloadAll} /></div>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="暂无面试任务" description="当前没有进入面试阶段的候选人。候选人进入面试阶段后，可直接在这里安排面试。" />
          ) : (
            <EmptyState
              icon={Search}
              title="暂无符合条件的面试"
              description="当前搜索或表头筛选条件下没有记录。"
              action={<Button size="sm" variant="secondary" onClick={() => { setSearch(''); setColumnFilters(EMPTY_COLUMN_FILTERS); }}>清除筛选</Button>}
            />
          )
        )}

        {!loading && !loadError && filtered.length > 0 && view === 'list' && (
          <div className="overflow-x-auto rounded-[14px]">
            <table className="w-full min-w-[1380px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[170px]" /><col className="w-[178px]" /><col className="w-[104px]" />
                <col className="w-[137px]" /><col className="w-[126px]" /><col className="w-[260px]" /><col className="w-[405px]" />
              </colgroup>
              <thead className="border-b border-[#ecece8] bg-[#fbfbf9] text-xs">
                <tr className="h-[62px]">
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="候选人" filterKey="candidate" open={headerFilter === 'candidate'} value={columnFilters.candidate} options={optionMap.candidate} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('candidate', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="应聘岗位" filterKey="job" open={headerFilter === 'job'} value={columnFilters.job} options={optionMap.job} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('job', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="城市" filterKey="city" open={headerFilter === 'city'} value={columnFilters.city} options={optionMap.city} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('city', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="部门" filterKey="department" open={headerFilter === 'department'} value={columnFilters.department} options={optionMap.department} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('department', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="面试轮次" filterKey="round" open={headerFilter === 'round'} value={columnFilters.round} options={optionMap.round} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('round', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="面试安排" filterKey="arrangement" open={headerFilter === 'arrangement'} value={columnFilters.arrangement} options={optionMap.arrangement} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('arrangement', value)} /></th>
                  <th className="relative px-6 font-medium"><HeaderFilterMenu label="操作" filterKey="action" open={headerFilter === 'action'} value={columnFilters.action} options={optionMap.action} toggleHeaderFilter={toggleHeaderFilter} onSelect={(value) => setColumnFilter('action', value)} /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefeb] bg-canvas">
                {filtered.map((row) => {
                  const item = assignmentForRow(row);
                  const state = rowState(row);
                  return (
                    <tr
                      key={`${row.candidate_id}-${row.demand_id}-${row.assignment_id ?? 'new'}`}
                      className="h-[66px] cursor-pointer transition-colors hover:bg-[#fbfbf8]"
                      tabIndex={0}
                      onClick={() => {
                        if (item) setDetailTarget(item);
                        else void openSchedule(row);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        if (item) setDetailTarget(item);
                      }}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <span aria-label="候选人头像" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5f5ed] text-sm font-semibold text-[var(--enterprise-brand)]">{candidateInitial(row.name_masked)}</span>
                          <span className="truncate font-semibold text-ink">{row.name_masked || `候选人 #${row.candidate_id}`}</span>
                        </div>
                      </td>
                      <td className="truncate px-6 py-3 text-body">{row.job_title || `岗位 #${row.job_id}`}</td>
                      <td className="truncate px-6 py-3 text-body">{row.job_city || '未记录'}</td>
                      <td className="truncate px-6 py-3 text-body">{row.job_department || '未记录'}</td>
                      <td className="px-6 py-3"><Badge className="border-0 bg-[#e8f0e4] px-3 py-1 text-[#5b7454]" tone="neutral">{managementRoundLabel(row)}</Badge></td>
                      <td className="px-6 py-3">
                        {state === 'scheduled' ? (
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#def3ea] text-xs font-semibold text-[var(--enterprise-brand)]">{candidateInitial(row.interviewer_name)}</span>
                            <div className="min-w-0"><p className="truncate font-medium text-ink">{row.interviewer_name || '待定面试官'}</p><p className="mt-0.5 text-xs text-muted">{formatManagementDate(row.scheduled_at)}</p></div>
                          </div>
                        ) : state === 'result' ? (
                          <div><Badge tone={row.feedback_passed === false ? 'danger' : 'success'}>{arrangementLabel(row)}</Badge><p className="mt-1 text-xs text-muted">{formatManagementDate(row.scheduled_at)}</p></div>
                        ) : (
                          <span className={state === 'awaiting_feedback' ? 'text-[#696f6b]' : state === 'pending_decision' ? 'font-medium text-[#5e655f]' : 'text-muted'}>{arrangementLabel(row)}</span>
                        )}
                      </td>
                      <td className="px-6 py-3">{renderRowActions(row, item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && filtered.length > 0 && view === 'calendar' && (
          <div className="space-y-5 p-5" data-ui="interview-calendar-view">
            {calendarGroups.map(([date, items]) => (
              <section key={date}>
                <h2 className="mb-2 text-sm font-semibold text-ink">{date === '待安排' ? '待安排' : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${date}T00:00:00`))}</h2>
                <div className="grid gap-3 xl:grid-cols-2">
                  {items.map((row) => {
                    const item = assignmentForRow(row);
                    return (
                      <article key={`${row.candidate_id}-${row.assignment_id ?? 'new'}`} className="rounded-xl border border-[#e8e8e3] bg-canvas p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span aria-label="候选人头像" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5f5ed] text-sm font-semibold text-[var(--enterprise-brand)]">{candidateInitial(row.name_masked)}</span>
                            <div><p className="font-semibold text-ink">{row.name_masked || `候选人 #${row.candidate_id}`}</p><p className="mt-1 text-xs text-muted">{row.job_title} · {managementRoundLabel(row)}</p></div>
                          </div>
                          <span className="text-xs text-muted">{row.scheduled_at ? formatManagementDate(row.scheduled_at) : '尚未安排'}</span>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted">{arrangementLabel(row)}</span>{renderRowActions(row, item)}</div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      {scheduleSeed && (
        <ScheduleModal
          demands={availableDemands}
          interviewers={interviewers}
          seed={scheduleSeed}
          onClose={() => setScheduleSeed(null)}
          onCreated={() => { setScheduleSeed(null); reloadAll(); toast.success('面试安排已保存'); }}
        />
      )}
      {adjustTarget && (
        <AdjustModal assignment={adjustTarget} interviewers={interviewers} onClose={() => setAdjustTarget(null)} onUpdated={() => { setAdjustTarget(null); reloadAll(); toast.success('面试安排已更新'); }} />
      )}
      <ConfirmDialog
        open={Boolean(conductTarget)}
        title="确认面试已完成？"
        description="确认后任务才会进入待反馈，不会因为时间经过而自动完成。"
        confirmLabel="确认已完成"
        loading={Boolean(conductTarget && actionBusy === conductTarget.id)}
        onConfirm={() => void confirmConducted()}
        onCancel={() => setConductTarget(null)}
      />
      {cancelTarget && (
        <CancelModal assignment={cancelTarget} onClose={() => setCancelTarget(null)} onCancelled={() => { setCancelTarget(null); reloadAll(); toast.success('已标记本次面试未进行'); }} />
      )}
      {feedbackTarget && (
        <ModalShell
          title="填写面试反馈"
          description={`${feedbackTarget.name_masked ?? `候选人 #${feedbackTarget.candidate_id}`} · ${feedbackTarget.job_title ?? `岗位 #${feedbackTarget.job_id}`} · ${roundLabel(feedbackTarget.round)}`}
          onClose={() => setFeedbackTarget(null)}
        >
          <div className="px-6 py-6">
            {feedbackTarget.demand_id ? (
              <FeedbackForm candidateId={feedbackTarget.candidate_id} demandId={feedbackTarget.demand_id} assignmentId={feedbackTarget.id} initialRound={feedbackTarget.round} onSubmitted={handleFeedbackSubmitted} />
            ) : (
              <FeedbackForm candidateId={feedbackTarget.candidate_id} jobId={feedbackTarget.job_id} assignmentId={feedbackTarget.id} initialRound={feedbackTarget.round} onSubmitted={handleFeedbackSubmitted} />
            )}
          </div>
        </ModalShell>
      )}

      <DrawerShell
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="面试详情"
        eyebrow={detailTarget ? STATUS_META[assignmentStatus(detailTarget)].label : undefined}
        description={detailTarget ? `${detailTarget.name_masked ?? `候选人 #${detailTarget.candidate_id}`} · ${detailTarget.job_title ?? `岗位 #${detailTarget.job_id}`}` : undefined}
        size="lg"
        testId="interview-detail-drawer"
        footer={detailTarget?.demand_id && detailFeedback ? (
          <Link to={`/kanban?demand=${detailTarget.demand_id}&candidate=${detailTarget.candidate_id}`}><Button size="sm">去候选人流程处理结果</Button></Link>
        ) : undefined}
      >
        {detailTarget && (
          <div className="space-y-6">
            <section className="rounded-xl border border-hairline p-4">
              <h3 className="text-sm font-semibold text-ink">面试信息</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">面试轮次</dt><dd className="mt-1 font-medium text-ink">{roundLabel(detailTarget.round)} · 第 {detailTarget.round_sequence} 轮</dd></div>
                <div><dt className="text-xs text-muted">面试官</dt><dd className="mt-1 font-medium text-ink">{detailTarget.interviewer_name ?? `面试官 #${detailTarget.interviewer_id}`}</dd></div>
                <div><dt className="text-xs text-muted">时间</dt><dd className="mt-1 font-medium text-ink">{formatManagementDate(detailTarget.scheduled_at)}</dd></div>
                <div><dt className="text-xs text-muted">地点 / 会议链接</dt><dd className="mt-1 font-medium text-ink">{detailTarget.location || '地点待定'}</dd></div>
              </dl>
            </section>
            <section className="rounded-xl border border-hairline p-4">
              <h3 className="text-sm font-semibold text-ink">面试反馈</h3>
              {detailFeedback ? (
                <div className="mt-3 space-y-2 text-sm text-body">
                  <p><span className="text-muted">结论：</span>{detailFeedback.pass === null ? '未记录' : detailFeedback.pass ? '通过' : '不通过'}</p>
                  <p><span className="text-muted">评分：</span>{detailFeedback.score ?? '—'}</p>
                  <p><span className="text-muted">优势：</span>{detailFeedback.strengths || '未记录'}</p>
                  <p><span className="text-muted">顾虑：</span>{detailFeedback.concerns || '未记录'}</p>
                </div>
              ) : <p className="mt-3 text-sm text-muted">本轮尚无已提交反馈。</p>}
            </section>
            <section className="rounded-xl border border-hairline p-4">
              <h3 className="text-sm font-semibold text-ink">流程记录</h3>
              <div className="mt-3 space-y-3">
                {detailRecords.length === 0 ? <p className="text-sm text-muted">暂无更多面试记录。</p> : detailRecords.map((record) => (
                  <div key={`${record.type}-${record.id}`} className="rounded-lg bg-surface-soft px-3 py-2 text-sm text-body">{formatDateTime(record.created_at)} · {record.type === 'feedback' ? '提交面试反馈' : '完成 AI 面试'}{record.interviewer_name ? ` · ${record.interviewer_name}` : ''}</div>
                ))}
              </div>
            </section>
          </div>
        )}
      </DrawerShell>
    </div>
  );
}


export function ReaddyInterviewsPage() {
  return <FigmaInterviewManagementPage />;
}

export default ReaddyInterviewsPage;
