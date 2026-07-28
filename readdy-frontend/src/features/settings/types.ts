export type AdminRole = 'recruiter' | 'interviewer' | 'manager' | 'admin';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  department: string;
  is_active: boolean;
  created_at: string | null;
}

export interface OrganizationSettingsConfig {
  company_name: string;
  system_name: string;
  default_recruitment_cycle_days: number;
  offer_validity_days: number;
  departments: string[];
}

export interface OrganizationSettings {
  config: OrganizationSettingsConfig;
  version: number;
  updated_by: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
  permission_mode: 'server_enforced';
  pipeline_mode: 'server_enforced';
}
