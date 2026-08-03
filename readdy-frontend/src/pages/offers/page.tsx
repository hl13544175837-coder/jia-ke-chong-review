import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProductRole } from '@/auth/productRole';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { offersApi } from '@/features/offers/api';
import type { OfferAction, OfferActionInput, OfferRecord } from '@/features/offers/types';
import { useToast } from '@/hooks/useToast';
import { userFacingError } from '@/lib/userFacingError';
import CreateOfferModal from './components/CreateOfferModal';
import OfferDetailDrawer from './components/OfferDetailDrawer';
import OfferTable from './components/OfferTable';
import {
  buildOfferTabCounts,
  filterAndSortOffers,
  OFFER_WORKBENCH_TABS,
  offerRisk,
  type OfferOrder,
  type OfferRiskLevel,
  type OfferWorkbenchTab,
} from './workbench';

function replaceOffer(items: OfferRecord[], next: OfferRecord) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [next, ...items];
  return items.map((item) => item.id === next.id ? next : item);
}

function initialOfferTab(value: string | null): OfferWorkbenchTab {
  if (OFFER_WORKBENCH_TABS.some((tab) => tab.key === value)) return value as OfferWorkbenchTab;
  if (value === 'delivery') return 'approved';
  if (value === 'reply') return 'sent';
  if (value === 'onboard') return 'accepted';
  if (value === 'closed') return 'history';
  return 'today';
}

function initialOfferRisk(value: string | null): '' | OfferRiskLevel {
  return value === 'high' || value === 'medium' || value === 'low' ? value : '';
}

function initialOfferOrder(value: string | null): OfferOrder {
  return value === 'updated' || value === 'onboard' ? value : 'urgent';
}

function setOfferSearchParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  defaultValue = '',
) {
  if (!value || value === defaultValue) searchParams.delete(key);
  else searchParams.set(key, value);
}

export default function OffersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const requestedOfferId = Number(searchParams.get('offer')) || null;
  const fromJobs = searchParams.get('from') === 'jobs';
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const { role } = useProductRole();
  const { showToast } = useToast();
  const detailRequest = useRef(0);
  const handledDeepLink = useRef('');
  const handledOfferDetail = useRef<number | null>(null);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [unmappedTotal, setUnmappedTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<OfferWorkbenchTab>(() => initialOfferTab(searchParams.get('tab')));
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [demandFilter, setDemandFilter] = useState(() => searchParams.get('request') || '');
  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get('owner') || '');
  const [riskFilter, setRiskFilter] = useState<'' | OfferRiskLevel>(() => initialOfferRisk(searchParams.get('risk')));
  const [order, setOrder] = useState<OfferOrder>(() => initialOfferOrder(searchParams.get('order')));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [demandsLoading, setDemandsLoading] = useState(true);
  const [demandsError, setDemandsError] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<OfferRecord | null>(null);
  const [requestedAction, setRequestedAction] = useState<OfferAction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferRecord | null>(null);
  const [createPrefill, setCreatePrefill] = useState<{ demandId: number; candidateId: number } | null>(null);

  useEffect(() => {
    if (role === 'manager' && !searchParams.has('tab')) setActiveTab('pending');
  }, [role, searchParams]);

  const syncOfferWorkspaceUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    setOfferSearchParam(next, 'tab', activeTab, 'today');
    setOfferSearchParam(next, 'q', search);
    setOfferSearchParam(next, 'request', demandFilter);
    setOfferSearchParam(next, 'owner', ownerFilter);
    setOfferSearchParam(next, 'risk', riskFilter);
    setOfferSearchParam(next, 'order', order, 'urgent');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, demandFilter, order, ownerFilter, riskFilter, search, searchParams, setSearchParams]);

  useEffect(() => {
    syncOfferWorkspaceUrl();
  }, [syncOfferWorkspaceUrl]);

  const openOfferInUrl = useCallback((offerId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('offer', String(offerId));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await offersApi.listOffers(search ? { search } : {});
      setOffers(response.items);
      setUnmappedTotal(response.unmapped_total);
    } catch (error) {
      setLoadError(userFacingError(error, '加载 Offer 失败'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadDemands = useCallback(async () => {
    setDemandsLoading(true);
    setDemandsError('');
    try {
      const response = await demandsApi.listDemands();
      setDemands(response.items);
    } catch (error) {
      setDemandsError(error instanceof Error ? error.message : '加载招聘需求失败');
    } finally {
      setDemandsLoading(false);
    }
  }, []);

  useEffect(() => { void loadOffers(); }, [loadOffers]);
  useEffect(() => { void loadDemands(); }, [loadDemands]);

  const approvedDemands = useMemo(
    () => demands.filter((demand) => demand.approval_status === 'approved' && demand.status === 'active'),
    [demands],
  );

  const scopedOffers = useMemo(
    () => requestedDemandId ? offers.filter((offer) => (
      offer.demand_id === requestedDemandId
      && (!(fromJobs || fromDashboard) || !['declined', 'withdrawn', 'expired', 'onboarded'].includes(offer.status))
    )) : offers,
    [fromDashboard, fromJobs, offers, requestedDemandId],
  );
  const demandContext = useMemo(
    () => requestedDemandId ? demands.find((demand) => demand.id === requestedDemandId) ?? null : null,
    [demands, requestedDemandId],
  );
  const counts = useMemo(() => buildOfferTabCounts(scopedOffers), [scopedOffers]);
  const visibleOffers = useMemo(() => filterAndSortOffers({
    items: scopedOffers,
    tab: activeTab,
    search,
    demand: demandFilter,
    owner: ownerFilter,
    risk: riskFilter,
    order,
  }), [activeTab, demandFilter, order, ownerFilter, riskFilter, scopedOffers, search]);
  const demandOptions = useMemo(() => Array.from(new Map(
    scopedOffers.map((offer) => [offer.request_no, `${offer.position} · ${offer.request_no}`]),
  ).entries()).filter(([value]) => Boolean(value)), [scopedOffers]);
  const ownerOptions = useMemo(() => Array.from(new Set(
    scopedOffers.map((offer) => offer.created_by_name).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'zh-CN')), [scopedOffers]);
  const highRiskCount = useMemo(
    () => scopedOffers.filter((offer) => offerRisk(offer).level === 'high' && offer.status !== 'expired').length,
    [scopedOffers],
  );

  const hasFilters = Boolean(
    search
    || demandFilter.trim()
    || ownerFilter.trim()
    || riskFilter
    || order !== 'urgent',
  );

  const resetOfferFilters = () => {
    setSearchInput('');
    setSearch('');
    setDemandFilter('');
    setOwnerFilter('');
    setRiskFilter('');
    setOrder('urgent');
  };

  const selectTab = (tab: OfferWorkbenchTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'today') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const openDetail = useCallback(async (summary: OfferRecord, rememberInUrl = true) => {
    if (rememberInUrl) openOfferInUrl(summary.id);
    const requestId = ++detailRequest.current;
    setSelectedOffer(summary);
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await offersApi.getOffer(summary.id);
      if (detailRequest.current !== requestId) return;
      setOffers((current) => replaceOffer(current, detail));
      setSelectedOffer(detail);
    } catch (error) {
      if (detailRequest.current !== requestId) return;
      setDetailError(error instanceof Error ? error.message : '加载 Offer 详情失败');
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false);
    }
  }, [openOfferInUrl]);

  useEffect(() => {
    if (!requestedOfferId || loading || handledOfferDetail.current === requestedOfferId) return;
    const existing = offers.find((offer) => offer.id === requestedOfferId);
    if (!existing) return;
    handledOfferDetail.current = requestedOfferId;
    void openDetail(existing, false);
  }, [loading, offers, openDetail, requestedOfferId]);

  useEffect(() => {
    if (!requestedDemandId || !requestedCandidateId || loading || demandsLoading) return;
    const key = `${requestedDemandId}:${requestedCandidateId}`;
    if (handledDeepLink.current === key) return;
    handledDeepLink.current = key;
    const existing = offers.find((offer) => (
      offer.demand_id === requestedDemandId && offer.candidate_id === requestedCandidateId
    ));
    const next = new URLSearchParams(searchParams);
    if (existing) {
      void openDetail(existing, false);
      next.set('offer', String(existing.id));
    } else if (approvedDemands.some((demand) => demand.id === requestedDemandId)) {
      setEditingOffer(null);
      setCreatePrefill({ demandId: requestedDemandId, candidateId: requestedCandidateId });
      setShowCreate(true);
    } else {
      setDemandsError('对应需求不可创建 Offer，请确认需求仍在招聘中且已审核通过');
    }
    next.delete('candidate');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [approvedDemands, demandsLoading, loading, offers, openDetail, requestedCandidateId, requestedDemandId, searchParams, setSearchParams]);

  const closeOfferDetail = () => {
    detailRequest.current += 1;
    setSelectedOffer(null);
    setDetailLoading(false);
    setDetailError('');
    setRequestedAction(null);
    const next = new URLSearchParams(searchParams);
    next.delete('offer');
    setSearchParams(next, { replace: true });
  };

  const refreshSelected = async () => {
    if (!selectedOffer) return;
    const detail = await offersApi.getOffer(selectedOffer.id);
    setOffers((current) => replaceOffer(current, detail));
    setSelectedOffer(detail);
  };

  const runAction = async (offer: OfferRecord, payload: OfferActionInput) => {
    const updated = await offersApi.runAction(offer.id, payload);
    setOffers((current) => replaceOffer(current, updated));
    setSelectedOffer(updated);
    showToast('操作已保存');
    return updated;
  };

  const handleSaved = (saved: OfferRecord) => {
    setOffers((current) => replaceOffer(current, saved));
    setShowCreate(false);
    setEditingOffer(null);
    setCreatePrefill(null);
    setSelectedOffer(saved);
    setDetailError('');
    openOfferInUrl(saved.id);
    showToast('Offer 草稿已保存');
  };

  const openCreate = () => {
    closeOfferDetail();
    setEditingOffer(null);
    setCreatePrefill(null);
    setShowCreate(true);
  };

  const openEdit = (offer: OfferRecord) => {
    closeOfferDetail();
    setEditingOffer(offer);
    setCreatePrefill(null);
    setShowCreate(true);
  };

  const openPrimaryAction = (offer: OfferRecord) => {
    const canMaintain = role === 'recruiter' || role === 'admin';
    if (canMaintain && (offer.status === 'draft' || offer.status === 'rejected')) {
      openEdit(offer);
      return;
    }
    const actionByStatus: Partial<Record<OfferRecord['status'], OfferAction>> = {
      pending: role === 'manager' || role === 'admin' ? 'approve' : undefined,
      approved: 'send',
      sent: 'accept',
      accepted: 'onboard',
    };
    setRequestedAction(actionByStatus[offer.status] ?? null);
    void openDetail(offer);
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-offer-lifecycle">
      <PageHeader
        title="Offer 管理"
        visuallyHiddenTitle
        description={role === 'manager'
          ? '确认或退回招聘专员提交的 Offer 方案'
          : '确认方案、登记发放、跟进回复和确认入职'}
        leading={fromDashboard && !requestedDemandId ? (
          <button type="button" onClick={() => navigate('/dashboard')} aria-label="返回工作台" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-background-200 bg-white text-foreground-600 hover:bg-background-50"><ArrowLeft size={17} /></button>
        ) : undefined}
        actions={(role === 'recruiter' || role === 'admin') ? (
          <button
            type="button"
            onClick={openCreate}
            disabled={demandsLoading || Boolean(demandsError) || approvedDemands.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-add-line text-base" aria-hidden="true"></i>
            {demandsLoading ? '加载需求中' : '新建 Offer'}
          </button>
        ) : undefined}
      />

      {role === 'manager' && (
        <section data-ui="manager-offer-scope" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-xs text-primary-800">
          <span className="font-semibold">主管处理范围</span>
          <span>这里只需要确认或退回待审批 Offer；草稿维护、发放登记、候选人回复和入职登记由招聘专员处理。</span>
        </section>
      )}

      {requestedDemandId && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3" aria-label="当前岗位 Offer">
          <div className="flex min-w-0 items-center gap-3">
            {(fromJobs || fromDashboard) && <button type="button" onClick={() => navigate(fromDashboard ? '/dashboard' : '/jobs')} aria-label={fromDashboard ? '返回工作台' : '返回招聘需求'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-white text-primary-700 hover:bg-primary-50"><ArrowLeft size={17} /></button>}
            <div className="min-w-0"><p className="text-xs font-semibold text-primary-700">当前岗位 Offer</p><p className="mt-0.5 truncate text-sm font-medium text-foreground-900">{demandContext?.job_title || `招聘需求 #${requestedDemandId}`}</p><p className="mt-0.5 text-xs text-foreground-500">只显示这个岗位的 Offer，共 {scopedOffers.length} 条</p></div>
          </div>
          <button type="button" onClick={() => navigate('/offers')} className="text-xs font-medium text-primary-700 hover:underline">查看全部 Offer</button>
        </section>
      )}

      {demandsError && (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>招聘需求加载失败，暂时无法新建 Offer：{demandsError}</p>
          <button type="button" onClick={() => void loadDemands()} className="mt-2 font-medium underline">重新加载</button>
        </section>
      )}
      {!demandsLoading && !demandsError && approvedDemands.length === 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前没有已审核通过且进行中的招聘需求，请先在招聘管理中完成需求审核。
        </section>
      )}
      {unmappedTotal > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          有 {unmappedTotal} 条历史 Offer 尚未关联招聘需求，已隔离且未在列表中展示。
        </section>
      )}

      {(highRiskCount > 0 || counts.pending > 0 || counts.approved > 0) && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3" aria-label="今日提醒">
          <span className="text-sm font-semibold text-amber-800">今日提醒</span>
          {highRiskCount > 0 && <button type="button" onClick={() => { setRiskFilter('high'); selectTab('today'); }} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700">{highRiskCount} 项已超时或即将到期</button>}
          {counts.pending > 0 && <button type="button" onClick={() => selectTab('pending')} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-800">{counts.pending} 份待确认</button>}
          {counts.approved > 0 && <button type="button" onClick={() => selectTab('approved')} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700">{counts.approved} 份待发放</button>}
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-background-200 bg-white">
        <div className="border-b border-background-200 p-3">
          <WorkspaceTabs
            items={OFFER_WORKBENCH_TABS.map((tab) => ({ ...tab, count: counts[tab.key] }))}
            value={activeTab}
            onChange={selectTab}
            ariaLabel="Offer 状态"
          />
        </div>

        <form
          className="grid gap-2 border-b border-background-200 bg-background-50 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(260px,1fr)_220px_160px_150px_160px_auto]"
          onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}
        >
          <label className="relative flex-1">
            <span className="sr-only">搜索 Offer</span>
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" aria-hidden="true"></i>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索候选人、岗位、部门或需求编号"
              className="h-10 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400"
            />
          </label>
          <select aria-label="按招聘需求筛选" value={demandFilter} onChange={(event) => setDemandFilter(event.target.value)} className="h-10 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700"><option value="">全部招聘需求</option>{demandOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="按负责人筛选" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="h-10 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700"><option value="">全部负责人</option>{ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select>
          <select aria-label="按风险筛选" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as '' | OfferRiskLevel)} className="h-10 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700"><option value="">全部风险</option><option value="high">高风险</option><option value="medium">需关注</option><option value="low">正常</option></select>
          <select aria-label="Offer 排序" value={order} onChange={(event) => setOrder(event.target.value as OfferOrder)} className="h-10 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-700"><option value="urgent">紧急优先</option><option value="updated">最近更新</option><option value="onboard">预计入职日</option></select>
          <button type="submit" className="h-10 rounded-lg border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 hover:bg-primary-50">搜索</button>
        </form>

        {hasFilters && <div className="flex flex-wrap items-center gap-2 border-b border-background-100 px-4 py-2.5 text-xs text-foreground-500"><span>已筛选</span>{search && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} className="rounded-full bg-background-100 px-2.5 py-1">搜索：{search} ×</button>}{demandFilter && <button type="button" onClick={() => setDemandFilter('')} className="rounded-full bg-background-100 px-2.5 py-1">需求：{demandFilter} ×</button>}{ownerFilter && <button type="button" onClick={() => setOwnerFilter('')} className="rounded-full bg-background-100 px-2.5 py-1">负责人：{ownerFilter} ×</button>}{riskFilter && <button type="button" onClick={() => setRiskFilter('')} className="rounded-full bg-background-100 px-2.5 py-1">风险：{riskFilter} ×</button>}<button type="button" onClick={resetOfferFilters} className="font-medium text-primary-700">清空全部</button></div>}

        {loading ? (
          <PageStateCard variant="loading" title="正在加载 Offer" description="请稍候，正在读取最新 Offer。" />
        ) : loadError ? (
          <PageStateCard
            variant="error"
            title="Offer 加载失败"
            description={loadError}
            onAction={() => void loadOffers()}
          />
        ) : visibleOffers.length === 0 ? (
          <PageStateCard
            variant="empty"
            title={activeTab === 'today' ? '今天没有需要处理的 Offer' : '当前范围没有符合条件的 Offer'}
            description={activeTab === 'history' ? '已入职、拒绝、撤回和过期记录会统一归档在这里。' : '可切换状态或清除筛选查看其他记录。'}
            actionLabel={hasFilters ? '清空筛选' : undefined}
            onAction={hasFilters ? resetOfferFilters : undefined}
          />
        ) : (
          <OfferTable
            offers={visibleOffers}
            role={role}
            onOpen={(offer) => { setRequestedAction(null); void openDetail(offer); }}
            onPrimaryAction={openPrimaryAction}
          />
        )}
      </section>

      {showCreate && (
        <CreateOfferModal
          offer={editingOffer}
          demands={demands}
          initialDemandId={createPrefill?.demandId}
          initialCandidateId={createPrefill?.candidateId}
          onClose={() => { setShowCreate(false); setEditingOffer(null); setCreatePrefill(null); }}
          onSaved={handleSaved}
        />
      )}

      {selectedOffer && (
        <OfferDetailDrawer
          offer={selectedOffer}
          initialAction={requestedAction}
          role={role}
          loading={detailLoading}
          loadError={detailError}
          onClose={closeOfferDetail}
          onEdit={() => openEdit(selectedOffer)}
          onRunAction={runAction}
          onRefresh={refreshSelected}
        />
      )}
    </div>
  );
}
