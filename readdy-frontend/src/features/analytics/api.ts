import { apiBlob, apiRequest } from '@/lib/api';
import type { AnalyticsOverview } from './types';

export const analyticsApi = {
  overview(): Promise<AnalyticsOverview> {
    return apiRequest('/analytics/overview');
  },
  exportCsv(): Promise<Blob> {
    return apiBlob('/analytics/export');
  },
};
