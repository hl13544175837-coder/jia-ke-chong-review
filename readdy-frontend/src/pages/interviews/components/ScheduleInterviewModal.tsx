import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, LoaderCircle, Trash2, X } from 'lucide-react';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewerOption,
} from '@/features/interviews/types';

const roundOptions = [
  { value: 'round_1', label: '一面' },
  { value: 'round_2', label: '二面' },
  { value: 'round_3', label: '终面' },
  { value: 'technical', label: '技术面' },
  { value: 'business', label: '业务面' },
  { value: 'hr', label: 'HR 面' },
  { value: 'additional', label: '加面' },
];

function localDateTime(value: string | null) {
  return value ? value.slice(0, 16) : '';
}

interface ScheduleInterviewModalProps {
  row: InterviewManagementRow;
  interviewers: InterviewerOption[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: InterviewAssignmentInput | InterviewAssignmentUpdateInput) => void;
  onCancelAssignment: (reason: string) => void;
}

export default function ScheduleInterviewModal({
  row,
  interviewers,
  saving,
  error,
  onClose,
  onSave,
  onCancelAssignment,
}: ScheduleInterviewModalProps) {
  const editing = row.assignment_id !== null;
  const [round, setRound] = useState(row.round || 'round_1');
  const [roundSequence, setRoundSequence] = useState(row.round_sequence || 1);
  const [interviewerId, setInterviewerId] = useState(row.interviewer_id || 0);
  const [scheduledAt, setScheduledAt] = useState(localDateTime(row.scheduled_at));
  const [location, setLocation] = useState(row.location || '');
  const [note, setNote] = useState(row.note || '');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (!interviewerId && interviewers.length === 1) setInterviewerId(interviewers[0].id);
  }, [interviewerId, interviewers]);

  const canSave = useMemo(
    () => interviewerId > 0 && Boolean(scheduledAt) && Boolean(location.trim()),
    [interviewerId, location, scheduledAt],
  );

  const submit = () => {
    if (!canSave) return;
    const editable = {
      interviewer_id: interviewerId,
      scheduled_at: scheduledAt,
      location: location.trim(),
      note: note.trim(),
    };
    onSave(editing ? editable : {
      ...editable,
      candidate_id: row.candidate_id,
      demand_id: row.demand_id,
      round,
      round_sequence: roundSequence,
      is_primary: true,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <div className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="schedule-interview-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="schedule-interview-title" className="text-lg font-bold text-foreground-900">{editing ? '调整面试安排' : '安排面试'}</h2>
            <p className="mt-1 text-sm text-foreground-500">{row.name_masked} · {row.job_title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-foreground-400 hover:bg-background-100" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground-700">
              面试轮次
              <select value={round} onChange={(event) => setRound(event.target.value)} disabled={editing || saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm disabled:bg-background-50">
                {roundOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-foreground-700">
              第几轮
              <input type="number" min={1} max={20} value={roundSequence} onChange={(event) => setRoundSequence(Math.max(1, Number(event.target.value) || 1))} disabled={editing || saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm disabled:bg-background-50" />
            </label>
          </div>

          <label className="block text-sm font-medium text-foreground-700">
            面试官 <span className="text-red-500">*</span>
            <select value={interviewerId || ''} onChange={(event) => setInterviewerId(Number(event.target.value))} disabled={saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm">
              <option value="">请选择面试官</option>
              {interviewers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground-700">
              面试时间 <span className="text-red-500">*</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onInput={(event) => setScheduledAt(event.currentTarget.value)}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={saving}
                className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-foreground-700">
              面试地点 / 会议链接 <span className="text-red-500">*</span>
              <input value={location} onChange={(event) => setLocation(event.target.value)} disabled={saving} maxLength={240} placeholder="例如：3F 会议室或腾讯会议链接" className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm" />
            </label>
          </div>

          <label className="block text-sm font-medium text-foreground-700">
            给面试官的备注（选填）
            <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} rows={3} maxLength={1000} placeholder="说明需要重点确认的问题" className="mt-2 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm" />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {editing && (
            <div className="border-t border-background-200 pt-4">
              {!showCancel ? (
                <button type="button" onClick={() => setShowCancel(true)} disabled={saving} className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
                  <Trash2 size={15} /> 取消这场面试
                </button>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <label className="block text-sm font-medium text-red-800">
                    取消原因（必填）
                    <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={2} maxLength={500} className="mt-2 w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-foreground-800" />
                  </label>
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setShowCancel(false)} className="px-3 py-1.5 text-sm text-foreground-600">返回</button>
                    <button type="button" onClick={() => cancelReason.trim() && onCancelAssignment(cancelReason.trim())} disabled={!cancelReason.trim() || saving} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">确认取消</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-background-200 bg-background-50 px-6 py-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-500"><CalendarDays size={14} /> 保存后面试官会收到真实待办</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">取消</button>
            <button type="button" onClick={submit} disabled={!canSave || saving} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:bg-background-300">
              {saving && <LoaderCircle className="animate-spin" size={15} />}
              {saving ? '保存中' : '保存安排'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
