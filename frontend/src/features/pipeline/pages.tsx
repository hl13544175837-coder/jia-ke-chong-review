import { lazy } from 'react';

export const PipelinePage = lazy(() => import('../../pages/PipelinePage').then((module) => ({ default: module.PipelinePage })));
