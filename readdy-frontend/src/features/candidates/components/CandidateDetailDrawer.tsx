import type { ReactNode } from 'react';

interface CandidateDetailDrawerProps {
  onClose: () => void;
  children: ReactNode;
}

export default function CandidateDetailDrawer({ onClose, children }: CandidateDetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30" role="presentation" onMouseDown={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-[720px] flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}
