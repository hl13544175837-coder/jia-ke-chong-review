import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, LoaderCircle, Trash2, X } from 'lucide-react';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewerOption,
} from '@/features/interviews/types';
import {
  interviewDateTimeToLocalInput,
  localInterviewInputToUtc,
} from '@/features/interviews/dateTime';

const roundOptions = [
  { value: 'round_1', label: '一面' },
  { value: 'round_2', label: '二面' },
  { value: 'round_3', label: '终面' },
  { value: 'technical', label: '技术面' },
  { value: 'business', label: '业务面' },
  { value: 'hr', label: 'HR 面' },
  { value: 'additional', label: '加面' },
];

const fixedRoundSequenceByType: Record<string, number> = {
  round_1: 1,
  round_2: 2,
  round_3: 3,
};

function currentLocalMinute() {
  const now = new Date();
  now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface ScheduleInterviewModalProps {
  row: InterviewManagementRow;
  interviewers: InterviewerOption[];
  saving: boolean;
  error: string;
  isPrimary?: boolean;
  allowCancel?: boolean;
  confirmReschedule?: boolean;
  onClose: () => void;
  onSave: (payload: InterviewAssignmentInput | InterviewAssignmentUpdateInput) => void;
  onCancelAssignment: (reason: string) => void;
}

export default function ScheduleInterviewModal({
  row,
  interviewers,
  saving,
  error,
  isPrimary = true,
  allowCancel = true,
  confirmReschedule = false,
  onClose,
  onSave,
  onCancelAssignment,
}: ScheduleInterviewModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const editing = row.assignment_id !== null;
  const initialRound = row.round || 'round_1';
  const passedRoundSequence = row.round_sequence || 1;
  const [round, setRound] = useState(initialRound);
  const [roundSequence, setRoundSequence] = useState(
    editing ? passedRoundSequence : fixedRoundSequenceByType[initialRound] ?? passedRoundSequence,
  );
  const [interviewerId, setInterviewerId] = useState(row.interviewer_id || 0);
  const [scheduledAt, setScheduledAt] = useState(interviewDateTimeToLocalInput(row.scheduled_at));
  const [location, setLocation] = useState(row.location || '');
  const [note, setNote] = useState(row.note || '');
  const [changeReason, setChangeReason] = useState(row.reschedule_request?.reason || '');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [minimumInterviewTime] = useState(currentLocalMinute);

  useEffect(() => {
    if (!interviewerId && interviewers.length === 1) setInterviewerId(interviewers[0].id);
  }, [interviewerId, interviewers]);

  useOverlayLifecycle({
    canClose: !saving,
    onClose,
    initialFocusRef: modalRef,
  });

  const canSave = useMemo(
    () => interviewerId > 0
      && Boolean(scheduledAt)
      && scheduledAt >= minimumInterviewTime
      && Boolean(location.trim())
      && (!editing || Boolean(changeReason.trim())),
    [changeReason, editing, interviewerId, location, minimumInterviewTime, scheduledAt],
  );

  const handleRoundChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextRound = event.target.value;
    setRound(nextRound);
    setRoundSequence(fixedRoundSequenceByType[nextRound] ?? passedRoundSequence);
  };

  const submit = () => {
    if (!canSave) return;
    const editable = {
      interviewer_id: interviewerId,
      scheduled_at: localInterviewInputToUtc(scheduledAt),
      location: location.trim(),
      note: note.trim(),
      change_reason: changeReason.trim(),
    };
    onSave(editing ? editable : {
      ...editable,
      candidate_id: row.candidate_id,
      demand_id: row.demand_id,
      round,
      round_sequence: roundSequence,
      is_primary: isPrimary,
    });
  };

  const hasUnsavedInput = editing
    || Boolean(note.trim())
    || Boolean(location.trim())
    || Boolean(changeReason.trim())
    || (Boolean(scheduledAt) && scheduledAt !== interviewDateTimeToLocalInput(row.scheduled_at));

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={saving || hasUnsavedInput ? undefined : onClose}>
      <div ref={modalRef} tabIndex={-1} className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="schedule-interview-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="schedule-interview-title" className="text-lg font-bold text-foreground-900">{confirmReschedule ? '确认改约' : editing ? '调整面试安排' : '安排面试'}</h2>
            <p className="mt-1 text-sm text-foreground-500">{row.name_masked} · {row.job_title}</p>
            {confirmReschedule && (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs leading-5 text-amber-800">
                已按面试官建议的时间预填，可直接保存；也可在此调整时间和面试官。
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-foreground-400 hover:bg-background-100" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground-700">
              面试轮次
              <select value={round} onChange={handleRoundChange} disabled={editing || saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm disabled:bg-background-50">
                {roundOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-foreground-700">
              轮次序号
              <span aria-label="面试轮次序号" aria-readonly="true" className="mt-2 flex h-10 w-full items-center rounded-lg border border-background-300 bg-background-50 px-3 text-sm text-foreground-700">
                第 {roundSequence} 轮
              </span>
            </label>
          </div>

          <label className="block text-sm font-medium text-foreground-700">
            面试官 <span className="text-red-500">*</span>
            <select value={interviewerId || ''} onChange={(event) => setInterviewerId(Number(event.target.value))} disabled={saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm">
              <option value="">请选择面试官</option>
              {interviewers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
            </select>
          </label>

          {editing && allowCancel && (
            <label className="block text-sm font-medium text-foreground-700">
              {confirmReschedule ? '改约备注' : '调整原因'} <span className="text-red-500">*</span>
              <textarea
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                disabled={saving}
                rows={2}
                maxLength={500}
                placeholder={confirmReschedule ? '确认改约的说明（面试官会看到）' : '说明为什么调整，下一位面试官可以看到这条记录'}
                className="mt-2 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground-700">
              面试时间 <span className="text-red-500">*</span>
              <input
                type="datetime-local"
                min={minimumInterviewTime}
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

          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
            {confirmReschedule ? '确认后，原面试安排将更新为新时间并通知对应面试官。' : '保存后会创建本地站内日程和待办。'}
          </div>

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
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-500"><CalendarDays size={14} /> {confirmReschedule ? '确认后会通知面试官最新面试时间' : '保存后面试官会收到站内待办'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">取消</button>
            <button type="button" onClick={submit} disabled={!canSave || saving} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:bg-background-300">
              {saving && <LoaderCircle className="animate-spin" size={15} />}
              {saving ? '提交中' : confirmReschedule ? '确认改约' : '保存安排'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
