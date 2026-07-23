import { lazy } from 'react';

export const DashboardPage = lazy(() => import('../../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
export const NotificationCenterPage = lazy(() => import('../../pages/NotificationCenterPage').then((module) => ({ default: module.NotificationCenterPage })));
