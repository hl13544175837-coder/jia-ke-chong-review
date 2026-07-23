import { lazy } from 'react';

export const AgentPage = lazy(() => import('../../pages/AgentPage').then((module) => ({ default: module.AgentPage })));
