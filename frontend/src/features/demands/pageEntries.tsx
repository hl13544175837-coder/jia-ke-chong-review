import { lazy } from 'react';

export const JobsPage = lazy(() => import('../../pages/JobsPage').then((module) => ({ default: module.JobsPage })));
export const JobMatchPage = lazy(() => import('../../pages/JobMatchPage').then((module) => ({ default: module.JobMatchPage })));
