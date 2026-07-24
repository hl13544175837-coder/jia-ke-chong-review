import { apiBlob, apiRequest } from '@/lib/api';
import type {
  BusinessReviewDecisionInput,
  BusinessReviewListResponse,
  BusinessReviewStatus,
  BusinessReviewTask,
  CreateBusinessReviewInput,
} from './types';

function statusQuery(status?: BusinessReviewStatus) {
  return status ? `?status=${encodeURIComponent(status)}` : '';
}

export const businessReviewsApi = {
  listMine(status?: BusinessReviewStatus): Promise<BusinessReviewListResponse> {
    return apiRequest(`/business-reviews/mine${statusQuery(status)}`);
  },
  listForHr(status?: BusinessReviewStatus): Promise<BusinessReviewListResponse> {
    return apiRequest(`/business-reviews${statusQuery(status)}`);
  },
  getTask(taskId: number): Promise<BusinessReviewTask> {
    return apiRequest(`/business-reviews/${taskId}`);
  },
  createTask(
    payload: CreateBusinessReviewInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<BusinessReviewTask> {
    return apiRequest('/business-reviews', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
  decideTask(
    taskId: number,
    payload: BusinessReviewDecisionInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<BusinessReviewTask> {
    return apiRequest(`/business-reviews/${taskId}/decision`, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
  loadResume(candidateId: number): Promise<Blob> {
    return apiBlob(`/resume/${candidateId}/original/preview`);
  },
  downloadResume(candidateId: number): Promise<Blob> {
    return apiBlob(`/resume/${candidateId}/original/download`);
  },
};
