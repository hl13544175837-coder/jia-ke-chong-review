import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface RowActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  dividerBefore?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface RowActionMenuProps {
  ariaLabel: string;
  items: RowActionItem[];
  className?: string;
}

interface MenuPosition {
  left: number;
  top: number;
}

const MENU_WIDTH = 208;
const VIEWPORT_GAP = 8;
const TRIGGER_GAP = 4;

export default function RowActionMenu({ ariaLabel, items, className = '' }: RowActionMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const measuredHeight = menuRef.current?.offsetHeight ?? Math.min(items.length * 40 + 8, 320);
    const maxHeight = Math.max(120, window.innerHeight - VIEWPORT_GAP * 2);
    const menuHeight = Math.min(measuredHeight, maxHeight);
    const belowTop = rect.bottom + TRIGGER_GAP;
    const shouldOpenUp = belowTop + menuHeight > window.innerHeight - VIEWPORT_GAP
      && rect.top - TRIGGER_GAP - menuHeight >= VIEWPORT_GAP;
    const top = shouldOpenUp
      ? rect.top - TRIGGER_GAP - menuHeight
      : Math.min(belowTop, window.innerHeight - VIEWPORT_GAP - menuHeight);
    const left = Math.min(
      window.innerWidth - VIEWPORT_GAP - MENU_WIDTH,
      Math.max(VIEWPORT_GAP, rect.right - MENU_WIDTH),
    );
    setPosition({ left, top: Math.max(VIEWPORT_GAP, top) });
  }, [items.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [close, open, updatePosition]);

  useEffect(() => {
    if (!open || !position) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, position]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (buttons.length === 0) return;
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    let next: number;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else if (event.key === 'Tab') {
      close();
      return;
    } else return;
    event.preventDefault();
    buttons[next]?.focus();
  };

  if (items.length === 0) return null;

  const menu = open && position && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={ariaLabel}
      data-ui="row-action-menu"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleMenuKeyDown}
      className="z-[240] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-background-200 bg-white py-1 shadow-[0_12px_32px_rgba(24,39,31,0.16)]"
      style={{ position: 'fixed', left: position.left, top: position.top, width: MENU_WIDTH }}
    >
      {items.map((item) => (
        <div key={item.key} className={item.dividerBefore ? 'mt-1 border-t border-background-100 pt-1' : ''}>
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => {
              event.stopPropagation();
              close();
              item.onSelect();
            }}
            className={`flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              item.tone === 'danger'
                ? 'text-red-600 hover:bg-red-50'
                : 'text-foreground-700 hover:bg-primary-50 hover:text-primary-700'
            }`}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.tone === 'danger' ? 'text-red-500' : 'text-primary-500'}`} aria-hidden="true">
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-ui="row-action-menu-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-foreground-500 transition-colors hover:border-background-200 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${className}`.trim()}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
      {menu}
    </>
  );
}
