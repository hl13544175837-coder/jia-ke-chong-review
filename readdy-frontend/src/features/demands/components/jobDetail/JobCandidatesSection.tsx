import type { ReactNode } from 'react';

export default function JobCandidatesSection({ children }: { children: ReactNode }) {
  return <section data-ui="job-candidates-section" className="contents">{children}</section>;
}
