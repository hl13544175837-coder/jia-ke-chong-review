import type {
  InterviewAssignment,
  InterviewRound,
  InterviewListItem,
  PipelineBoard,
  PipelineBoardCandidate,
  RecruitmentDemand,
  Role,
} from '../types';

export type RecordFocus = 'all' | 'pending' | 'passed' | 'failed';
export type InterviewTypeFilter = 'all' | 'ai' | 'feedback';
export type InterviewResultFilter = 'all' | 'passed' | 'failed' | 'empty';
export type InterviewDateRange = 'all' | 'today' | '7d' | '30d';

export interface InterviewFiltersState {
  query: string;
  demandId: 'all' | number;
  round: 'all' | InterviewRound;
  type: InterviewTypeFilter;
  result: InterviewResultFilter;
  interviewerId: 'all' | number;
  range: InterviewDateRange;
}

export interface InterviewStats {
  total: number;
  today: number;
  passed: number;
  failed: number;
  pending: number;
  avgScore: number | null;
}

export interface PendingFeedbackItem {
  candidate_id: number;
  name_masked: string;
  demand_id: number | null;
  assignment_id?: number;
  job_id: number;
  job_title: string;
  round: InterviewRound;
  round_sequence: number;
  is_primary: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface InterviewDemandOption {
  id: number;
  label: string;
}

export const INTERVIEW_ROUNDS: Array<{ key: InterviewRound; label: string }> = [
  { key: 'round_1', label: '一面' },
  { key: 'round_2', label: '二面' },
  { key: 'round_3', label: '终面' },
  { key: 'additional', label: '加面' },
];

const ROUND_LABEL = INTERVIEW_ROUNDS.reduce<Record<string, string>>((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {
  // Historical values remain readable but are not offered for new tasks.
  technical: '技术面',
  business: '业务面',
  hr: 'HR 面',
  interview_first: '一面',
  interview_second: '二面',
  interview_final: '终面',
});

export const DEFAULT_INTERVIEW_FILTERS: InterviewFiltersState = {
  query: '',
  demandId: 'all',
  round: 'all',
  type: 'all',
  result: 'all',
  interviewerId: 'all',
  range: '30d',
};

export function defaultFocusForRole(role: Role | null): RecordFocus {
  if (role === 'interviewer' || role === 'recruiter') return 'pending';
  return 'all';
}

export function roundLabel(round: string | null | undefined): string {
  if (!round) return 'AI 预筛';
  return ROUND_LABEL[round] ?? '面试';
}

export function resultLabel(pass: boolean | null): string {
  if (pass === null) return '未填写';
  return pass ? '建议通过' : '建议不通过';
}

export function resultTone(pass: boolean | null): 'neutral' | 'success' | 'danger' {
  if (pass === null) return 'neutral';
  return pass ? 'success' : 'danger';
}

export function recordSummary(item: InterviewListItem): string {
  if (item.type === 'ai') {
    if (item.pass === null || item.score === null) return 'AI 预筛报告待查看';
    return `AI 建议${item.pass ? '通过' : '不通过'}，评分 ${item.score}`;
  }
  if (item.reason_tags.length > 0) return item.reason_tags.join('、');
  return item.concerns || item.note || item.strengths || '已提交面试反馈';
}

export function demandOptionLabel(demand: RecruitmentDemand): string {
  return [
    demand.request_no || `REQ-${demand.id}`,
    demand.job_title,
    demand.requester_department || demand.job_department,
    demand.job_city,
  ].filter(Boolean).join(' · ');
}

export function uniqueDemands(
  items: InterviewListItem[],
  demands: RecruitmentDemand[],
  assignments: InterviewAssignment[] = [],
): InterviewDemandOption[] {
  const options = new Map<number, InterviewDemandOption>();
  demands.forEach((demand) => options.set(demand.id, {
    id: demand.id,
    label: demandOptionLabel(demand),
  }));
  [...items, ...assignments].forEach((item) => {
    if (item.demand_id && !options.has(item.demand_id)) {
      options.set(item.demand_id, {
        id: item.demand_id,
        label: `招聘需求 #${item.demand_id} · ${item.job_title ?? `岗位 #${item.job_id}`}`,
      });
    }
  });
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
}

export function uniqueInterviewers(items: InterviewListItem[]) {
  const map = new Map<number, string>();
  items.forEach((item) => {
    if (item.interviewer_id && item.interviewer_name) {
      map.set(item.interviewer_id, item.interviewer_name);
    }
  });
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function inDateRange(createdAt: string | null, range: InterviewDateRange): boolean {
  if (range === 'all' || !createdAt) return true;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const now = Date.now();
  if (range === 'today') {
    const d = new Date(created);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }
  const days = range === '7d' ? 7 : 30;
  return now - created <= days * 24 * 60 * 60 * 1000;
}

export function filterInterviewRecords(
  items: InterviewListItem[],
  filters: InterviewFiltersState,
  focus: RecordFocus,
): InterviewListItem[] {
  const q = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    const text = [
      item.name_masked,
      item.job_title,
      item.interviewer_name,
      item.strengths,
      item.concerns,
      item.note,
      ...item.reason_tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (q && !text.includes(q)) return false;
    if (filters.demandId !== 'all' && item.demand_id !== filters.demandId) return false;
    if (filters.round !== 'all' && item.round !== filters.round) return false;
    if (filters.type !== 'all' && item.type !== filters.type) return false;
    if (filters.interviewerId !== 'all' && item.interviewer_id !== filters.interviewerId) {
      return false;
    }
    if (!inDateRange(item.created_at, filters.range)) return false;
    if (filters.result === 'passed' && item.pass !== true) return false;
    if (filters.result === 'failed' && item.pass !== false) return false;
    if (filters.result === 'empty' && item.pass !== null) return false;
    if (focus === 'passed' && item.pass !== true) return false;
    if (focus === 'failed' && item.pass !== false) return false;
    return true;
  });
}

function hasFeedbackForRound(
  records: InterviewListItem[],
  candidateId: number,
  demandId: number | null,
  jobId: number,
  round: InterviewRound,
): boolean {
  return records.some(
    (record) =>
      record.type === 'feedback' &&
      record.candidate_id === candidateId &&
      (demandId !== null ? record.demand_id === demandId : record.job_id === jobId) &&
      record.round === round,
  );
}

function isInterviewCandidate(candidate: PipelineBoardCandidate): boolean {
  return candidate.stage === 'interview';
}

export function buildPendingFeedback(
  boards: PipelineBoard[],
  records: InterviewListItem[],
): PendingFeedbackItem[] {
  const pending: PendingFeedbackItem[] = [];
  boards.forEach((board) => {
    board.candidates.filter(isInterviewCandidate).forEach((candidate) => {
      const fallbackRound: InterviewRound = 'round_1';
      const demandId = board.demand_id ?? null;
      if (!hasFeedbackForRound(records, candidate.candidate_id, demandId, board.job_id, fallbackRound)) {
        pending.push({
          candidate_id: candidate.candidate_id,
          name_masked: candidate.name_masked,
          demand_id: demandId,
          job_id: board.job_id,
          job_title: board.job_title,
          round: fallbackRound,
          round_sequence: 1,
          is_primary: true,
          updated_at: candidate.updated_at,
          updated_by_name: candidate.updated_by_name,
        });
      }
    });
  });
  return pending.sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
}

export function buildAssignedPendingFeedback(assignments: InterviewAssignment[]): PendingFeedbackItem[] {
  return assignments
    .filter((item) => isActiveInterviewAssignment(item) && !item.feedback_submitted)
    .map((item) => ({
      candidate_id: item.candidate_id,
      name_masked: item.name_masked ?? `候选人 #${item.candidate_id}`,
      demand_id: item.demand_id,
      assignment_id: item.id,
      job_id: item.job_id,
      job_title: item.job_title ?? `岗位 #${item.job_id}`,
      round: item.round,
      round_sequence: item.round_sequence,
      is_primary: item.is_primary,
      updated_at: item.scheduled_at ?? item.created_at,
      updated_by_name: item.created_by_name,
    }))
    .sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
}

export function isActiveInterviewAssignment(item: InterviewAssignment): boolean {
  const status = (item.status || 'scheduled').trim().toLowerCase();
  return !['cancelled', 'canceled'].includes(status);
}

export function mergePendingFeedback(
  primary: PendingFeedbackItem[],
  fallback: PendingFeedbackItem[],
): PendingFeedbackItem[] {
  const byKey = new Map<string, PendingFeedbackItem>();
  [...primary, ...fallback].forEach((item) => {
    const scope = item.demand_id === null ? `job-${item.job_id}` : `demand-${item.demand_id}`;
    const key = `${scope}-${item.candidate_id}-${item.round}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  });
  return [...byKey.values()].sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
}

export function filterPendingFeedback(
  items: PendingFeedbackItem[],
  filters: InterviewFiltersState,
): PendingFeedbackItem[] {
  const q = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    const text = [item.name_masked, item.job_title, roundLabel(item.round)]
      .join(' ')
      .toLowerCase();
    if (q && !text.includes(q)) return false;
    if (filters.demandId !== 'all' && item.demand_id !== filters.demandId) return false;
    if (filters.round !== 'all' && item.round !== filters.round) return false;
    return true;
  });
}

export function computeInterviewStats(
  records: InterviewListItem[],
  pending: PendingFeedbackItem[],
): InterviewStats {
  const scored = records.filter((item) => typeof item.score === 'number');
  const totalScore = scored.reduce((sum, item) => sum + Number(item.score), 0);
  return {
    total: records.length,
    today: records.filter((item) => inDateRange(item.created_at, 'today')).length,
    passed: records.filter((item) => item.pass === true).length,
    failed: records.filter((item) => item.pass === false).length,
    pending: pending.length,
    avgScore: scored.length > 0 ? Number((totalScore / scored.length).toFixed(1)) : null,
  };
}
