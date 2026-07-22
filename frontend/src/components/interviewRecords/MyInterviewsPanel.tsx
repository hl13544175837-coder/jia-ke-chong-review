import { useState } from 'react';
import { AlertTriangle, CalendarCheck2 } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import {
  assignmentResponseLabel,
  assignmentResponseTone,
  isActiveInterviewAssignment,
  roundLabel,
} from '../../lib/interviewRecords';
import type { InterviewAssignment } from '../../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '../ui';

interface MyInterviewsPanelProps {
  assignments: InterviewAssignment[];
  onStartFeedback?: (assignment: InterviewAssignment) => void;
  onRespond?: (
    assignment: InterviewAssignment,
    decision: 'accepted' | 'declined',
    reason?: string,
  ) => Promise<void>;
}

export function MyInterviewsPanel({
  assignments,
  onStartFeedback,
  onRespond,
}: MyInterviewsPanelProps) {
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const active = assignments.filter(isActiveInterviewAssignment);
  const pending = active.filter((item) => !item.feedback_submitted);
  const overdue = active.filter((item) => item.is_overdue);
  const done = assignments.filter((item) => item.feedback_submitted);
  const focusItems = [...overdue, ...pending.filter((item) => !item.is_overdue)].slice(0, 4);

  async function handleRespond(
    item: InterviewAssignment,
    decision: 'accepted' | 'declined',
  ) {
    if (!onRespond) return;
    const reason = decision === 'declined'
      ? window.prompt('请说明无法参加本次面试的原因，HR 会据此重新安排。')
      : undefined;
    if (reason === null) return;
    if (decision === 'declined' && !reason?.trim()) {
      setMessage('无法参加时需要填写原因');
      return;
    }
    setRespondingId(item.id);
    setMessage(null);
    try {
      await onRespond(item, decision, reason?.trim());
      setMessage(decision === 'accepted' ? '已确认参加面试' : '已通知 HR 重新安排');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '更新接单状态失败');
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>我的面试</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">待反馈、超时提醒和近期安排集中在这里</p>
          </div>
          <CalendarCheck2 className="h-5 w-5 text-muted" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2">
            <p className="text-xs text-muted-soft">待接单 / 反馈</p>
            <p className="mt-1 text-xl font-semibold text-ink">{pending.length}</p>
          </div>
          <div className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="text-xs text-danger-700">超时待反馈</p>
            <p className="mt-1 text-xl font-semibold text-danger-700">{overdue.length}</p>
          </div>
          <div className="rounded-md border border-success-100 bg-success-50 px-3 py-2">
            <p className="text-xs text-success-700">已反馈</p>
            <p className="mt-1 text-xl font-semibold text-success-700">{done.length}</p>
          </div>
        </div>

        {message && (
          <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
            {message}
          </p>
        )}

        {focusItems.length > 0 && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {focusItems.map((item) => (
              <div key={item.id} className="rounded-md border border-hairline bg-canvas px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{item.name_masked ?? '候选人'}</p>
                      <Badge tone={item.is_overdue ? 'danger' : 'warning'}>
                        {item.is_overdue ? '超时待反馈' : roundLabel(item.round)}
                      </Badge>
                      <Badge tone={item.is_primary ? 'brand' : 'neutral'}>
                        {item.is_primary ? '主面试官' : '辅助面试官'}
                      </Badge>
                      <Badge tone={assignmentResponseTone(item.response_status)}>
                        {assignmentResponseLabel(item.response_status)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{item.job_title ?? '岗位信息待补充'}</p>
                    <p className="mt-1 text-xs text-muted-soft">
                      {item.demand_request_no ?? '历史未归属需求'} · 第 {item.round_sequence} 轮
                    </p>
                    <p className="mt-1 text-xs text-muted-soft">
                      {item.scheduled_at ? formatDate(item.scheduled_at) : '未定时间'}
                      {item.interviewer_name ? ` · ${item.interviewer_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {item.is_overdue && <AlertTriangle className="h-4 w-4 text-danger-700" aria-hidden="true" />}
                    {item.response_status === 'pending' && onRespond && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          loading={respondingId === item.id}
                          disabled={respondingId !== null}
                          onClick={() => void handleRespond(item, 'accepted')}
                        >
                          确认参加
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={respondingId !== null}
                          onClick={() => void handleRespond(item, 'declined')}
                        >
                          无法参加
                        </Button>
                      </div>
                    )}
                    {onStartFeedback
                      && !item.feedback_submitted
                      && item.response_status === 'accepted' && (
                      <Button
                        type="button"
                        size="sm"
                        variant={item.is_overdue ? 'danger' : 'secondary'}
                        onClick={() => onStartFeedback(item)}
                      >
                        填写反馈
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
