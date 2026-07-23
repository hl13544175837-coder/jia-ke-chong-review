import { lazy } from 'react';

export const BiPage = lazy(() => import('../../pages/BiPage').then((module) => ({ default: module.BiPage })));
