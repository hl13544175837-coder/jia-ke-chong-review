import { apiRequest } from '@/lib/api';
import type {
  NotificationListResponse,
  NotificationUnreadCountResponse,
} from './types';

export const notificationsApi = {
  list(page = 1, perPage = 20): Promise<NotificationListResponse> {
    return apiRequest(`/notifications?page=${page}&per_page=${perPage}`);
  },
  unreadCount(): Promise<NotificationUnreadCountResponse> {
    return apiRequest('/notifications/unread-count');
  },
  markRead(ids?: number[]): Promise<{ status: string }> {
    return apiRequest('/notifications/mark-read', {
      method: 'POST',
      body: ids?.length ? { ids } : {},
    });
  },
};

