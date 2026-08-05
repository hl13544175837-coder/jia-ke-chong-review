import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { apiRequest } from '@/lib/api';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateListItem, CandidateListQuery, CandidateListResponse } from '@/features/candidates/types';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { interviewsApi } from '@/features/interviews/api';
import type { InterviewManagementRow } from '@/features/interviews/types';
import type { BusinessReviewerOption, PushDemandOption } from '@/features/businessReviews/components/PushToReviewerModal';
import { errorMessage, isBusinessReviewer, type InterviewerApiItem } from '@/features/candidates/library';
import type { CandidateLibraryFiltersController } from '@/features/candidates/library/useCandidateLibraryFilters';

const PER_PAGE = 20;
const emptyCandidateResponse: CandidateListResponse = {
  candidates: [],
  total: 0,
  page: 1,
  per_page: PER_PAGE,
  pages: 1,
};

export function useCandidateLibraryData(
  filters: CandidateLibraryFiltersController,
  setSelectedIds: Dispatch<SetStateAction<Set<number>>>,
) {
  const {
    cityFilter,
    createdFrom,
    createdTo,
    deferredSearch,
    demandFilter,
    educationFilter,
    libraryScope,
    page,
    parseStatusFilter,
    pipelineStateFilter,
    sortBy,
    sortOrder,
    sourceFilter,
    stageFilter,
  } = filters;
  const [candidateResponse, setCandidateResponse] = useState<CandidateListResponse>(emptyCandidateResponse);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const candidateRequestId = useRef(0);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [demandsLoading, setDemandsLoading] = useState(true);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [reviewers, setReviewers] = useState<BusinessReviewerOption[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const [reviewTasks, setReviewTasks] = useState<BusinessReviewTask[]>([]);
  const [reviewTasksLoading, setReviewTasksLoading] = useState(true);
  const [reviewTasksError, setReviewTasksError] = useState<string | null>(null);
  const [interviewRows, setInterviewRows] = useState<InterviewManagementRow[]>([]);
  const [interviewRowsError, setInterviewRowsError] = useState<string | null>(null);

  const activeDemands = useMemo(
    () => demands.filter((demand) => demand.status === 'active' && demand.approval_status === 'approved'),
    [demands],
  );
  const pushDemandOptions = useMemo<PushDemandOption[]>(
    () => activeDemands.map((demand) => ({
      id: demand.id,
      jobTitle: demand.job_title,
      requestNo: demand.request_no,
      department: demand.job_department,
    })),
    [activeDemands],
  );

  const loadCandidates = useCallback(async () => {
    const requestId = ++candidateRequestId.current;
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const scopePipelineStatus: CandidateListQuery['pipeline_status'] = libraryScope === 'in_pipeline'
        ? 'in_pipeline'
        : libraryScope === 'talent_pool'
          ? 'not_in_pipeline'
          : undefined;
      const response = await candidatesApi.listCandidates({
        search: deferredSearch || undefined,
        demand_id: demandFilter || undefined,
        city: cityFilter || undefined,
        education: educationFilter || undefined,
        source_channel: sourceFilter || undefined,
        parse_status: parseStatusFilter || undefined,
        pipeline_status: pipelineStateFilter || scopePipelineStatus,
        favorite: libraryScope === 'favorite' || undefined,
        stage: stageFilter || undefined,
        created_from: createdFrom || undefined,
        created_to: createdTo || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        per_page: PER_PAGE,
      });
      if (requestId !== candidateRequestId.current) return;
      setCandidateResponse(response);
      setSelectedIds((current) => new Set(
        response.candidates.filter((candidate) => current.has(candidate.id)).map((candidate) => candidate.id),
      ));
    } catch (error) {
      if (requestId !== candidateRequestId.current) return;
      setCandidatesError(errorMessage(error, '候选人列表加载失败'));
    } finally {
      if (requestId === candidateRequestId.current) setCandidatesLoading(false);
    }
  }, [
    cityFilter,
    createdFrom,
    createdTo,
    deferredSearch,
    demandFilter,
    educationFilter,
    libraryScope,
    page,
    parseStatusFilter,
    pipelineStateFilter,
    setSelectedIds,
    sortBy,
    sortOrder,
    sourceFilter,
    stageFilter,
  ]);

  const loadDemands = useCallback(async () => {
    setDemandsLoading(true);
    setDemandError(null);
    try {
      const response = await demandsApi.listDemands();
      setDemands(response.items);
    } catch (error) {
      setDemandError(errorMessage(error, '招聘需求加载失败'));
    } finally {
      setDemandsLoading(false);
    }
  }, []);

  const loadReviewers = useCallback(async () => {
    setReviewersLoading(true);
    setReviewerError(null);
    try {
      const response = await apiRequest<InterviewerApiItem[]>('/interview/interviewers');
      setReviewers(response.filter(isBusinessReviewer).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
      })));
    } catch (error) {
      setReviewerError(errorMessage(error, '业务评审人加载失败'));
    } finally {
      setReviewersLoading(false);
    }
  }, []);

  const loadReviewTasks = useCallback(async () => {
    setReviewTasksLoading(true);
    setReviewTasksError(null);
    try {
      const response = await businessReviewsApi.listForHr();
      setReviewTasks(response.items);
    } catch (error) {
      setReviewTasksError(errorMessage(error, '业务筛选结果加载失败'));
    } finally {
      setReviewTasksLoading(false);
    }
  }, []);

  const loadInterviewRows = useCallback(async () => {
    setInterviewRowsError(null);
    try {
      setInterviewRows(await interviewsApi.listManagementRows());
    } catch (error) {
      setInterviewRowsError(errorMessage(error, '面试安排状态加载失败'));
    }
  }, []);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  useEffect(() => {
    const hasBackgroundParsing = candidateResponse.candidates.some(
      (candidate) => ['pending', 'processing'].includes(candidate.parse_status),
    );
    if (!hasBackgroundParsing) return undefined;
    const timer = window.setInterval(() => void loadCandidates(), 3000);
    return () => window.clearInterval(timer);
  }, [candidateResponse.candidates, loadCandidates]);

  useEffect(() => { void loadDemands(); }, [loadDemands]);

  useEffect(() => {
    void Promise.all([loadReviewTasks(), loadInterviewRows()]);
    const refreshWorkflowFacts = () => void Promise.all([loadReviewTasks(), loadInterviewRows()]);
    window.addEventListener('focus', refreshWorkflowFacts);
    return () => window.removeEventListener('focus', refreshWorkflowFacts);
  }, [loadInterviewRows, loadReviewTasks]);

  return {
    candidateResponse,
    candidatesLoading,
    candidatesError,
    demands,
    demandsLoading,
    demandError,
    reviewers,
    reviewersLoading,
    reviewerError,
    reviewTasks,
    reviewTasksLoading,
    reviewTasksError,
    interviewRows,
    interviewRowsError,
    activeDemands,
    pushDemandOptions,
    loadCandidates,
    loadDemands,
    loadReviewers,
    loadReviewTasks,
  } as const;
}

export type CandidateLibraryDataController = ReturnType<typeof useCandidateLibraryData>;
