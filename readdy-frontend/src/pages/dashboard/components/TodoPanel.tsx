import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPrioritizedTodos, type PriorityTodo } from '@/mocks/dashboard';

interface TodoPanelProps {
  onCandidateClick?: (candidateId: number) => void;
  role?: string;
}

const accentConfig: Record<PriorityTodo['accent'], { dot: string; chip: string; icon: string }> = {
  urgent: { dot: 'bg-accent-500', chip: 'bg-accent-50 text-accent-700', icon: 'bg-accent-100 text-accent-600' },
  high: { dot: 'bg-primary-500', chip: 'bg-primary-50 text-primary-700', icon: 'bg-primary-100 text-primary-600' },
  normal: { dot: 'bg-secondary-400', chip: 'bg-secondary-50 text-secondary-700', icon: 'bg-secondary-100 text-secondary-600' },
};

const DEFAULT_VISIBLE = 5;

export default function TodoPanel({ onCandidateClick, role = 'recruiter' }: TodoPanelProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<PriorityTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const loadTodos = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(getPrioritizedTodos(role));
    } catch (err) {
      console.error('Failed to load todos:', err);
      setLoadError('加载待办事项时发生错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const urgentCount = useMemo(() => items.filter(i => i.accent === 'urgent').length, [items]);
  const visibleItems = showAll ? items : items.slice(0, DEFAULT_VISIBLE);

  const handleItemClick = (item: PriorityTodo) => {
    sessionStorage.setItem('dashboard_scrollPosition', String(window.scrollY));
    // 面试类待办（已有面试记录）→ 跳转面试页并自动打开该候选人的面试详情抽屉
    // 其余待办（待筛选 / Offer谈薪 / 待安排面试）→ 直接在工作台打开候选人详情抽屉，展示进度与处理入口
    const todoTab = (item.targetState as { tab?: string })?.tab;
    const isInterviewMode = item.targetPage === '/dashboard/interviews' && todoTab !== '待安排';
    if (!isInterviewMode && onCandidateClick && item.candidateId > 0) {
      onCandidateClick(item.candidateId);
      return;
    }
    navigate(item.targetPage, { state: { ...item.targetState, fromDashboard: true } });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">待处理事项</h3>
        </div>
        <div className="p-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-primary-300 border-t-transparent animate-spin"></div>
            <span className="text-sm text-foreground-500">加载中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">待处理事项</h3>
        </div>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent-50 flex items-center justify-center mb-3">
            <i className="ri-error-warning-line text-accent-500 text-xl"></i>
          </div>
          <p className="text-sm text-foreground-600 mb-3">{loadError}</p>
          <button
            onClick={loadTodos}
            className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors flex items-center gap-1.5 mx-auto"
          >
            <i className="ri-refresh-line"></i>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-background-200">
          <h3 className="font-semibold text-foreground-900 text-sm">待处理事项</h3>
        </div>
        <div className="p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-background-100 flex items-center justify-center mb-3">
            <i className="ri-check-double-line text-foreground-400 text-xl"></i>
          </div>
          <p className="text-sm text-foreground-500">暂无待处理事项</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="font-semibold text-foreground-900 text-sm">待处理事项</h3>
          {urgentCount > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
              {urgentCount} 项紧急
            </span>
          )}
        </div>
        <button
          onClick={loadTodos}
          className="w-7 h-7 rounded-lg hover:bg-background-100 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
          title="刷新"
        >
          <i className="ri-refresh-line text-sm"></i>
        </button>
      </div>

      <div className="divide-y divide-background-100">
        {visibleItems.map((item) => {
          const cfg = accentConfig[item.accent];
          return (
            <div
              key={item.key}
              onClick={() => handleItemClick(item)}
              className="flex items-center gap-3 px-5 py-3 hover:bg-background-50/60 transition-colors cursor-pointer group"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.icon}`}>
                <i className={`${item.categoryIcon} text-sm`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${cfg.chip} whitespace-nowrap`}>
                    {item.category}
                  </span>
                  <span className="text-sm font-medium text-foreground-900 truncate">{item.title}</span>
                </div>
                <p className="text-xs text-foreground-500 truncate">{item.detail}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {item.meta && (
                  <span className="text-[11px] text-foreground-400 whitespace-nowrap hidden sm:block">{item.meta}</span>
                )}
                <i className="ri-arrow-right-s-line text-foreground-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all"></i>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full px-5 py-2.5 border-t border-background-100 text-xs font-medium text-foreground-500 hover:text-primary-600 hover:bg-background-50/60 transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          {showAll ? '收起' : `查看全部 ${items.length} 项`}
          <i className={`${showAll ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-sm`}></i>
        </button>
      )}
    </div>
  );
}