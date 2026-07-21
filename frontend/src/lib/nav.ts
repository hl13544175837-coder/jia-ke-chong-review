// Role-aware navigation definition. Later tasks plug their pages into these routes.

import {
  LayoutDashboard,
  KanbanSquare,
  BarChart3,
  ClipboardCheck,
  FileCheck2,
  Sparkles,
  SlidersHorizontal,
  Settings,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { featureNavItems } from '../app/featureRegistry';
import type { Role } from '../types';

export interface NavItem {
  to: string;
  label: string;
  labelByRole?: Partial<Record<Role, string>>;
  icon: LucideIcon;
  // Roles allowed to see this item.
  roles: Role[];
  activePaths?: string[];
  // 对应网关菜单 code（queryCurrentUserMenu 的 code）。设置后该菜单项受网关权限控制：
  // 仅当用户拥有该菜单 code 时显示。未设置则不受网关菜单权限影响（见 usePermissions 的
  // fail-open 语义）。待 zhipin 真实菜单 code 确定后逐项补齐。
  menuCode?: string;
}

// menuCode 对应网关 queryCurrentUserMenu 返回的菜单 code。已在网关为 zhipin 配置的：
// index / candidates / demands / pipeline。其余（interviews/bi/agent/agentLogs/settings）
// 待网关补配后才会显示（未授权即隐藏，见 usePermissions 的语义）。
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: '工作台',
    icon: LayoutDashboard,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
    menuCode: 'index',
  },
  ...featureNavItems,
  {
    to: '/pipeline',
    label: '候选人流程',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
    menuCode: 'pipeline',
  },
  {
    to: '/offers',
    label: 'Offer 管理',
    icon: FileCheck2,
    roles: ['recruiter', 'manager', 'admin'],
    menuCode: 'pipeline',
  },
  {
    to: '/interviews',
    label: '我的面试',
    icon: ClipboardCheck,
    roles: ['interviewer'],
    menuCode: 'interviews',
  },
  {
    to: '/bi',
    label: '进度看板',
    icon: BarChart3,
    roles: ['manager', 'admin'],
    menuCode: 'bi',
  },
  {
    to: '/kpi-standards',
    label: '流程口径',
    icon: SlidersHorizontal,
    roles: ['manager', 'admin'],
    menuCode: 'bi',
  },
  {
    to: '/agent',
    label: 'AI 助手',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin'],
    menuCode: 'agent',
  },
  {
    to: '/admin/agent-logs',
    label: 'AI 调用日志',
    icon: ScrollText,
    roles: ['admin'],
    menuCode: 'agentLogs',
  },
  {
    to: '/admin/settings',
    label: '系统设置',
    icon: Settings,
    roles: ['admin'],
    menuCode: 'settings',
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function navLabelForRole(item: NavItem, role: Role | null): string {
  if (!role) return item.label;
  return item.labelByRole?.[role] ?? item.label;
}

// Default landing route after login. All roles land on the Readdy dashboard.
export function defaultRouteForRole(): string {
  return '/dashboard';
}
