export interface OnlineResumeChatMessage {
  sender: 'recruiter' | 'candidate' | 'system';
  text: string;
  sent_at: string;
}

export interface OnlineResumeItem {
  id: number;
  display_name: string;
  demand: { id: number; request_no: string; title: string };
  boss_account: string;
  source_platform: string;
  source_url: string;
  resume_json: Record<string, unknown>;
  chat_json: OnlineResumeChatMessage[];
  latest_chat: OnlineResumeChatMessage | null;
  created_at: string;
  updated_at: string;
}

export interface OnlineResumeListResponse {
  items: OnlineResumeItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface OnlineResumeUpdatePayload {
  display_name: string;
  resume_json: Record<string, unknown>;
}

export interface OnlineResumeDetailResponse {
  item: OnlineResumeItem;
}
