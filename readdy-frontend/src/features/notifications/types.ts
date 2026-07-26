export interface NotificationItem {
  id: number;
  demand_id: number | null;
  type: string;
  title: string;
  body: string;
  link: string;
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

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

