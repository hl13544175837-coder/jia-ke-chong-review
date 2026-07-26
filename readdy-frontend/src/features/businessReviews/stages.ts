import type { CandidateStage } from '@/features/candidates/types';

export const BUSINESS_REVIEW_ENTRY_STAGES = new Set<CandidateStage>([
  'pending',
  'ai_screen',
  'business_review',
]);

export function canEnterBusinessReview(stage?: CandidateStage | null) {
  return !stage || BUSINESS_REVIEW_ENTRY_STAGES.has(stage);
}
