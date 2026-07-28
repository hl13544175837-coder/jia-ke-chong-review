import { apiRequest } from '@/lib/api';
import type {
  NotificationListResponse,
  NotificationUnreadCountResponse,
} from './types';

export const notificationsApi = {
  list(page = 1, perPage = 20, options: { activeOnly?: boolean } = {}): Promise<NotificationListResponse> {
    const activeOnly = options.activeOnly ? '&active_only=1' : '';
    return apiRequest(`/notifications?page=${page}&per_page=${perPage}${activeOnly}`);
  },
  unreadCount(options: { activeOnly?: boolean } = {}): Promise<NotificationUnreadCountResponse> {
    return apiRequest(`/notifications/unread-count${options.activeOnly ? '?active_only=1' : ''}`);
  },
  markRead(ids?: number[]): Promise<{ status: string }> {
    return apiRequest('/notifications/mark-read', {
      method: 'POST',
      body: ids?.length ? { ids } : {},
    });
  },
};
