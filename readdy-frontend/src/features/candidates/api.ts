import { apiMultipart, apiRequest } from '@/lib/api';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { CreateBusinessReviewInput, BusinessReviewTask } from '@/features/businessReviews/types';
import type {
  CandidateListQuery,
  CandidateListResponse,
  CandidateDuplicateResponse,
  CandidateDemandTransferResult,
  CandidateFavoriteResult,
  CandidateMatchPreview,
  CandidateMergeResult,
  CandidatePipelineAddResult,
  CandidateJourney,
  CandidateResumeDetail,
  ResumeUploadResponse,
  ResumeUploadSource,
} from './types';

function queryString(query: CandidateListQuery) {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) search.set(key, String(value));
  });
  return search.toString();
}

export const candidatesApi = {
  listCandidates(query: CandidateListQuery = {}): Promise<CandidateListResponse> {
    const search = queryString({ page: 1, per_page: 20, ...query });
    return apiRequest(`/candidates?${search}`);
  },
  uploadResumes(files: File[], source: ResumeUploadSource): Promise<ResumeUploadResponse> {
    const form = new FormData();
    files.forEach((item) => form.append('files', item));
    if (source.target_demand_id) form.append('target_demand_id', String(source.target_demand_id));
    if (source.source_channel) form.append('source_channel', source.source_channel);
    if (source.source_note) form.append('source_note', source.source_note);
    return apiMultipart('/resume/upload', form);
  },
  getResume(candidateId: number): Promise<CandidateResumeDetail> {
    return apiRequest(`/resume/${candidateId}`);
  },
  getJourney(candidateId: number, demandId: number): Promise<CandidateJourney> {
    return apiRequest(`/candidates/${candidateId}/journey?demand_id=${demandId}`);
  },
  setFavorites(candidateIds: number[], favorite: boolean): Promise<CandidateFavoriteResult> {
    return apiRequest('/candidates/favorites/set', {
      method: 'POST',
      body: { candidate_ids: candidateIds, favorite },
    });
  },
  addToPipeline(
    demandId: number,
    candidateIds: number[],
    reason?: string,
  ): Promise<CandidatePipelineAddResult> {
    return apiRequest('/candidates/pipeline/add', {
      method: 'POST',
      body: {
        demand_id: demandId,
        candidate_ids: candidateIds,
        reactivate_rejected: Boolean(reason?.trim()),
        reason: reason?.trim() || undefined,
      },
    });
  },
  transferToDemand(
    candidateId: number,
    fromDemandId: number,
    toDemandId: number,
    reason: string,
  ): Promise<CandidateDemandTransferResult> {
    return apiRequest('/pipeline/transfer', {
      method: 'POST',
      body: {
        candidate_id: candidateId,
        from_demand_id: fromDemandId,
        to_demand_id: toDemandId,
        reason: reason.trim(),
      },
    });
  },
  previewMatches(demandId: number, candidateIds: number[]): Promise<CandidateMatchPreview> {
    return apiRequest('/candidates/match/preview', {
      method: 'POST',
      body: { demand_id: demandId, candidate_ids: candidateIds },
    });
  },
  getDuplicateGroups(): Promise<CandidateDuplicateResponse> {
    return apiRequest('/candidates/duplicates/get');
  },
  mergeDuplicates(
    primaryCandidateId: number,
    duplicateCandidateIds: number[],
    reason: string,
  ): Promise<CandidateMergeResult> {
    return apiRequest('/candidates/duplicates/merge', {
      method: 'POST',
      body: {
        primary_candidate_id: primaryCandidateId,
        duplicate_candidate_ids: duplicateCandidateIds,
        reason,
      },
    });
  },
  pushToBusinessReview(
    payload: CreateBusinessReviewInput,
  ): Promise<BusinessReviewTask & { deduplicated?: boolean }> {
    return businessReviewsApi.createTask(payload);
  },
};
