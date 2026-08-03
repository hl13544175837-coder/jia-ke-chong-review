import type { Candidate } from '@/mocks/candidates';

export type JoinStatus = 'available' | 'in_current' | 'in_other' | 'ended';

export type CandidateSelectionRow = Candidate & {
  joinStatus: JoinStatus;
  matchScore: number;
  resumeUpdatedAt: string;
  currentProcessPosition: string;
};

interface CandidateSelectionFilters {
  searchQuery: string;
  cityFilter: string;
  joinStatusFilter: string;
  joinableOnly: boolean;
  sourceFilter: string;
  expFilter: string;
  eduFilters: Set<string>;
  recruiterFilter: string;
  resumeTimeFilter: string;
  positionFilter: string;
  sortMode: 'match' | 'updated' | 'entry';
}

const candidateCityMap: Record<number, string> = {
  1: '上海', 2: '上海', 3: '杭州', 4: '北京', 5: '北京',
  6: '上海', 7: '广州', 8: '武汉', 9: '武汉', 10: '成都',
  11: '南京', 12: '无锡', 13: '北京', 14: '北京', 15: '成都',
  16: '北京', 17: '哈尔滨', 18: '西安', 19: '天津', 20: '厦门',
  21: '重庆', 22: '杭州', 23: '合肥', 24: '南京', 25: '上海',
  26: '广州', 27: '成都', 28: '上海', 29: '北京', 30: '杭州',
  31: '广州', 32: '广州', 33: '北京',
};

function getCity(candidate: Candidate) {
  return candidate.city || candidateCityMap[candidate.id] || '北京';
}

function educationLevel(value: string) {
  if (value.includes('博士')) return '博士';
  if (value.includes('硕士')) return '硕士';
  if (value.includes('本科')) return '本科';
  if (value.includes('大专')) return '大专';
  return '高中及以下';
}

function experienceRange(value: string) {
  if (!value || value.includes('应届')) return '应届/1年以内';
  const years = Number.parseInt(value, 10);
  if (Number.isNaN(years) || years <= 1) return '应届/1年以内';
  if (years <= 3) return '1–3年';
  if (years <= 5) return '3–5年';
  if (years <= 10) return '5–10年';
  return '10年以上';
}

export function filterCandidateSelection(
  rows: CandidateSelectionRow[],
  filters: CandidateSelectionFilters,
) {
  let result = [...rows];
  const query = filters.searchQuery.trim().toLowerCase();
  if (query) {
    result = result.filter((candidate) => (
      candidate.name.toLowerCase().includes(query)
      || candidate.position.toLowerCase().includes(query)
      || candidate.tags.some((tag) => tag.toLowerCase().includes(query))
    ));
  }
  if (filters.cityFilter) result = result.filter((candidate) => getCity(candidate) === filters.cityFilter);
  if (filters.joinStatusFilter) result = result.filter((candidate) => candidate.joinStatus === filters.joinStatusFilter);
  else if (filters.joinableOnly) result = result.filter((candidate) => candidate.joinStatus === 'available');
  if (filters.sourceFilter) result = result.filter((candidate) => candidate.source === filters.sourceFilter);
  if (filters.expFilter) result = result.filter((candidate) => experienceRange(candidate.experienceYears) === filters.expFilter);
  if (filters.eduFilters.size > 0) result = result.filter((candidate) => filters.eduFilters.has(educationLevel(candidate.education)));
  if (filters.recruiterFilter) result = result.filter((candidate) => candidate.recruiter === filters.recruiterFilter);
  if (filters.resumeTimeFilter) {
    const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[filters.resumeTimeFilter] ?? 999;
    const cutoff = new Date('2026-07-21');
    cutoff.setDate(cutoff.getDate() - days);
    result = result.filter((candidate) => new Date(candidate.resumeUpdatedAt || candidate.appliedAt) >= cutoff);
  }
  if (filters.positionFilter) result = result.filter((candidate) => candidate.position === filters.positionFilter);
  result.sort((left, right) => {
    if (filters.sortMode === 'match') return right.matchScore - left.matchScore;
    if (filters.sortMode === 'updated') return new Date(right.resumeUpdatedAt || right.appliedAt).getTime() - new Date(left.resumeUpdatedAt || left.appliedAt).getTime();
    return new Date(right.appliedAt).getTime() - new Date(left.appliedAt).getTime();
  });
  return result;
}
