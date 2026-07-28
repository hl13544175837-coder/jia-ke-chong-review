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

export interface MonthlyPerformanceFunnel {
  resumes: number;
  screened: number;
  business_review: number;
  interview: number;
  offer: number;
  hired: number;
}

export interface MonthlyPerformanceDemand {
  demand_id: number;
  request_no: string;
  title: string;
  department: string;
  city: string;
  status: string;
  headcount: number;
  funnel: MonthlyPerformanceFunnel;
  conversion_rates: Record<string, number>;
  overall_conversion_rate: number;
}

export interface MonthlyPerformance {
  month: string;
  purpose: string;
  owner: { id: number; name: string; department: string };
  summary: {
    demand_count: number;
    funnel: MonthlyPerformanceFunnel;
    conversion_rates: Record<string, number>;
    overall_conversion_rate: number;
    progress_count: number;
  };
  demands: MonthlyPerformanceDemand[];
}
