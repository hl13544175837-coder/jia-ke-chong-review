import { apiBlob, apiRequest } from '@/lib/api';
import type {
  BusinessReviewDecisionInput,
  BusinessReviewListResponse,
  BusinessReviewStatus,
  BusinessReviewTask,
  CreateBusinessReviewInput,
  ReassignBusinessReviewInput,
} from './types';

function statusQuery(status?: BusinessReviewStatus) {
  return status ? `?status=${encodeURIComponent(status)}` : '';
}

function normalizeListResponse(
  response: BusinessReviewTask[] | BusinessReviewListResponse,
): BusinessReviewListResponse {
  const items = Array.isArray(response) ? response : response.items;
  return {
    items: items,
    total: Array.isArray(response) ? items.length : response.total,
  };
}

export const businessReviewsApi = {
  async listMine(status?: BusinessReviewStatus): Promise<BusinessReviewListResponse> {
    const response = await apiRequest<BusinessReviewTask[] | BusinessReviewListResponse>(
      `/business-reviews/mine${statusQuery(status)}`,
    );
    return normalizeListResponse(response);
  },
  async listForHr(status?: BusinessReviewStatus): Promise<BusinessReviewListResponse> {
    const response = await apiRequest<BusinessReviewTask[] | BusinessReviewListResponse>(
      `/business-reviews${statusQuery(status)}`,
    );
    return normalizeListResponse(response);
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
  reassignTask(
    taskId: number,
    reviewerId: number,
  ): Promise<BusinessReviewTask & { unchanged?: boolean }> {
    const body: ReassignBusinessReviewInput = { reviewer_id: reviewerId };
    return apiRequest(`/business-reviews/${taskId}/reviewer`, {
      method: 'PATCH',
      body,
    });
  },
  remindTask(
    taskId: number,
  ): Promise<BusinessReviewTask & { deduplicated: boolean }> {
    return apiRequest(`/business-reviews/${taskId}/remind`, {
      method: 'POST',
    });
  },
  loadResume(candidateId: number): Promise<Blob> {
    return apiBlob(`/resume/${candidateId}/original/preview`);
  },
  downloadResume(candidateId: number): Promise<Blob> {
    return apiBlob(`/resume/${candidateId}/original/download`);
  },
};
