import type { ReactNode } from 'react';

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
