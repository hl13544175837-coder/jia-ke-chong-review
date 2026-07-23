import { Network, Users } from 'lucide-react';
import type { FeatureNavItem } from '../../app/featureRegistry';
import { CANDIDATE_LIST_ROLES } from './permissions';

export const candidatesNavItems: FeatureNavItem[] = [
  {
    to: '/candidates',
    label: '简历库',
    icon: Users,
    roles: CANDIDATE_LIST_ROLES,
    menuCode: 'candidates',
  },
  {
    to: '/talent-map',
    label: '人才地图',
    icon: Network,
    roles: CANDIDATE_LIST_ROLES,
    menuCode: 'candidates',
  },
];
