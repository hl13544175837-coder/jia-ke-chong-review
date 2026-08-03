import { useCallback, useEffect, useState } from 'react';
import { userFacingError } from '@/lib/userFacingError';
import { interviewsApi } from './api';
import type { InterviewManagementRow, InterviewerOption } from './types';
import type { InterviewFilters, InterviewStatusTab, InterviewViewMode } from './workbench';

export function followUpScheduleRow(
  row: InterviewManagementRow,
  mode: 'next_round' | 'add_interviewer',
): InterviewManagementRow {
  const currentSequence = row.round_sequence || 1;
  const nextSequence = mode === 'next_round' ? currentSequence + 1 : currentSequence;
  return {
    ...row,
    round: mode === 'next_round' ? nextSequence <= 3 ? `round_${nextSequence}` : 'additional' : row.round || 'additional',
    round_sequence: nextSequence,
    assignment_id: null,
    is_primary: mode === 'next_round',
    interviewer_id: null,
    interviewer_name: null,
    scheduled_at: null,
    location: '',
    note: '',
    assignment_status: 'unassigned',
    feedback_id: null,
    feedback_submitted: false,
    feedback_score: null,
    feedback_passed: null,
    feedback_result: null,
    disposition_reason: '',
    enter_talent_pool: null,
  };
}

export function initialInterviewTab(value: string | null): InterviewStatusTab {
  if (value === 'unassigned' || value === 'scheduled' || value === 'awaiting_feedback' || value === 'completed') return value;
  return 'all';
}

export function initialInterviewView(value: string | null): InterviewViewMode {
  return value === 'calendar' ? 'calendar' : 'list';
}

export function initialInterviewFilters(searchParams: URLSearchParams): InterviewFilters {
  return {
    jobTitle: searchParams.get('job') || '',
    interviewerId: searchParams.get('interviewer') || '',
    schedule: searchParams.get('schedule') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    roundSequence: searchParams.get('round') || '',
    city: searchParams.get('city') || '',
    department: searchParams.get('department') || '',
  };
}

export function setInterviewSearchParam(searchParams: URLSearchParams, key: string, value: string, defaultValue = '') {
  if (!value || value === defaultValue) searchParams.delete(key);
  else searchParams.set(key, value);
}

export function latestCandidateManagementRow(
  rows: InterviewManagementRow[],
  candidateId: number,
  demandId: number | null,
  assignmentId: number | null,
) {
  const matches = rows.filter((item) => item.candidate_id === candidateId && (!demandId || item.demand_id === demandId));
  if (assignmentId) {
    const exact = matches.find((item) => item.assignment_id === assignmentId);
    if (exact) return exact;
  }
  return matches.sort((left, right) => (
    (right.round_sequence || 0) - (left.round_sequence || 0)
    || (right.assignment_id || 0) - (left.assignment_id || 0)
  ))[0] ?? null;
}

export function useRecruiterInterviewWorkbench() {
  const [rows, setRows] = useState<InterviewManagementRow[]>([]);
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [selectedRow, setSelectedRow] = useState<InterviewManagementRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [managementRows, reviewerRows] = await Promise.all([
        interviewsApi.listManagementRows(),
        interviewsApi.listInterviewers(),
      ]);
      setRows(managementRows);
      setInterviewers(reviewerRows);
      setSelectedRow((current) => current ? latestCandidateManagementRow(managementRows, current.candidate_id, current.demand_id, current.assignment_id) : null);
    } catch (error) {
      setLoadError(userFacingError(error, '面试管理加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkbench();
    const refresh = () => void loadWorkbench();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadWorkbench]);

  return { rows, interviewers, selectedRow, setSelectedRow, loading, loadError, loadWorkbench };
}
