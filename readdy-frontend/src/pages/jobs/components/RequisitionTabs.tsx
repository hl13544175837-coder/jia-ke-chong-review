const statusTabs = [
  { key: 'all', label: '全部需求' },
  { key: 'active', label: '招聘中' },
  { key: 'pending', label: '待确认' },
  { key: 'paused', label: '已暂停' },
  { key: 'filled', label: '已完成' },
  { key: 'closed', label: '已关闭' },
];

interface RequisitionTabsProps {
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function RequisitionTabs({ activeTab, onTabChange }: RequisitionTabsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {statusTabs.map((tab) => (
        <button
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
