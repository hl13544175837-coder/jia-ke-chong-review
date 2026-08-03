import type { ReactNode } from 'react';

interface CandidateUploadModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function CandidateUploadModal({
  open,
  busy,
  onClose,
  children,
}: CandidateUploadModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="presentation"
      onMouseDown={() => { if (!busy) onClose(); }}
    >
      <div
        className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-resume-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
