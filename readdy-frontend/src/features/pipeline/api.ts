import { apiRequest } from '@/lib/api';
import type { MoveCandidateInput, PipelineBoard, PipelineHistory } from './types';

export const pipelineApi = {
  getBoard(demandId: number): Promise<PipelineBoard> {
    return apiRequest(`/pipeline/demands/${demandId}/board`);
  },
  getHistory(demandId: number, candidateId: number): Promise<PipelineHistory> {
    return apiRequest(`/pipeline/demands/${demandId}/history/${candidateId}`);
  },
  moveCandidate(
    demandId: number,
    payload: MoveCandidateInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<Record<string, unknown>> {
    return apiRequest(`/pipeline/demands/${demandId}/move`, {
      method: 'POST',
      body: { ...payload, demand_id: demandId },
      idempotencyKey,
    });
  },
};
