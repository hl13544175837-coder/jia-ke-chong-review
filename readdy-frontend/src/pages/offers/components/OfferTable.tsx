import { useState } from 'react';
import type { Offer } from '@/mocks/offers';

interface Props {
  offers: Offer[];
  userRole: string;
  positionFilter: string;
  onPositionFilterChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  salarySort: string;
  onSalarySortChange: (v: string) => void;
  timeSort: string;
  onTimeSortChange: (v: string) => void;
  onRowClick: (offer: Offer) => void;
  onApprove: (offer: Offer) => void;
  onSend: (offer: Offer) => void;
  onFollowUp: (offer: Offer) => void;
  onOnboard: (offer: Offer) => void;
  onSubmitApproval: (offer: Offer) => void;
  onViewResult: (offer: Offer) => void;
  onEdit: (offer: Offer) => void;
  onWithdraw: (offer: Offer) => void;
  onResend: (offer: Offer) => void;
  onExport: (offer: Offer) => void;
  onHistory: (offer: Offer) => void;
}

const statusLabelMap: Record<string, string> = {
  '草稿': '待提交',
  '待审批': '审批中',
  '已通过': '待发放',
  '待发放': '待发放',
  '已发放': '等待回复',
  '已接受': '待入职',
  '已拒绝': '已拒绝',
  '已撤回': '已撤回',
  '已过期': '已过期',
  '已入职': '已入职',
};

const statusColorMap: Record<string, string> = {
  '草稿': 'bg-background-200 text-foreground-600',
  '待审批': 'bg-amber-50 text-amber-700',
  '已通过': 'bg-primary-50 text-primary-700',
  '待发放': 'bg-primary-50 text-primary-700',
  '已发放': 'bg-accent-50 text-accent-700',
  '已接受': 'bg-emerald-50 text-emerald-700',
  '已拒绝': 'bg-red-50 text-red-600',
  '已撤回': 'bg-background-200 text-foreground-500',
  '已过期': 'bg-amber-50 text-amber-600',
  '已入职': 'bg-emerald-50 text-emerald-700',
};

const getLatestActivity = (offer: Offer): { text: string; time: string } => {
  if (offer.status === '草稿') return { text: '草稿创建', time: offer.createdAt || '' };
  if (offer.status === '待审批') return { text: '提交审批', time: offer.submittedAt };
  if (offer.status === '待发放' || offer.status === '已通过') return { text: '审批通过', time: offer.approvedAt || '' };
  if (offer.status === '已发放') return { text: 'Offer已发送', time: offer.sentAt || '' };
  if (offer.status === '已接受') return { text: '候选人已接受', time: offer.respondedAt || '' };
  if (offer.status === '已拒绝') return { text: '候选人已拒绝', time: offer.respondedAt || '' };
  if (offer.status === '已撤回') return { text: 'Offer已撤回', time: offer.retractedAt || '' };
  if (offer.status === '已过期') return { text: 'Offer已过期', time: offer.expiredAt || '' };
  if (offer.status === '已入职') return { text: '已入职', time: offer.onboardedAt || '' };
  return { text: '', time: '' };
};

const progressDisplayMap: Record<string, { label: string; sub: string }> = {
  '草稿': { label: '待提交', sub: '草稿未提交' },
  '待审批': { label: '审批中', sub: '' },
  '已通过': { label: '待发放', sub: '审批已通过' },
  '待发放': { label: '待发放', sub: '审批已通过' },
  '已发放': { label: '等待回复', sub: '' },
  '已接受': { label: '待入职', sub: '' },
  '已拒绝': { label: '已拒绝', sub: '' },
  '已撤回': { label: '已撤回', sub: '' },
  '已过期': { label: '已过期', sub: '' },
  '已入职': { label: '已入职', sub: '' },
};

const positionOptions = ['高级产品经理', 'Java开发工程师', '前端开发工程师', 'UI/UX设计师', '后端开发工程师', '市场运营专员', 'UI设计师'];

const statusBarOptions = ['草稿', '待审批', '待发放', '已发放', '已接受'];

export default function OfferTable({ offers, userRole, positionFilter, onPositionFilterChange, statusFilter, onStatusFilterChange, salarySort, onSalarySortChange, timeSort, onTimeSortChange, onRowClick, onApprove, onSend, onFollowUp, onOnboard, onSubmitApproval, onViewResult, onEdit, onWithdraw, onResend, onExport, onHistory }: Props) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [openHeaderDropdown, setOpenHeaderDropdown] = useState<string | null>(null);

  const handleMenuToggle = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === id ? null : id);
  };

  const handleActionClick = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    setOpenMenuId(null);
    fn();
  };

  const toggleHeaderDropdown = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setOpenHeaderDropdown(openHeaderDropdown === key ? null : key);
  };

  const closeHeaderDropdown = () => setOpenHeaderDropdown(null);

  const isEnded = (status: string) => ['已拒绝', '已撤回', '已过期', '已入职'].includes(status);

  const getProgressContent = (offer: Offer) => {
    const base = progressDisplayMap[offer.status] || { label: offer.status, sub: '' };
    let sub = base.sub;
    if (offer.status === '待审批' && offer.approver) sub = `等待${offer.approver}审批`;
    if (offer.status === '已发放' && offer.expiresAt) sub = `有效期至${offer.expiresAt.split(' ')[0]}`;
    if (offer.status === '已接受' && offer.startDate) sub = `预计${offer.startDate}`;
    if (offer.status === '已拒绝' && offer.rejectionReason) sub = `拒绝：${offer.rejectionReason.slice(0, 15)}${offer.rejectionReason.length > 15 ? '...' : ''}`;
    if (offer.status === '已撤回' && offer.retractedAt) sub = `撤回于${offer.retractedAt.split(' ')[0]}`;
    if (offer.status === '已过期' && offer.expiredAt) sub = `过期于${offer.expiredAt.split(' ')[0]}`;
    if (offer.status === '已入职' && offer.onboardedAt) sub = `入职于${offer.onboardedAt.split(' ')[0]}`;
    return { label: base.label, sub };
  };

  const renderAction = (offer: Offer) => {
    const isApprover = (userRole === 'hr_director' && offer.approverRole === 'hr_director') || (userRole === 'manager' && offer.approverRole === 'manager');
    const canSend = userRole === 'manager' || userRole === 'recruiter';

    if (offer.status === '草稿') {
      return (
        <button onClick={(e) => handleActionClick(e, () => onSubmitApproval(offer))} className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors font-medium">
          编辑并提交
        </button>
      );
    }
    if (offer.status === '待审批') {
      if (isApprover) {
        return (
          <button onClick={(e) => handleActionClick(e, () => onApprove(offer))} className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors font-medium">
            查看审批
          </button>
        );
      }
      return <span className="text-xs text-foreground-400">等待审批</span>;
    }
    if (offer.status === '待发放' || offer.status === '已通过') {
      if (canSend) {
        return (
          <button onClick={(e) => handleActionClick(e, () => onSend(offer))} className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors font-medium">
            发放Offer
          </button>
        );
      }
      return <span className="text-xs text-foreground-400">待发放</span>;
    }
    if (offer.status === '已发放') {
      return (
        <button onClick={(e) => handleActionClick(e, () => onFollowUp(offer))} className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors font-medium">
          跟进回复
        </button>
      );
    }
    if (offer.status === '已接受') {
      return (
        <button onClick={(e) => handleActionClick(e, () => onOnboard(offer))} className="px-3 py-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg cursor-pointer whitespace-nowrap transition-colors font-medium">
          确认入职
        </button>
      );
    }
    if (isEnded(offer.status)) {
      return (
        <button onClick={(e) => handleActionClick(e, () => onViewResult(offer))} className="px-3 py-1.5 text-xs border border-background-200 text-foreground-600 rounded-lg cursor-pointer whitespace-nowrap transition-colors hover:bg-background-50 font-medium">
          查看结果
        </button>
      );
    }
    return null;
  };

  const renderMenuItems = (offer: Offer) => {
    const items: { label: string; icon: string; onClick: () => void; danger?: boolean }[] = [];

    if (offer.status === '草稿') {
      items.push({ label: '编辑', icon: 'ri-edit-line', onClick: () => onEdit(offer) });
      items.push({ label: '撤回', icon: 'ri-close-circle-line', onClick: () => onWithdraw(offer), danger: true });
    } else if (offer.status === '待审批') {
      items.push({ label: '撤回', icon: 'ri-close-circle-line', onClick: () => onWithdraw(offer), danger: true });
    } else if (offer.status === '待发放' || offer.status === '已通过') {
      items.push({ label: '撤回', icon: 'ri-close-circle-line', onClick: () => onWithdraw(offer), danger: true });
    } else if (offer.status === '已发放') {
      items.push({ label: '重新发送', icon: 'ri-send-plane-line', onClick: () => onResend(offer) });
      items.push({ label: '撤回', icon: 'ri-close-circle-line', onClick: () => onWithdraw(offer), danger: true });
    } else if (offer.status === '已接受') {
      // no specific items here besides the common ones
    }

    // Common items for all
    items.push({ label: '导出', icon: 'ri-download-line', onClick: () => onExport(offer) });
    items.push({ label: '历史记录', icon: 'ri-history-line', onClick: () => onHistory(offer) });

    return items;
  };

  const salarySortLabel = () => {
    switch (salarySort) {
      case 'salary_asc': return '薪资↑';
      case 'salary_desc': return '薪资↓';
      case 'date_asc': return '入职日↑';
      case 'date_desc': return '入职日↓';
      default: return '';
    }
  };

  const timeSortLabel = () => {
    switch (timeSort) {
      case 'time_asc': return '最早↑';
      case 'time_desc': return '最新↓';
      default: return '';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
      <table className="w-full text-sm">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[16%]" />
          <col className="w-[20%]" />
          <col className="w-[15%]" />
          <col className="w-[19%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="bg-background-50/50 border-b border-background-200">
            <th className="text-left px-4 py-3">
              <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">候选人</span>
            </th>
            <th className="text-left px-4 py-3 relative">
              <button
                className="flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer hover:text-foreground-700 transition-colors"
                style={{ color: positionFilter ? 'oklch(var(--primary-500))' : 'oklch(var(--foreground-500))' }}
                onClick={(e) => toggleHeaderDropdown(e, 'position')}
              >
                应聘岗位
                <i className={`ri-arrow-down-s-line text-xs transition-transform ${openHeaderDropdown === 'position' ? 'rotate-180' : ''}`}></i>
              </button>
              {openHeaderDropdown === 'position' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={closeHeaderDropdown}></div>
                  <div className="absolute top-full left-2 mt-1 w-48 bg-white rounded-lg shadow-lg border border-background-200 z-20 py-1 max-h-56 overflow-y-auto">
                    <button onClick={() => { onPositionFilterChange(''); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap ${!positionFilter ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>全部岗位</button>
                    {positionOptions.map(p => (
                      <button key={p} onClick={() => { onPositionFilterChange(p); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap ${positionFilter === p ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>{p}</button>
                    ))}
                  </div>
                </>
              )}
            </th>
            <th className="text-left px-4 py-3 relative">
              <button
                className="flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer hover:text-foreground-700 transition-colors"
                style={{ color: salarySort ? 'oklch(var(--primary-500))' : 'oklch(var(--foreground-500))' }}
                onClick={(e) => toggleHeaderDropdown(e, 'salary')}
              >
                薪酬 / 入职日期
                {salarySortLabel() && <span className="text-[10px] font-normal">{salarySortLabel()}</span>}
                <i className={`ri-arrow-down-s-line text-xs transition-transform ${openHeaderDropdown === 'salary' ? 'rotate-180' : ''}`}></i>
              </button>
              {openHeaderDropdown === 'salary' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={closeHeaderDropdown}></div>
                  <div className="absolute top-full left-2 mt-1 w-36 bg-white rounded-lg shadow-lg border border-background-200 z-20 py-1">
                    <button onClick={() => { onSalarySortChange('salary_asc'); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${salarySort === 'salary_asc' ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>
                      <i className="ri-sort-asc text-xs"></i>薪资从低到高
                    </button>
                    <button onClick={() => { onSalarySortChange('salary_desc'); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${salarySort === 'salary_desc' ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>
                      <i className="ri-sort-desc text-xs"></i>薪资从高到低
                    </button>
                    <button onClick={() => { onSalarySortChange('date_asc'); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${salarySort === 'date_asc' ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>
                      <i className="ri-sort-asc text-xs"></i>入职日期从近到远
                    </button>
                    <button onClick={() => { onSalarySortChange('date_desc'); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${salarySort === 'date_desc' ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>
                      <i className="ri-sort-desc text-xs"></i>入职日期从远到近
                    </button>
                    {salarySort && (
                      <button onClick={() => { onSalarySortChange(''); closeHeaderDropdown(); }} className="w-full text-left px-3 py-2 text-sm text-foreground-400 hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap border-t border-background-200">
                        <i className="ri-close-line mr-1"></i>清除排序
                      </button>
                    )}
                  </div>
                </>
              )}
            </th>
            <th className="text-left px-4 py-3 relative">
              <button
                className="flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer hover:text-foreground-700 transition-colors"
                style={{ color: statusFilter ? 'oklch(var(--primary-500))' : 'oklch(var(--foreground-500))' }}
                onClick={(e) => toggleHeaderDropdown(e, 'status')}
              >
                当前进度
                <i className={`ri-arrow-down-s-line text-xs transition-transform ${openHeaderDropdown === 'status' ? 'rotate-180' : ''}`}></i>
              </button>
              {openHeaderDropdown === 'status' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={closeHeaderDropdown}></div>
                  <div className="absolute top-full left-2 mt-1 w-40 bg-white rounded-lg shadow-lg border border-background-200 z-20 py-1">
                    <button onClick={() => { onStatusFilterChange(''); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap ${!statusFilter ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>全部状态</button>
                    {statusBarOptions.map(s => (
                      <button key={s} onClick={() => { onStatusFilterChange(s); closeHeaderDropdown(); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap ${statusFilter === s ? 'text-primary-600 bg-primary-50' : 'text-foreground-600'}`}>{statusLabelMap[s]}</button>
                    ))}
                  </div>
                </>
              )}
            </th>
            <th className="text-left px-4 py-3 relative">
              <button
                className="flex items-center gap-1 text-xs font-medium whitespace-nowrap cursor-pointer hover:text-foreground-700 transition-colors"
                style={{ color: timeSort ? 'oklch(var(--primary-500))' : 'oklch(var(--foreground-500))' }}
                onClick={() => { onTimeSortChange(timeSort === 'time_desc' ? 'time_asc' : timeSort === 'time_asc' ? '' : 'time_desc'); }}
              >
                最新动态
                {timeSortLabel() && <span className="text-[10px] font-normal">{timeSortLabel()}</span>}
                <i className={`ri-arrow-up-down-line text-xs transition-colors ${timeSort ? '' : ''}`}></i>
              </button>
            </th>
            <th className="text-center px-4 py-3">
              <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const activity = getLatestActivity(offer);
            const progress = getProgressContent(offer);
            const menuItems = renderMenuItems(offer);
            return (
              <tr
                key={offer.id}
                onClick={() => onRowClick(offer)}
                className="border-b border-background-100 hover:bg-background-50/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary-600">{offer.candidateAvatar}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-900 whitespace-nowrap">{offer.candidateName}</p>
                      <p className="text-xs text-foreground-400 whitespace-nowrap">{offer.recruiter} 跟进</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-foreground-900 font-medium whitespace-nowrap">{offer.position}</p>
                  <p className="text-xs text-foreground-400 whitespace-nowrap">{offer.department}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-foreground-900 font-medium whitespace-nowrap">
                    税前月薪 ¥{Number(offer.salary).toLocaleString()}
                  </p>
                  <p className="text-xs text-foreground-400 whitespace-nowrap">
                    {offer.startDate ? `预计 ${offer.startDate} 入职` : '入职日期待定'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColorMap[offer.status]}`}>
                    {progress.label}
                  </span>
                  {progress.sub && (
                    <p className="text-[10px] text-foreground-400 mt-0.5 whitespace-nowrap">{progress.sub}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-foreground-600 whitespace-nowrap">{activity.text}</p>
                  {activity.time && (
                    <p className="text-[10px] text-foreground-400 whitespace-nowrap">{activity.time.split(' ')[0]}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {renderAction(offer)}
                    <div className="relative">
                      <button
                        onClick={(e) => handleMenuToggle(e, offer.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-colors cursor-pointer"
                      >
                        <i className="ri-more-2-fill text-sm"></i>
                      </button>
                      {openMenuId === offer.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}></div>
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-background-200 z-20 py-1" onClick={e => e.stopPropagation()}>
                            {menuItems.map((item, idx) => (
                              <button
                                key={idx}
                                onClick={(e) => handleActionClick(e, item.onClick)}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-foreground-600'}`}
                              >
                                <i className={`${item.icon} text-foreground-400 ${item.danger ? '!text-red-400' : ''}`}></i>
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
          {offers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-16 text-center text-foreground-400">
                <div className="flex flex-col items-center gap-2">
                  <i className="ri-mail-send-line text-2xl"></i>
                  <p className="text-sm">暂无匹配的 Offer 记录</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}