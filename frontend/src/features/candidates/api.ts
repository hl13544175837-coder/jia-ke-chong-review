import { ApiError, api, getToken } from '../../lib/api';
import { API_BASE } from '../../lib/apiBase';
import type { CandidateProfileDetail, OriginalResumeBlob } from './types';

function responseFilename(response: Response, candidateId: number): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `candidate-${candidateId}-resume`;
}

async function fetchOriginalResume(
  candidateId: number,
  mode: 'preview' | 'download',
): Promise<OriginalResumeBlob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}/resume/${candidateId}/original/${mode}`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    throw new ApiError(
      response.status,
      payload?.error || `Request failed with status ${response.status}`,
      payload?.code,
    );
  }
  return {
    blob: await response.blob(),
    filename: responseFilename(response, candidateId),
    mimeType: response.headers.get('Content-Type') || 'application/octet-stream',
  };
}

export const candidatesApi = {
  listCandidates: api.listCandidates,
  searchCandidates: api.searchCandidates,
  getCandidate(candidateId: number): Promise<CandidateProfileDetail> {
    return api.getCandidate(candidateId) as Promise<CandidateProfileDetail>;
  },
  previewOriginalResume(candidateId: number): Promise<OriginalResumeBlob> {
    return fetchOriginalResume(candidateId, 'preview');
  },
  downloadOriginalResume(candidateId: number): Promise<OriginalResumeBlob> {
    return fetchOriginalResume(candidateId, 'download');
  },
  exportCandidate: api.exportCandidate,
  retryCandidateParse: api.retryCandidateParse,
  updateCandidateProfile: api.updateCandidateProfile,
  getCandidatePipelines: api.getCandidatePipelines,
  getCandidateJourney: api.getCandidateJourney,
  reassignCandidate: api.reassignCandidate,
  movePipeline: api.movePipeline,
  listJobs: api.listJobs,
  listDemands: api.listDemands,
  previewJobMatch: api.previewJobMatch,
  batchAddToPipeline: api.batchAddToPipeline,
};
