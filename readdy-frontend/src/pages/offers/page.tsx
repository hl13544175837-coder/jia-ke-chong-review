import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import CollapsibleFilterBar from '@/components/ui/CollapsibleFilterBar';
import { FILTER_CONTROL_CLASS, FILTER_FIELD_CLASS } from '@/components/ui/FilterBar';
import { offersApi } from '@/features/offers/api';
import type { OfferOaRegistrationInput, OfferWorkbenchRecord } from '@/features/offers/types';
import { useToast } from '@/hooks/useToast';
import { userFacingError } from '@/lib/userFacingError';
import OfferTable from './components/OfferTable';
import OaRegistrationModal from './components/OaRegistrationModal';
import {
  buildOfferTabCounts,
  filterAndSortOffers,
  OFFER_WORKBENCH_TABS,
  type OfferOrder,
  type OfferRiskLevel,
  type OfferWorkbenchTab,
} from './workbench';

function initialOfferTab(value: string | null): OfferWorkbenchTab {
  if (OFFER_WORKBENCH_TABS.some((tab) => tab.key === value)) return value as OfferWorkbenchTab;
  if (['pending', 'approved', 'sent', 'accepted'].includes(value || '')) return 'follow_up';
  if (['history', 'closed'].includes(value || '')) return 'completed';
  return 'pending_registration';
}

function setSearchValue(params: URLSearchParams, key: string, value: string, defaultValue = '') {
  if (!value || value === defaultValue) params.delete(key);
  else params.set(key, value);
}

function replaceWorkbenchRow(items: OfferWorkbenchRecord[], next: OfferWorkbenchRecord) {
  const index = items.findIndex((item) => (
    item.candidate_id === next.candidate_id && item.demand_id === next.demand_id
  ));
  if (index < 0) return [next, ...items];
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

export default function OffersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const fromJobs = searchParams.get('from') === 'jobs';
  const [offers, setOffers] = useState<OfferWorkbenchRecord[]>([]);
  const [activeTab, setActiveTab] = useState<OfferWorkbenchTab>(() => initialOfferTab(searchParams.get('tab')));
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [demandFilter, setDemandFilter] = useState(() => searchParams.get('request') || '');
  const [ownerFilter, setOwnerFilter] = useState(() => searchParams.get('owner') || '');
  const [riskFilter, setRiskFilter] = useState<'' | OfferRiskLevel>('');
  const [updatedDateFilter, setUpdatedDateFilter] = useState(() => searchParams.get('updated') || '');
  const [rangeDays, setRangeDays] = useState(() => Number(searchParams.get('range')) || 7);
  const [order, setOrder] = useState<OfferOrder>('updated');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [registeringOffer, setRegisteringOffer] = useState<OfferWorkbenchRecord | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await offersApi.listWorkbench(search ? { search } : {});
      setOffers(response.items);
    } catch (error) {
      setLoadError(userFacingError(error, '加载 Offer 失败'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { void loadOffers(); }, [loadOffers]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    setSearchValue(next, 'tab', activeTab, 'pending_registration');
    setSearchValue(next, 'q', search);
    setSearchValue(next, 'request', demandFilter);
    setSearchValue(next, 'owner', ownerFilter);
    setSearchValue(next, 'updated', updatedDateFilter);
    setSearchValue(next, 'range', String(rangeDays), '7');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, demandFilter, ownerFilter, rangeDays, search, searchParams, setSearchParams, updatedDateFilter]);

  useEffect(() => {
    if (!requestedDemandId || !requestedCandidateId || loading || registeringOffer) return;
    const matched = offers.find((item) => (
      item.demand_id === requestedDemandId && item.candidate_id === requestedCandidateId
    ));
    if (matched) setRegisteringOffer(matched);
  }, [loading, offers, registeringOffer, requestedCandidateId, requestedDemandId]);

  const scopedOffers = useMemo(() => requestedDemandId
    ? offers.filter((item) => item.demand_id === requestedDemandId)
    : offers, [offers, requestedDemandId]);
  const counts = useMemo(() => buildOfferTabCounts(scopedOffers), [scopedOffers]);
  const visibleOffers = useMemo(() => filterAndSortOffers({
    items: scopedOffers,
    tab: activeTab,
    search,
    demand: demandFilter,
    owner: ownerFilter,
    risk: riskFilter,
    order,
    recentDays: rangeDays,
  }).filter((offer) => (
    !updatedDateFilter
    || (offer.oa_updated_at || offer.updated_at || offer.created_at || '').slice(0, 10) === updatedDateFilter
  )), [activeTab, demandFilter, order, ownerFilter, rangeDays, riskFilter, scopedOffers, search, updatedDateFilter]);
  const demandOptions = useMemo(() => Array.from(new Map(
    scopedOffers.map((offer) => [offer.request_no, `${offer.position} · ${offer.request_no}`]),
  ).entries()).filter(([value]) => Boolean(value)), [scopedOffers]);
  const ownerOptions = useMemo(() => Array.from(new Set(
    scopedOffers.map((offer) => offer.created_by_name).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'zh-CN')), [scopedOffers]);

  const hasFilters = Boolean(searchInput.trim() || demandFilter || ownerFilter || updatedDateFilter || rangeDays !== 7);
  const activeFilterCount = [
    searchInput.trim(),
    demandFilter,
    ownerFilter,
    updatedDateFilter,
    rangeDays !== 7 ? String(rangeDays) : '',
  ].filter(Boolean).length;

  const resetOfferFilters = () => {
    setSearchInput('');
    setSearch('');
    setDemandFilter('');
    setOwnerFilter('');
    setRiskFilter('');
    setUpdatedDateFilter('');
    setRangeDays(7);
    setOrder('updated');
  };

  const selectTab = (tab: OfferWorkbenchTab) => setActiveTab(tab);

  const registerOaResult = async (payload: OfferOaRegistrationInput) => {
    if (!registeringOffer || registering) return;
    setRegistering(true);
    setRegisterError('');
    try {
      const saved = await offersApi.registerOaResult(
        registeringOffer.demand_id,
        registeringOffer.candidate_id,
        payload,
      );
      setOffers((current) => replaceWorkbenchRow(current, saved));
      setRegisteringOffer(null);
      showToast('OA 结果已登记');
    } catch (error) {
      setRegisterError(userFacingError(error, 'OA 结果登记失败'));
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="offer-oa-workbench">
      <PageHeader
        title="Offer 管理"
        visuallyHiddenTitle
        description="登记候选人的 OA 结果，并跟进后续状态"
        leading={fromDashboard && !requestedDemandId ? (
          <button type="button" onClick={() => navigate('/dashboard')} aria-label="返回工作台" className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-200 bg-white text-foreground-600 hover:bg-background-50"><ArrowLeft size={17} /></button>
        ) : undefined}
      />

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-blue-800" aria-label="Offer 一期处理说明">
        <span className="font-semibold">一期处理方式</span>
        <span>仅登记 OA 结果，不会自动发起或同步 OA；外部接口放在二期。</span>
      </section>

      {requestedDemandId && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3">
          <div className="flex items-center gap-3">
            {(fromJobs || fromDashboard) && <button type="button" onClick={() => navigate(fromDashboard ? '/dashboard' : '/jobs')} aria-label="返回上一页" className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-200 bg-white text-primary-700 hover:bg-primary-50"><ArrowLeft size={17} /></button>}
            <div><p className="text-xs font-semibold text-primary-700">当前招聘需求</p><p className="mt-0.5 text-sm text-foreground-700">只显示需求 #{requestedDemandId}，共 {scopedOffers.length} 位候选人</p></div>
          </div>
          <button type="button" onClick={() => navigate('/offers')} className="text-xs font-medium text-primary-700 hover:underline">查看全部</button>
        </section>
      )}

      <div className="space-y-2">
        <form onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
          <CollapsibleFilterBar ariaLabel="Offer 查询条件" activeFilterCount={activeFilterCount}>
            <label className={`${FILTER_FIELD_CLASS} relative`}><span className="sr-only">搜索 Offer</span><i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" aria-hidden="true" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索 Offer" className={`${FILTER_CONTROL_CLASS} pl-9`} /></label>
            <select aria-label="按招聘需求筛选" value={demandFilter} onChange={(event) => setDemandFilter(event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}><option value="">全部招聘需求</option>{demandOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="按负责人筛选" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}><option value="">全部负责人</option>{ownerOptions.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select>
            <select aria-label="时间范围" value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`}><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={3650}>全部时间</option></select>
            <input type="date" aria-label="按更新时间筛选" value={updatedDateFilter} onChange={(event) => setUpdatedDateFilter(event.target.value)} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS}`} />
            <button type="submit" className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS} font-medium text-primary-700 hover:bg-primary-50`}>搜索</button>
            <button type="button" onClick={resetOfferFilters} disabled={!hasFilters} className={`${FILTER_FIELD_CLASS} ${FILTER_CONTROL_CLASS} font-medium disabled:opacity-40`}>重置筛选</button>
          </CollapsibleFilterBar>
        </form>
        <WorkspaceTabs items={OFFER_WORKBENCH_TABS.map((tab) => ({ ...tab, count: counts[tab.key] }))} value={activeTab} onChange={selectTab} ariaLabel="Offer OA 状态" />
      </div>

      <section className="overflow-hidden rounded-lg border border-background-200 bg-white">

        {loading ? (
          <PageStateCard variant="loading" title="正在加载 Offer" description="请稍候，正在读取最新 OA 登记状态。" />
        ) : loadError ? (
          <PageStateCard variant="error" title="Offer 加载失败" description={loadError} onAction={() => void loadOffers()} />
        ) : visibleOffers.length === 0 ? (
          <PageStateCard variant="empty" title="当前范围没有符合条件的候选人" description="可切换状态或清除筛选查看其他记录。" actionLabel={hasFilters ? '清空筛选' : undefined} onAction={hasFilters ? resetOfferFilters : undefined} />
        ) : (
          <OfferTable
            offers={visibleOffers}
            onOpenCandidate={(offer) => navigate(`/candidates?candidate=${offer.candidate_id}&demand=${offer.demand_id}&from=offers`)}
            onOpenDemand={(offer) => navigate(`/jobs?demand=${offer.demand_id}`)}
            onOpenPipeline={(offer) => navigate(`/kanban?demand=${offer.demand_id}&candidate=${offer.candidate_id}`)}
            onOpenInterviews={(offer) => navigate(`/interviews?demand=${offer.demand_id}&candidate=${offer.candidate_id}`)}
            onRegister={(offer) => { setRegisterError(''); setRegisteringOffer(offer); }}
          />
        )}
      </section>

      {registeringOffer && (
        <OaRegistrationModal
          offer={registeringOffer}
          saving={registering}
          error={registerError}
          onClose={() => { if (!registering) setRegisteringOffer(null); }}
          onSave={(payload) => void registerOaResult(payload)}
        />
      )}
    </div>
  );
}
