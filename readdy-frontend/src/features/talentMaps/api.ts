import { apiRequest } from '@/lib/api';
import type {
  TalentMapCompany,
  TalentMapCompanyInput,
  TalentMapCreateInput,
  TalentMapDetail,
  TalentMapPerson,
  TalentMapPersonInput,
  TalentMapSummary,
} from '@/features/talentMaps/types';

export const talentMapsApi = {
  list(): Promise<TalentMapSummary[]> {
    return apiRequest('/talent-maps');
  },
  create(payload: TalentMapCreateInput): Promise<TalentMapDetail> {
    return apiRequest('/talent-maps', { method: 'POST', body: payload });
  },
  get(mapId: number): Promise<TalentMapDetail> {
    return apiRequest(`/talent-maps/${mapId}`);
  },
  update(mapId: number, payload: Partial<TalentMapCreateInput>): Promise<TalentMapDetail> {
    return apiRequest(`/talent-maps/${mapId}`, { method: 'PATCH', body: payload });
  },
  createCompany(mapId: number, payload: TalentMapCompanyInput): Promise<TalentMapCompany> {
    return apiRequest(`/talent-maps/${mapId}/companies`, { method: 'POST', body: payload });
  },
  updateCompany(companyId: number, payload: Partial<TalentMapCompanyInput>): Promise<TalentMapCompany> {
    return apiRequest(`/talent-map-companies/${companyId}`, { method: 'PATCH', body: payload });
  },
  createPerson(mapId: number, payload: TalentMapPersonInput): Promise<TalentMapPerson> {
    return apiRequest(`/talent-maps/${mapId}/people`, { method: 'POST', body: payload });
  },
  updatePerson(personId: number, payload: Partial<TalentMapPersonInput>): Promise<TalentMapPerson> {
    return apiRequest(`/talent-map-people/${personId}`, { method: 'PATCH', body: payload });
  },
};
