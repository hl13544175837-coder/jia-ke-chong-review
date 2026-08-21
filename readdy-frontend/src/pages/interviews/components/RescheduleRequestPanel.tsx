import { CalendarClock, Check, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type { InterviewRescheduleRequest } from '@/features/interviews/types';

interface RescheduleRequestPanelProps {
  request: InterviewRescheduleRequest;
  busy: boolean;
  error: string;
  onApprove: (suggestedTime: string) => void;
  onReject: (reason: string) => void;
  onCancelAndWait: (reason: string) => void;
}

export default function RescheduleRequestPanel({
  request,
  busy,
  error,
  onApprove,
  onReject,
  onCancelAndWait,
}: RescheduleRequestPanelProps) {
  const [decisionReason, setDecisionReason] = useState('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  return (
    <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <CalendarClock size={16} /> 待确认的改约申请
      </h3>
      <p className="mt-2 text-xs leading-5 text-amber-800">
        {request.requester_name || '面试官'}：{request.reason}
      </p>
      <div className="mt-3 space-y-2">
        {request.proposed_times.map((time, index) => {
          const isSelected = selectedTime === time;
          return (
            <button
              key={time}
              type="button"
              onClick={() => setSelectedTime(isSelected ? null : time)}
              disabled={busy}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs text-foreground-700 disabled:opacity-50 ${isSelected ? 'border-primary-400 bg-primary-50' : 'border-amber-200 bg-white hover:border-primary-300 hover:bg-primary-50'}`}
            >
              <span className="inline-flex items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${isSelected ? 'border-primary-600 bg-primary-600' : 'border-foreground-300 bg-white'}`}>
                  {isSelected && <Check size={10} strokeWidth={3} className="text-white" />}
                </span>
                建议时间 {index + 1}：{formatInterviewDateTime(time)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => selectedTime && onApprove(selectedTime)}
          disabled={busy || !selectedTime}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy && <LoaderCircle size={13} className="animate-spin" />}
          确认调整
        </button>
      </div>
      <label className="mt-3 block text-xs font-medium text-amber-900">
        拒绝或暂时取消时，请填写处理原因
        <textarea
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
          disabled={busy}
          rows={2}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-foreground-800 outline-none focus:border-primary-400"
        />
      </label>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onReject(decisionReason.trim())}
          disabled={busy || !decisionReason.trim()}
          className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
        >
          拒绝申请
        </button>
        <button
          type="button"
          onClick={() => onCancelAndWait(decisionReason.trim())}
          disabled={busy || !decisionReason.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 disabled:opacity-50"
        >
          {busy && <LoaderCircle size={13} className="animate-spin" />}
          取消并等待重新安排
        </button>
      </div>
    </section>
  );
}
