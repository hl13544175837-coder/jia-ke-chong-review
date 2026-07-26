import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProductRole } from '@/auth/productRole';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { offersApi } from '@/features/offers/api';
import type { OfferActionInput, OfferRecord, OfferStatus } from '@/features/offers/types';
import { useToast } from '@/hooks/useToast';
import CreateOfferModal from './components/CreateOfferModal';
import OfferDetailDrawer from './components/OfferDetailDrawer';
import OfferTable from './components/OfferTable';

type TabKey = 'all' | 'draft' | 'pending' | 'delivery' | 'reply' | 'onboard' | 'closed';

const TABS: Array<{ key: TabKey; label: string; statuses: OfferStatus[] }> = [
  { key: 'all', label: '全部', statuses: [] },
  { key: 'draft', label: '待提交', statuses: ['draft'] },
  { key: 'pending', label: '审批中', statuses: ['pending'] },
  { key: 'delivery', label: '待发放', statuses: ['approved'] },
  { key: 'reply', label: '待回复', statuses: ['sent'] },
  { key: 'onboard', label: '待入职', statuses: ['accepted'] },
  { key: 'closed', label: '已结束', statuses: ['declined', 'withdrawn', 'expired', 'onboarded'] },
];

function replaceOffer(items: OfferRecord[], next: OfferRecord) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [next, ...items];
  return items.map((item) => item.id === next.id ? next : item);
}

function offerUpdatedAt(offer: OfferRecord) {
  const parsed = Date.parse(offer.updated_at || offer.created_at || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function OffersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const { role } = useProductRole();
  const { showToast } = useToast();
  const detailRequest = useRef(0);
  const handledDeepLink = useRef('');
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [unmappedTotal, setUnmappedTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [identityFilter, setIdentityFilter] = useState('');
  const [demandFilter, setDemandFilter] = useState('');
  const [compensationFilter, setCompensationFilter] = useState('');
  const [onboardDateFilter, setOnboardDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | OfferStatus>('');
  const [updatedOrder, setUpdatedOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [demandsLoading, setDemandsLoading] = useState(true);
  const [demandsError, setDemandsError] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<OfferRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferRecord | null>(null);
  const [createPrefill, setCreatePrefill] = useState<{ demandId: number; candidateId: number } | null>(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await offersApi.listOffers(search ? { search } : {});
      setOffers(response.items);
      setUnmappedTotal(response.unmapped_total);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载 Offer 失败');
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

  const currentTab = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const visibleOffers = useMemo(() => {
    const identityTerm = identityFilter.trim().toLocaleLowerCase('zh-CN');
    const demandTerm = demandFilter.trim().toLocaleLowerCase('zh-CN');
    const compensationTerm = compensationFilter.trim().toLocaleLowerCase('zh-CN');

    return offers
      .filter((offer) => currentTab.statuses.length === 0 || currentTab.statuses.includes(offer.status))
      .filter((offer) => !statusFilter || offer.status === statusFilter)
      .filter((offer) => !identityTerm || [offer.candidate_name, offer.position]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(identityTerm)))
      .filter((offer) => !demandTerm || [offer.request_no, offer.department]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(demandTerm)))
      .filter((offer) => !compensationTerm || offer.salary_range
        .toLocaleLowerCase('zh-CN').includes(compensationTerm))
      .filter((offer) => !onboardDateFilter || offer.onboard_date === onboardDateFilter)
      .sort((left, right) => updatedOrder === 'asc'
        ? offerUpdatedAt(left) - offerUpdatedAt(right)
        : offerUpdatedAt(right) - offerUpdatedAt(left));
  }, [
    compensationFilter,
    currentTab.statuses,
    demandFilter,
    identityFilter,
    onboardDateFilter,
    offers,
    statusFilter,
    updatedOrder,
  ]);

  const counts = useMemo<Record<TabKey, number>>(() => {
    const nextCounts: Record<TabKey, number> = {
      all: 0,
      draft: 0,
      pending: 0,
      delivery: 0,
      reply: 0,
      onboard: 0,
      closed: 0,
    };
    for (const tab of TABS) {
      nextCounts[tab.key] = tab.statuses.length === 0
        ? offers.length
        : offers.filter((offer) => tab.statuses.includes(offer.status)).length;
    }
    return nextCounts;
  }, [offers]);

  const hasColumnFilters = Boolean(
    identityFilter.trim()
    || demandFilter.trim()
    || compensationFilter.trim()
    || onboardDateFilter
    || statusFilter
    || updatedOrder !== 'desc',
  );

  const resetOfferFilters = () => {
    setIdentityFilter('');
    setDemandFilter('');
    setCompensationFilter('');
    setOnboardDateFilter('');
    setStatusFilter('');
    setUpdatedOrder('desc');
  };

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    setStatusFilter('');
  };

  const openDetail = useCallback(async (summary: OfferRecord) => {
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
  }, []);

  useEffect(() => {
    if (!requestedDemandId || !requestedCandidateId || loading || demandsLoading) return;
    const key = `${requestedDemandId}:${requestedCandidateId}`;
    if (handledDeepLink.current === key) return;
    handledDeepLink.current = key;
    const existing = offers.find((offer) => (
      offer.demand_id === requestedDemandId && offer.candidate_id === requestedCandidateId
    ));
    if (existing) {
      void openDetail(existing);
    } else if (approvedDemands.some((demand) => demand.id === requestedDemandId)) {
      setEditingOffer(null);
      setCreatePrefill({ demandId: requestedDemandId, candidateId: requestedCandidateId });
      setShowCreate(true);
    } else {
      setDemandsError('对应需求不可创建 Offer，请确认需求仍在招聘中且已审批通过');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('demand');
    next.delete('candidate');
    setSearchParams(next, { replace: true });
  }, [approvedDemands, demandsLoading, loading, offers, openDetail, requestedCandidateId, requestedDemandId, searchParams, setSearchParams]);

  const closeDetail = () => {
    detailRequest.current += 1;
    setSelectedOffer(null);
    setDetailLoading(false);
    setDetailError('');
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
    showToast('Offer 草稿已保存');
  };

  const openCreate = () => {
    closeDetail();
    setEditingOffer(null);
    setCreatePrefill(null);
    setShowCreate(true);
  };

  const openEdit = (offer: OfferRecord) => {
    closeDetail();
    setEditingOffer(offer);
    setCreatePrefill(null);
    setShowCreate(true);
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-offer-lifecycle">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground-900">Offer 管理</h1>
          <p className="mt-1 text-sm text-foreground-500">审批、发放记录、候选人回复与入职确认</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={demandsLoading || Boolean(demandsError) || approvedDemands.length === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-add-line text-base" aria-hidden="true"></i>
          {demandsLoading ? '加载需求中' : '新建 Offer'}
        </button>
      </header>

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

      <section className="overflow-hidden rounded-lg border border-background-200 bg-white">
        <div className="flex overflow-x-auto border-b border-background-200 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`relative shrink-0 px-4 py-3 text-sm font-medium ${activeTab === tab.key ? 'text-primary-600' : 'text-foreground-500 hover:text-foreground-800'}`}
            >
              {tab.label}<span className="ml-1.5 text-xs">{counts[tab.key]}</span>
              {activeTab === tab.key && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary-500"></span>}
            </button>
          ))}
        </div>

        <form
          className="flex flex-col gap-2 border-b border-background-200 bg-background-50 p-4 sm:flex-row"
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
          <button type="submit" className="h-10 rounded-lg border border-background-300 bg-white px-4 text-sm font-medium text-foreground-700 hover:bg-background-100">搜索</button>
          {(search || searchInput) && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); setSearch(''); }}
              className="h-10 rounded-lg px-3 text-sm text-foreground-500 hover:bg-background-100"
            >清除</button>
          )}
          {hasColumnFilters && (
            <button
              type="button"
              onClick={resetOfferFilters}
              className="h-10 rounded-lg px-3 text-sm text-foreground-500 hover:bg-background-100"
            >重置列筛选</button>
          )}
        </form>

        {loading ? (
          <div className="py-16 text-center text-sm text-foreground-500"><i className="ri-loader-4-line mr-2 animate-spin"></i>正在加载 Offer...</div>
        ) : loadError ? (
          <div className="px-5 py-14 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
            <button type="button" onClick={() => void loadOffers()} className="mt-3 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50">重新加载</button>
          </div>
        ) : visibleOffers.length === 0 && !hasColumnFilters ? (
          <div className="py-16 text-center">
            <i className="ri-file-list-3-line text-3xl text-foreground-300" aria-hidden="true"></i>
            <p className="mt-3 text-sm font-medium text-foreground-700">暂无符合条件的 Offer</p>
            <p className="mt-1 text-xs text-foreground-400">候选人进入 Offer 阶段后，可以创建真实草稿。</p>
          </div>
        ) : (
          <OfferTable
            offers={visibleOffers}
            identityFilter={identityFilter}
            demandFilter={demandFilter}
            compensationFilter={compensationFilter}
            onboardDateFilter={onboardDateFilter}
            statusFilter={statusFilter}
            updatedOrder={updatedOrder}
            onOpen={(offer) => void openDetail(offer)}
            onEdit={openEdit}
            onIdentityFilterChange={setIdentityFilter}
            onDemandFilterChange={setDemandFilter}
            onCompensationFilterChange={setCompensationFilter}
            onOnboardDateFilterChange={setOnboardDateFilter}
            onStatusFilterChange={(nextStatus) => {
              setStatusFilter(nextStatus);
              if (nextStatus) setActiveTab('all');
            }}
            onUpdatedOrderChange={setUpdatedOrder}
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
          role={role}
          loading={detailLoading}
          loadError={detailError}
          onClose={closeDetail}
          onEdit={() => openEdit(selectedOffer)}
          onRunAction={runAction}
          onRefresh={refreshSelected}
        />
      )}
    </div>
  );
}
