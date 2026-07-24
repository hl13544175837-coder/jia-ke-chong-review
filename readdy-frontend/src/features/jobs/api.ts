import { apiRequest } from '@/lib/api';
import type { JobTemplateDetail, JobTemplateSummary } from './types';

export const jobsApi = {
  listTemplates(): Promise<JobTemplateSummary[]> {
    return apiRequest('/jobs?status=active');
  },
  getTemplate(jobId: number): Promise<JobTemplateDetail> {
    return apiRequest(`/jobs/${jobId}`);
  },
};
