import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CandidateColumnFilterHeaderProps {
  'data-ui': string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function CandidateColumnFilterHeader({
  'data-ui': dataUi,
  label,
  open,
  onToggle,
  children,
}: CandidateColumnFilterHeaderProps) {
  return (
    <th
      className="relative px-3 py-3 font-medium"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <button
        type="button"
        data-ui={dataUi}
        aria-expanded={open}
        aria-controls={`${dataUi}-panel`}
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded text-left hover:text-foreground-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${dataUi}-panel`}
          role="group"
          aria-label={`${label}筛选条件`}
          className="absolute left-3 top-full z-30 mt-1 w-60 space-y-2 rounded-lg border border-background-200 bg-white p-3 shadow-xl"
        >
          {children}
        </div>
      )}
    </th>
  );
}
