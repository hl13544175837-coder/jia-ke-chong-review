import type { ReactNode } from 'react';
import DetailDrawerShell from '@/components/ui/DetailDrawerShell';

interface CandidateDetailDrawerProps {
  onClose: () => void;
  children: ReactNode;
}

export default function CandidateDetailDrawer({ onClose, children }: CandidateDetailDrawerProps) {
  return (
    <DetailDrawerShell
      ariaLabel="候选人详情"
      closeLabel="关闭候选人详情"
      onClose={onClose}
      modal
      backdropClassName="fixed inset-0 z-40 cursor-default bg-black/30"
      panelClassName="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[720px] flex-col bg-white shadow-xl"
    >
      {children}
    </DetailDrawerShell>
  );
}
