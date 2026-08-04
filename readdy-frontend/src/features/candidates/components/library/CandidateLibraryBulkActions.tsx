import { Send, Star, UserPlus } from 'lucide-react';
import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';

interface CandidateLibraryBulkActionsProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryBulkActions({ controller }: CandidateLibraryBulkActionsProps) {
  const {
    selectedIds,
    setSelectedIds,
    favoriteSaving,
    selectedCandidates,
    openPushModal,
    updateFavorites,
    openPipelineModal,
    selectedAllFavorite,
    selectedAllInPipeline,
    selectedAllReviewable,
  } = controller;

  if (selectedIds.size === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-y border-primary-200 bg-primary-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-primary-800">已选 {selectedIds.size} 位候选人</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm font-medium text-foreground-600 hover:text-foreground-900">取消选择</button>
        <button
          type="button"
          onClick={() => void updateFavorites(selectedCandidates, !selectedAllFavorite)}
          disabled={favoriteSaving}
          className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
        >
          <Star size={15} fill={selectedAllFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          {selectedAllFavorite ? '取消收藏' : '批量收藏'}
        </button>
        {!selectedAllInPipeline && (
          <button
            type="button"
            onClick={() => openPipelineModal(selectedCandidates)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            <UserPlus size={15} aria-hidden="true" />
            加入需求并继续业务筛选
          </button>
        )}
        {selectedAllInPipeline && selectedAllReviewable && (
          <button
            type="button"
            onClick={() => openPushModal(selectedCandidates)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
          >
            <Send size={15} aria-hidden="true" />
            推送业务筛选
          </button>
        )}
      </div>
    </div>
  );
}
