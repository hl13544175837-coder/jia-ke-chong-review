import type { ReactNode } from 'react';
import CandidateDetailTabs, { type CandidateDetailTab } from './CandidateDetailTabs';

interface CandidateDetailWorkspaceProps {
  value: CandidateDetailTab;
  onChange: (value: CandidateDetailTab) => void;
  children: ReactNode;
  className?: string;
}

export default function CandidateDetailWorkspace({
  value,
  onChange,
  children,
  className = '',
}: CandidateDetailWorkspaceProps) {
  return (
    <div data-ui="candidate-detail-workspace" className={className}>
      <CandidateDetailTabs value={value} onChange={onChange} />
      {children}
    </div>
  );
}
