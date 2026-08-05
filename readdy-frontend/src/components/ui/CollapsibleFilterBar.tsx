import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import FilterBar, { FILTER_TOGGLE_CLASS } from './FilterBar';

interface CollapsibleFilterBarProps {
  children: ReactNode;
  ariaLabel: string;
  activeFilterCount?: number;
  defaultExpanded?: boolean;
  className?: string;
}

export default function CollapsibleFilterBar({
  children,
  ariaLabel,
  activeFilterCount = 0,
  defaultExpanded = true,
  className = '',
}: CollapsibleFilterBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const countLabel = activeFilterCount > 0 ? `（${activeFilterCount}项）` : '';

  return (
    <section data-ui="collapsible-filter-bar" aria-label={ariaLabel} className={className}>
      {expanded ? (
        <FilterBar ariaLabel={`${ariaLabel}条件`}>
          {children}
          <button
            type="button"
            aria-expanded="true"
            onClick={() => setExpanded(false)}
            className={FILTER_TOGGLE_CLASS}
          >
            <ChevronUp size={14} aria-hidden="true" />
            收起筛选
          </button>
        </FilterBar>
      ) : (
        <button
          type="button"
          aria-expanded="false"
          onClick={() => setExpanded(true)}
          className={FILTER_TOGGLE_CLASS}
        >
          <ChevronDown size={14} aria-hidden="true" />
          展开筛选{countLabel}
        </button>
      )}
    </section>
  );
}
