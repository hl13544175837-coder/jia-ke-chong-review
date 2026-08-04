import { useRef, type ReactNode } from 'react';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';

interface DetailDrawerShellProps {
  children: ReactNode;
  onClose: () => void;
  ariaLabel: string;
  closeLabel?: string;
  canClose?: boolean;
  modal?: boolean;
  backdropClassName: string;
  panelClassName: string;
}

export default function DetailDrawerShell({
  children,
  onClose,
  ariaLabel,
  closeLabel = `关闭${ariaLabel}`,
  canClose = true,
  modal = false,
  backdropClassName,
  panelClassName,
}: DetailDrawerShellProps) {
  const panelRef = useRef<HTMLElement>(null);
  useOverlayLifecycle({ canClose, onClose, initialFocusRef: panelRef });

  return (
    <>
      <button
        type="button"
        aria-label={closeLabel}
        aria-disabled={!canClose}
        onClick={() => { if (canClose) onClose(); }}
        className={backdropClassName}
        data-ui="detail-drawer-backdrop"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={ariaLabel}
        aria-modal={modal || undefined}
        className={`${panelClassName} min-h-0 overflow-hidden outline-none`.trim()}
        data-ui="detail-drawer-panel"
      >
        {children}
      </aside>
    </>
  );
}
