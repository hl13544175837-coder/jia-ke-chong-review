import type { ReactNode } from 'react';

interface DetailActionBarProps {
  children: ReactNode;
  status?: ReactNode;
  className?: string;
}

export default function DetailActionBar({ children, status, className = '' }: DetailActionBarProps) {
  return (
    <div
      data-ui="detail-action-bar"
      className={`sticky bottom-0 z-20 border-t border-background-200 bg-white px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-end gap-3">
        {status && <div className="mr-auto min-w-0">{status}</div>}
        <div className="flex flex-wrap justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}
