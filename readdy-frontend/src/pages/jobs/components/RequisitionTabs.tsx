import type { DemandWorkspaceTab } from '../workbench';

const statusTabs: Array<{ key: DemandWorkspaceTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pendingApproval', label: '待审核' },
  { key: 'active', label: '招聘中' },
  { key: 'filled', label: '已完成' },
  { key: 'stopped', label: '已停止' },
];

interface RequisitionTabsProps {
  activeTab: DemandWorkspaceTab;
  onTabChange: (key: DemandWorkspaceTab) => void;
}

export default function RequisitionTabs({ activeTab, onTabChange }: RequisitionTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="招聘需求状态">
      {statusTabs.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`
            px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer
            ${activeTab === tab.key
              ? 'bg-primary-500 text-white'
              : 'bg-white text-foreground-600 hover:bg-background-100 border border-background-200'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
