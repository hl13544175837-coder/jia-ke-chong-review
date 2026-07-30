import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import { analyticsApi } from '@/features/analytics/api';
import type { AnalyticsOverview } from '@/features/analytics/types';
import { buildDirectorData, type ApprovalType } from '../data';

const typeTabs: Array<{ key: ApprovalType | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'requisition', label: '需求审批' },
  { key: 'offer', label: 'Offer审批' },
  { key: 'budget', label: '超预算' },
  { key: 'overdue', label: '长期未招满' },
  { key: 'feedback', label: '反馈超时' },
  { key: 'expiring', label: '即将到期' },
];

const typeLabelMap: Record<string, string> = {
  requisition: '招聘需求审批',
  offer: 'Offer审批',
  budget: '超预算',
  overdue: '长期未招满',
  feedback: '面试反馈超时',
  expiring: '即将到期',
};

const typeColorMap: Record<string, string> = {
  requisition: 'bg-primary-50 text-primary-700',
  offer: 'bg-accent-50 text-accent-700',
  budget: 'bg-secondary-50 text-secondary-700',
  overdue: 'bg-accent-100 text-accent-700',
  feedback: 'bg-secondary-100 text-secondary-700',
  expiring: 'bg-primary-50 text-primary-700',
};

export default function DirectorApprovalsPage() {
  const [activeTab, setActiveTab] = useState<ApprovalType | 'all'>('all');
  const [urgenyFilter, setUrgencyFilter] = useState('all');
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await analyticsApi.overview());
    } catch {
      setError('审批与风险暂时无法读取，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const view = useMemo(() => data ? buildDirectorData(data) : null, [data]);
  const approvalItems = useMemo(() => view?.approvalItems ?? [], [view]);
  const riskAiInsight = view?.riskSummary ?? { summary: '正在读取本地审批与风险数据。', alerts: [] };

  const filtered = useMemo(() => {
    let items = [...approvalItems];
    if (activeTab !== 'all') items = items.filter(i => i.type === activeTab);
    if (urgenyFilter !== 'all') items = items.filter(i => i.urgency === urgenyFilter);
    items.sort((a, b) => {
      const urgOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
      return urgOrder[a.urgency] - urgOrder[b.urgency];
    });
    return items;
  }, [activeTab, approvalItems, urgenyFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: approvalItems.length };
    approvalItems.forEach(i => {
      map[i.type] = (map[i.type] || 0) + 1;
    });
    return map;
  }, [approvalItems]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="审批与风险"
        description={`${approvalItems.length} 项待处理 · ${approvalItems.filter(i => i.urgency === 'urgent').length} 项紧急 · 只读分析模式`}
        actions={<><button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button><Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-line"></i> 返回驾驶舱</Link></>}
      />

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadData()} className="font-medium underline">重新加载</button></div>}
      {loading && !data && <div className="rounded-xl border border-background-200 bg-white px-5 py-10 text-center text-sm text-foreground-500">正在读取本地风险事项...</div>}

      {/* Rule-based risk summary */}
      <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-alert-line text-white text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground-800 leading-relaxed">{riskAiInsight.summary}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {riskAiInsight.alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(a.drillKey as ApprovalType)}
                  className="cursor-pointer whitespace-nowrap rounded-full bg-secondary-100 px-2 py-1 text-xs font-medium text-secondary-800"
                >
                  <i className="ri-alert-line mr-1"></i>
                  {a.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <WorkspaceTabs<ApprovalType | 'all'>
        items={typeTabs.map((tab) => ({
          ...tab,
          count: counts[tab.key] || undefined,
        }))}
        value={activeTab}
        onChange={(value) => {
          setActiveTab(value);
          setDetailItemId(null);
        }}
        ariaLabel="审批与风险分类"
      />

      {/* Urgency filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground-500">紧急度：</span>
        {(['all', 'urgent', 'normal', 'low'] as const).map(u => (
          <button
            key={u}
            onClick={() => setUrgencyFilter(u)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors cursor-pointer whitespace-nowrap ${
              urgenyFilter === u
                ? 'bg-foreground-900 text-white'
                : 'bg-background-100 text-foreground-500 hover:text-foreground-700'
            }`}
          >
            {u === 'all' ? '全部' : u === 'urgent' ? '紧急' : u === 'normal' ? '一般' : '低'}
          </button>
        ))}
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-background-200 p-12 text-center">
            <p className="text-sm text-foreground-500">该分类下暂无待处理事项</p>
          </div>
        ) : (
          filtered.map(item => {
            const isOpen = detailItemId === item.id;
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border transition-all ${
                  isOpen ? 'border-primary-300 ring-2 ring-primary-50' : 'border-background-200 hover:border-background-300'
                }`}
              >
                <button
                  onClick={() => setDetailItemId(isOpen ? null : item.id)}
                  className="w-full flex items-center gap-4 p-4 text-left cursor-pointer"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColorMap[item.type]}`}>
                    <i className={`${
                      item.type === 'requisition' ? 'ri-file-list-3-line' :
                      item.type === 'offer' ? 'ri-mail-send-line' :
                      item.type === 'budget' ? 'ri-money-cny-circle-line' :
                      item.type === 'overdue' ? 'ri-timer-line' :
                      item.type === 'feedback' ? 'ri-chat-1-line' :
                      'ri-alarm-line'
                    } text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground-900">{item.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        item.urgency === 'urgent' ? 'bg-accent-100 text-accent-700' :
                        item.urgency === 'normal' ? 'bg-secondary-100 text-secondary-700' :
                        'bg-background-100 text-foreground-500'
                      }`}>
                        {item.urgency === 'urgent' ? '紧急' : item.urgency === 'normal' ? '一般' : '低'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-foreground-500 mt-1">
                      <span>{typeLabelMap[item.type]}</span>
                      <span>·</span>
                      <span>{item.department}</span>
                      <span>·</span>
                      <span>申请人：{item.applicant}</span>
                      <span>·</span>
                      <span>{item.submittedAt}</span>
                      {item.daysRemaining !== undefined && (
                        <>
                          <span>·</span>
                          <span className={item.daysRemaining <= 0 ? 'text-accent-600 font-semibold' : item.daysRemaining <= 14 ? 'text-secondary-600 font-medium' : 'text-foreground-500'}>
                            {item.daysRemaining <= 0 ? `已超期${Math.abs(item.daysRemaining)}天` : `剩余${item.daysRemaining}天`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-background-100 pt-3">
                    <p className="text-sm text-foreground-700 leading-relaxed">{item.detail}</p>
                    {item.type === 'overdue' && (
                      <div className="mt-3 p-3 bg-accent-50 rounded-lg border border-accent-100">
                        <p className="text-xs text-accent-700">
                          <i className="ri-error-warning-line mr-1"></i>
                          此岗位已超期，请结合岗位详情复核招聘条件、预算和推进责任人。
                        </p>
                      </div>
                    )}
                    {item.type === 'expiring' && item.daysRemaining !== undefined && item.daysRemaining <= 11 && (
                      <div className="mt-3 p-3 bg-secondary-50 rounded-lg border border-secondary-100">
                        <p className="text-xs text-secondary-700">
                          <i className="ri-alert-line mr-1"></i>
                          距截止日期不足{item.daysRemaining}天，请尽快确认剩余 HC 和下一步安排。
                        </p>
                      </div>
                    )}
                    {item.type === 'feedback' && (
                      <div className="mt-3 p-3 bg-secondary-50 rounded-lg border border-secondary-100">
                        <p className="text-xs text-secondary-700">
                          <i className="ri-information-line mr-1"></i>
                          该面试反馈仍待补充，请尽快联系对应面试官确认。
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
