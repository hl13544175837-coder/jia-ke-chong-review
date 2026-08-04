import { AlertCircle, LoaderCircle, RotateCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import DetailDrawerShell from '@/components/ui/DetailDrawerShell';

interface ReadOnlyDetailDrawerProps {
  title: ReactNode;
  description?: ReactNode;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}

export default function ReadOnlyDetailDrawer({
  title,
  description,
  loading = false,
  error = '',
  onClose,
  onRetry,
  children,
  footer,
  widthClassName = 'max-w-[640px]',
}: ReadOnlyDetailDrawerProps) {
  return (
    <DetailDrawerShell
      ariaLabel="只读详情"
      closeLabel="关闭详情"
      onClose={onClose}
      backdropClassName="workspace-detail-backdrop fixed inset-0 z-[100] cursor-default bg-foreground-900/35 lg:left-[var(--workspace-sidebar-width)] lg:top-14"
      panelClassName={`workspace-detail-panel fixed inset-y-0 right-0 z-[110] flex w-full flex-col border-l border-background-200 bg-white shadow-2xl lg:top-14 ${widthClassName}`}
    >
        <header className="flex items-start justify-between gap-4 border-b border-background-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-foreground-900">{title}</h2>
            {description && <p className="mt-1 text-xs leading-5 text-foreground-500">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭详情"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground-400 transition hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-sm text-foreground-500" aria-live="polite">
              <LoaderCircle size={20} className="mb-2 animate-spin" />
              正在加载详情...
            </div>
          ) : error ? (
            <div role="alert" className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50/50 px-5 text-center">
              <AlertCircle size={22} className="text-red-600" />
              <p className="mt-3 text-sm font-medium text-foreground-800">详情暂时无法读取</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-foreground-500">{error}</p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                  <RotateCw size={14} />重新加载</button>
              )}
            </div>
          ) : children}
        </div>

        {footer && <footer className="border-t border-background-100 bg-white px-6 py-4">{footer}</footer>}
    </DetailDrawerShell>
  );
}
