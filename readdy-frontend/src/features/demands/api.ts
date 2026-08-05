import { apiRequest } from '@/lib/api';
import type {
  DemandListResponse,
  DemandOwnerOption,
  DemandPriority,
  DemandStatus,
  DemandUpdateInput,
  RecruitmentDemand,
  RecruitmentDemandInput,
} from './types';

export const demandsApi = {
  listDemands(): Promise<DemandListResponse> {
    return apiRequest('/demands?status=all&page=1&page_size=100&sort=created_at_desc');
  },
  getDemand(demandId: number): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}`);
  },
  createDemand(payload: RecruitmentDemandInput, idempotencyKey: string): Promise<RecruitmentDemand> {
    return apiRequest('/demands', { method: 'POST', body: payload, idempotencyKey });
  },
  updateDemand(demandId: number, payload: DemandUpdateInput): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}`, { method: 'PATCH', body: payload });
  },
  closeDemand(
    demandId: number,
    status: Exclude<DemandStatus, 'active' | 'pending'>,
    reason: string,
  ): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/close`, {
      method: 'POST',
      body: { status, close_reason: reason },
    });
  },
  restoreDemand(demandId: number, reason: string): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/restore`, {
      method: 'POST',
      body: { note: reason },
    });
  },
  adjustPriority(demandId: number, priority: DemandPriority, reason: string): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/downgrade`, {
      method: 'POST',
      body: { priority, downgrade_reason: reason },
    });
  },
  reassignOwner(demandId: number, ownerHrId: number, reason: string): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/owner`, {
      method: 'PATCH',
      body: { owner_hr_id: ownerHrId, reason },
    });
  },
  listRecruiterOwners(): Promise<DemandOwnerOption[]> {
    return apiRequest('/candidates/owner-options');
  },
  approveDemand(demandId: number, idempotencyKey = crypto.randomUUID()): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/approve`, { method: 'POST', idempotencyKey });
  },
  rejectDemand(
    demandId: number,
    reason: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/reject`, {
      method: 'POST',
      body: { reason },
      idempotencyKey,
    });
  },
  resubmitDemand(
    demandId: number,
    payload: DemandUpdateInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<RecruitmentDemand> {
    return apiRequest(`/demands/${demandId}/resubmit`, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
};
