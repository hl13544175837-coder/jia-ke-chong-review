import { lazy } from 'react';

export const InterviewListPage = lazy(() => import('../../pages/InterviewListPage').then((module) => ({ default: module.InterviewListPage })));
export const InterviewsPage = lazy(() => import('../../pages/InterviewsPage').then((module) => ({ default: module.InterviewsPage })));
export const InterviewReportPage = lazy(() => import('../../pages/InterviewReportPage').then((module) => ({ default: module.InterviewReportPage })));
