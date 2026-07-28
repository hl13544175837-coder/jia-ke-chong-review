import { apiBlob, apiRequest } from '@/lib/api';
import type { AnalyticsOverview, MonthlyPerformance } from './types';

export const analyticsApi = {
  overview(): Promise<AnalyticsOverview> {
    return apiRequest('/analytics/overview');
  },
  monthlyPerformance(hrId: number, month: string): Promise<MonthlyPerformance> {
    return apiRequest(`/bi/staff/${hrId}/monthly?month=${encodeURIComponent(month)}`);
  },
  exportCsv(): Promise<Blob> {
    return apiBlob('/analytics/export');
  },
};
