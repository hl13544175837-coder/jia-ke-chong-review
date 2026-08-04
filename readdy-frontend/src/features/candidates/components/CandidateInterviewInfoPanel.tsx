import type { ReactNode } from 'react';

export default function CandidateInterviewInfoPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-5" role="tabpanel" aria-label="面试信息">{children}</div>;
}
