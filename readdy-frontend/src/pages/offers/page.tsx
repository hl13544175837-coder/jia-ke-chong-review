import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { offers as initialOffers } from '@/mocks/offers';
import type { Offer } from '@/mocks/offers';
import { useToast } from '@/hooks/useToast';
import OfferTable from '@/pages/offers/components/OfferTable';
import OfferDetailDrawer from '@/pages/offers/components/OfferDetailDrawer';
import CreateOfferModal from '@/pages/offers/components/CreateOfferModal';

type TabKey = '全部' | '待提交' | '审批中' | '待发放' | '待回复' | '待入职' | '已结束';

const tabStatusMap: Record<TabKey, string[]> = {
  '全部': ['草稿', '待审批', '已通过', '待发放', '已发放', '已接受', '已拒绝', '已撤回', '已过期', '已入职'],
  '待提交': ['草稿'],
  '审批中': ['待审批'],
  '待发放': ['已通过', '待发放'],
  '待回复': ['已发放'],
  '待入职': ['已接受'],
  '已结束': ['已拒绝', '已撤回', '已过期', '已入职'],
};

const statusLabelMap: Record<string, string> = {
  '草稿': '待提交',
  '待审批': '审批中',
  '已通过': '待发放',
  '待发放': '待发放',
  '已发放': '等待回复',
  '已接受': '待入职',
  '已拒绝': '已结束',
  '已撤回': '已结束',
  '已过期': '已结束',
  '已入职': '已结束',
};

const SESSION_KEY = 'zhipin-offers-v3-state';

function saveState(state: Record<string, unknown>) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* noop */ }
}
function loadState(): Record<string, unknown> | null {
  try { const raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function OffersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as {
    fromInterviews?: boolean; candidateName?: string; position?: string; reqId?: string; reqName?: string; fromDashboard?: boolean;
  } | null;
  const fromInterviews = !!navState?.fromInterviews;
  const fromDashboard = !!navState?.fromDashboard;
  const { showToast } = useToast();
  const saved = useRef(loadState()).current;
  const savedScrollTop = saved?.scrollTop as number | undefined;
  const userRole = localStorage.getItem('zhipin-current-role') || 'recruiter';
  const tableRef = useRef<HTMLDivElement>(null);

  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [activeTab, setActiveTab] = useState<TabKey>((saved?.activeTab as TabKey) || '全部');
  const [searchTerm, setSearchTerm] = useState((saved?.searchTerm as string) || '');
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createPreFill, setCreatePreFill] = useState<{
    candidateName: string; candidateAvatar: string; position: string; department: string; reqId: string; reqName: string;
  } | null>(null);

  // Header-driven filters
  const [positionFilter, setPositionFilter] = useState((saved?.positionFilter as string) || '');
  const [statusFilter, setStatusFilter] = useState((saved?.statusFilter as string) || '');
  const [salarySort, setSalarySort] = useState((saved?.salarySort as string) || '');
  const [timeSort, setTimeSort] = useState((saved?.timeSort as string) || '');

  // More filters dropdown state
  const [moreFilterOpen, setMoreFilterOpen] = useState(false);
  const [approverFilter, setApproverFilter] = useState((saved?.approverFilter as string) || '');
  const [dateFilter, setDateFilter] = useState((saved?.dateFilter as string) || '');

  // Confirmation modals
  const [confirmOnboard, setConfirmOnboard] = useState<Offer | null>(null);
  const [onboardDate, setOnboardDate] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState<Offer | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<Offer | null>(null);

  const persist = () => {
    saveState({ activeTab, positionFilter, statusFilter, salarySort, timeSort, approverFilter, dateFilter, searchTerm, scrollTop: tableRef.current?.scrollTop || 0 });
  };

  const navigateTo = (url: string) => {
    persist();
    navigate(url);
  };

  useEffect(() => {
    if (savedScrollTop && tableRef.current) {
      setTimeout(() => { tableRef.current?.scrollTo({ top: savedScrollTop, behavior: 'instant' as const }); }, 50);
    }
  }, [savedScrollTop]);

  useEffect(() => {
    if (fromInterviews && navState?.candidateName) {
      const exists = offers.find(o => o.candidateName === navState.candidateName && o.reqId === navState.reqId);
      if (!exists) {
        setCreatePreFill({
          candidateName: navState.candidateName,
          candidateAvatar: navState.candidateName.charAt(0),
          position: navState.position || '',
          department: offers.find(o => o.position === navState.position)?.department || '',
          reqId: navState.reqId || '',
          reqName: navState.reqName || '',
        });
        setShowCreate(true);
      }
    }
  }, [fromInterviews, navState?.candidateName, navState?.position, navState?.reqId, navState?.reqName, offers]);

  // Filter options
  const approverOptions = useMemo(() => [...new Set(offers.map(o => o.approver))].sort(), [offers]);
  const dateOptions = useMemo(() => {
    const dates = new Set<string>();
    offers.forEach(o => {
      if (o.sentAt) dates.add(o.sentAt.split(' ')[0]);
      if (o.submittedAt) dates.add(o.submittedAt.split(' ')[0]);
      if (o.approvedAt) dates.add(o.approvedAt.split(' ')[0]);
      if (o.respondedAt) dates.add(o.respondedAt.split(' ')[0]);
      if (o.onboardedAt) dates.add(o.onboardedAt.split(' ')[0]);
    });
    return [...dates].sort().reverse();
  }, [offers]);

  // Count per tab
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {} as Record<TabKey, number>;
    (Object.keys(tabStatusMap) as TabKey[]).forEach((key) => {
      counts[key] = offers.filter(o => tabStatusMap[key].includes(o.status)).length;
    });
    return counts;
  }, [offers]);

  // Combined filtering
  const filtered = useMemo(() => {
    let data = offers.filter(o => tabStatusMap[activeTab].includes(o.status));

    if (positionFilter) data = data.filter(o => o.position === positionFilter);
    if (statusFilter) data = data.filter(o => o.status === statusFilter);
    if (approverFilter) data = data.filter(o => o.approver === approverFilter);
    if (dateFilter) {
      data = data.filter(o => {
        const dates = [o.sentAt, o.submittedAt, o.approvedAt, o.respondedAt, o.onboardedAt, o.retractedAt, o.expiredAt, o.createdAt].filter(Boolean);
        return dates.some(d => d && d.startsWith(dateFilter));
      });
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(o =>
        o.candidateName.toLowerCase().includes(term) ||
        o.position.toLowerCase().includes(term) ||
        o.department.toLowerCase().includes(term) ||
        o.reqName.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    if (salarySort) {
      const sorted = [...data];
      switch (salarySort) {
        case 'salary_asc':
          sorted.sort((a, b) => Number(a.salary) - Number(b.salary));
          break;
        case 'salary_desc':
          sorted.sort((a, b) => Number(b.salary) - Number(a.salary));
          break;
        case 'date_asc':
          sorted.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
          break;
        case 'date_desc':
          sorted.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
          break;
      }
      data = sorted;
    }

    if (timeSort) {
      const sorted = [...data];
      const getTime = (o: Offer) => {
        const t = o.respondedAt || o.sentAt || o.approvedAt || o.submittedAt || o.createdAt || '';
        return t;
      };
      if (timeSort === 'time_desc') {
        sorted.sort((a, b) => getTime(b).localeCompare(getTime(a)));
      } else {
        sorted.sort((a, b) => getTime(a).localeCompare(getTime(b)));
      }
      data = sorted;
    }

    return data;
  }, [offers, activeTab, positionFilter, statusFilter, approverFilter, dateFilter, searchTerm, salarySort, timeSort]);

  const hasActiveFilters = positionFilter || statusFilter || approverFilter || dateFilter || searchTerm || salarySort || timeSort;

  const clearAllFilters = useCallback(() => {
    setPositionFilter('');
    setStatusFilter('');
    setApproverFilter('');
    setDateFilter('');
    setSearchTerm('');
    setSalarySort('');
    setTimeSort('');
  }, []);

  // Action handlers
  const openDetail = (offer: Offer) => {
    setSelectedOffer(offer);
    setShowDetail(true);
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedOffer(null);
  };

  const handleCreateOffer = (data: { salary: string; startDate: string; notes: string; candidateName: string; candidateAvatar: string; position: string; department: string; reqId: string; reqName: string }) => {
    const newId = Math.max(...offers.map(o => o.id), 0) + 1;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const newOffer: Offer = {
      id: newId,
      candidateName: data.candidateName,
      candidateAvatar: data.candidateAvatar,
      position: data.position,
      department: data.department,
      reqId: data.reqId,
      reqName: data.reqName,
      salary: data.salary,
      startDate: data.startDate,
      status: '草稿',
      approver: userRole === 'manager' ? '人力资源总监' : '招聘主管',
      approverRole: userRole === 'manager' ? 'hr_director' : 'manager',
      submittedBy: userRole === 'recruiter' ? '李华' : '张敏',
      submittedAt: '',
      approvedAt: null,
      sentAt: null,
      respondedAt: null,
      retractedAt: null,
      expiredAt: null,
      onboardedAt: null,
      recruiter: userRole === 'recruiter' ? '李华' : '张敏',
      notes: data.notes,
      rejectionReason: '',
      createdAt: now,
      salaryBreakdown: [{ item: '基本工资', amount: data.salary }, { item: '绩效工资（预估）', amount: '0' }],
      offerVersions: [{ version: 1, date: now.split(' ')[0], changes: `初始版本，定薪${Number(data.salary).toLocaleString()}元/月` }],
      sendRecords: [],
      approvalHistory: [],
      candidateReply: null,
      expiresAt: '',
      currentStep: '待提交审批',
    };
    setOffers(prev => [...prev, newOffer]);
    setShowCreate(false);
    setCreatePreFill(null);
    showToast('Offer 草稿已创建，请编辑后提交审批');
    setSelectedOffer(newOffer);
    setShowDetail(true);
  };

  const handleSubmitApproval = (id: number) => {
    const now = '2026-07-19 10:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: '待审批' as const,
        submittedAt: now,
        approvalHistory: [...(o.approvalHistory || []), { approver: o.recruiter, action: '提交审批', date: now, comment: '' }],
        currentStep: `等待${o.approver}审批`,
      };
    }));
    showToast('Offer 已提交审批');
    closeDetail();
  };

  const handleApprove = (id: number, action: '通过' | '拒绝') => {
    const now = '2026-07-19 11:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: action === '通过' ? '待发放' as const : '已拒绝' as const,
        approvedAt: action === '通过' ? now : null,
        rejectionReason: action === '拒绝' ? '审批未通过，薪酬超出岗位预算范围。' : o.rejectionReason,
        approvalHistory: [...(o.approvalHistory || []), { approver: o.approver, action: action === '通过' ? '审批通过' : '审批拒绝', date: now, comment: action === '通过' ? '同意按建议薪酬发放。' : '薪酬超出预算。' }],
        currentStep: action === '通过' ? '审批已通过，待发放' : '已结束（审批拒绝）',
      };
    }));
    showToast(action === '通过' ? '审批已通过，请尽快发放 Offer' : '已拒绝该 Offer 申请');
    closeDetail();
  };

  const handleSend = (id: number) => {
    const now = '2026-07-19 14:00';
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + 14);
    const expireStr = expireDate.toISOString().split('T')[0] + ' 14:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: '已发放' as const,
        sentAt: now,
        expiresAt: expireStr,
        sendRecords: [
          { channel: '邮件', sentAt: now, status: '已送达' },
          { channel: '电子签', sentAt: now, status: '待签署' },
          { channel: '企业微信', sentAt: now, status: '已读' },
        ],
        currentStep: `等待候选人回复（有效期至${expireStr.split(' ')[0]}）`,
      };
    }));
    showToast('Offer 已成功发放');
    closeDetail();
  };

  const handleFollowUp = (id: number) => {
    showToast('已发送跟进提醒给候选人');
  };

  const handleAccept = (id: number) => {
    const now = '2026-07-19 18:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: '已接受' as const,
        respondedAt: now,
        candidateReply: { repliedAt: now, answer: '接受', note: '候选人已确认接受Offer。' },
        currentStep: '待入职',
      };
    }));
    showToast('候选人已接受 Offer，请跟进入职流程');
    closeDetail();
  };

  const handleReject = (id: number, reason: string) => {
    const now = '2026-07-19 18:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: '已拒绝' as const,
        respondedAt: now,
        rejectionReason: reason,
        candidateReply: { repliedAt: now, answer: '拒绝', note: reason },
        currentStep: '已结束（候选人拒绝）',
      };
    }));
    showToast('Offer 已标记为拒绝');
    closeDetail();
  };

  const handleRetract = (id: number) => {
    const now = '2026-07-19 10:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== id) return o;
      return {
        ...o,
        status: '已撤回' as const,
        retractedAt: now,
        rejectionReason: '手动撤回',
        approvalHistory: [...(o.approvalHistory || []), { approver: o.recruiter, action: '撤回Offer', date: now, comment: '手动撤回' }],
        currentStep: '已结束（已撤回）',
      };
    }));
    showToast('Offer 已撤回');
    setConfirmWithdraw(null);
    closeDetail();
  };

  const handleOnboardConfirm = () => {
    if (!confirmOnboard || !onboardDate) return;
    setOffers(prev => prev.map(o => {
      if (o.id !== confirmOnboard.id) return o;
      return {
        ...o,
        status: '已入职' as const,
        onboardedAt: `${onboardDate} 09:00`,
        currentStep: `已结束（${onboardDate}已入职）`,
      };
    }));
    showToast(`候选人已确认入职（${onboardDate}），Offer 流程结束`);
    setConfirmOnboard(null);
    setOnboardDate('');
    closeDetail();
  };

  // Three-dot menu actions
  const handleEdit = (offer: Offer) => { openDetail(offer); };
  const handleWithdrawClick = (offer: Offer) => { setConfirmWithdraw(offer); };
  const handleResend = (offer: Offer) => {
    const now = '2026-07-19 14:00';
    setOffers(prev => prev.map(o => {
      if (o.id !== offer.id) return o;
      return {
        ...o,
        sendRecords: [...(o.sendRecords || []), { channel: '邮件', sentAt: now, status: '已送达' }],
      };
    }));
    showToast('Offer 已重新发送');
  };
  const handleExport = (_offer: Offer) => { showToast('Offer 已导出为 PDF'); };
  const handleHistory = (offer: Offer) => { openDetail(offer); };

  // Sort a label from the sort state for tag display
  const salarySortLabel = () => {
    switch (salarySort) {
      case 'salary_asc': return '薪资从低到高';
      case 'salary_desc': return '薪资从高到低';
      case 'date_asc': return '入职日期从近到远';
      case 'date_desc': return '入职日期从远到近';
      default: return '';
    }
  };
  const timeSortLabel = () => {
    switch (timeSort) {
      case 'time_asc': return '最早更新优先';
      case 'time_desc': return '最新更新优先';
      default: return '';
    }
  };

  const moreFilterCount = [approverFilter, dateFilter].filter(Boolean).length;

  return (
    <div className="p-6 max-w-[1440px] mx-auto">
      {/* Breadcrumb */}
      {(fromInterviews || fromDashboard) && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigateTo(fromInterviews ? '/interviews' : '/dashboard')} className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800 transition-colors cursor-pointer">
            <i className="ri-arrow-left-line"></i>
            {fromInterviews ? '返回面试管理' : '返回工作台'}
          </button>
          {navState?.candidateName && fromInterviews && (
            <>
              <span className="text-foreground-300">/</span>
              <span className="text-sm font-medium text-foreground-900">推进 Offer：{navState.candidateName}</span>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground-900">Offer 管理</h1>
          <p className="text-sm text-foreground-500 mt-1">管理 Offer 审批、发放与候选人回复</p>
        </div>
        <button
          onClick={() => { setCreatePreFill(null); setShowCreate(true); }}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
        >
          <i className="ri-add-line text-base"></i>
          发起 Offer
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 mb-4 w-fit">
        {(Object.keys(tabStatusMap) as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab ? 'bg-white text-foreground-900 shadow-sm' : 'text-foreground-500 hover:text-foreground-700'
            }`}
          >
            {tab}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab ? 'bg-background-100 text-foreground-600' : 'bg-background-200/70 text-foreground-400'
            }`}>
              {tabCounts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter Bar — compact: search + more */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索候选人、岗位..."
            className="w-full pl-8 pr-3 py-2 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300 placeholder:text-foreground-400"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-400 hover:text-foreground-600 cursor-pointer">
              <i className="ri-close-circle-line text-sm"></i>
            </button>
          )}
        </div>

        {/* More Filters */}
        <div className="relative">
          <button
            onClick={() => setMoreFilterOpen(!moreFilterOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap ${
              moreFilterCount > 0 ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-background-200 bg-white text-foreground-600 hover:border-background-300'
            }`}
          >
            <i className="ri-filter-3-line text-xs"></i>
            更多筛选
            {moreFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary-500 text-white text-[10px] flex items-center justify-center">{moreFilterCount}</span>
            )}
            <i className={`${moreFilterOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-xs`}></i>
          </button>
          {moreFilterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreFilterOpen(false)}></div>
              <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-background-200 z-20 p-3 space-y-3">
                {/* Approver */}
                <div>
                  <p className="text-xs font-medium text-foreground-500 mb-1.5">审批人</p>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    <button onClick={() => { setApproverFilter(''); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded cursor-pointer transition-colors ${!approverFilter ? 'text-primary-600 bg-primary-50' : 'text-foreground-600 hover:bg-background-50'}`}>全部审批人</button>
                    {approverOptions.map(a => (
                      <button key={a} onClick={() => { setApproverFilter(a); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded cursor-pointer transition-colors ${approverFilter === a ? 'text-primary-600 bg-primary-50' : 'text-foreground-600 hover:bg-background-50'}`}>{a}</button>
                    ))}
                  </div>
                </div>
                {/* Date */}
                <div>
                  <p className="text-xs font-medium text-foreground-500 mb-1.5">时间</p>
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    <button onClick={() => { setDateFilter(''); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded cursor-pointer transition-colors ${!dateFilter ? 'text-primary-600 bg-primary-50' : 'text-foreground-600 hover:bg-background-50'}`}>全部时间</button>
                    {dateOptions.map(d => (
                      <button key={d} onClick={() => { setDateFilter(d); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded cursor-pointer transition-colors ${dateFilter === d ? 'text-primary-600 bg-primary-50' : 'text-foreground-600 hover:bg-background-50'}`}>{d}</button>
                    ))}
                  </div>
                </div>
                {(approverFilter || dateFilter) && (
                  <button onClick={() => { setApproverFilter(''); setDateFilter(''); }} className="text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer">清除</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active Filter & Sort Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {positionFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
              岗位：{positionFilter}
              <button onClick={() => setPositionFilter('')} className="cursor-pointer hover:text-primary-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {statusFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
              进度：{statusLabelMap[statusFilter] || statusFilter}
              <button onClick={() => setStatusFilter('')} className="cursor-pointer hover:text-primary-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {approverFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
              审批人：{approverFilter}
              <button onClick={() => setApproverFilter('')} className="cursor-pointer hover:text-primary-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {dateFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
              时间：{dateFilter}
              <button onClick={() => setDateFilter('')} className="cursor-pointer hover:text-primary-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {searchTerm && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
              搜索：{searchTerm}
              <button onClick={() => setSearchTerm('')} className="cursor-pointer hover:text-primary-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {salarySort && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-50 text-accent-700 rounded-full text-xs font-medium">
              {salarySortLabel()}
              <button onClick={() => setSalarySort('')} className="cursor-pointer hover:text-accent-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          {timeSort && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-50 text-accent-700 rounded-full text-xs font-medium">
              {timeSortLabel()}
              <button onClick={() => setTimeSort('')} className="cursor-pointer hover:text-accent-900"><i className="ri-close-line"></i></button>
            </span>
          )}
          <button onClick={clearAllFilters} className="text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap flex items-center gap-1">
            <i className="ri-close-circle-line"></i>清除全部
          </button>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef}>
        <OfferTable
          offers={filtered}
          userRole={userRole}
          positionFilter={positionFilter}
          onPositionFilterChange={setPositionFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          salarySort={salarySort}
          onSalarySortChange={setSalarySort}
          timeSort={timeSort}
          onTimeSortChange={setTimeSort}
          onRowClick={openDetail}
          onApprove={(offer) => { setSelectedOffer(offer); setShowDetail(true); }}
          onSend={(offer) => { setSelectedOffer(offer); setShowDetail(true); }}
          onFollowUp={(offer) => handleFollowUp(offer.id)}
          onOnboard={(offer) => { setConfirmOnboard(offer); setOnboardDate(offer.startDate || ''); }}
          onSubmitApproval={(offer) => handleSubmitApproval(offer.id)}
          onViewResult={openDetail}
          onEdit={handleEdit}
          onWithdraw={handleWithdrawClick}
          onResend={handleResend}
          onExport={handleExport}
          onHistory={handleHistory}
        />
      </div>

      {/* Detail Drawer */}
      {showDetail && selectedOffer && (
        <OfferDetailDrawer
          offer={selectedOffer}
          userRole={userRole}
          onClose={closeDetail}
          onApprove={handleApprove}
          onSend={handleSend}
          onAccept={handleAccept}
          onReject={handleReject}
          onRetract={handleRetract}
          onSubmitApproval={handleSubmitApproval}
          onFollowUp={handleFollowUp}
          onOnboard={(id) => { const o = offers.find(x => x.id === id); if (o) { setConfirmOnboard(o); setOnboardDate(o.startDate || ''); } }}
        />
      )}

      {/* Create Offer Modal */}
      <CreateOfferModal
        show={showCreate}
        preFill={createPreFill}
        onClose={() => { setShowCreate(false); setCreatePreFill(null); }}
        onCreate={handleCreateOffer}
      />

      {/* Confirm Onboard Modal */}
      {confirmOnboard && (
        <div className="fixed inset-0 bg-foreground-900/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOnboard(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-background-200">
              <h3 className="text-base font-semibold text-foreground-900">确认入职</h3>
              <p className="text-xs text-foreground-500 mt-0.5">{confirmOnboard.candidateName} · {confirmOnboard.position}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground-600 mb-1.5 block">实际入职日期</label>
                <input
                  type="date"
                  value={onboardDate}
                  onChange={(e) => setOnboardDate(e.target.value)}
                  className="w-full px-3 py-2 bg-background-50 border border-background-200 rounded-lg text-sm text-foreground-900 focus:outline-none focus:border-primary-300"
                />
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-xs text-emerald-700">确认后将同步更新候选人状态为"已入职"，并更新 HC 统计。</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmOnboard(null)} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">取消</button>
                <button onClick={handleOnboardConfirm} disabled={!onboardDate} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${onboardDate ? 'bg-primary-500 text-white hover:bg-primary-600' : 'bg-background-200 text-foreground-400 cursor-not-allowed'}`}>确认入职</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Withdraw Modal */}
      {confirmWithdraw && (
        <div className="fixed inset-0 bg-foreground-900/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmWithdraw(null)}>
          <div className="bg-white rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-background-200">
              <h3 className="text-base font-semibold text-foreground-900">撤回 Offer</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-foreground-600">确定要撤回 <strong>{confirmWithdraw.candidateName}</strong> 的 Offer 吗？撤回后 Offer 将标记为"已撤回"。</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmWithdraw(null)} className="flex-1 px-4 py-2.5 border border-background-200 text-foreground-700 rounded-lg text-sm font-medium hover:bg-background-50 transition-colors cursor-pointer whitespace-nowrap">取消</button>
                <button onClick={() => handleRetract(confirmWithdraw.id)} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap">确认撤回</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
