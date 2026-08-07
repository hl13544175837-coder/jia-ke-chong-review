import { apiRequest } from '@/lib/api';
import type {
  OnlineResumeDetailResponse,
  OnlineResumeItem,
  OnlineResumeListResponse,
  OnlineResumeUpdatePayload,
} from './types';
import type { AgentImportTokenResponse } from './agentConnection';

export const onlineResumesApi = {
  issueAgentImportToken(): Promise<AgentImportTokenResponse> {
    return apiRequest<AgentImportTokenResponse>('/agent-imports/token', { method: 'POST' });
  },

  list(page = 1, perPage = 20): Promise<OnlineResumeListResponse> {
    return apiRequest<OnlineResumeListResponse>(`/online-resumes?page=${page}&per_page=${perPage}`);
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
