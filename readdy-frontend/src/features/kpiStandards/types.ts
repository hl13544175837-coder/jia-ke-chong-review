export interface BlockCategoryRule {
  id: string;
  name: string;
  keywords: string[];
}

export interface RiskThresholds {
  deadline_warning_days: number;
  stale_stage_days: number;
  no_recommendation_days: number;
  low_interview_candidate_threshold: number;
  open_too_long_days: number;
  high_if_status_paused_or_closed: boolean;
  high_if_zero_fill_and_blocked: boolean;
  medium_if_blocked: boolean;
  medium_fill_ratio_threshold: number;
}

export interface HealthThresholds {
  green_threshold: number;
  yellow_threshold: number;
}

export interface KpiStandardConfig {
  block_categories: BlockCategoryRule[];
  risk_thresholds: RiskThresholds;
  health_thresholds: HealthThresholds;
}

export interface KpiStandardsPayload {
  config: KpiStandardConfig;
  version: number;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}
