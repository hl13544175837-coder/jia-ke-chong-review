export interface OnlineResumeChatMessage {
  sender: string;
  text: string;
  sent_at: string;
}

export interface OnlineResumeItem {
  id: number;
  display_name: string;
  demand: { id: number; request_no: string; title: string };
  boss_account: string;
  source_platform: string;
  source_url: string | null;
  owner_name: string;
  owner_hr_id: number;
  extracted: {
    age: string;
    gender: string;
    education_level: string;
    years_of_experience: string;
    salary_expectation: string;
    location: string;
    target_position: string;
    availability: string;
    summary: string;
  };
  resume_json: Record<string, unknown>;
  chat_json: OnlineResumeChatMessage[];
  latest_chat: OnlineResumeChatMessage | null;
  created_at: string;
  updated_at: string;
}

export interface OnlineResumeListParams {
  page?: number;
  perPage?: number;
  demandId?: number;
  gender?: string;
  ageFrom?: number;
  ageTo?: number;
  createdFrom?: string;
  createdTo?: string;
  sourcePlatform?: string;
  educationLevel?: string;
  location?: string;
  keyword?: string;
  ownerHrId?: number;
}

export interface OnlineResumeListResponse {
  items: OnlineResumeItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface OnlineResumeOwnerOption {
  id: number;
  name: string;
  email: string;
}

export interface OnlineResumeUpdatePayload {
  display_name: string;
  resume_json: Record<string, unknown>;
}

export interface OnlineResumeDetailResponse {
  item: OnlineResumeItem;
}
