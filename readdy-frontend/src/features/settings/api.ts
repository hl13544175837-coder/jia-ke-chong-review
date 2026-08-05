import { apiRequest } from '@/lib/api';
import type { AdminRole, AdminUser, OrganizationSettings, OrganizationSettingsConfig } from './types';

export const settingsApi = {
  getSettings(): Promise<OrganizationSettings> {
    return apiRequest('/admin/settings');
  },
  saveSettings(version: number, config: OrganizationSettingsConfig): Promise<OrganizationSettings> {
    return apiRequest('/admin/settings', { method: 'PUT', body: { version, config } });
  },
  listUsers(): Promise<AdminUser[]> {
    return apiRequest('/admin/users');
  },
  createUser(input: { name: string; email: string; password: string; role: AdminRole; department: string }): Promise<AdminUser> {
    return apiRequest('/admin/users', { method: 'POST', body: input });
  },
  updateUser(userId: number, input: Partial<Pick<AdminUser, 'name' | 'role' | 'department' | 'is_active'>>): Promise<AdminUser> {
    return apiRequest(`/admin/users/${userId}`, { method: 'PATCH', body: input });
  },
  resetUserPassword(userId: number, password: string): Promise<{ status: 'ok'; id: number }> {
    return apiRequest(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: { password },
    });
  },
};
