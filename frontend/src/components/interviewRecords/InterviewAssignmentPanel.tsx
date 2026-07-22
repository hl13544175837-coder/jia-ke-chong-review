import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/formatDate';
import {
  assignmentResponseLabel,
  assignmentResponseTone,
  demandOptionLabel,
  INTERVIEW_ROUNDS,
  notificationDeliveryLabel,
  notificationDeliveryTone,
  roundLabel,
} from '../../lib/interviewRecords';
import type {
  InterviewAssignment,
  InterviewRound,
  InterviewerOption,
  PipelineBoard,
  RecruitmentDemand,
} from '../../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input, Select } from '../ui';
import { SearchableInterviewerField } from './SearchableInterviewerField';

const ROUND_SEQUENCE_BY_ROUND: Partial<Record<InterviewRound, number>> = {
  round_1: 1,
  round_2: 2,
  round_3: 3,
  additional: 4,
};

interface InterviewAssignmentPanelProps {
  demands: RecruitmentDemand[];
  boards: PipelineBoard[];
  interviewers: InterviewerOption[];
  interviewersLoading?: boolean;
  interviewersError?: string | null;
  onReloadInterviewers?: () => void;
  assignments: InterviewAssignment[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated: () => void;
}

export function InterviewAssignmentPanel({
  demands,
  boards,
  interviewers,
  interviewersLoading = false,
  interviewersError = null,
  onReloadInterviewers,
  assignments,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: InterviewAssignmentPanelProps) {
  const { role } = useAuth();
  const [localOpen, setLocalOpen] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const [demandId, setDemandId] = useState('');
  const [round, setRound] = useState<InterviewRound>('round_1');
  const [roundSequence, setRoundSequence] = useState('1');
  const [isPrimary, setIsPrimary] = useState(true);
  const [interviewerId, setInterviewerId] = useState<number | null>(null);
  const [pendingDefaultInterviewerId, setPendingDefaultInterviewerId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const open = controlledOpen ?? localOpen;
  const recentAssignments = useMemo(() => assignments.slice(0, 6), [assignments]);
  const selectedDemandId = Number(demandId);
  const selectedDemand = demands.find((demand) => demand.id === selectedDemandId);
  const selectedBoard = boards.find((board) => board.demand_id === selectedDemandId);
  const demandCandidates = selectedBoard?.candidates.filter((candidate) => candidate.stage === 'interview') ?? [];
  const defaultInterviewerUnavailable = Boolean(selectedDemand?.default_interviewer_id)
    && !interviewers.some((interviewer) => interviewer.id === selectedDemand?.default_interviewer_id);

  useEffect(() => {
    if (pendingDefaultInterviewerId === null) return;
    const pendingIsAvailable = interviewers.some(
      (interviewer) => interviewer.id === pendingDefaultInterviewerId,
    );
    if (!pendingIsAvailable) return;
    setInterviewerId(pendingDefaultInterviewerId);
    setPendingDefaultInterviewerId(null);
  }, [interviewers, pendingDefaultInterviewerId]);

  useEffect(() => {
    if (interviewersLoading || interviewersError || interviewerId === null) return;
    const selectedIsAvailable = interviewers.some(
      (interviewer) => interviewer.id === interviewerId,
    );
    if (!selectedIsAvailable) {
      setInterviewerId(null);
    }
  }, [interviewers, interviewerId, interviewersLoading, interviewersError]);

  function setOpen(nextOpen: boolean) {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }
    setLocalOpen(nextOpen);
  }

  function selectDemand(nextDemandId: string) {
    setDemandId(nextDemandId);
    setCandidateId('');
    const selectedDemand = demands.find((demand) => String(demand.id) === nextDemandId);
    const defaultInterviewerId = selectedDemand?.default_interviewer_id ?? null;
    const defaultIsAvailable = defaultInterviewerId !== null
      && interviewers.some((interviewer) => interviewer.id === defaultInterviewerId);
    setInterviewerId(defaultIsAvailable ? defaultInterviewerId : null);
    setPendingDefaultInterviewerId(defaultIsAvailable ? null : defaultInterviewerId);
  }

  function selectInterviewer(nextInterviewerId: number | null) {
    setPendingDefaultInterviewerId(null);
    setInterviewerId(nextInterviewerId);
  }

  async function handleCreate() {
    const cid = Number(candidateId);
    const did = Number(demandId);
    const iid = interviewerId;
    const sequence = Number(roundSequence);
    if (!cid || !did || !iid) {
      setMessage('请选择招聘需求、该需求中的候选人和面试官');
      return;
    }
    if (!Number.isInteger(sequence) || sequence < 1) {
      setMessage('轮次序号必须是大于 0 的整数');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await api.createInterviewAssignment({
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
      setCandidateId('');
      setDemandId('');
      setPendingDefaultInterviewerId(null);
      setInterviewerId(null);
      setRound('round_1');
      setRoundSequence('1');
      setIsPrimary(true);
      setScheduledAt('');
      setLocation('');
      setNote('');
      const deliveryStatus = created.notification_delivery?.status;
      setMessage(
        deliveryStatus === 'sent'
          ? '面试安排已保存，企微通知已发送'
          : deliveryStatus === 'failed'
            ? '面试安排已保存，但企微通知发送失败，可在任务卡片重试'
            : deliveryStatus === 'not_configured'
              ? '面试安排已保存；当前未配置企微通知，面试官仍可登录处理'
              : '面试安排已保存，通知正在等待发送',
      );
      onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(item: InterviewAssignment) {
    const reason = window.prompt('请输入取消面试安排的原因');
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage('取消面试安排需要填写原因');
      return;
    }
    setCancellingId(item.id);
    setMessage(null);
    try {
      await api.cancelInterviewAssignment(item.id, reason.trim());
      setMessage('面试安排已取消，可重新安排该轮主面试官');
      onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '取消失败');
    } finally {
      setCancellingId(null);
    }
  }

  async function handleRetryNotification(item: InterviewAssignment) {
    setRetryingId(item.id);
    setMessage(null);
    try {
      const updated = await api.retryInterviewAssignmentNotification(item.id);
      setMessage(
        updated.notification_delivery?.status === 'sent'
          ? '企微通知已重新发送'
          : updated.notification_delivery?.last_error ?? '企微通知仍未发送，请检查运行配置',
      );
      onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '重新发送通知失败');
    } finally {
      setRetryingId(null);
    }
  }

  function canCancel(item: InterviewAssignment) {
    const status = (item.status || 'scheduled').toLowerCase();
    return role !== 'interviewer'
      && !['cancelled', 'canceled', 'declined', 'completed', 'feedback_submitted'].includes(status);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>面试安排</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">
              指派面试官后自动通知；面试官接单、反馈，HR 再决定后续流程
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(!open)}>
            {open ? '收起' : '安排面试'}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {open && (
          <div className="mb-5 space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
            {(demands.length === 0 || interviewersLoading || interviewersError || interviewers.length === 0) && (
              <div className="grid gap-2 md:grid-cols-3">
                {demands.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">暂无可选招聘需求。</p>
                    <Link to="/demands" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                      先创建招聘需求
                    </Link>
                  </div>
                )}
                {interviewersLoading && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">正在加载可选面试官…</p>
                  </div>
                )}
                {!interviewersLoading && interviewersError && (
                  <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                    <p className="font-semibold">面试官列表暂时无法加载</p>
                    <p className="mt-1">{interviewersError}</p>
                    {onReloadInterviewers && (
                      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onReloadInterviewers}>
                        重新加载面试官
                      </Button>
                    )}
                  </div>
                )}
                {!interviewersLoading && !interviewersError && interviewers.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">
                      暂无可选面试官，请管理员先创建或启用面试官账号。
                    </p>
                    {role === 'admin' ? (
                      <Link to="/admin/users" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                        去用户管理
                      </Link>
                    ) : (
                      <p className="mt-1 font-semibold text-ink">联系管理员创建或启用面试官账号</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <Select
                  id="interview-assignment-demand"
                  name="demand_id"
                  label="招聘需求"
                  value={demandId}
                  onChange={(e) => selectDemand(e.target.value)}
                >
                  <option value="">选择招聘需求</option>
                  {demands.map((demand) => (
                    <option key={demand.id} value={demand.id}>
                      {demandOptionLabel(demand)}
                    </option>
                  ))}
                </Select>
                <Link to="/demands" className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
                  没有目标需求？创建需求
                </Link>
              </div>
              <div>
                <Select
                  id="interview-assignment-candidate"
                  name="candidate_id"
                  label="候选人"
                  value={candidateId}
                  disabled={!demandId}
                  onChange={(e) => setCandidateId(e.target.value)}
                >
                  <option value="">选择候选人</option>
                  {demandCandidates.map((candidate) => (
                    <option key={candidate.candidate_id} value={candidate.candidate_id}>
                      {candidate.name_masked}
                    </option>
                  ))}
                </Select>
                {demandId && demandCandidates.length === 0 && (
                  <Link
                    to={`/pipeline?demand=${selectedDemandId}`}
                    className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline"
                  >
                    该需求暂无“面试中”候选人，去候选人流程查看
                  </Link>
                )}
              </div>
              <Select
                id="interview-assignment-round"
                name="round"
                label="轮次"
                value={round}
                onChange={(e) => {
                  const nextRound = e.target.value as InterviewRound;
                  setRound(nextRound);
                  const nextSequence = ROUND_SEQUENCE_BY_ROUND[nextRound];
                  if (nextSequence) setRoundSequence(String(nextSequence));
                }}
              >
                {INTERVIEW_ROUNDS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <SearchableInterviewerField
                key={`interviewer-${demandId || 'none'}`}
                label="面试官"
                options={interviewers}
                value={interviewerId}
                onChange={selectInterviewer}
                disabled={interviewersLoading || Boolean(interviewersError) || interviewers.length === 0}
                helperText={interviewersLoading
                  ? '正在加载可选面试官…'
                  : interviewersError
                    ? '面试官列表加载失败，请重新加载后再安排。'
                    : defaultInterviewerUnavailable && interviewerId === null
                      ? '该需求的默认面试官已不可用，请人工选择。'
                      : '选择需求后会带出可用的默认面试官，仍可更换。'}
              />
              <Select
                id="interview-assignment-responsibility"
                name="is_primary"
                label="面试责任"
                value={isPrimary ? 'primary' : 'supporting'}
                onChange={(e) => setIsPrimary(e.target.value === 'primary')}
              >
                <option value="primary">主面试官</option>
                <option value="supporting">辅助面试官</option>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                id="interview-assignment-round-sequence"
                name="round_sequence"
                label="轮次序号"
                type="number"
                min={1}
                value={roundSequence}
                onChange={(e) => setRoundSequence(e.target.value)}
              />
              <Input
                id="interview-assignment-scheduled-at"
                name="scheduled_at"
                label="面试时间"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <Input
                id="interview-assignment-location"
                name="location"
                label="地点 / 会议链接"
                value={location}
                placeholder="例：腾讯会议 123 或会议室 A"
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="interview-assignment-note"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                安排备注（可选）
              </label>
              <textarea
                id="interview-assignment-note"
                name="note"
                className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                rows={2}
                placeholder="补充本轮面试的特殊说明"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {message && (
              <p role="status" aria-live="polite" className="text-sm text-muted">
                {message}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              loading={saving}
              disabled={saving || interviewersLoading || Boolean(interviewersError)}
              onClick={handleCreate}
            >
              保存安排
            </Button>
          </div>
        )}

        {recentAssignments.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="暂无面试安排"
            description="安排面试后，这里会显示待执行的面试协同信息"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentAssignments.map((item) => (
              <div key={item.id} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{item.name_masked ?? '候选人'}</p>
                      <Badge tone="warning">{roundLabel(item.round)}</Badge>
                      <Badge tone={assignmentResponseTone(item.response_status)}>
                        {assignmentResponseLabel(item.response_status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{item.job_title ?? '岗位信息待补充'}</p>
                    <p className="mt-1 text-xs text-muted-soft">
                      {item.demand_request_no ?? '历史未归属需求'}
                      {' · '}第 {item.round_sequence} 轮
                      {' · '}{item.is_primary ? '主面试官' : '辅助面试官'}
                    </p>
                    <p className="mt-2 text-xs text-muted-soft">
                      {item.scheduled_at ? formatDate(item.scheduled_at) : '未定时间'}
                      {item.interviewer_name ? ` · ${item.interviewer_name}` : ''}
                    </p>
                    {item.location && <p className="mt-1 text-xs text-body">{item.location}</p>}
                    {item.response_reason && (
                      <p className="mt-2 text-xs text-danger-700">
                        原因：{item.response_reason}
                      </p>
                    )}
                    {item.notification_delivery?.last_error && (
                      <p className="mt-1 text-xs text-muted">
                        通知说明：{item.notification_delivery.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {item.feedback_submitted && <Badge tone="success">反馈已提交</Badge>}
                    {item.notification_delivery && (
                      <Badge tone={notificationDeliveryTone(item.notification_delivery.status)}>
                        {notificationDeliveryLabel(item.notification_delivery.status)}
                      </Badge>
                    )}
                    {item.notification_delivery
                      && ['failed', 'not_configured'].includes(item.notification_delivery.status)
                      && canCancel(item) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={retryingId === item.id}
                        disabled={retryingId !== null}
                        onClick={() => void handleRetryNotification(item)}
                      >
                        重发企微通知
                      </Button>
                      )}
                    {canCancel(item) && (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={cancellingId === item.id}
                        disabled={cancellingId !== null}
                        onClick={() => handleCancel(item)}
                      >
                        取消安排
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
