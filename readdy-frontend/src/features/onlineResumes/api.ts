import { apiRequest } from '@/lib/api';
import type {
  OnlineResumeDetailResponse,
  OnlineResumeItem,
  OnlineResumeListResponse,
  OnlineResumeUpdatePayload,
} from './types';

export const onlineResumesApi = {
  list(): Promise<OnlineResumeListResponse> {
    return apiRequest<OnlineResumeListResponse>('/online-resumes');
  },

  async detail(id: number): Promise<OnlineResumeItem> {
    const response = await apiRequest<OnlineResumeDetailResponse>(`/online-resumes/${id}`);
    return response.item;
  },

  async update(id: number, payload: OnlineResumeUpdatePayload): Promise<OnlineResumeItem> {
    const response = await apiRequest<OnlineResumeDetailResponse>(`/online-resumes/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return response.item;
  },

  remove(id: number): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/online-resumes/${id}`, { method: 'DELETE' });
  },
};
