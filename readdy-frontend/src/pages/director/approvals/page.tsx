import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import ReadOnlyDetailDrawer from '@/components/ui/ReadOnlyDetailDrawer';
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

function isApprovalType(value: string | null): value is ApprovalType {
  return ['requisition', 'offer', 'budget', 'overdue', 'feedback', 'expiring'].includes(value || '');
}

function relatedDemandId(itemId: string) {
  const match = itemId.match(/^(?:demand|overdue|expiring|long-open)-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export default function DirectorApprovalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const [activeTab, setActiveTab] = useState<ApprovalType | 'all'>(() => isApprovalType(requestedType) ? requestedType : 'all');
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

  useEffect(() => {
    if (isApprovalType(requestedType)) setActiveTab(requestedType);
  }, [requestedType]);

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
  const selectedItem = useMemo(
    () => approvalItems.find((item) => item.id === detailItemId) || null,
    [approvalItems, detailItemId],
  );

  const selectType = (value: ApprovalType | 'all') => {
    setActiveTab(value);
    setDetailItemId(null);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('type');
    else next.set('type', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="审批与风险"
        visuallyHiddenTitle
        description={`${approvalItems.length} 项待关注 · ${approvalItems.filter(i => i.urgency === 'urgent').length} 项紧急 · 只读监督模式`}
        actions={<><button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">刷新</button><Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-line"></i> 返回驾驶舱</Link></>}
      />

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void loadData()} className="font-medium underline">重新加载</button></div>}
      {loading && !data && <div className="rounded-xl border border-background-200 bg-white px-5 py-10 text-center text-sm text-foreground-500">正在读取本地风险事项...</div>}

      <section data-ui="director-role-scope" className="rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-xs leading-5 text-primary-800">
        <span className="font-semibold">角色分工：</span>招聘主管负责处理需求审批、Offer 确认和日常推进；总监负责查看全局风险、确认责任人，并在需要时调整资源和优先级。
      </section>

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
                  onClick={() => selectType(a.drillKey as ApprovalType)}
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
        onChange={selectType}
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
            <p className="text-sm text-foreground-500">该分类下暂无待关注事项</p>
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
                        <i className="ri-arrow-right-s-line text-foreground-400"></i>
                      </div>
                </button>

              </div>
            );
          })
        )}
      </div>

      {selectedItem && (
        <ReadOnlyDetailDrawer
          title={selectedItem.title}
          description={`${typeLabelMap[selectedItem.type]} · ${selectedItem.department} · 只读监督详情`}
          onClose={() => setDetailItemId(null)}
        >
          <div data-ui="director-attention-detail" className="space-y-5">
            <section className="rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary-800">
              <p className="font-semibold">处理分工</p>
              <p className="mt-1 leading-6">招聘主管负责处理这项业务并留下审批或跟进记录；总监负责判断是否需要升级、调整资源或改变优先级。</p>
            </section>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['事项类型', typeLabelMap[selectedItem.type]],
                ['紧急程度', selectedItem.urgency === 'urgent' ? '紧急' : selectedItem.urgency === 'normal' ? '一般' : '低'],
                ['责任申请人', selectedItem.applicant],
                ['所属部门', selectedItem.department],
                ['提交日期', selectedItem.submittedAt],
                ['距离截止', selectedItem.daysRemaining === undefined ? '未设置' : selectedItem.daysRemaining <= 0 ? `已超期 ${Math.abs(selectedItem.daysRemaining)} 天` : `剩余 ${selectedItem.daysRemaining} 天`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-background-200 bg-background-50 px-3 py-3">
                  <dt className="text-xs text-foreground-500">{label}</dt>
                  <dd className="mt-1 font-medium text-foreground-900">{value}</dd>
                </div>
              ))}
            </dl>
            <section>
              <h3 className="text-sm font-semibold text-foreground-900">当前事实</h3>
              <p className="mt-2 rounded-lg border border-background-200 px-4 py-3 text-sm leading-6 text-foreground-700">{selectedItem.detail}</p>
            </section>
            {relatedDemandId(selectedItem.id) ? (
              <Link to={`/director/progress?position=demand-${relatedDemandId(selectedItem.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700">
                查看岗位、负责人和建议动作<i className="ri-arrow-right-line" aria-hidden="true" />
              </Link>
            ) : (
              <p className="rounded-lg border border-background-200 bg-background-50 px-4 py-3 text-xs text-foreground-600">处理路径：招聘主管进入 Offer 管理的“待确认”，确认或退回后系统继续保留记录。</p>
            )}
          </div>
        </ReadOnlyDetailDrawer>
      )}
    </div>
  );
}
