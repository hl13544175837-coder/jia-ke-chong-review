// Readdy 视觉风格的面试管理页（招聘专员 / 经理 / 管理员视角）。
// 数据全部来自真实后端：面试任务(assignment)、面试记录(record)、招聘需求、面试官。
// 反馈提交只调用反馈接口，不会自动推进候选人主流程（后端语义如此）。

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock3,
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
  isActiveInterviewAssignment,
  roundLabel,
} from '../lib/interviewRecords';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Spinner,
  useToast,
} from '../components/ui';
import { FeedbackForm } from '../components/interview/FeedbackForm';
import { InterviewRecordDrawer } from '../components/interviewRecords/InterviewRecordDrawer';
import type {
  InterviewAssignment,
  InterviewFeedbackResponse,
  InterviewListItem,
  InterviewRound,
  RecruitmentDemand,
} from '../types';

// ---- 状态语义 ----

type AssignmentStatusKey = 'scheduled' | 'pending_feedback' | 'done' | 'cancelled';

function assignmentStatus(item: InterviewAssignment): AssignmentStatusKey {
  const status = (item.status || 'scheduled').trim().toLowerCase();
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (item.feedback_submitted || ['completed', 'feedback_submitted'].includes(status)) return 'done';
  if (item.is_overdue) return 'pending_feedback';
  if (item.scheduled_at && new Date(item.scheduled_at).getTime() < Date.now()) {
    return 'pending_feedback';
  }
  return 'scheduled';
}

const STATUS_META: Record<AssignmentStatusKey, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  scheduled: { label: '待面试', tone: 'info' },
  pending_feedback: { label: '待反馈', tone: 'warning' },
  done: { label: '已反馈', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

const STATUS_FILTER_OPTIONS: Array<{ key: 'all' | AssignmentStatusKey; label: string }> = [
  { key: 'all', label: '全部状态' },
  { key: 'scheduled', label: '待面试' },
  { key: 'pending_feedback', label: '待反馈' },
  { key: 'done', label: '已反馈' },
  { key: 'cancelled', label: '已取消' },
];

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label={title}>
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

function ScheduleModal({
  demands,
  interviewers,
  onClose,
  onCreated,
}: {
  demands: RecruitmentDemand[];
  interviewers: { id: number; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const schedulableDemands = useMemo(
    () => demands.filter((demand) => demand.status === 'pending' || demand.status === 'active'),
    [demands],
  );
  const [demandId, setDemandId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [round, setRound] = useState<InterviewRound>('round_1');
  const [roundSequence, setRoundSequence] = useState('1');
  const [isPrimary, setIsPrimary] = useState(true);
  const [interviewerId, setInterviewerId] = useState('');
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
            <Link to="/kanban" className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
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

// ---- 页面主体 ----

export function ReaddyInterviewsPage() {
  const { role, userId } = useAuth();
  const toast = useToast();
  const canManage = role === 'recruiter' || role === 'manager' || role === 'admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [demandFilter, setDemandFilter] = useState<'all' | number>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentStatusKey>('all');
  const [interviewerFilter, setInterviewerFilter] = useState<'all' | number>('all');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InterviewAssignment | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<InterviewAssignment | null>(null);
  const [viewingRecord, setViewingRecord] = useState<InterviewListItem | null>(null);

  const assignmentsAsync = useAsync(() => api.listInterviewAssignments(), []);
  const recordsAsync = useAsync(() => api.listInterviews(), []);
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );
  const interviewersAsync = useAsync(() => api.listInterviewers(), []);

  const assignments = useMemo(() => assignmentsAsync.data ?? [], [assignmentsAsync.data]);
  const records = useMemo(() => recordsAsync.data ?? [], [recordsAsync.data]);
  const demands = useMemo(() => demandsAsync.data?.items ?? [], [demandsAsync.data]);
  const interviewers = useMemo(() => interviewersAsync.data ?? [], [interviewersAsync.data]);

  const stats = useMemo(() => {
    const counts: Record<AssignmentStatusKey, number> = {
      scheduled: 0,
      pending_feedback: 0,
      done: 0,
      cancelled: 0,
    };
    assignments.forEach((item) => {
      counts[assignmentStatus(item)] += 1;
    });
    return counts;
  }, [assignments]);

  const demandOptions = useMemo(() => {
    const map = new Map<number, string>();
    demands.forEach((demand) => map.set(demand.id, demandOptionLabel(demand)));
    assignments.forEach((item) => {
      if (item.demand_id && !map.has(item.demand_id)) {
        map.set(item.demand_id, `招聘需求 #${item.demand_id} · ${item.job_title ?? `岗位 #${item.job_id}`}`);
      }
    });
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  }, [demands, assignments]);

  const interviewerOptions = useMemo(() => {
    const map = new Map<number, string>();
    interviewers.forEach((interviewer) => map.set(interviewer.id, interviewer.name));
    assignments.forEach((item) => {
      if (item.interviewer_id && item.interviewer_name && !map.has(item.interviewer_id)) {
        map.set(item.interviewer_id, item.interviewer_name);
      }
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [interviewers, assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((item) => {
      if (demandFilter !== 'all' && item.demand_id !== demandFilter) return false;
      if (statusFilter !== 'all' && assignmentStatus(item) !== statusFilter) return false;
      if (interviewerFilter !== 'all' && item.interviewer_id !== interviewerFilter) return false;
      if (q) {
        const text = [item.name_masked, item.job_title, item.interviewer_name, item.location, item.note]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [assignments, demandFilter, statusFilter, interviewerFilter, search]);

  const hasActiveFilter = search.trim() !== ''
    || demandFilter !== 'all'
    || statusFilter !== 'all'
    || interviewerFilter !== 'all';

  function clearAllFilters() {
    setSearchInput('');
    setSearch('');
    setDemandFilter('all');
    setStatusFilter('all');
    setInterviewerFilter('all');
  }

  function reloadAll() {
    assignmentsAsync.reload();
    recordsAsync.reload();
  }

  function findFeedbackRecord(assignment: InterviewAssignment): InterviewListItem | null {
    return records.find((record) => record.type === 'feedback'
      && (record.assignment_id === assignment.id
        || (record.candidate_id === assignment.candidate_id
          && record.round === assignment.round
          && (assignment.demand_id === null
            ? record.job_id === assignment.job_id
            : record.demand_id === assignment.demand_id)))) ?? null;
  }

  function handleViewFeedback(assignment: InterviewAssignment) {
    const record = findFeedbackRecord(assignment);
    if (record) {
      setViewingRecord(record);
    } else {
      toast.error('未找到对应的反馈记录，可能尚未同步');
    }
  }

  function handleFeedbackSubmitted(result: InterviewFeedbackResponse) {
    setFeedbackTarget(null);
    reloadAll();
    toast.success(
      result.next_action === 'awaiting_hr_decision'
        ? '主面试官反馈已提交，本轮完成，待 HR 确认下一步'
        : '反馈已提交，等待主面试官完成本轮',
    );
  }

  const loading = assignmentsAsync.loading || recordsAsync.loading;
  const loadError = assignmentsAsync.error ?? recordsAsync.error;

  // 无权限提示：面试官请走专属工作区
  if (!canManage) {
    return (
      <div data-ui="readdy-interviews" className="mx-auto max-w-[1440px]">
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="当前账号无权限访问面试管理"
            description="面试管理面向招聘专员、招聘经理和管理员；面试官请前往专属工作区处理待反馈任务。"
            action={(
              <Link to="/interviewer/interviews">
                <Button size="sm">去面试官工作区</Button>
              </Link>
            )}
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-interviews" className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">面试管理</h1>
          <p className="mt-1 text-sm text-muted">安排面试、跟踪待反馈任务并查看历史反馈，所有数据来自真实面试协同记录</p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>
          <CalendarPlus className="h-4 w-4" />
          安排面试
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-canvas p-4">
          <Clock3 className="h-5 w-5 text-[#1e6fd9]" />
          <p className="mt-3 text-xs text-muted">待面试</p>
          <p className="mt-1 text-2xl font-bold text-ink">{stats.scheduled}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-canvas p-4">
          <AlertTriangle className="h-5 w-5 text-[#b56a00]" />
          <p className="mt-3 text-xs text-muted">待反馈</p>
          <p className="mt-1 text-2xl font-bold text-ink">{stats.pending_feedback}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-canvas p-4">
          <CheckCircle2 className="h-5 w-5 text-[#52a611]" />
          <p className="mt-3 text-xs text-muted">已反馈</p>
          <p className="mt-1 text-2xl font-bold text-ink">{stats.done}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-canvas p-4">
          <XCircle className="h-5 w-5 text-muted-soft" />
          <p className="mt-3 text-xs text-muted">已取消</p>
          <p className="mt-1 text-2xl font-bold text-ink">{stats.cancelled}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* 筛选栏 */}
        <form
          className="flex flex-col gap-3 border-b border-hairline bg-surface-soft p-4 lg:flex-row lg:items-center"
          onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" />
            <input
              className="h-10 w-full rounded-md border border-hairline bg-canvas pl-9 pr-8 text-sm text-ink outline-none placeholder:text-muted-soft focus:border-ink"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索候选人、岗位、面试官或地点"
              aria-label="搜索面试任务"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); }}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-soft hover:text-ink"
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
            <select
              aria-label="按招聘需求筛选"
              className="h-10 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none"
              value={demandFilter === 'all' ? 'all' : String(demandFilter)}
              onChange={(event) => setDemandFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
            >
              <option value="all">全部需求</option>
              {demandOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="按状态筛选"
              className="h-10 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | AssignmentStatusKey)}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="按面试官筛选"
              className="h-10 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none"
              value={interviewerFilter === 'all' ? 'all' : String(interviewerFilter)}
              onChange={(event) => setInterviewerFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
            >
              <option value="all">全部面试官</option>
              {interviewerOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary">搜索</Button>
            <span className="whitespace-nowrap text-xs text-muted">
              共 <strong className="text-ink">{filtered.length}</strong> 条
            </span>
          </div>
        </form>

        {/* 激活的筛选标签 */}
        {hasActiveFilter && (
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            {search.trim() && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink">
                搜索: {search}
                <button type="button" onClick={() => { setSearchInput(''); setSearch(''); }} aria-label="清除搜索筛选"><X className="h-3 w-3" /></button>
              </span>
            )}
            {demandFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink">
                需求: {demandOptions.find((option) => option.id === demandFilter)?.label ?? `#${demandFilter}`}
                <button type="button" onClick={() => setDemandFilter('all')} aria-label="清除需求筛选"><X className="h-3 w-3" /></button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink">
                状态: {STATUS_META[statusFilter].label}
                <button type="button" onClick={() => setStatusFilter('all')} aria-label="清除状态筛选"><X className="h-3 w-3" /></button>
              </span>
            )}
            {interviewerFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-1 text-xs font-medium text-ink">
                面试官: {interviewerOptions.find((option) => option.id === interviewerFilter)?.name ?? `#${interviewerFilter}`}
                <button type="button" onClick={() => setInterviewerFilter('all')} aria-label="清除面试官筛选"><X className="h-3 w-3" /></button>
              </span>
            )}
            <button type="button" onClick={clearAllFilters} className="text-xs text-muted hover:text-ink">
              清除全部
            </button>
          </div>
        )}

        {/* 列表区：加载 / 错误 / 空态 / 表格 */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
            <Spinner />
            加载面试任务…
          </div>
        )}
        {!loading && loadError && (
          <div className="p-6">
            <ErrorState message={`面试数据加载失败：${loadError.message}`} onRetry={reloadAll} />
          </div>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          assignments.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="暂无面试任务"
              description="还没有任何面试安排。点击右上角“安排面试”，为进行中的招聘需求指派面试官。"
              action={(
                <Button size="sm" onClick={() => setScheduleOpen(true)}>
                  <CalendarPlus className="h-4 w-4" />
                  安排面试
                </Button>
              )}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="暂无符合条件的面试"
              description="当前筛选条件下没有面试任务，可以调整筛选或清除全部条件。"
              action={<Button size="sm" variant="secondary" onClick={clearAllFilters}>清除全部筛选</Button>}
            />
          )
        )}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-surface-soft text-xs text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
                  <th className="px-5 py-3 font-medium">轮次</th>
                  <th className="px-5 py-3 font-medium">面试官</th>
                  <th className="px-5 py-3 font-medium">时间 / 地点</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefeb]">
                {filtered.map((item) => {
                  const statusKey = assignmentStatus(item);
                  const statusMeta = STATUS_META[statusKey];
                  const canFillFeedback = statusKey !== 'cancelled'
                    && !item.feedback_submitted
                    && item.interviewer_id === userId;
                  const canCancel = statusKey !== 'cancelled'
                    && !item.feedback_submitted
                    && isActiveInterviewAssignment(item);
                  return (
                    <tr key={item.id} className="hover:bg-surface-soft">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{item.name_masked ?? `候选人 #${item.candidate_id}`}</p>
                        <p className="mt-1 text-xs text-muted">
                          {item.job_title ?? `岗位 #${item.job_id}`}
                          {item.demand_id ? ` · 需求 #${item.demand_id}` : ' · 历史未归属需求'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="warning">{roundLabel(item.round)}</Badge>
                        <p className="mt-1 text-xs text-muted-soft">
                          第 {item.round_sequence} 轮 · {item.is_primary ? '主面试官' : '辅助面试官'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-muted">{item.interviewer_name ?? `面试官 #${item.interviewer_id}`}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink">{formatDateTime(item.scheduled_at)}</p>
                        <p className="mt-1 max-w-[200px] truncate text-xs text-muted-soft">{item.location || '地点待定'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                          {item.is_overdue && statusKey === 'pending_feedback' && (
                            <Badge tone="danger">已逾期</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {item.feedback_submitted && (
                            <Button size="sm" variant="secondary" onClick={() => handleViewFeedback(item)}>查看反馈</Button>
                          )}
                          {canFillFeedback && (
                            <Button size="sm" onClick={() => setFeedbackTarget(item)}>填写反馈</Button>
                          )}
                          {!item.feedback_submitted && !canFillFeedback && statusKey === 'pending_feedback' && (
                            <span className="self-center text-xs text-muted-soft">待面试官反馈</span>
                          )}
                          {canCancel && (
                            <Button size="sm" variant="danger" onClick={() => setCancelTarget(item)}>取消面试</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 弹窗 */}
      {scheduleOpen && (
        <ScheduleModal
          demands={demands}
          interviewers={interviewers}
          onClose={() => setScheduleOpen(false)}
          onCreated={() => {
            setScheduleOpen(false);
            reloadAll();
            toast.success('面试安排已保存');
          }}
        />
      )}
      {cancelTarget && (
        <CancelModal
          assignment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            reloadAll();
            toast.success('面试已取消，可重新安排该轮主面试官');
          }}
        />
      )}
      {feedbackTarget && (
        <ModalShell
          title="填写面试反馈"
          description={`${feedbackTarget.name_masked ?? `候选人 #${feedbackTarget.candidate_id}`} · ${feedbackTarget.job_title ?? `岗位 #${feedbackTarget.job_id}`} · ${roundLabel(feedbackTarget.round)}。反馈只完成本轮面试任务，推进或淘汰由 HR 另行确认。`}
          onClose={() => setFeedbackTarget(null)}
        >
          <div className="px-6 py-6">
            {feedbackTarget.demand_id ? (
              <FeedbackForm
                candidateId={feedbackTarget.candidate_id}
                demandId={feedbackTarget.demand_id}
                assignmentId={feedbackTarget.id}
                initialRound={feedbackTarget.round}
                onSubmitted={handleFeedbackSubmitted}
              />
            ) : (
              <>
                <div className="mb-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
                  这是兼容期历史任务，尚未回填招聘需求。系统只会在该岗位能唯一解析到需求时接受反馈。
                </div>
                <FeedbackForm
                  candidateId={feedbackTarget.candidate_id}
                  jobId={feedbackTarget.job_id}
                  assignmentId={feedbackTarget.id}
                  initialRound={feedbackTarget.round}
                  onSubmitted={handleFeedbackSubmitted}
                />
              </>
            )}
          </div>
        </ModalShell>
      )}
      {viewingRecord && (
        <InterviewRecordDrawer item={viewingRecord} onClose={() => setViewingRecord(null)} />
      )}
    </div>
  );
}

export default ReaddyInterviewsPage;
