import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewerOption,
} from '@/features/interviews/types';
import ScheduleInterviewModal from './ScheduleInterviewModal';

interface RecruiterInterviewOverlaysProps {
  confirmConductedRow: InterviewManagementRow | null;
  actionRowId: number | null;
  onCloseConfirm: () => void;
  onConfirmConducted: (row: InterviewManagementRow) => void;
  scheduleRow: InterviewManagementRow | null;
  interviewers: InterviewerOption[];
  saving: boolean;
  actionError: string;
  scheduleIsPrimary: boolean;
  allowCancel: boolean;
  confirmReschedule: boolean;
  onCloseSchedule: () => void;
  onSaveSchedule: (payload: InterviewAssignmentInput | InterviewAssignmentUpdateInput) => void;
  onCancelSchedule: (reason: string) => void;
}

export default function RecruiterInterviewOverlays(props: RecruiterInterviewOverlaysProps) {
  return (
    <>
      {props.confirmConductedRow && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={props.onCloseConfirm}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-conducted-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="confirm-conducted-title" className="text-base font-semibold text-foreground-900">确认这场面试已经完成？</h2>
            <p className="mt-2 text-sm leading-6 text-foreground-500">确认后会把任务交给面试官填写评价。请先核对候选人、时间和面试官，避免提前确认。</p>
            <div className="mt-4 rounded-lg bg-background-50 px-3 py-2 text-sm text-foreground-700">{props.confirmConductedRow.name_masked} · {formatInterviewDateTime(props.confirmConductedRow.scheduled_at)} · {props.confirmConductedRow.interviewer_name || '面试官未填写'}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={props.onCloseConfirm} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">返回核对</button>
              <button type="button" onClick={() => props.onConfirmConducted(props.confirmConductedRow as InterviewManagementRow)} disabled={props.actionRowId !== null} className="rounded-lg bg-foreground-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">确认已面试</button>
            </div>
          </div>
        </div>
      )}
      {props.scheduleRow && (
        <ScheduleInterviewModal
          row={props.scheduleRow}
          interviewers={props.interviewers}
          saving={props.saving}
          error={props.actionError}
          isPrimary={props.scheduleIsPrimary}
          allowCancel={props.allowCancel}
          confirmReschedule={props.confirmReschedule}
          onClose={props.onCloseSchedule}
          onSave={props.onSaveSchedule}
          onCancelAssignment={props.onCancelSchedule}
        />
      )}
    </>
  );
}
