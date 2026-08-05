import type { InterviewManagementRow } from '@/features/interviews/types';

export type InterviewPrimaryAction =
  | 'process_reschedule'
  | 'schedule'
  | 'remind_feedback'
  | 'view_feedback'
  | 'confirm_conducted'
  | 'adjust_schedule';

export type InterviewMenuAction =
  | 'view_details'
  | 'view_resume'
  | 'view_history'
  | 'adjust_schedule'
  | 'cancel_schedule';

export interface InterviewRowActions {
  primary: InterviewPrimaryAction;
  menu: InterviewMenuAction[];
}

function rowActionStatus(row: Pick<InterviewManagementRow, 'assignment_id' | 'assignment_status' | 'feedback_submitted'>) {
  if (row.feedback_submitted || ['completed', 'feedback_submitted'].includes(row.assignment_status)) return 'completed';
  if (row.assignment_status === 'awaiting_feedback') return 'awaiting_feedback';
  if (!row.assignment_id || row.assignment_status === 'unassigned') return 'unassigned';
  return 'scheduled';
}

function hasStarted(value: string | null, now: number) {
  if (!value) return false;
  const explicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const time = new Date(explicitZone ? value : `${value}Z`).getTime();
  return Number.isFinite(time) && time <= now;
}

export function buildInterviewRowActions(
  row: Pick<InterviewManagementRow, 'assignment_id' | 'assignment_status' | 'feedback_submitted' | 'scheduled_at' | 'reschedule_request'>,
  now = Date.now(),
): InterviewRowActions {
  const menu: InterviewMenuAction[] = ['view_details', 'view_resume', 'view_history'];
  let primary: InterviewPrimaryAction;

  if (row.reschedule_request?.status === 'pending') {
    primary = 'process_reschedule';
  } else {
    const status = rowActionStatus(row);
    if (status === 'unassigned') primary = 'schedule';
    else if (status === 'awaiting_feedback') primary = 'remind_feedback';
    else if (status === 'completed') primary = 'view_feedback';
    else if (hasStarted(row.scheduled_at, now)) primary = 'confirm_conducted';
    else primary = 'adjust_schedule';
  }

  if (row.assignment_id && !row.feedback_submitted && !['completed', 'feedback_submitted'].includes(row.assignment_status)) {
    menu.push('adjust_schedule', 'cancel_schedule');
  }

  return { primary, menu: menu.filter((action) => action !== primary) };
}
