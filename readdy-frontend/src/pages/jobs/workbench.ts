import type { RequisitionRow } from '@/features/demands/types';

export type DemandWorkspaceTab =
  | 'all'
  | 'active'
  | 'pendingApproval'
  | 'filled'
  | 'stopped';

export type DemandSortField = 'newest' | 'priority' | 'deadline';
export type DemandSortDirection = 'asc' | 'desc';

export interface DemandWorkspaceFilters {
  department: string;
  city: string;
  owner: string;
  stage: string;
  headcount: string;
  deadline: string;
}

export interface DemandWorkspaceQuery {
  activeTab: DemandWorkspaceTab;
  searchQuery: string;
  filters: DemandWorkspaceFilters;
  sortField: DemandSortField;
  sortDirection: DemandSortDirection;
}

export interface DemandFilterOptions {
  departments: string[];
  cities: string[];
  owners: string[];
}

const priorityRank: Record<string, number> = {
  '紧急': 3,
  '高': 2,
  '普通': 1,
};

function normalized(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN');
}

function dateValue(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

function compareOptionalNumber(
  left: number | null,
  right: number | null,
  direction: DemandSortDirection,
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const difference = left - right;
  return direction === 'asc' ? difference : -difference;
}

export function matchesDemandTab(row: RequisitionRow, tab: DemandWorkspaceTab) {
  if (tab === 'all') return true;
  if (tab === 'pendingApproval') return row.source.approval_status === 'pending';
  if (tab === 'stopped') return ['paused', 'closed', 'cancelled'].includes(row.statusCode);
  return row.statusCode === tab;
}

export function demandStatusLabel(row: RequisitionRow) {
  if (row.source.approval_status === 'pending') return '待审核';
  if (row.source.approval_status === 'rejected') return '已驳回';
  return row.status;
}

export function buildDemandFilterOptions(rows: RequisitionRow[]): DemandFilterOptions {
  const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  return {
    departments: unique(rows.map((row) => row.department)),
    cities: unique(rows.map((row) => row.city)),
    owners: unique(rows.map((row) => row.owner)),
  };
}

export function filterAndSortRequisitions(
  rows: RequisitionRow[],
  query: DemandWorkspaceQuery,
) {
  const search = normalized(query.searchQuery);
  const filtered = rows.filter((row) => {
    if (!matchesDemandTab(row, query.activeTab)) return false;
    if (search) {
      const searchable = [
        row.source.request_no,
        row.title || row.name,
        row.owner,
        row.department,
        row.city,
      ];
      if (!searchable.some((value) => normalized(value).includes(search))) return false;
    }
    if (query.filters.department && row.department !== query.filters.department) return false;
    if (query.filters.city && row.city !== query.filters.city) return false;
    if (query.filters.owner && row.owner !== query.filters.owner) return false;
    if (query.filters.stage === 'hasAny' && row.stageAll <= 0) return false;
    if (query.filters.stage === 'none' && row.stageAll > 0) return false;
    if (query.filters.stage === 'feedback' && row.stageFeedback <= 0) return false;
    if (query.filters.stage === 'interview' && row.stageInterview <= 0) return false;
    if (query.filters.stage === 'offer' && row.stageOffer <= 0) return false;
    if (query.filters.headcount === 'available' && row.remainingHeadcount <= 0) return false;
    if (query.filters.headcount === 'reached' && row.remainingHeadcount > 0) return false;
    const deadline = dateValue(row.deadline);
    const today = startOfToday();
    if (query.filters.deadline === 'overdue' && (!deadline || deadline >= today)) return false;
    if (query.filters.deadline === 'dueSoon' && (!deadline || deadline < today || deadline > today + 7 * 86_400_000)) return false;
    if (query.filters.deadline === 'unset' && deadline !== null) return false;
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (query.sortField === 'priority') {
      return compareOptionalNumber(
        priorityRank[left.priority] ?? null,
        priorityRank[right.priority] ?? null,
        query.sortDirection,
      );
    }
    if (query.sortField === 'deadline') {
      return compareOptionalNumber(
        dateValue(left.deadline),
        dateValue(right.deadline),
        query.sortDirection,
      );
    }
    return compareOptionalNumber(
      dateValue(left.createdAt),
      dateValue(right.createdAt),
      query.sortDirection,
    );
  });
}
