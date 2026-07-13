// Shared domain types for the HireInsight frontend.
// Mirrors the Flask backend API contract (base path: /api).

export type Role = 'recruiter' | 'manager' | 'admin' | 'interviewer';

export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected'
  | 'transferred';

export type InterviewRound =
  | 'round_1'
  | 'round_2'
  | 'round_3'
  | 'additional'
  | 'hr'
  | 'business'
  | 'technical'
  | 'interview_first'
  | 'interview_second'
  | 'interview_final';

// ---- Auth ----
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface RegisterResponse {
  id: number;
  email: string;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: Role;
  name: string;
}

// JWT payload (decoded client-side, not verified).
export interface JwtPayload {
  user_id: number;
  role: Role;
  exp: number;
}

// ---- Resume / Candidates ----
export interface ResumeUploadResultItem {
  file: string;
  status: 'ok' | 'skipped' | 'error';
  candidate_id?: number;
  reason?: string;
  target_demand_id?: number;
  target_job_id?: number;
  pipeline_joined?: boolean;
  pipeline_error?: string;
  pipeline_error_code?: string;
  pipeline_stage?: PipelineStage;
}

export interface ResumeUploadResponse {
  batch_id?: number;
  total: number;
  results: ResumeUploadResultItem[];
}

export interface CandidateTag {
  tag: string;
  score: number;
}

// Resume JSON is backend-defined and free-form; kept as a record.
export type ResumeJson = Record<string, unknown>;
export type ParseStatus = 'pending' | 'processing' | 'ok' | 'failed';

export interface CandidateSourceInfo {
  batch_id: number;
  channel: string;
  source_link: string;
  referrer: string;
  target_demand_id: number | null;
  target_demand_request_no: string | null;
  target_job_id: number | null;
  target_job_title: string | null;
  target_job_city: string;
  target_job_department: string;
  note: string;
  created_at: string | null;
}

export interface CandidateDetail {
  id: number;
  name_masked: string;
  owner_hr_id: number;
  resume_json: ResumeJson;
  tags: CandidateTag[];
  parse_status?: ParseStatus;
  parse_error?: string | null;
  source?: CandidateSourceInfo | null;
  created_at: string;
  rematched_jobs?: { id: number; title: string }[];
}

export interface CandidateProfileUpdateRequest {
  profile: ResumeJson;
  skills?: CandidateTag[];
}

export interface RetryParseResponse {
  candidate_id: number;
  name_masked: string;
  parse_status: ParseStatus;
  parse_error: string | null;
  resume_json: ResumeJson;
  tags: CandidateTag[];
}

export interface CandidateListItem {
  id: number;
  name_masked: string;
  email_masked?: string;
  phone_masked?: string;
  owner_hr_id: number;
  created_at: string;
  parse_status?: ParseStatus;
  parse_error?: string | null;
  tag_count: number;
  top_tags?: CandidateTag[];
  max_score?: number;
  intent_city?: string;
  latest_experience?: {
    company: string;
    position: string;
    duration: string;
  } | null;
  education_summary?: string;
  source?: CandidateSourceInfo | null;
}

export interface CandidateListQuery {
  search?: string;
  stage?: PipelineStage;
  job_id?: number;
  city?: string;
  source_channel?: string;
  parse_status?: ParseStatus;
  pipeline_status?: 'in_pipeline' | 'not_in_pipeline';
  sort_by?: 'created_at' | 'name_masked';
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface CandidateListResponse {
  candidates: CandidateListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface CandidateOwnerOption {
  id: number;
  name: string;
  email: string;
}

// ---- Jobs ----
export interface CreateJobRequest {
  title: string;
  jd_text: string;
  city?: string;
  department?: string;
  job_code?: string;
  // Optional HR answers to AI clarification questions, folded into the JD.
  clarifications?: JdClarificationAnswer[];
}

// A single AI clarification question about a JD.
export interface JdClarificationQuestion {
  field: string;
  question: string;
  placeholder?: string;
}

// HR's answer to one clarification question.
export interface JdClarificationAnswer {
  question: string;
  answer: string;
}

export interface JdClarifyResponse {
  questions: JdClarificationQuestion[];
  warning?: string;
}

export type JobStructured = Record<string, unknown>;

export interface CreateJobResponse {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
  status: string;
  structured: JobStructured;
}

export interface JobListItem {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
  status: 'active' | 'closed' | string;
  created_at: string;
}

// Full job detail incl. structured JD and lifecycle status.
export interface JobDetail {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
  jd_text: string;
  structured: JobStructured;
  status: string;
  owner_hr_id?: number;
  created_at?: string;
}

// ---- Recruitment demands ----
export type DemandPriority = 'A' | 'B' | 'C';
export type DemandStatus = 'pending' | 'active' | 'paused' | 'filled' | 'cancelled' | 'closed';

export interface RecruitmentDemandMetrics {
  recommended_count: number;
  business_review_count: number;
  interview_count: number;
  offer_count: number;
  onboarded_count: number;
  transferred_count: number;
  current_stage_counts: Partial<Record<PipelineStage | string, number>>;
}

export interface RecruitmentDemand {
  id: number;
  job_id: number;
  job_title: string;
  job_city: string;
  job_department: string;
  job_code: string;
  owner_hr_id: number;
  owner_hr_name: string;
  default_interviewer_id: number | null;
  default_interviewer_name: string | null;
  request_no: string;
  requester_name: string;
  requester_department: string;
  hiring_manager_name: string;
  requested_at: string | null;
  accepted_at: string | null;
  target_date: string | null;
  priority: DemandPriority;
  headcount: number;
  status: DemandStatus;
  close_reason: string;
  downgrade_reason: string;
  note: string;
  metrics: RecruitmentDemandMetrics;
  risk_flags: string[];
  completion_suggested: boolean;
  jd_text?: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface RecruitmentDemandInput {
  job_id?: number;
  job_title?: string;
  jd_text?: string;
  owner_hr_id: number;
  default_interviewer_id?: number | null;
  city: string;
  request_no?: string;
  requester_name?: string;
  requester_department: string;
  hiring_manager_name: string;
  requested_at: string;
  accepted_at?: string;
  target_date: string;
  priority?: DemandPriority;
  headcount: number;
  status?: DemandStatus;
  note?: string;
}

export interface DemandListQuery {
  status?: DemandStatus | 'all';
  q?: string;
  department?: string;
  city?: string;
  owner_hr_id?: number;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
  sort?: 'created_at_desc' | 'created_at_asc';
}

export interface DemandListResponse {
  items: RecruitmentDemand[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DemandOwnerTransferInput {
  owner_hr_id: number;
  reason: string;
}

export interface DemandCloseInput {
  status: 'filled' | 'cancelled' | 'paused' | 'closed';
  close_reason: string;
}

export interface DemandDowngradeInput {
  priority: DemandPriority;
  downgrade_reason: string;
}

export interface DemandRestoreInput {
  note: string;
}

// ---- Talent map ----
export type TalentMapBoardJson = Record<string, unknown>;

export interface TalentMapCompany {
  id: number;
  map_id: number;
  company_name: string;
  city: string;
  region: string;
  industry: string;
  priority: string;
  note: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface TalentMapPerson {
  id: number;
  map_id: number;
  company_id: number | null;
  company_name: string;
  name: string;
  title: string;
  city: string;
  tags: string[];
  salary_range: string;
  contact_status: string;
  evaluation: string;
  source: string;
  next_follow_at: string | null;
  note: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface TalentMapSummary {
  id: number;
  name: string;
  job_id: number | null;
  job_title: string;
  department: string;
  owner_hr_id: number;
  companies_count: number;
  people_count: number;
  updated_at: string | null;
}

export interface TalentMap extends TalentMapSummary {
  board_json: TalentMapBoardJson;
  companies: TalentMapCompany[];
  people: TalentMapPerson[];
  created_at: string | null;
}

export interface TalentMapInput {
  name: string;
  job_id?: number | null;
  department?: string;
  board_json?: TalentMapBoardJson;
}

export interface TalentMapCompanyInput {
  company_name: string;
  city?: string;
  region?: string;
  industry?: string;
  priority?: string;
  note?: string;
}

export interface TalentMapPersonInput {
  company_id?: number | null;
  name: string;
  title?: string;
  city?: string;
  tags?: string[];
  salary_range?: string;
  contact_status?: string;
  evaluation?: string;
  source?: string;
  next_follow_at?: string;
  note?: string;
}

export interface TalentMapFilters {
  company?: string;
  city?: string;
  status?: string;
  keyword?: string;
}

// ---- Matching ----
export interface MatchResultItem {
  candidate_id: number;
  name_masked: string;
  score: number;
  matched_tags: string[];
  missing_tags: string[];
}

export interface MatchResponse {
  job_id: number;
  results: MatchResultItem[];
}

export interface BatchAddToPipelineResponse {
  demand_id: number;
  job_id: number;
  added: number;
  skipped_existing: number;
  skipped_missing: number;
  skipped_conflict: number;
  failures: Array<{ candidate_id: number; code: string; error: string }>;
}

// ---- Interview ----
export interface InterviewStartRequest {
  candidate_id: number;
  demand_id: number;
  // Legacy fallback only. New screens always send demand_id.
  job_id?: number;
  count?: number;
}

export interface InterviewStartResponse {
  candidate_id: number;
  demand_id: number | null;
  job_id: number;
  questions: string[];
}

export interface QaPair {
  q: string;
  a: string;
}

export interface InterviewSubmitRequest {
  candidate_id: number;
  demand_id: number;
  // Legacy fallback only. New screens always send demand_id.
  job_id?: number;
  qa_pairs: QaPair[];
}

export interface InterviewReportDetail {
  score: number;
  highlight: string;
  concern: string;
  pass_recommended: boolean;
}

export interface InterviewReport {
  avg_score: number;
  pass_recommended: boolean;
  details: InterviewReportDetail[];
}

export interface InterviewSubmitResponse {
  interview_id: number;
  demand_id: number | null;
  report: InterviewReport;
  decision_required: boolean;
  pipeline_changed: false;
}

export interface InterviewRecord {
  id: number;
  candidate_id: number;
  demand_id: number | null;
  job_id: number;
  score: number;
  pass_recommended: boolean;
  ai_report: InterviewReport;
  created_at: string;
}

// ---- Pipeline ----
export interface PipelineMoveRequest {
  candidate_id: number;
  demand_id?: number;
  job_id?: number;
  stage: PipelineStage;
  note?: string;
  disposition?: CandidateDispositionInput;
}

export interface PipelineMoveResponse {
  status: string;
  stage: PipelineStage;
  from: PipelineStage | null;
  candidate_id: number;
  demand_id: number;
  job_id: number;
  name_masked: string;
}

export interface PipelineTransferRequest {
  candidate_id: number;
  from_demand_id: number;
  to_demand_id: number;
  reason: string;
}

export interface PipelineTransferResponse {
  status: string;
  candidate_id: number;
  name_masked: string;
  from_demand_id: number;
  to_demand_id: number;
  from_job_id: number;
  to_job_id: number;
  source_terminal_stage: 'transferred';
  to_stage: 'pending';
}

export interface CandidateDispositionInput {
  reason?: string;
  enter_talent_pool?: boolean;
  next_contact_at?: string;
  tags?: string[];
  note?: string;
}

export interface OfferRecord {
  id?: number;
  candidate_id: number;
  demand_id: number;
  job_id: number;
  salary_range: string;
  onboard_date: string | null;
  approval_status: 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'declined' | string;
  note: string;
  updated_at?: string | null;
}

// Map of stage -> count. Keys are PipelineStage values.
export type PipelineCounts = Partial<Record<PipelineStage, number>>;

// A single candidate currently sitting in a job's pipeline (at their latest stage).
export interface PipelineBoardCandidate {
  candidate_id: number;
  name_masked: string;
  stage: PipelineStage;
  updated_at: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

// Full board payload for one job: candidates bucketed by their current stage.
export interface PipelineBoard {
  demand_id?: number;
  job_id: number;
  job_title: string;
  stage_order: PipelineStage[];
  candidates: PipelineBoardCandidate[];
}

// One step in a candidate's stage-transition timeline for a job.
export interface PipelineHistoryStep {
  stage: PipelineStage;
  ts: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

export interface PipelineHistory {
  job_id: number;
  candidate_id: number;
  timeline: PipelineHistoryStep[];
}

// ---- BI ----
// 漏斗按当前阶段计数。MVP 主流程只保留一个"面试中"阶段。
export interface BiFunnel {
  pending?: number;
  ai_screen?: number;
  business_review?: number;
  interview?: number;
  offer?: number;
  onboarded?: number;
  rejected?: number;
  transferred?: number;
  pipeline_total?: number;
  archived_total?: number;
  funnel_total?: number;
  conversion_rate: number;
}

export interface BiDemandScope {
  type: 'demand';
  demand_id: number;
  job_id: number;
}

export interface BiDemandSummary {
  id: number;
  job_id: number;
  title: string;
  department: string;
  city: string;
  status: DemandStatus | string;
  target_date: string | null;
}

export interface BiDemandStageAge {
  candidate_id: number;
  candidate_name: string;
  stage: PipelineStage | string;
  stage_label: string;
  age_days: number;
  updated_at: string | null;
  last_actor_id: number | null;
  last_actor_name: string | null;
}

export interface BiDemandOutstandingFeedbackItem {
  assignment_id: number;
  candidate_id: number;
  candidate_name: string;
  round: InterviewRound | string;
  round_sequence: number;
  is_primary: boolean;
  interviewer_id: number;
  interviewer_name: string | null;
  scheduled_at: string | null;
  overdue_days: number;
}

export interface BiDemandOutstandingFeedback {
  count: number;
  items: BiDemandOutstandingFeedbackItem[];
}

export interface BiDemandOfferItem {
  id: number;
  candidate_id: number;
  approval_status: string;
  onboard_date: string | null;
}

export interface BiDemandOffers {
  total: number;
  by_status: Record<string, number>;
  items: BiDemandOfferItem[];
}

export interface BiDemandHc {
  headcount: number;
  onboarded_count: number;
  remaining: number;
  completion_rate: number;
  completion_suggested: boolean;
}

export interface BiDemandCurrentResponsibility {
  owner_hr_id: number | null;
  owner_name: string | null;
  label: string;
  active_candidates: number;
  outstanding_feedback: number;
  note: string;
}

export interface BiDemandOperationalMetrics {
  scope: BiDemandScope;
  purpose: 'operational_collaboration';
  purpose_label: string;
  demand: BiDemandSummary;
  funnel: BiFunnel;
  stage_age: BiDemandStageAge[];
  outstanding_feedback: BiDemandOutstandingFeedback;
  offers: BiDemandOffers;
  hc: BiDemandHc;
  current_responsibility: BiDemandCurrentResponsibility;
}

export interface BiOperationalFunnel {
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
}

export interface BiOverviewDemandSummary {
  demand_id: number;
  job_id: number;
  title: string;
  department: string;
  city: string;
  status: DemandStatus | string;
  target_date: string | null;
  owner_hr_id: number | null;
  owner_name: string | null;
  funnel: BiOperationalFunnel;
  outstanding_feedback: number;
  hc: BiDemandHc;
}

export interface BiOperationalWorkload {
  active_demands: number;
  active_candidates: number;
  business_review: number;
  interview: number;
  offer: number;
  outstanding_feedback: number;
}

export interface BiManagerAlert {
  kind: string;
  priority: 'high' | 'medium' | 'low' | string;
  title: string;
  detail: string;
  demand_id: number;
  job_id: number;
  candidate_id: number | null;
  candidate_name?: string;
  assignment_id?: number;
  interviewer_id?: number | null;
  interviewer_name?: string | null;
  stage: PipelineStage | string | null;
  stage_label?: string;
  age_days: number;
  owner_hr_id: number | null;
  owner_name: string | null;
  action_path: string;
}

export interface BiOverview {
  purpose: 'operational_collaboration';
  purpose_label: string;
  funnel: BiOperationalFunnel;
  alerts: BiManagerAlert[];
  demands: BiOverviewDemandSummary[];
}

export interface BiStaffDetail {
  purpose: 'operational_collaboration';
  purpose_label: string;
  hr_id: number;
  name: string | null;
  workload: BiOperationalWorkload;
  demands: BiOverviewDemandSummary[];
}

// Legacy single-Job proxy for a uniquely resolved Demand.
export interface BiJobDetail extends BiDemandOperationalMetrics {
  job_id: number;
  job_title: string;
  compatibility: {
    mode: 'single_demand';
    aggregate: false;
  };
}

// ---- Account ----
export interface MeResponse {
  id: number;
  name: string;
  email: string;
  role: Role;
}

// ---- Admin user management ----
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string | null;
}

export interface AdminUserCreateInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

// ---- Admin AI architecture dashboard ----
export interface AdminAiTool {
  name: string;
  description: string;
  params: Record<string, string>;
  rbac?: Role[];
  write?: boolean;
}

export interface AdminAiArchitectureLayer {
  name: string;
  description: string;
  files: string[];
}

export interface AdminAiPermissionModel {
  database_access: boolean;
  read_tools_available_to_authenticated_users: boolean;
  read_scope_note: string;
  write_requires_confirmation: boolean;
  write_scope_note: string;
  cannot_do: string[];
}

export interface AdminAiArchitecture {
  title: string;
  purpose: string;
  system_prompt: string;
  read_tools: AdminAiTool[];
  write_tools: AdminAiTool[];
  architecture: AdminAiArchitectureLayer[];
  permission_model: AdminAiPermissionModel;
  safeguards: string[];
  recommended_next_steps: string[];
}

export interface AuditLogItem {
  id: number;
  source: 'event';
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  payload: Record<string, unknown>;
  ts: string | null;
}

export interface AuditLogResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface AuditLogQuery {
  page?: number;
  per_page?: number;
  actor_id?: number;
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
}

export interface NotificationItem {
  id: number;
  demand_id: number | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  unread_count: number;
}

export interface InterviewerOption {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface InterviewAssignment {
  id: number;
  candidate_id: number;
  name_masked: string | null;
  demand_id: number | null;
  job_id: number;
  job_title: string | null;
  round: InterviewRound;
  round_sequence: number;
  is_primary: boolean;
  interviewer_id: number;
  interviewer_name: string | null;
  scheduled_at: string | null;
  location: string;
  note: string;
  status: string;
  feedback_submitted: boolean;
  is_overdue: boolean;
  created_by_name: string | null;
  created_at: string | null;
}

export interface InterviewAssignmentInput {
  candidate_id: number;
  demand_id: number;
  // Kept optional for the unique-Demand legacy bridge; new UI does not send it.
  job_id?: number;
  round: InterviewRound;
  round_sequence: number;
  is_primary: boolean;
  interviewer_id: number;
  scheduled_at?: string;
  location?: string;
  note?: string;
}

// ---- Interview list + feedback ----
export interface InterviewListItem {
  id: number;
  type: 'ai' | 'feedback';
  candidate_id: number;
  name_masked: string | null;
  demand_id: number | null;
  assignment_id?: number | null;
  job_id: number;
  job_title: string | null;
  score: number | null;
  pass: boolean | null;
  round: string | null;
  interviewer_id: number | null;
  interviewer_name: string | null;
  evaluation: EvaluationScores | null;
  reason_tags: string[];
  strengths: string | null;
  concerns: string | null;
  note: string | null;
  created_at: string | null;
}

export type EvaluationScores = Record<string, number>;

export interface InterviewFeedbackInput {
  candidate_id: number;
  demand_id: number;
  assignment_id: number;
  // Kept optional for the unique-Demand legacy bridge; new UI does not send it.
  job_id?: number;
  round: InterviewRound;
  score: number;
  passed: boolean;
  evaluation?: EvaluationScores;
  reason_tags?: string[];
  strengths?: string;
  concerns?: string;
  note?: string;
}

/** Compatibility payload for a legacy entry point when the backend can resolve one unique Demand. */
export interface LegacyInterviewFeedbackInput {
  candidate_id: number;
  job_id: number;
  demand_id?: never;
  assignment_id: number;
  round: InterviewRound;
  score: number;
  passed: boolean;
  evaluation?: EvaluationScores;
  reason_tags?: string[];
  strengths?: string;
  concerns?: string;
  note?: string;
}

export interface InterviewFeedbackResponse {
  id: number;
  status: string;
  deduplicated: boolean;
  round_completed: boolean;
  next_action: 'awaiting_hr_decision' | 'awaiting_primary_feedback';
}

export interface InterviewGuide {
  candidate_id: number;
  demand_id: number | null;
  job_id: number;
  round: InterviewRound;
  focus: string[];
  questions: string[];
  risks: string[];
  required_checks: string[];
}

// ---- Candidate pipeline context / journey (M4/M5) ----
export interface CandidatePipelineItem {
  demand_id: number;
  job_id: number;
  job_title: string;
  department: string;
  city: string;
  demand_status: DemandStatus;
  stage: PipelineStage;
  updated_at: string | null;
}

export interface CandidatePipelines {
  candidate_id: number;
  name_masked: string;
  pipelines: CandidatePipelineItem[];
}

export interface JourneyTimelineStep {
  stage: PipelineStage;
  ts: string | null;
  note: string | null;
  updated_by_name: string | null;
}

export interface JourneyAiInterview {
  id: number;
  score: number | null;
  pass: boolean | null;
  created_at: string | null;
}

export interface JourneyFeedback {
  id: number;
  round: string | null;
  score: number | null;
  passed: boolean | null;
  strengths: string | null;
  concerns: string | null;
  evaluation: EvaluationScores;
  reason_tags: string[];
  note: string | null;
  interviewer_name: string | null;
  created_at: string | null;
}

export interface JourneyDisposition {
  id: number;
  reason: string;
  enter_talent_pool: boolean;
  next_contact_at: string | null;
  tags: string[];
  note: string;
  created_by_name: string | null;
  created_at: string | null;
}

export interface DecisionSummary {
  current_stage: PipelineStage | null;
  feedback_count: number;
  passed_count: number;
  failed_count: number;
  average_score: number | null;
  ai_interview_count: number;
  highlights: string[];
  risks: string[];
  recommendation: string;
}

export interface CandidateJourney {
  candidate_id: number;
  name_masked: string;
  demand_id: number;
  job_id: number;
  job_title: string | null;
  timeline: JourneyTimelineStep[];
  ai_interviews: JourneyAiInterview[];
  feedback: JourneyFeedback[];
  dispositions: JourneyDisposition[];
  decision_summary: DecisionSummary;
}

// ── BOSS 直聘集成（boss-cli 招聘端）──────────────────────────────
// 后端统一返回 {ok, data, error?}；此处 data 的形态依接口而定，统一用宽松类型。
// boss status --json 的裸 dict
export interface BossStatus {
  authenticated: boolean;
  credential_present?: boolean;
  cookie_count?: number;
  cookies?: string[];
  search_authenticated?: boolean;
  recommend_authenticated?: boolean;
  reason?: string | null;
}

// 招聘端在招职位条目（字段来自 boss-cli recruiter jobs）
export interface BossJob {
  jobName?: string;
  salaryDesc?: string;
  address?: string;
  encryptJobId?: string;
  [k: string]: unknown;
}

// 搜索/推荐候选人条目（字段名随 boss-cli 返回，统一宽松）
export interface BossCandidate {
  name?: string;
  geekName?: string;
  expectPositionName?: string;
  jobName?: string;
  workYearDesc?: string;
  workYear?: string | number;
  degreeDesc?: string;
  degree?: string | number;
  encryptGeekId?: string;
  encryptUid?: string;
  encryptFriendId?: string;
  friendId?: number;
  securityId?: string;
  salaryDesc?: string;
  lastTime?: string;
  newGeek?: boolean;
  sourceType?: number;
  [k: string]: unknown;
}

export interface BossRecommendParams {
  job?: string;
  limit?: number;
  page?: number;
}

export interface BossInboxParams {
  job?: string;
  label?: number;
  limit?: number;
  page?: number;
}

// BOSS 账号（多账号，不含 cookies 明文）
export interface BossAccount {
  id: number;
  label: string;
  cookie_count: number;
  is_active: boolean;
  last_verified_at: string | null;
  last_verified_ok: boolean | null;
  created_at: string | null;
}

// ── 招聘闭环：批量导入 / AI 初筛 ──────────────────────────────────
// 批量导入单条入参（来自收件箱列表勾选）
export interface BossImportItem {
  geek_id: string;
  name?: string;
  security_id?: string;
  friend_id?: number;
  job?: string;
}

export interface BossBatchImportParams {
  items: BossImportItem[];
  target_job_id?: number;
  boss_job?: string;
  limit?: number;
  interval_sec?: number;
}

export interface BossImportResultItem {
  geek_id: string;
  name?: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  code?: string;
  candidate_id?: number;
  target_job_id?: number | null;
}

export interface BossBatchImportResult {
  batch_id: number;
  imported: number;
  skipped: number;
  failed: number;
  stopped_reason: string | null;
  results: BossImportResultItem[];
}

export interface BossAiScreenParams {
  candidate_ids: number[];
  job_id: number;
}

export interface BossScreenResultItem {
  candidate_id: number;
  name?: string;
  status: 'ok' | 'error';
  reason?: string;
  score?: number | null;
  pass_recommended?: boolean;
  summary?: string;
  highlights?: string[];
  concerns?: string[];
}

export interface BossAiScreenResult {
  screened: number;
  failed: number;
  results: BossScreenResultItem[];
}

// ---- AI 助手会话与调用日志 ----

export interface ConversationSummary {
  id: number;
  title: string;
  title_source?: string;
  archived?: boolean;
  created_at: string | null;
  updated_at: string | null;
  message_count: number;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  page: number;
  per_page: number;
  total: number;
}

export interface ConversationDetailMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }> | null;
  thoughts?: string[] | null;
  created_at: string | null;
}

export interface ConversationDetail {
  id: number;
  title: string;
  title_source?: string;
  archived?: boolean;
  messages: ConversationDetailMessage[];
}

export interface CreateConversationResponse {
  id: number;
  title: string;
  archived: boolean;
  title_source: string;
  created_at: string | null;
}

export interface UpdateConversationResponse {
  id: number;
  title: string;
  title_source: string;
  archived: boolean;
  updated_at: string | null;
}

export interface AgentCallLogItem {
  id: number;
  conversation_id: number | null;
  message_id: number | null;
  user_id: number;
  role: string;
  kind: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  status: string;
  error_msg: string | null;
  tool_calls: unknown;
  thoughts: unknown;
  input_text: string | null;
  output_text: string | null;
  created_at: string | null;
}

export interface CallLogListResponse {
  items: AgentCallLogItem[];
  page: number;
  per_page: number;
  total: number;
}

export interface CallLogQuery {
  conversation_id?: number;
  status?: string;
  kind?: string;
  user_id?: number;
  page?: number;
  per_page?: number;
}
