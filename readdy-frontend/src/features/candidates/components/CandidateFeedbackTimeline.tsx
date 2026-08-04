import CandidateJourneySummary from '@/components/candidates/CandidateJourneySummary';
import type { CandidateJourney } from '@/features/candidates/types';

interface CandidateFeedbackTimelineProps {
  journey: CandidateJourney | null;
  loading?: boolean;
  error?: string;
  interviewOnly?: boolean;
  onRetry?: () => void;
}

export default function CandidateFeedbackTimeline({
  journey,
  loading = false,
  error = '',
  interviewOnly = false,
  onRetry,
}: CandidateFeedbackTimelineProps) {
  if (loading) return <p className="py-12 text-center text-sm text-foreground-500">正在加载面试评价...</p>;
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p>{error}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium">重新加载</button>}
      </div>
    );
  }
  if (!journey) return <p className="rounded-lg bg-background-50 px-4 py-8 text-center text-sm text-foreground-500">暂无历史面试评价和操作记录</p>;
  return <CandidateJourneySummary journey={journey} interviewOnly={interviewOnly} />;
}
