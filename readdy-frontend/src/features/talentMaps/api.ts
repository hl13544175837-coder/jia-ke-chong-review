import { apiRequest } from '@/lib/api';
import type {
  ImportConfirmItem,
  TalentMapContactLog,
  ImportConfirmResult,
  ImportPreviewResult,
  ResumeCandidateItem,
  TalentMapCompany,
  TalentMapCompanyInput,
  TalentMapCreateInput,
  TalentMapDetail,
  TalentMapOrganizationDepartmentDraft,
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
  updateOrganization(mapId: number, payload: {
    company_id: number;
    departments: TalentMapOrganizationDepartmentDraft[];
  }): Promise<TalentMapDetail> {
    return apiRequest(`/talent-maps/${mapId}/organization`, { method: 'PATCH', body: payload });
  },
  createCompany(mapId: number, payload: TalentMapCompanyInput): Promise<TalentMapCompany> {
    return apiRequest(`/talent-maps/${mapId}/companies`, { method: 'POST', body: payload });
  },
  bulkCreateCompanies(mapId: number, items: Array<{ company_name: string; industry?: string; city?: string; note?: string }>): Promise<{ created: TalentMapCompany[]; count: number; skipped: number }> {
    return apiRequest(`/talent-maps/${mapId}/companies/bulk`, { method: 'POST', body: { items } });
  },
  listContactLogs(personId: number): Promise<TalentMapContactLog[]> {
    return apiRequest(`/talent-map-people/${personId}/contact-logs`);
  },
  addContactLog(personId: number, payload: { content: string; contact_at?: string; next_follow_at?: string }): Promise<TalentMapPerson> {
    return apiRequest(`/talent-map-people/${personId}/contact-logs`, { method: 'POST', body: payload });
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

  /* ---------- AI 从简历库导入 ---------- */
  resumeCandidates(mapId: number, keyword = ''): Promise<{ items: ResumeCandidateItem[]; total: number }> {
    const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    return apiRequest(`/talent-maps/${mapId}/resume-candidates${query}`);
  },
  previewImport(mapId: number, candidateIds: number[]): Promise<ImportPreviewResult> {
    return apiRequest(`/talent-maps/${mapId}/import/preview`, {
      method: 'POST',
      body: { candidate_ids: candidateIds },
    });
  },
  confirmImport(mapId: number, items: ImportConfirmItem[]): Promise<ImportConfirmResult> {
    return apiRequest(`/talent-maps/${mapId}/import/confirm`, {
      method: 'POST',
      body: { items },
    });
  },
};
