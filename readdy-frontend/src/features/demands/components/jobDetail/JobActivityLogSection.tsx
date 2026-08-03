import type { ReactNode } from 'react';

export default function JobActivityLogSection({ children }: { children: ReactNode }) {
  return <section data-ui="job-activity-log-section" className="contents">{children}</section>;
}
