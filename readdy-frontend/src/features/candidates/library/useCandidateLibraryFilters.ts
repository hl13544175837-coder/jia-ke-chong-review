import {
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  type ChangeEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { CandidateStage, ParseStatus } from '@/features/candidates/types';
import {
  candidateStageFromNavigation,
  initialCandidateScope,
  isCandidateNavigationState,
  isCandidateStage,
  isParseStatus,
  positiveSearchId,
  positiveSearchPage,
  setCandidateSearchParam,
  type CandidateLibraryScope,
  type PipelineStatusFilter,
} from '@/features/candidates/library';

export type CandidateColumnFilter = 'identity' | 'parse' | 'profile' | 'skills' | 'source' | 'stage' | 'created';
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
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [demandFilter, setDemandFilter] = useState<number | ''>(navState?.demandId ?? requestedDemandId ?? '');
  const [cityFilter, setCityFilter] = useState(() => searchParams.get('city') ?? '');
  const [educationFilter, setEducationFilter] = useState(() => searchParams.get('education') ?? '');
  const [skillFilter, setSkillFilter] = useState(() => searchParams.get('skill') ?? '');
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get('source') ?? '');
  const [parseStatusFilter, setParseStatusFilter] = useState<'' | ParseStatus>(() => {
    const value = searchParams.get('parse');
    return value && isParseStatus(value) ? value : '';
  });
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<PipelineStatusFilter>(
    initialScope === 'in_pipeline' ? 'in_pipeline' : initialScope === 'talent_pool' ? 'not_in_pipeline' : '',
  );
  const [favoriteFilter, setFavoriteFilter] = useState(initialScope === 'favorite');
  const [stageFilter, setStageFilter] = useState<'' | CandidateStage>(() => {
    const fromNavigation = candidateStageFromNavigation(navState?.targetStage);
    const fromUrl = searchParams.get('stage');
    return fromNavigation || (fromUrl && isCandidateStage(fromUrl) ? fromUrl : '');
  });
  const [scoreFilter, setScoreFilter] = useState(() => searchParams.get('score') ?? '0');
  const [sortBy, setSortBy] = useState<CandidateSortBy>(() => searchParams.get('sort') === 'name_masked' ? 'name_masked' : 'created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  const [openColumnFilter, setOpenColumnFilter] = useState<CandidateColumnFilter | null>(null);
  const [page, setPage] = useState(() => positiveSearchPage(searchParams.get('page')));
  const [hideLocalDemoRecords, setHideLocalDemoRecords] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const deferredSkill = useDeferredValue(skillFilter.trim());

  const openCandidateInUrl = useCallback((candidateId: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (candidateId) next.set('candidate', String(candidateId));
    else next.delete('candidate');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const consumeNavigationState = useCallback(() => {
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, navigate]);

  const syncCandidateWorkspaceUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    const scope: CandidateLibraryScope = favoriteFilter
      ? 'favorite'
      : pipelineStatusFilter === 'in_pipeline'
        ? 'in_pipeline'
        : pipelineStatusFilter === 'not_in_pipeline'
          ? 'talent_pool'
          : 'all';
    setCandidateSearchParam(next, 'scope', scope, 'all');
    setCandidateSearchParam(next, 'q', searchQuery);
    setCandidateSearchParam(next, 'demand', demandFilter ? String(demandFilter) : '');
    setCandidateSearchParam(next, 'city', cityFilter);
    setCandidateSearchParam(next, 'education', educationFilter);
    setCandidateSearchParam(next, 'skill', skillFilter);
    setCandidateSearchParam(next, 'source', sourceFilter);
    setCandidateSearchParam(next, 'parse', parseStatusFilter);
    setCandidateSearchParam(next, 'stage', stageFilter);
    setCandidateSearchParam(next, 'score', scoreFilter, '0');
    setCandidateSearchParam(next, 'sort', sortBy, 'created_at');
    setCandidateSearchParam(next, 'order', sortOrder, 'desc');
    setCandidateSearchParam(next, 'page', String(page), '1');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [
    cityFilter,
    demandFilter,
    educationFilter,
    favoriteFilter,
    page,
    parseStatusFilter,
    pipelineStatusFilter,
    scoreFilter,
    searchParams,
    searchQuery,
    setSearchParams,
    skillFilter,
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
    setSkillFilter('');
    setSourceFilter('');
    setParseStatusFilter('');
    setPipelineStatusFilter('');
    setFavoriteFilter(false);
    setStageFilter('');
    setScoreFilter('0');
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
    || skillFilter.trim()
    || sourceFilter
    || parseStatusFilter
    || pipelineStatusFilter
    || favoriteFilter
    || stageFilter
    || scoreFilter !== '0'
    || sortBy !== 'created_at'
    || sortOrder !== 'desc'
    || hideLocalDemoRecords,
  );

  const toggleColumnFilter = (column: CandidateColumnFilter) => {
    setOpenColumnFilter((current) => current === column ? null : column);
  };

  const selectLibraryScope = (scope: CandidateLibraryScope) => {
    changeFilter(() => {
      setFavoriteFilter(scope === 'favorite');
      setPipelineStatusFilter(
        scope === 'in_pipeline' ? 'in_pipeline' : scope === 'talent_pool' ? 'not_in_pipeline' : '',
      );
    });
  };

  const libraryScope: CandidateLibraryScope = favoriteFilter
    ? 'favorite'
    : pipelineStatusFilter === 'in_pipeline'
      ? 'in_pipeline'
      : pipelineStatusFilter === 'not_in_pipeline'
        ? 'talent_pool'
        : 'all';

  return {
    navigate,
    requestedDemandId,
    requestedCandidateId,
    navState,
    workflowSourceQuery,
    searchQuery,
    demandFilter,
    setDemandFilter,
    cityFilter,
    setCityFilter,
    educationFilter,
    setEducationFilter,
    skillFilter,
    setSkillFilter,
    sourceFilter,
    setSourceFilter,
    parseStatusFilter,
    setParseStatusFilter,
    pipelineStatusFilter,
    setPipelineStatusFilter,
    favoriteFilter,
    stageFilter,
    setStageFilter,
    scoreFilter,
    setScoreFilter,
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
    deferredSkill,
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
  } as const;
}

export type CandidateLibraryFiltersController = ReturnType<typeof useCandidateLibraryFilters>;
