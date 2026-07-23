import type { AppFeature } from '../../app/featureRegistry';
import { candidatesNavItems } from './nav';
import { candidatesRoutes } from './routes';

export const candidatesFeature: AppFeature = {
  id: 'candidates',
  navItems: candidatesNavItems,
  routes: candidatesRoutes,
  topLevelPaths: ['/candidates', '/talent-map'],
};

export { candidatesApi } from './api';
export type * from './types';
