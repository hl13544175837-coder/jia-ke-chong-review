import type { InterviewManagementRow } from '@/features/interviews/types';
import { interviewHasStarted } from '@/features/interviews/dateTime';

export type InterviewStatusTab = 'all' | 'unassigned' | 'scheduled' | 'awaiting_feedback' | 'completed';
export type InterviewViewMode = 'list' | 'calendar';

export interface InterviewFilters {
  jobTitle: string;
  interviewerId: string;
  schedule: string;
  dateFrom: string;
  dateTo: string;
  roundSequence: string;
  city: string;
  department: string;
}

export interface InterviewFilterOptions {
  jobs: string[];
  interviewers: Array<[string, string]>;
  rounds: number[];
  cities: string[];
  departments: string[];
}

export const emptyInterviewFilters: InterviewFilters = {
  jobTitle: '',
  interviewerId: '',
  schedule: '',
  dateFrom: '',
  dateTo: '',
  roundSequence: '',
  city: '',
  department: '',
};

export function rowStatus(row: InterviewManagementRow): Exclude<InterviewStatusTab, 'all'> {
  if (row.feedback_submitted || ['completed', 'feedback_submitted'].includes(row.assignment_status)) return 'completed';
  if (row.assignment_status === 'awaiting_feedback') return 'awaiting_feedback';
  if (!row.assignment_id || row.assignment_status === 'unassigned') return 'unassigned';
  return 'scheduled';
}

export function statusLabel(status: Exclude<InterviewStatusTab, 'all'>) {
  return {
    unassigned: '待安排',
    scheduled: '已安排',
    awaiting_feedback: '待反馈',
    completed: '已完成',
  }[status];
}

export function statusLabelForRow(row: InterviewManagementRow) {
  if (row.reschedule_request?.status === 'pending') return '待处理改约';
  if (row.reschedule_request?.status === 'waiting_reassignment') return '因改约待重新安排';
  const status = rowStatus(row);
  if (status === 'scheduled' && interviewHasStarted(row.scheduled_at)) return '待确认已面试';
  return statusLabel(status);
}

export function interviewLocalDateKey(value: string | null) {
  if (!value) return '';
  const hasExplicitZone = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
  const date = new Date(hasExplicitZone ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

export function deriveInterviewFilterOptions(rows: InterviewManagementRow[]): InterviewFilterOptions {
  const interviewers = new Map<string, string>();
  rows.forEach((row) => {
    if (row.interviewer_id) interviewers.set(String(row.interviewer_id), row.interviewer_name || '未命名面试官');
  });
  return {
    jobs: unique(rows.map((row) => row.job_title)),
    interviewers: [...interviewers.entries()].sort((left, right) => left[1].localeCompare(right[1], 'zh-CN')),
    rounds: [...new Set(rows.map((row) => row.round_sequence).filter((value): value is number => Boolean(value)))].sort((left, right) => left - right),
    cities: unique(rows.map((row) => row.job_city)),
    departments: unique(rows.map((row) => row.job_department)),
  };
}

export function activeInterviewFilterCount(filters: InterviewFilters) {
  return [
    filters.jobTitle,
    filters.interviewerId,
    filters.schedule,
    filters.dateFrom || filters.dateTo,
    filters.roundSequence,
    filters.city,
    filters.department,
  ].filter(Boolean).length;
}

export function filterInterviewRows(
  rows: InterviewManagementRow[],
  activeTab: InterviewStatusTab,
  query: string,
  filters: InterviewFilters,
) {
  const keyword = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (activeTab !== 'all' && rowStatus(row) !== activeTab) return false;
    if (
      keyword
      && ![row.name_masked, row.job_title, row.job_department, row.interviewer_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    ) return false;
    if (filters.jobTitle && row.job_title !== filters.jobTitle) return false;
    if (filters.interviewerId && String(row.interviewer_id || '') !== filters.interviewerId) return false;
    if (filters.schedule === 'unassigned' && rowStatus(row) !== 'unassigned') return false;
    if (filters.schedule === 'scheduled' && rowStatus(row) === 'unassigned') return false;
    if (filters.roundSequence && String(row.round_sequence || '') !== filters.roundSequence) return false;
    if (filters.city && row.job_city !== filters.city) return false;
    if (filters.department && row.job_department !== filters.department) return false;
    const day = interviewLocalDateKey(row.scheduled_at);
    if (filters.dateFrom && (!day || day < filters.dateFrom)) return false;
    if (filters.dateTo && (!day || day > filters.dateTo)) return false;
    return true;
  });
}
