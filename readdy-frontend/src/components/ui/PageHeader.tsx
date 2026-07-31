import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  visuallyHiddenTitle?: boolean;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  leading,
  actions,
  visuallyHiddenTitle = false,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      data-ui="page-header"
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          <h1
            data-ui="page-header-title"
            className={visuallyHiddenTitle
              ? 'sr-only'
              : 'font-heading text-2xl font-bold leading-tight tracking-tight text-foreground-900'}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm leading-6 text-foreground-500">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}
