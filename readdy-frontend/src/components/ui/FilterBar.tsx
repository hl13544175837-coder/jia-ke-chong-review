import type { ReactNode } from 'react';

export const FILTER_FIELD_CLASS = 'block w-full sm:w-40 sm:flex-none';
export const FILTER_CONTROL_CLASS = 'h-9 w-full min-w-0 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100';
export const FILTER_TOGGLE_CLASS = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-600 transition hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 sm:w-40 sm:flex-none';

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
