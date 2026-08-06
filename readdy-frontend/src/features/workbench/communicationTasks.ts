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

export interface NextRoundTask {
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

function isFeedbackSubmittedInterviewRow(row: InterviewManagementRow) {
  return (
    row.pipeline_stage === 'interview'
    && row.feedback_submitted
    && row.assignment_status !== 'cancelled'
  );
}

export function buildCommunicationTasks(rows: InterviewManagementRow[]) {
  const latestFeedbackByCandidate = new Map<string, InterviewManagementRow>();
  const maxActiveRound = new Map<string, number>();
  rows.forEach((row) => {
    const key = `${row.candidate_id}:${row.demand_id}`;
    if (row.assignment_status !== 'cancelled') {
      maxActiveRound.set(key, Math.max(maxActiveRound.get(key) ?? 0, row.round_sequence ?? 0));
    }
    if (!isFeedbackSubmittedInterviewRow(row)) return;
    const current = latestFeedbackByCandidate.get(key);
    if (!current || isLater(row, current)) latestFeedbackByCandidate.set(key, row);
  });

  const communicationTasks: CommunicationTask[] = [];
  const nextRoundTasks: NextRoundTask[] = [];
  latestFeedbackByCandidate.forEach((row, key) => {
    const hasActiveNextRound = (maxActiveRound.get(key) ?? 0) > (row.round_sequence ?? 0);
    const base = {
      candidateId: row.candidate_id,
      demandId: row.demand_id,
      candidateName: row.name_masked,
      jobTitle: row.job_title,
      roundSequence: row.round_sequence,
      scheduledAt: row.scheduled_at,
    };
    if (hasActiveNextRound) {
      communicationTasks.push({
        key: `communication-${row.candidate_id}-${row.demand_id}`,
        ...base,
      });
    } else {
      nextRoundTasks.push({
        key: `next-round-${row.candidate_id}-${row.demand_id}`,
        ...base,
      });
    }
  });

  const byTimeDesc = (
    left: { scheduledAt: string | null; candidateId: number },
    right: { scheduledAt: string | null; candidateId: number },
  ) => (
    (right.scheduledAt || '').localeCompare(left.scheduledAt || '')
    || right.candidateId - left.candidateId
  );
  communicationTasks.sort(byTimeDesc);
  nextRoundTasks.sort(byTimeDesc);

  return { communicationTasks, nextRoundTasks };
}
