export interface JobTemplateSummary {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
  status: 'active' | 'closed';
  created_at: string;
}

export interface JobTemplateDetail extends JobTemplateSummary {
  jd_text: string;
  structured: Record<string, unknown>;
  owner_hr_id: number | null;
}
