import type { ReactNode } from 'react';

export const FILTER_GRID_CLASS = 'grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4';
export const FILTER_CONTROL_CLASS = 'h-10 w-full min-w-0 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export default function FilterBar({
  children,
  trailing,
  className = '',
  ariaLabel = '查询条件',
}: FilterBarProps) {
  return (
    <div
      data-ui="filter-bar"
      aria-label={ariaLabel}
      className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`.trim()}
    >
      {children}
      {trailing && <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div>}
    </div>
  );
}
