export interface AnalyticsCandidateRow {
  candidate_id: number;
  candidate_name: string;
  stage: string;
  stage_label: string;
  age_days: number;
  updated_at: string | null;
  last_actor_id: number | null;
  last_actor_name: string | null;
  hired_this_month: boolean;
  hired_this_quarter: boolean;
  offer_issued: boolean;
  offer_accepted: boolean;
}

export interface AnalyticsDemandRow {
  demand_id: number;
  request_no: string;
  title: string;
  department: string;
  headcount: number;
  onboarded: number;
  in_progress: number;
  remaining: number;
  over_headcount: number;
  owner_hr_id: number | null;
  owner_name: string;
  start_date: string | null;
  target_date: string | null;
  days_open: number;
  risk_flags: string[];
  outstanding_feedback: number;
  candidates: AnalyticsCandidateRow[];
  funnel: {
    pending: number;
    ai_screen: number;
    business_review: number;
    interview: number;
    offer: number;
    onboarded: number;
    rejected: number;
    transferred: number;
    pipeline_total: number;
    archived_total: number;
    funnel_total: number;
  };
  hires_month: number;
  hires_quarter: number;
  offers_issued: number;
  offers_accepted: number;
}

export interface AnalyticsHiredRecord {
  offer_id: number;
  candidate_id: number;
  demand_id: number;
  candidate_name: string;
  position: string;
  department: string;
  source_channel: string;
  onboard_date: string | null;
  recruitment_days: number | null;
}

export interface AnalyticsCycleRow {
  demand_id: number;
  position: string;
  department: string;
  average_days: number;
  fastest_days: number;
  slowest_days: number;
  hired_count: number;
}

export type AnalyticsAttentionType = 'requisition' | 'offer' | 'budget' | 'overdue' | 'feedback' | 'expiring';

export interface AnalyticsAttentionItem {
  id: string;
  type: AnalyticsAttentionType;
  title: string;
  department: string;
  applicant: string;
  submitted_at: string | null;
  urgency: 'urgent' | 'normal' | 'low';
  detail: string;
  days_remaining: number | null;
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
    average_cycle_days: number | null;
    fastest_cycle_days: number | null;
    slowest_cycle_days: number | null;
    attention_count: number;
  };
  funnel: { resumes: number; screened: number; interviewed: number; offered: number; hired: number };
  monthly_trends: Array<{ month: string; hires: number; offers: number }>;
  departments: Array<{ department: string; headcount: number; onboarded: number; in_progress: number }>;
  sources: Array<{ channel: string; count: number }>;
  demands: AnalyticsDemandRow[];
  hired_records: AnalyticsHiredRecord[];
  cycle_rows: AnalyticsCycleRow[];
  attention_items: AnalyticsAttentionItem[];
}

export interface MonthlyPerformanceFunnel {
  resumes: number;
  screened: number;
  business_review: number;
  interview: number;
  offer: number;
  hired: number;
}

export interface MonthlyPerformanceConversionRates {
  resume_to_screened: number | null;
  screened_to_business_review: number | null;
  business_review_to_interview: number | null;
  interview_to_offer: number | null;
  offer_to_hired: number | null;
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
  conversion_rates: MonthlyPerformanceConversionRates;
  overall_conversion_rate: number | null;
}

export interface MonthlyPerformance {
  month: string;
  purpose: string;
  owner: { id: number; name: string; department: string };
  summary: {
    demand_count: number;
    funnel: MonthlyPerformanceFunnel;
    conversion_rates: MonthlyPerformanceConversionRates;
    overall_conversion_rate: number | null;
    progress_count: number;
  };
  demands: MonthlyPerformanceDemand[];
}
