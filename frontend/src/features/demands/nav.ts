import { ClipboardList, MapPinned } from 'lucide-react';
import type { FeatureNavItem } from '../../app/featureRegistry';
import { DEMAND_ROLES } from './permissions';

export const demandsNavItems: FeatureNavItem[] = [
  {
    to: '/demands',
    label: '招聘管理',
    icon: ClipboardList,
    roles: DEMAND_ROLES,
    activePaths: ['/jobs', '/job-templates'],
    menuCode: 'demands',
  },
  {
    to: '/talent-map',
    label: '人才地图',
    icon: MapPinned,
    roles: DEMAND_ROLES,
    menuCode: 'demands',
  },
];
