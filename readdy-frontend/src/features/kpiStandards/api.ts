import { apiRequest } from '@/lib/api';
import type { KpiStandardConfig, KpiStandardsPayload } from './types';

export const kpiStandardsApi = {
  get(): Promise<KpiStandardsPayload> {
    return apiRequest<KpiStandardsPayload>('/kpi-standards');
  },
  save(version: number, config: KpiStandardConfig): Promise<KpiStandardsPayload> {
    return apiRequest<KpiStandardsPayload>('/kpi-standards', {
      method: 'PUT',
      body: { version, config },
    });
  },
  reset(version: number): Promise<KpiStandardsPayload> {
    return apiRequest<KpiStandardsPayload>('/kpi-standards/reset', {
      method: 'POST',
      body: { version },
    });
  },
};
