import type { DemandWorkspaceTab } from '../workbench';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';

const statusTabs: Array<{ key: DemandWorkspaceTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pendingApproval', label: '待审核' },
  { key: 'active', label: '招聘中' },
  { key: 'filled', label: '已完成' },
  { key: 'stopped', label: '已停止' },
];

interface RequisitionTabsProps {
  activeTab: DemandWorkspaceTab;
  resultCount: number;
  onTabChange: (key: DemandWorkspaceTab) => void;
}

export default function RequisitionTabs({ activeTab, resultCount, onTabChange }: RequisitionTabsProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <WorkspaceTabs
        items={statusTabs}
        value={activeTab}
        onChange={onTabChange}
        ariaLabel="招聘需求状态"
        className="min-w-0 flex-1"
      />
      <span data-ui="requisition-result-count" className="whitespace-nowrap text-xs text-foreground-400">
        {resultCount} 条
      </span>
    </div>
  );
}
