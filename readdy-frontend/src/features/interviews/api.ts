import { apiRequest } from '@/lib/api';
import type {
  InterviewAssignment,
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewFeedback,
  InterviewFeedbackInput,
  InterviewFeedbackMutationResult,
  InterviewFeedbackUpdateInput,
  InterviewManagementRow,
  InterviewReplacementInput,
  InterviewRescheduleProcessInput,
  InterviewRescheduleRequest,
  InterviewRescheduleRequestInput,
  InterviewerOption,
} from './types';

export const interviewsApi = {
  listManagementRows(): Promise<InterviewManagementRow[]> {
    return apiRequest('/interview/management-rows');
  },
  listInterviewers(): Promise<InterviewerOption[]> {
    return apiRequest('/interview/interviewers');
  },
  createAssignment(
    payload: InterviewAssignmentInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<InterviewAssignment & { deduplicated?: boolean }> {
    return apiRequest('/interview/assignments', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
  updateAssignment(
    assignmentId: number,
    payload: InterviewAssignmentUpdateInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<InterviewAssignment & { deduplicated?: boolean }> {
    return apiRequest(`/interview/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: payload,
      idempotencyKey,
    });
  },
  markConducted(assignmentId: number): Promise<InterviewAssignment & { deduplicated?: boolean }> {
    return apiRequest(`/interview/assignments/${assignmentId}/mark-conducted`, { method: 'POST' });
  },
  remindFeedback(assignmentId: number): Promise<InterviewAssignment & { deduplicated?: boolean }> {
    return apiRequest(`/interview/assignments/${assignmentId}/remind-feedback`, { method: 'POST' });
  },
  cancelAssignment(assignmentId: number, reason: string): Promise<InterviewAssignment & { deduplicated?: boolean }> {
    return apiRequest(`/interview/assignments/${assignmentId}/cancel`, {
      method: 'PATCH',
      body: { reason },
    });
  },
  requestReschedule(
    assignmentId: number,
    payload: InterviewRescheduleRequestInput,
  ): Promise<InterviewRescheduleRequest> {
    return apiRequest(`/interview/assignments/${assignmentId}/reschedule-requests`, {
      method: 'POST',
      body: payload,
    });
  },
  listRescheduleHistory(assignmentId: number): Promise<InterviewRescheduleRequest[]> {
    return apiRequest(`/interview/assignments/${assignmentId}/reschedule-history`);
  },
  processRescheduleRequest(
    requestId: number,
    payload: InterviewRescheduleProcessInput,
  ): Promise<InterviewRescheduleRequest> {
    return apiRequest(`/interview/reschedule-requests/${requestId}`, {
      method: 'PATCH',
      body: payload,
    });
  },
  createReplacementAssignment(
    requestId: number,
    payload: InterviewReplacementInput,
  ): Promise<{ assignment: InterviewAssignment; reschedule_request: InterviewRescheduleRequest }> {
    return apiRequest(`/interview/reschedule-requests/${requestId}/replacement`, {
      method: 'POST',
      body: payload,
    });
  },
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
