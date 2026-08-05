import type { ProductRole } from '@/auth/productRoleModel';
import type { RequisitionRow } from '@/features/demands/types';

export type DemandPrimaryAction =
  | 'review'
  | 'select_candidates'
  | 'mark_filled'
  | 'restore'
  | 'view_candidates'
  | null;

export type DemandMenuAction =
  | 'view'
  | 'edit'
  | 'view_candidates'
  | 'adjust_priority'
  | 'reassign_owner'
  | 'pause'
  | 'mark_filled'
  | 'cancel'
  | 'close'
  | 'restore';

export interface DemandRowActions {
  primary: DemandPrimaryAction;
  menu: DemandMenuAction[];
}

export function buildDemandRowActions(
  row: Pick<RequisitionRow, 'statusCode' | 'remainingHeadcount' | 'source'>,
  role: ProductRole | null,
): DemandRowActions {
  const canManage = role === 'recruiter' || role === 'manager' || role === 'admin';
  if (!canManage) return { primary: null, menu: ['view', 'view_candidates'] };

  const menu: DemandMenuAction[] = ['view', 'edit', 'view_candidates', 'adjust_priority'];
  if (role === 'manager' || role === 'admin') menu.push('reassign_owner');

  let primary: DemandPrimaryAction = null;
  if (row.source.approval_status === 'pending') {
    primary = 'review';
    menu.push('cancel');
  } else if (row.statusCode === 'active') {
    if (row.remainingHeadcount > 0) {
      primary = 'select_candidates';
      menu.push('pause', 'mark_filled', 'cancel', 'close');
    } else {
      primary = 'mark_filled';
      menu.push('pause', 'cancel', 'close');
    }
  } else if (row.statusCode === 'paused') {
    primary = 'restore';
    menu.push('cancel', 'close');
  } else if (row.statusCode === 'filled' || row.statusCode === 'cancelled' || row.statusCode === 'closed') {
    primary = 'view_candidates';
    menu.push('restore');
  }

  return { primary, menu: menu.filter((action) => action !== primary) };
}
