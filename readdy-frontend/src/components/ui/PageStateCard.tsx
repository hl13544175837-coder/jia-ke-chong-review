import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';

type PageStateVariant = 'loading' | 'empty' | 'error';

interface PageStateCardProps {
  variant: PageStateVariant;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const stateStyles: Record<PageStateVariant, string> = {
  loading: 'border-background-200 bg-white text-foreground-500',
  empty: 'border-background-200 bg-white text-foreground-500',
  error: 'border-red-200 bg-red-50 text-red-700',
};

export default function PageStateCard({
  variant,
  title,
  description,
  actionLabel,
  onAction,
}: PageStateCardProps) {
  const Icon = variant === 'loading' ? LoaderCircle : variant === 'error' ? CircleAlert : Inbox;
  const resolvedActionLabel = actionLabel || (variant === 'error' ? '重新加载' : '继续处理');

  return (
    <div
      className={`rounded-lg border px-5 py-12 text-center ${stateStyles[variant]}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-ui="page-state-card"
      data-variant={variant}
    >
      <Icon
        size={26}
        className={`mx-auto mb-3 ${variant === 'loading' ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <p className="text-sm font-semibold text-current">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm opacity-80">{description}</p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-current bg-white px-4 py-2 text-sm font-medium text-current transition-colors hover:bg-background-50"
        >
          {resolvedActionLabel}
        </button>
      )}
    </div>
  );
}

export type { PageStateVariant };
