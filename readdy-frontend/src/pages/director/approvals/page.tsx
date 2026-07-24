import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  approvalItems,
  riskAiInsight,
  type ApprovalType,
} from '@/mocks/director';

const typeTabs: { key: ApprovalType | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'ri-list-check-3' },
  { key: 'requisition', label: '需求审批', icon: 'ri-file-list-3-line' },
  { key: 'offer', label: 'Offer审批', icon: 'ri-mail-send-line' },
  { key: 'budget', label: '超预算', icon: 'ri-money-cny-circle-line' },
  { key: 'overdue', label: '长期未招满', icon: 'ri-timer-line' },
  { key: 'feedback', label: '反馈超时', icon: 'ri-chat-1-line' },
  { key: 'expiring', label: '即将到期', icon: 'ri-alarm-line' },
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
  const [showAiDetail, setShowAiDetail] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let items = [...approvalItems];
    if (activeTab !== 'all') items = items.filter(i => i.type === activeTab);
    if (urgenyFilter !== 'all') items = items.filter(i => i.urgency === urgenyFilter);
    items.sort((a, b) => {
      const urgOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
      return urgOrder[a.urgency] - urgOrder[b.urgency];
    });
    return items;
  }, [activeTab, urgenyFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: approvalItems.length };
    approvalItems.forEach(i => {
      map[i.type] = (map[i.type] || 0) + 1;
    });
    return map;
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground-900">审批与风险</h1>
          <p className="text-sm text-foreground-500 mt-1">
            {approvalItems.length} 项待处理 · {approvalItems.filter(i => i.urgency === 'urgent').length} 项紧急 · 只读分析模式
          </p>
        </div>
        <Link to="/director/cockpit" className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer whitespace-nowrap">
          <i className="ri-arrow-left-line"></i> 返回驾驶舱
        </Link>
      </div>

      {/* AI Risk Insight */}
      <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-robot-2-line text-white text-sm"></i>
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground-800 leading-relaxed">{riskAiInsight.summary}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {riskAiInsight.alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(a.drillKey === 'overdue' ? 'overdue' : a.drillKey === 'expiring' ? 'expiring' : 'feedback')}
                  className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer whitespace-nowrap ${
                    a.type === 'danger' ? 'bg-accent-100 text-accent-700' : 'bg-secondary-100 text-secondary-800'
                  }`}
                >
                  <i className={`${a.type === 'danger' ? 'ri-error-warning-line' : 'ri-alert-line'} mr-1`}></i>
                  {a.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Type Tabs */}
      <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit overflow-x-auto">
        {typeTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setDetailItemId(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-foreground-900 shadow-sm'
                : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            <i className={`${tab.icon} text-sm`}></i>
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-primary-50 text-primary-600' : 'bg-background-200 text-foreground-500'
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

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
                      {item.amount && (
                        <>
                          <span>·</span>
                          <span className={item.type === 'budget' ? 'text-accent-600 font-medium' : 'text-foreground-600'}>
                            ¥{item.amount.toLocaleString()}
                          </span>
                        </>
                      )}
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
                          AI建议：此岗位已严重超期，建议考虑：①放宽经验年限要求扩大候选人漏斗；②调整薪资预算增加竞争力；③启动猎头定向挖猎。
                        </p>
                      </div>
                    )}
                    {item.type === 'expiring' && item.daysRemaining !== undefined && item.daysRemaining <= 11 && (
                      <div className="mt-3 p-3 bg-secondary-50 rounded-lg border border-secondary-100">
                        <p className="text-xs text-secondary-700">
                          <i className="ri-alert-line mr-1"></i>
                          AI建议：距截止日期不足{item.daysRemaining}天，建议HRBP与招聘专员立即召开加速会议，明确每日推进计划。
                        </p>
                      </div>
                    )}
                    {item.type === 'feedback' && (
                      <div className="mt-3 p-3 bg-secondary-50 rounded-lg border border-secondary-100">
                        <p className="text-xs text-secondary-700">
                          <i className="ri-information-line mr-1"></i>
                          AI建议：建议向该面试官发送自动提醒，并考虑将反馈SLA从48小时缩短至24小时。
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