import { apiMultipart, apiRequest } from '@/lib/api';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { CreateBusinessReviewInput, BusinessReviewTask } from '@/features/businessReviews/types';
import type {
  CandidateListQuery,
  CandidateListResponse,
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
    form.append('target_demand_id', String(source.target_demand_id));
    if (source.source_channel) form.append('source_channel', source.source_channel);
    if (source.source_note) form.append('source_note', source.source_note);
    return apiMultipart('/resume/upload', form);
  },
  getResume(candidateId: number): Promise<CandidateResumeDetail> {
    return apiRequest(`/resume/${candidateId}`);
  },
  pushToBusinessReview(payload: CreateBusinessReviewInput): Promise<BusinessReviewTask> {
    return businessReviewsApi.createTask(payload);
  },
};
