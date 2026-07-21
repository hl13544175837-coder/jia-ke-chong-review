import { lazy } from 'react';
import type { FeatureRoute } from '../../app/featureRegistry';
import { DEMAND_ROLES } from './permissions';

const DemandsPage = lazy(() => import('./pages/DemandsPage').then((module) => ({ default: module.DemandsPage })));
const DemandDetailPage = lazy(() => import('./pages/DemandDetailPage').then((module) => ({ default: module.DemandDetailPage })));
const TalentMapPage = lazy(() => import('../../pages/TalentMapPage').then((module) => ({ default: module.TalentMapPage })));

export const demandsRoutes: FeatureRoute[] = [
  {
    path: '/demands',
    element: <DemandsPage />,
    roles: DEMAND_ROLES,
  },
  {
    path: '/jobs',
    element: <DemandsPage />,
    roles: DEMAND_ROLES,
  },
  {
    path: '/demands/:id',
    element: <DemandDetailPage />,
    roles: DEMAND_ROLES,
  },
  {
    path: '/talent-map',
    element: <TalentMapPage />,
    roles: DEMAND_ROLES,
  },
];
