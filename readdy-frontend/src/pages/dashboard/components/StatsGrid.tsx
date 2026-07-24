import { useState } from 'react';
import { getStatsCards, type StatCard } from '@/mocks/dashboard';
import StatsDetailDrawer from './StatsDetailDrawer';

function getColorClasses(color: string) {
  switch (color) {
    case 'accent':
      return 'bg-accent-100 text-accent-600';
    case 'secondary':
      return 'bg-secondary-100 text-secondary-600';
    default:
      return 'bg-primary-100 text-primary-600';
  }
}

function getChangeClasses(changeType: string) {
  switch (changeType) {
    case 'up':
      return 'bg-primary-50 text-primary-700';
    case 'down':
      return 'bg-accent-50 text-accent-700';
    default:
      return 'bg-background-100 text-foreground-500';
  }
}

interface StatsGridProps {
  role?: string;
}

export default function StatsGrid({ role = 'recruiter' }: StatsGridProps) {
  const cards = getStatsCards(role);
  const [collapsed, setCollapsed] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<StatCard | null>(null);

  const handleClick = (stat: StatCard) => {
    setSelectedCard(stat);
    setDrawerOpen(true);
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        {/* 折叠头 —— 一行摘要 */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-background-50/50 transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="font-semibold text-foreground-900 text-sm whitespace-nowrap">数据概览</h3>
            {collapsed && (
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                {cards.map((stat) => (
                  <span key={stat.id} className="flex items-center gap-1.5 text-xs text-foreground-500 whitespace-nowrap">
                    <i className={`${stat.icon} text-foreground-400`}></i>
                    {stat.label}
                    <span className="font-bold text-foreground-800">{stat.value}{stat.suffix || ''}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <i className={`${collapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-sm text-foreground-400 flex-shrink-0 ml-2`}></i>
        </button>

        {/* 展开 —— 卡片 */}
        {!collapsed && (
          <div className="px-5 pb-5 pt-1">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {cards.map((stat) => (
                <div
                  key={stat.id}
                  onClick={() => handleClick(stat)}
                  className="bg-background-50 rounded-lg border border-background-200 p-4 hover:border-primary-300 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColorClasses(stat.color)} group-hover:scale-110 transition-transform`}>
                      <i className={`${stat.icon} text-lg`}></i>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${getChangeClasses(stat.changeType)}`}>
                      {stat.change}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground-900 mb-0.5">
                    {stat.value}{stat.suffix || ''}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-foreground-500 group-hover:text-primary-600 transition-colors">{stat.label}</p>
                    <span className="text-[10px] text-foreground-300">·</span>
                    <span className="text-[10px] text-foreground-400 bg-background-100 px-1.5 py-0.5 rounded">{stat.scopeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <StatsDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        statId={selectedCard?.id ?? 0}
        statLabel={selectedCard?.label ?? ''}
        role={role}
      />
    </>
  );
}