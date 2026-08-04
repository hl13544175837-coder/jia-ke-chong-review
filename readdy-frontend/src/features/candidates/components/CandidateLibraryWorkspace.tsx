import CandidateLibraryDetail from '@/features/candidates/components/library/CandidateLibraryDetail';
import CandidateLibraryFilters from '@/features/candidates/components/library/CandidateLibraryFilters';
import CandidateLibraryOverlays from '@/features/candidates/components/library/CandidateLibraryOverlays';
import CandidateLibraryTable from '@/features/candidates/components/library/CandidateLibraryTable';
import { useCandidateLibraryController } from '@/features/candidates/library/useCandidateLibraryController';

export default function CandidateLibraryWorkspace() {
  const controller = useCandidateLibraryController();

  return (
    <div className="space-y-5 px-4 pb-6 pt-3 sm:px-6">
      <CandidateLibraryFilters controller={controller} />
      <CandidateLibraryTable controller={controller} />
      <CandidateLibraryDetail controller={controller} />
      <CandidateLibraryOverlays controller={controller} />
    </div>
  );
}
