import type { CompanyRole } from './companyAuth';

export type ProductRole = CompanyRole | 'hr_director';

export interface ProductRoleInfo {
  key: ProductRole;
  label: string;
  description: string;
  avatar: string;
  department: string;
  status: string;
}

export const PRODUCT_ROLES: ProductRoleInfo[] = [
  { key: 'manager', label: '招聘主管', description: '团队招聘管理', avatar: '张', department: '人力资源部', status: '在线' },
  { key: 'recruiter', label: '招聘专员', description: '日常招聘执行', avatar: '李', department: '人力资源部', status: '在线' },
  { key: 'admin', label: '系统管理员', description: '账号与系统配置', avatar: '陈', department: 'IT 运维部', status: '在线' },
  { key: 'hr_director', label: '人力资源总监', description: '全局分析与决策', avatar: '赵', department: '人力资源部', status: '在线' },
  { key: 'interviewer', label: '业务负责人 / 面试官', description: '业务筛选与面试反馈', avatar: '周', department: '业务部门', status: '在线' },
];

export const PRODUCT_ROLE_KEYS = new Set<ProductRole>(PRODUCT_ROLES.map((role) => role.key));

export function homePathForRole(role: ProductRole | null): string {
  if (role === 'hr_director') return '/director/cockpit';
  if (role === 'interviewer') return '/interviewer/dashboard';
  return '/dashboard';
}
