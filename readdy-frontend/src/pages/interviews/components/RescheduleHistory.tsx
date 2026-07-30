import { ArrowRight, CalendarClock } from 'lucide-react';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type { InterviewRescheduleRequest } from '@/features/interviews/types';

const statusLabels: Record<InterviewRescheduleRequest['status'], string> = {
  pending: '待招聘专员确认',
  approved: '已确认调整',
  rejected: '申请未通过',
  waiting_reassignment: '待重新安排',
  resolved: '已重新安排',
};

interface RescheduleHistoryProps {
  items: InterviewRescheduleRequest[];
  title?: string;
}

export default function RescheduleHistory({
  items,
  title = '排期变更记录',
}: RescheduleHistoryProps) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
        <CalendarClock size={16} /> {title}
      </h3>
      <div className="mt-2 space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-background-200 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground-800">
                {item.source === 'recruiter_direct' ? '招聘专员主动调整' : `${item.requester_name || '面试官'}申请改约`}
              </p>
              <span className="rounded-full bg-background-100 px-2.5 py-1 text-xs text-foreground-600">
                {statusLabels[item.status]}
              </span>
            </div>
            <p className="mt-2 text-xs text-foreground-500">
              {formatInterviewDateTime(item.requested_at)} · 原因：{item.reason || '未填写'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-background-50 px-3 py-2 text-xs text-foreground-600">
              <span>{item.original_interviewer_name || '原面试官'} · {formatInterviewDateTime(item.original_scheduled_at)}</span>
              <ArrowRight size={13} className="text-foreground-400" />
              <span>
                {item.final_scheduled_at
                  ? `${item.final_interviewer_name || '最终面试官'} · ${formatInterviewDateTime(item.final_scheduled_at)}`
                  : statusLabels[item.status]}
              </span>
            </div>
            {item.processor_note && (
              <p className="mt-2 text-xs text-foreground-500">
                {item.processor_name || '招聘专员'}：{item.processor_note}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
