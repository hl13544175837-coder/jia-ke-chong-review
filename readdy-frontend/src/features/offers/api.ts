import { apiRequest } from '@/lib/api';
import type {
  OfferActionInput,
  OfferDraftInput,
  OfferListResponse,
  OfferRecord,
  OfferStatus,
} from './types';

export const offersApi = {
  listOffers(query: { status?: OfferStatus[]; search?: string } = {}): Promise<OfferListResponse> {
    const search = new URLSearchParams();
    if (query.status?.length) search.set('status', query.status.join(','));
    if (query.search) search.set('search', query.search);
    const suffix = search.size ? `?${search.toString()}` : '';
    return apiRequest(`/offers${suffix}`);
  },
  getOffer(offerId: number): Promise<OfferRecord> {
    return apiRequest(`/offers/${offerId}`);
  },
  saveDraft(
    demandId: number,
    candidateId: number,
    payload: OfferDraftInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<OfferRecord> {
    return apiRequest(`/pipeline/demands/${demandId}/offer/${candidateId}`, {
      method: 'PUT',
      body: payload,
      idempotencyKey,
    });
  },
  runAction(
    offerId: number,
    payload: OfferActionInput,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<OfferRecord> {
    return apiRequest(`/offers/${offerId}/actions`, {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },
};
