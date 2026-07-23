import { lazy } from 'react';

export const UploadPage = lazy(() => import('../../pages/UploadPage').then((module) => ({ default: module.UploadPage })));
