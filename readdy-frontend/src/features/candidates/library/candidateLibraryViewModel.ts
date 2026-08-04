import { canEnterBusinessReview } from '@/features/businessReviews/stages';
import { candidateResumeReady } from '@/features/candidates/library';
import type { CandidateListItem } from '@/features/candidates/types';

interface CandidateLibraryViewModelInput {
  candidates: CandidateListItem[];
  hideLocalDemoRecords: boolean;
  selectedIds: ReadonlySet<number>;
}

export function buildCandidateLibraryViewModel({
  candidates,
  hideLocalDemoRecords,
  selectedIds,
}: CandidateLibraryViewModelInput) {
  const visibleCandidates = hideLocalDemoRecords
    ? candidates.filter((candidate) => !candidate.is_local_demo_record)
    : candidates;
  const localDemoRecordCount = candidates.filter((candidate) => candidate.is_local_demo_record).length;
  const selectedCandidates = visibleCandidates.filter((candidate) => selectedIds.has(candidate.id));
  const selectableVisibleCandidates = visibleCandidates.filter(candidateResumeReady);

  return {
    visibleCandidates,
    localDemoRecordCount,
    selectedCandidates,
    allVisibleSelected: selectableVisibleCandidates.length > 0
      && selectableVisibleCandidates.every((candidate) => selectedIds.has(candidate.id)),
    selectedAllFavorite: selectedCandidates.length > 0
      && selectedCandidates.every((candidate) => candidate.is_favorite),
    selectedAllInPipeline: selectedCandidates.length > 0
      && selectedCandidates.every((candidate) => candidate.current_demand_id),
    selectedAllReviewable: selectedCandidates.length > 0
      && selectedCandidates.every((candidate) => canEnterBusinessReview(candidate.current_stage)),
  } as const;
}
