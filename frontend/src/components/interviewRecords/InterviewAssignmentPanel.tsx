import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/formatDate';
import { demandOptionLabel, INTERVIEW_ROUNDS, roundLabel } from '../../lib/interviewRecords';
import type {
  InterviewAssignment,
  InterviewRound,
  InterviewerOption,
  PipelineBoard,
  RecruitmentDemand,
  Role,
} from '../../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input, Select } from '../ui';

const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员',
  interviewer: '面试官',
  manager: '经理',
  admin: '管理员',
};

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
  assignments: InterviewAssignment[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated: () => void;
}

export function InterviewAssignmentPanel({
  demands,
  boards,
  interviewers,
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
  const [interviewerId, setInterviewerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const open = controlledOpen ?? localOpen;
  const recentAssignments = useMemo(() => assignments.slice(0, 6), [assignments]);
  const selectedDemandId = Number(demandId);
  const selectedBoard = boards.find((board) => board.demand_id === selectedDemandId);
  const demandCandidates = selectedBoard?.candidates.filter((candidate) => candidate.stage === 'interview') ?? [];

  function setOpen(nextOpen: boolean) {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }
    setLocalOpen(nextOpen);
  }

  async function handleCreate() {
    const cid = Number(candidateId);
    const did = Number(demandId);
    const iid = Number(interviewerId);
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
      setCandidateId('');
      setDemandId('');
      setInterviewerId('');
      setRound('round_1');
      setRoundSequence('1');
      setIsPrimary(true);
      setScheduledAt('');
      setLocation('');
      setNote('');
      setMessage('面试安排已保存');
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

  function canCancel(item: InterviewAssignment) {
    const status = (item.status || 'scheduled').toLowerCase();
    return role !== 'interviewer'
      && !['cancelled', 'canceled', 'completed', 'feedback_submitted'].includes(status);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>面试安排</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">
              指派面试官、记录时间与会议链接，反馈仍在下方待填写区域完成
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
            {(demands.length === 0 || interviewers.length === 0) && (
              <div className="grid gap-2 md:grid-cols-3">
                {demands.length === 0 && (
                  <div className="rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-muted">
                    <p className="font-semibold text-ink">暂无可选招聘需求。</p>
                    <Link to="/demands" className="mt-1 inline-flex font-semibold text-ink hover:underline">
                      先创建招聘需求
                    </Link>
                  </div>
                )}
                {interviewers.length === 0 && (
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
                  label="招聘需求"
                  value={demandId}
                  onChange={(e) => {
                    setDemandId(e.target.value);
                    setCandidateId('');
                  }}
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
              <Select label="面试官" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
                <option value="">选择面试官</option>
                {interviewers.map((interviewer) => (
                  <option key={interviewer.id} value={interviewer.id}>
                    {interviewer.name}（{ROLE_LABEL[interviewer.role] ?? interviewer.role}）
                  </option>
                ))}
              </Select>
              <Select
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
                label="轮次序号"
                type="number"
                min={1}
                value={roundSequence}
                onChange={(e) => setRoundSequence(e.target.value)}
              />
              <Input
                label="面试时间"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <Input
                label="地点 / 会议链接"
                value={location}
                placeholder="例：腾讯会议 123 或会议室 A"
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <textarea
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              rows={2}
              placeholder="安排备注"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {message && <p className="text-sm text-muted">{message}</p>}
            <Button type="button" size="sm" loading={saving} disabled={saving} onClick={handleCreate}>
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
                      <p className="font-medium text-ink">{item.name_masked ?? `候选人 #${item.candidate_id}`}</p>
                      <Badge tone="warning">{roundLabel(item.round)}</Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{item.job_title ?? `岗位 #${item.job_id}`}</p>
                    <p className="mt-1 text-xs text-muted-soft">
                      {item.demand_id ? `招聘需求 #${item.demand_id}` : '历史未归属需求'}
                      {' · '}第 {item.round_sequence} 轮
                      {' · '}{item.is_primary ? '主面试官' : '辅助面试官'}
                    </p>
                    <p className="mt-2 text-xs text-muted-soft">
                      {item.scheduled_at ? formatDate(item.scheduled_at) : '未定时间'}
                      {item.interviewer_name ? ` · ${item.interviewer_name}` : ''}
                    </p>
                    {item.location && <p className="mt-1 text-xs text-body">{item.location}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone="brand">{item.status || 'scheduled'}</Badge>
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
