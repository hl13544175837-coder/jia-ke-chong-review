import { apiRequest } from '@/lib/api';
import type {
  OnlineResumeDetailResponse,
  OnlineResumeItem,
  OnlineResumeListParams,
  OnlineResumeListResponse,
  OnlineResumeOwnerOption,
  OnlineResumeUpdatePayload,
} from './types';
import type { AgentImportTokenResponse } from './agentConnection';

export const onlineResumesApi = {
  issueAgentImportToken(): Promise<AgentImportTokenResponse> {
    return apiRequest<AgentImportTokenResponse>('/agent-imports/token', { method: 'POST' });
  },

  list(params: OnlineResumeListParams = {}): Promise<OnlineResumeListResponse> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.perPage !== undefined) query.set('per_page', String(params.perPage));
    if (params.demandId !== undefined && params.demandId > 0) query.set('demand_id', String(params.demandId));
    if (params.gender) query.set('gender', params.gender);
    if (params.ageFrom !== undefined) query.set('age_from', String(params.ageFrom));
    if (params.ageTo !== undefined) query.set('age_to', String(params.ageTo));
    if (params.createdFrom) query.set('created_from', params.createdFrom);
    if (params.createdTo) query.set('created_to', params.createdTo);
    if (params.sourcePlatform) query.set('source_platform', params.sourcePlatform);
    if (params.educationLevel) query.set('education_level', params.educationLevel);
    if (params.location) query.set('location', params.location);
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.ownerHrId !== undefined && params.ownerHrId > 0) query.set('owner_hr_id', String(params.ownerHrId));
    const qs = query.toString();
    return apiRequest<OnlineResumeListResponse>(`/online-resumes${qs ? `?${qs}` : ''}`);
  },

  listRecruiterOwners(): Promise<OnlineResumeOwnerOption[]> {
    return apiRequest<OnlineResumeOwnerOption[]>('/candidates/owner-options');
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
