import { apiRequest } from '@/lib/api';
import type {
  InterviewAssignment,
  InterviewFeedback,
  InterviewFeedbackInput,
  InterviewFeedbackMutationResult,
  InterviewFeedbackUpdateInput,
} from './types';

export const interviewsApi = {
  listMyAssignments(): Promise<InterviewAssignment[]> {
    return apiRequest('/interview/assignments');
  },
  listFeedback(params: { candidateId?: number; demandId?: number } = {}): Promise<InterviewFeedback[]> {
    const search = new URLSearchParams();
    if (params.candidateId) search.set('candidate_id', String(params.candidateId));
    if (params.demandId) search.set('demand_id', String(params.demandId));
    const suffix = search.size ? `?${search.toString()}` : '';
    return apiRequest(`/interview/feedback${suffix}`);
  },
  saveFeedback(
    payload: InterviewFeedbackInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<InterviewFeedbackMutationResult> {
    return apiRequest('/interview/feedback', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
  updateFeedback(
    feedbackId: number,
    payload: InterviewFeedbackUpdateInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<InterviewFeedbackMutationResult> {
    return apiRequest(`/interview/feedback/${feedbackId}`, {
      method: 'PATCH',
      body: payload,
      idempotencyKey,
    });
  },
};
