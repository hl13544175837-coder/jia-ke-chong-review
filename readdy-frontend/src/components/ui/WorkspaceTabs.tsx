export interface WorkspaceTabItem<T extends string> {
  key: T;
  label: string;
  count?: number;
  /** 为 true 时数量以红色角标展示，用于提醒待处理事项（如"待安排/待反馈"） */
  badge?: boolean;
  disabled?: boolean;
}

interface WorkspaceTabsProps<T extends string> {
  items: readonly WorkspaceTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export default function WorkspaceTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: WorkspaceTabsProps<T>) {
  return (
    <div
      data-ui="workspace-tabs"
      role="tablist"
      aria-label={ariaLabel}
      className={`flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto ${className}`.trim()}
    >
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                : 'border-background-200 bg-white text-foreground-600 hover:border-primary-200 hover:bg-primary-50/50 hover:text-primary-700'
            }`}
          >
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              item.badge ? (
                <span
                  data-ui="workspace-tab-badge"
                  className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ring-2 ${
                    active ? 'bg-white text-accent-600 ring-primary-500' : 'bg-accent-500 text-white ring-white'
                  }`}
                >
                  {item.count > 99 ? '99+' : item.count}
                </span>
              ) : (
                <span className={`text-xs ${active ? 'text-white/80' : 'text-foreground-400'}`}>
                  {item.count}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
