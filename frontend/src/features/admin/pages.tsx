import { lazy } from 'react';

export const UsersPage = lazy(() => import('../../pages/admin/UsersPage').then((module) => ({ default: module.UsersPage })));
export const SystemSettingsPage = lazy(() => import('../../pages/admin/SystemSettingsPage').then((module) => ({ default: module.SystemSettingsPage })));
export const AiArchitecturePage = lazy(() => import('../../pages/admin/AiArchitecturePage').then((module) => ({ default: module.AiArchitecturePage })));
export const AgentCallLogsPage = lazy(() => import('../../pages/admin/AgentCallLogsPage').then((module) => ({ default: module.AgentCallLogsPage })));
