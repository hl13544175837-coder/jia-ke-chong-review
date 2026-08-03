import { ChevronRight } from 'lucide-react';

export interface FunnelItem {
  stage: string;
  count: number;
  conversionRate?: number | null;
}

export default function FunnelChart({
  items,
  onStageClick,
  title = '总体漏斗',
  description = '点击阶段查看对应信息',
  embedded = false,
}: {
  items: FunnelItem[];
  onStageClick: (stage: string) => void;
  title?: string;
  description?: string;
  embedded?: boolean;
}) {
  return (
    <section
      data-ui="dashboard-funnel"
      className={embedded
        ? 'border-b border-background-100 px-4 py-4'
        : 'rounded-xl border border-background-200 bg-white p-4 shadow-[0_8px_28px_rgba(44,62,52,0.035)]'}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground-900">{title}</h2>
        <span className="text-xs text-foreground-500">{description}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item, index) => (
          <button
            key={item.stage}
            type="button"
            disabled={item.count <= 0}
            onClick={() => onStageClick(item.stage)}
            className="group flex min-w-0 items-center gap-2 rounded-lg border border-background-200 bg-background-50/60 px-3 py-2 text-left transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-default disabled:opacity-50 disabled:hover:border-background-200 disabled:hover:bg-background-50/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground-500">{item.stage}</span>
              <span className="mt-1 block text-sm font-semibold text-foreground-900">{item.count} 人</span>
              {index > 0 && (
                <span className="mt-0.5 block text-[11px] text-primary-700">转化 {item.conversionRate === null || item.conversionRate === undefined ? '—' : `${item.conversionRate}%`}</span>
              )}
            </span>
            <ChevronRight size={14} className="shrink-0 text-foreground-300 transition group-hover:text-primary-600" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
