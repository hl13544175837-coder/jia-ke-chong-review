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
  onTabChange: (key: DemandWorkspaceTab) => void;
}

export default function RequisitionTabs({ activeTab, onTabChange }: RequisitionTabsProps) {
  return <WorkspaceTabs items={statusTabs} value={activeTab} onChange={onTabChange} ariaLabel="招聘需求状态" />;
}
