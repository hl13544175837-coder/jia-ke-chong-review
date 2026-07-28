export interface AnalyticsDemandRow {
  demand_id: number;
  request_no: string;
  title: string;
  department: string;
  headcount: number;
  onboarded: number;
  in_progress: number;
  remaining: number;
}

export interface AnalyticsOverview {
  generated_at: string;
  purpose: string;
  summary: {
    hires_month: number;
    hires_quarter: number;
    open_demands: number;
    candidate_total: number;
    headcount: number;
    onboarded: number;
    remaining_headcount: number;
    offer_accept_rate: number;
    cost_available: boolean;
  };
  funnel: { resumes: number; screened: number; interviewed: number; offered: number; hired: number };
  monthly_trends: Array<{ month: string; hires: number; offers: number }>;
  departments: Array<{ department: string; headcount: number; onboarded: number; in_progress: number }>;
  sources: Array<{ channel: string; count: number }>;
  demands: AnalyticsDemandRow[];
}
