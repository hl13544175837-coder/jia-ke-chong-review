import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';

interface CandidateLibraryPaginationProps {
  controller: CandidateLibraryController;
}

export default function CandidateLibraryPagination({ controller }: CandidateLibraryPaginationProps) {
  const { candidatesLoading, candidatesError, candidateResponse, page, setPage } = controller;
  if (candidatesLoading || candidatesError || candidateResponse.total === 0) return null;

  return (
    <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="候选人分页">
      <p className="text-xs text-foreground-500">
        第 {candidateResponse.page} / {candidateResponse.pages} 页，每页 {candidateResponse.per_page} 条
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <span className="min-w-20 text-center text-sm font-medium text-foreground-700">{page} / {candidateResponse.pages}</span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(candidateResponse.pages, current + 1))}
          disabled={page >= candidateResponse.pages}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
