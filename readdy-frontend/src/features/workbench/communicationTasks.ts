import type { InterviewManagementRow } from '@/features/interviews/types';

export interface CommunicationTask {
  key: string;
  candidateId: number;
  demandId: number;
  candidateName: string;
  jobTitle: string;
  roundSequence: number | null;
  scheduledAt: string | null;
}

function isLater(left: InterviewManagementRow, right: InterviewManagementRow) {
  const leftRound = left.round_sequence ?? 0;
  const rightRound = right.round_sequence ?? 0;
  if (leftRound !== rightRound) return leftRound > rightRound;
  return (left.assignment_id ?? 0) > (right.assignment_id ?? 0);
}

export function buildCommunicationTasks(rows: InterviewManagementRow[]): CommunicationTask[] {
  const latestByCandidate = new Map<string, InterviewManagementRow>();
  rows.forEach((row) => {
    const key = `${row.candidate_id}:${row.demand_id}`;
    const current = latestByCandidate.get(key);
    if (!current || isLater(row, current)) latestByCandidate.set(key, row);
  });

  return [...latestByCandidate.values()]
    .filter((row) => (
      row.pipeline_stage === 'interview'
      && row.feedback_submitted
      && row.assignment_status !== 'cancelled'
    ))
    .map((row) => ({
      key: `communication-${row.candidate_id}-${row.demand_id}`,
      candidateId: row.candidate_id,
      demandId: row.demand_id,
      candidateName: row.name_masked,
      jobTitle: row.job_title,
      roundSequence: row.round_sequence,
      scheduledAt: row.scheduled_at,
    }))
    .sort((left, right) => (
      (right.scheduledAt || '').localeCompare(left.scheduledAt || '')
      || right.candidateId - left.candidateId
    ));
}
