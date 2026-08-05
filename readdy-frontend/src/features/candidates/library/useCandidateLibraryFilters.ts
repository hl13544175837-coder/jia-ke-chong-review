import {
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  type ChangeEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { CandidateStage, ParseStatus } from '@/features/candidates/types';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import {
  candidateStageFromNavigation,
  initialCandidateScope,
  isCandidateNavigationState,
  isCandidateStage,
  isParseStatus,
  isPipelineStateFilter,
  positiveSearchId,
  positiveSearchPage,
  setCandidateSearchParam,
  type CandidateLibraryScope,
  type PipelineStateFilter,
} from '@/features/candidates/library';

export type CandidateColumnFilter = 'pipeline' | 'education' | 'city' | 'stage';
export type CandidateSortBy = 'created_at' | 'name_masked';
export type SortOrder = 'asc' | 'desc';

interface CandidateLibraryFiltersOptions {
  clearSelection: () => void;
}

export function useCandidateLibraryFilters({ clearSelection }: CandidateLibraryFiltersOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = positiveSearchId(searchParams.get('demand'));
  const requestedCandidateId = positiveSearchId(searchParams.get('candidate'));
  const requestedDetailTab: CandidateDetailTab = searchParams.get('detail') === 'resume'
    ? 'resume'
    : searchParams.get('detail') === 'feedback'
      ? 'feedback'
      : 'interview';
  const navState = isCandidateNavigationState(location.state)
    ? location.state
    : requestedDemandId
      ? { demandId: requestedDemandId }
      : null;
  const workflowSourceQuery = navState?.fromDashboard
    ? '&from=dashboard'
    : navState?.fromJobs
      ? '&from=jobs'
      : '';

  const initialScope = initialCandidateScope(searchParams.get('scope'));
  const [libraryScope, setLibraryScope] = useState<CandidateLibraryScope>(initialScope);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [demandFilter, setDemandFilter] = useState<number | ''>(navState?.demandId ?? requestedDemandId ?? '');
  const [cityFilter, setCityFilter] = useState(() => searchParams.get('city') ?? '');
  const [educationFilter, setEducationFilter] = useState(() => searchParams.get('education') ?? '');
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get('source') ?? '');
  const [parseStatusFilter, setParseStatusFilter] = useState<'' | ParseStatus>(() => {
    const value = searchParams.get('parse');
    return value && isParseStatus(value) ? value : '';
  });
  const [pipelineStateFilter, setPipelineStateFilter] = useState<PipelineStateFilter>(() => {
    const value = searchParams.get('state');
    return value && isPipelineStateFilter(value) ? value : '';
  });
  const [createdFrom, setCreatedFrom] = useState(() => searchParams.get('created_from') ?? '');
  const [createdTo, setCreatedTo] = useState(() => searchParams.get('created_to') ?? '');
  const [stageFilter, setStageFilter] = useState<'' | CandidateStage>(() => {
    const fromNavigation = candidateStageFromNavigation(navState?.targetStage);
    const fromUrl = searchParams.get('stage');
    return fromNavigation || (fromUrl && isCandidateStage(fromUrl) ? fromUrl : '');
  });
  const [sortBy, setSortBy] = useState<CandidateSortBy>(() => searchParams.get('sort') === 'name_masked' ? 'name_masked' : 'created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  const [openColumnFilter, setOpenColumnFilter] = useState<CandidateColumnFilter | null>(null);
  const [page, setPage] = useState(() => positiveSearchPage(searchParams.get('page')));
  const [hideLocalDemoRecords, setHideLocalDemoRecords] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const openCandidateInUrl = useCallback((candidateId: number | null, detailTab: CandidateDetailTab = 'interview') => {
    const next = new URLSearchParams(searchParams);
    if (candidateId) {
      next.set('candidate', String(candidateId));
      if (detailTab === 'interview') next.delete('detail');
      else next.set('detail', detailTab);
    } else {
      next.delete('candidate');
      next.delete('detail');
    }
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const consumeNavigationState = useCallback(() => {
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, navigate]);

  const syncCandidateWorkspaceUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    setCandidateSearchParam(next, 'scope', libraryScope, 'all');
    setCandidateSearchParam(next, 'q', searchQuery);
    setCandidateSearchParam(next, 'demand', demandFilter ? String(demandFilter) : '');
    setCandidateSearchParam(next, 'city', cityFilter);
    setCandidateSearchParam(next, 'education', educationFilter);
    setCandidateSearchParam(next, 'source', sourceFilter);
    setCandidateSearchParam(next, 'parse', parseStatusFilter);
    setCandidateSearchParam(next, 'state', pipelineStateFilter);
    setCandidateSearchParam(next, 'stage', stageFilter);
    setCandidateSearchParam(next, 'created_from', createdFrom);
    setCandidateSearchParam(next, 'created_to', createdTo);
    setCandidateSearchParam(next, 'sort', sortBy, 'created_at');
    setCandidateSearchParam(next, 'order', sortOrder, 'desc');
    setCandidateSearchParam(next, 'page', String(page), '1');
    next.delete('skill');
    next.delete('score');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [
    cityFilter,
    createdFrom,
    createdTo,
    demandFilter,
    educationFilter,
    libraryScope,
    page,
    parseStatusFilter,
    pipelineStateFilter,
    searchParams,
    searchQuery,
    setSearchParams,
    sortBy,
    sortOrder,
    sourceFilter,
    stageFilter,
  ]);

  useEffect(() => { syncCandidateWorkspaceUrl(); }, [syncCandidateWorkspaceUrl]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleDemandFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDemandFilter(event.target.value ? Number(event.target.value) : '');
    clearSelection();
    setPage(1);
  };

  const changeFilter = (change: () => void) => {
    change();
    clearSelection();
    setPage(1);
  };

  const resetCandidateFilters = () => {
    setSearchQuery('');
    setDemandFilter('');
    setCityFilter('');
    setEducationFilter('');
    setSourceFilter('');
    setParseStatusFilter('');
    setPipelineStateFilter('');
    setLibraryScope('all');
    setStageFilter('');
    setCreatedFrom('');
    setCreatedTo('');
    setSortBy('created_at');
    setSortOrder('desc');
    setHideLocalDemoRecords(false);
    setOpenColumnFilter(null);
    clearSelection();
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim()
    || demandFilter
    || cityFilter
    || educationFilter
    || sourceFilter
    || parseStatusFilter
    || pipelineStateFilter
    || libraryScope !== 'all'
    || stageFilter
    || createdFrom
    || createdTo
    || sortBy !== 'created_at'
    || sortOrder !== 'desc'
    || hideLocalDemoRecords,
  );

  const toggleColumnFilter = (column: CandidateColumnFilter) => {
    setOpenColumnFilter((current) => current === column ? null : column);
  };

  const selectLibraryScope = (scope: CandidateLibraryScope) => {
    changeFilter(() => {
      setLibraryScope(scope);
      setPipelineStateFilter('');
    });
  };

  return {
    navigate,
    requestedDemandId,
    requestedCandidateId,
    requestedDetailTab,
    navState,
    workflowSourceQuery,
    searchQuery,
    demandFilter,
    setDemandFilter,
    cityFilter,
    setCityFilter,
    educationFilter,
    setEducationFilter,
    sourceFilter,
    setSourceFilter,
    parseStatusFilter,
    setParseStatusFilter,
    pipelineStateFilter,
    setPipelineStateFilter,
    createdFrom,
    setCreatedFrom,
    createdTo,
    setCreatedTo,
    stageFilter,
    setStageFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    openColumnFilter,
    page,
    setPage,
    hideLocalDemoRecords,
    setHideLocalDemoRecords,
    deferredSearch,
    openCandidateInUrl,
    consumeNavigationState,
    handleSearchChange,
    handleDemandFilterChange,
    changeFilter,
    resetCandidateFilters,
    hasActiveFilters,
    toggleColumnFilter,
    selectLibraryScope,
    libraryScope,
    setLibraryScope,
  } as const;
}

export type CandidateLibraryFiltersController = ReturnType<typeof useCandidateLibraryFilters>;
