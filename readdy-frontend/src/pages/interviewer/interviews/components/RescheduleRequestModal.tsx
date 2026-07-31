import { CalendarClock, LoaderCircle, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import { localInterviewInputToUtc } from '@/features/interviews/dateTime';
import type {
  InterviewAssignment,
  InterviewRescheduleRequestInput,
} from '@/features/interviews/types';

function currentLocalMinute() {
  const now = new Date();
  now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface RescheduleRequestModalProps {
  assignment: InterviewAssignment;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: InterviewRescheduleRequestInput) => void;
}

export default function RescheduleRequestModal({
  assignment,
  saving,
  error,
  onClose,
  onSubmit,
}: RescheduleRequestModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState('');
  const [firstTime, setFirstTime] = useState('');
  const [secondTime, setSecondTime] = useState('');
  const [minimumInterviewTime] = useState(currentLocalMinute);
  const canSubmit = useMemo(() => (
    Boolean(reason.trim())
    && firstTime >= minimumInterviewTime
    && (!secondTime || secondTime >= minimumInterviewTime)
    && (!secondTime || secondTime !== firstTime)
  ), [firstTime, minimumInterviewTime, reason, secondTime]);

  useOverlayLifecycle({
    canClose: !saving,
    onClose,
    initialFocusRef: modalRef,
  });

  const submit = () => {
    if (!canSubmit) return;
    const proposed_times = [firstTime, secondTime]
      .filter(Boolean)
      .map(localInterviewInputToUtc);
    onSubmit({ reason: reason.trim(), proposed_times });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground-900/45 p-4"
      role="presentation"
      onMouseDown={saving ? undefined : onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-request-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-lg bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="reschedule-request-title" className="text-lg font-bold text-foreground-900">
              申请改约
            </h2>
            <p className="mt-1 text-sm text-foreground-500">
              {assignment.name_masked || `候选人 #${assignment.candidate_id}`} · 第 {assignment.round_sequence} 轮
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭申请改约"
            className="rounded-md p-2 text-foreground-400 hover:bg-background-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            提交后需要招聘专员确认；确认前，当前安排仍然有效。
          </div>
          <label className="block text-sm font-medium text-foreground-700">
            改约原因 <span className="text-red-500">*</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
              rows={3}
              maxLength={500}
              placeholder="请说明需要改约的原因，方便招聘专员协调"
              className="mt-2 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground-700">
              建议时间 1 <span className="text-red-500">*</span>
              <input
                type="datetime-local"
                min={minimumInterviewTime}
                value={firstTime}
                onChange={(event) => setFirstTime(event.target.value)}
                disabled={saving}
                className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400"
              />
            </label>
            <label className="text-sm font-medium text-foreground-700">
              建议时间 2（选填）
              <input
                type="datetime-local"
                min={minimumInterviewTime}
                value={secondTime}
                onChange={(event) => setSecondTime(event.target.value)}
                disabled={saving}
                className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400"
              />
            </label>
          </div>
          {secondTime && secondTime === firstTime && (
            <p className="text-xs text-red-600">两个建议时间不能相同</p>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-background-200 bg-background-50 px-6 py-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-500">
            <CalendarClock size={14} /> 招聘专员确认后新时间才会生效
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || saving}
              className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:bg-background-300"
            >
              {saving && <LoaderCircle className="animate-spin" size={15} />}
              {saving ? '提交中' : '提交申请'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
