import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Send,
  UserPlus,
} from 'lucide-react';
import { useProductRole } from '@/auth/productRole';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidatePipelineAddResult,
} from '@/features/candidates/types';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { candidateBusinessAction } from '@/features/businessReviews/actions';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/lib/api';
import type {
  PushFormValue,
  PushResultItem,
  PushTarget,
} from '@/features/businessReviews/components/PushToReviewerModal';
import { canEnterBusinessReview, isActionableBusinessReviewResult } from '@/features/businessReviews/stages';
import {
  candidateFromReviewTask,
  candidateResumeReady,
  candidateStageFromNavigation,
  errorMessage,
  isBusinessReviewer,
  stageLabels,
} from '@/features/candidates/library';
import { useCandidateLibraryFilters } from '@/features/candidates/library/useCandidateLibraryFilters';
import { useCandidateLibraryData } from '@/features/candidates/library/useCandidateLibraryData';
import { useCandidateDetail } from '@/features/candidates/library/useCandidateDetail';
import { useCandidateResumeUpload } from '@/features/candidates/library/useCandidateResumeUpload';
import { buildCandidateLibraryViewModel } from '@/features/candidates/library/candidateLibraryViewModel';

export function useCandidateLibraryController() {
  const { role } = useProductRole();
  const { showToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const filters = useCandidateLibraryFilters({ clearSelection: () => setSelectedIds(new Set()) });
  const {
    navigate,
    requestedDemandId,
    requestedCandidateId,
    requestedDetailTab,
    navState,
    workflowSourceQuery,
    demandFilter,
    setDemandFilter,
    cityFilter,
    educationFilter,
    sourceFilter,
    parseStatusFilter,
    pipelineStateFilter,
    createdFrom,
    createdTo,
    libraryScope,
    stageFilter,
    sortBy,
    sortOrder,
    page,
    hideLocalDemoRecords,
    deferredSearch,
    openCandidateInUrl,
    consumeNavigationState,
  } = filters;
  const data = useCandidateLibraryData(filters, setSelectedIds);
  const {
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
  } = data;

  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [pipelineTargets, setPipelineTargets] = useState<CandidateListItem[] | null>(null);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<CandidatePipelineAddResult | null>(null);
  const [transferCandidate, setTransferCandidate] = useState<CandidateListItem | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferInvalidated, setTransferInvalidated] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const detail = useCandidateDetail({
    candidates: candidateResponse.candidates,
    candidatesLoading,
    reviewTasks,
    reviewTasksLoading,
    requestedCandidateId,
    requestedDetailTab,
    requestedDemandId,
    demandFilter,
    openCandidateInUrl,
  });
  const {
    detailCandidate,
    setDetailCandidate,
    detailTab,
    setDetailTab,
    detailEditRequested,
    resumeDetail,
    setResumeDetail,
    candidateJourney,
    journeyError,
    detailLoading,
    detailError,
    resumePreviewUrl,
    originalResumeLoading,
    originalResumeError,
    loadCandidateDetail,
    openCandidateDetail,
    visibleReviewResults,
    detailReview,
    closeCandidateDetail,
    previewOriginalResume,
    downloadOriginalResume,
  } = detail;

  const upload = useCandidateResumeUpload({
    initialOpen: Boolean(navState?.openUpload),
    initialDemandId: navState?.demandId ?? requestedDemandId ?? '',
    demandFilter,
    activeDemands,
    candidates: candidateResponse.candidates,
    loadCandidates,
    openCandidateDetail,
    showToast,
  });
  const { setUploadOpen } = upload;

  useEffect(() => {
    if (!navState?.openUpload) return;
    setUploadOpen(true);
    consumeNavigationState();
  }, [consumeNavigationState, navState?.openUpload, setUploadOpen]);

  const [pushTargets, setPushTargets] = useState<PushTarget[] | null>(null);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushResults, setPushResults] = useState<PushResultItem[]>([]);
  const [pushInitialReviewerId, setPushInitialReviewerId] = useState<number | null>(null);
  const [reassignTask, setReassignTask] = useState<BusinessReviewTask | null>(null);

  const candidateViewModel = useMemo(
    () => buildCandidateLibraryViewModel({
      candidates: candidateResponse.candidates,
      hideLocalDemoRecords,
      selectedIds,
    }),
    [candidateResponse.candidates, hideLocalDemoRecords, selectedIds],
  );
  const {
    visibleCandidates,
    localDemoRecordCount,
    selectedCandidates,
    allVisibleSelected,
    selectedAllFavorite,
    selectedAllInPipeline,
    selectedAllReviewable,
  } = candidateViewModel;

  const toggleCandidate = (candidateId: number) => {
    const candidate = candidateResponse.candidates.find((item) => item.id === candidateId);
    if (!candidate || !candidateResumeReady(candidate)) {
      showToast('简历待确认，处理后才能加入流程');
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const selectableCandidates = visibleCandidates.filter(candidateResumeReady);
    const allVisibleSelected = selectableCandidates.length > 0
      && selectableCandidates.every((candidate) => selectedIds.has(candidate.id));
    setSelectedIds(allVisibleSelected ? new Set() : new Set(selectableCandidates.map((candidate) => candidate.id)));
  };

  const openPushModal = (candidates: CandidateListItem[], reviewerId: number | null = null) => {
    if (candidates.length === 0) return;
    setPushTargets(candidates.map((candidate) => ({
      candidateId: candidate.id,
      candidateName: candidate.name_masked,
      currentDemandId: candidate.current_demand_id ?? (demandFilter || null),
      currentStage: candidate.current_stage ? stageLabels[candidate.current_stage] : null,
      currentStageCode: candidate.current_stage,
    })));
    setPushResults([]);
    setPushInitialReviewerId(reviewerId);
    setReassignTask(null);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const openReassignModal = (task: BusinessReviewTask) => {
    const candidate = candidateFromReviewTask(task);
    setDemandFilter(task.demand_id);
    setPushTargets([{
      candidateId: candidate.id,
      candidateName: candidate.name_masked,
      currentDemandId: task.demand_id,
      currentStage: stageLabels[candidate.current_stage || 'business_review'],
      currentStageCode: candidate.current_stage || 'business_review',
    }]);
    setPushResults([]);
    setPushInitialReviewerId(task.reviewer_id);
    setReassignTask(task);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const repeatBusinessReview = (task: BusinessReviewTask) => {
    setDemandFilter(task.demand_id);
    openPushModal([candidateFromReviewTask(task)], task.reviewer_id);
  };

  const renderReviewAction = (task: BusinessReviewTask) => {
    if (task.status === 'approved') {
      if (task.candidate.current_stage === 'offer') {
        return (
          <button
            type="button"
            onClick={() => navigate(`/offers?demand=${task.demand_id}&candidate=${task.candidate_id}${workflowSourceQuery}`)}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            查看 Offer
          </button>
        );
      }
      if (task.candidate.current_stage === 'onboarded') {
        return <span className="text-xs font-medium text-emerald-700">已入职，流程已完成</span>;
      }
      if (task.candidate.current_stage === 'rejected') {
        return <span className="text-xs font-medium text-red-700">已淘汰，流程已结束</span>;
      }
      if (task.candidate.current_stage === 'transferred') {
        return <span className="text-xs font-medium text-foreground-600">已转至其他招聘需求</span>;
      }
      if (interviewRowsError) {
        return <span className="text-xs text-amber-700">面试状态暂不可用，请刷新后再操作</span>;
      }
      const hasScheduledInterview = interviewRows.some((row) => (
        row.demand_id === task.demand_id
        && row.candidate_id === task.candidate_id
        && row.assignment_id !== null
        && row.assignment_status !== 'unassigned'
      ));
      return (
        <button
          type="button"
          onClick={() => navigate(`/interviews?demand=${task.demand_id}&candidate=${task.candidate_id}${workflowSourceQuery}`)}
          className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          {hasScheduledInterview ? '查看/调整面试' : '安排面试'}
        </button>
      );
    }
    if (task.status === 'rejected') {
      return (
        <button
          type="button"
          onClick={() => navigate(`/kanban?demand=${task.demand_id}&candidate=${task.candidate_id}&target=rejected`)}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          去流程处理
        </button>
      );
    }
    if (task.status === 'needs_info') {
      return (
        <button
          type="button"
          onClick={() => repeatBusinessReview(task)}
          className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          补充并再次推送
        </button>
      );
    }
    return <span className="text-xs text-foreground-500">等待业务负责人处理</span>;
  };

  const updateFavorites = async (candidates: CandidateListItem[], favorite: boolean) => {
    if (candidates.length === 0 || favoriteSaving) return;
    setFavoriteSaving(true);
    try {
      await candidatesApi.setFavorites(candidates.map((candidate) => candidate.id), favorite);
      showToast(favorite ? `已收藏 ${candidates.length} 位候选人` : `已取消收藏 ${candidates.length} 位候选人`);
      await loadCandidates();
    } catch (error) {
      showToast(errorMessage(error, favorite ? '收藏候选人失败' : '取消收藏失败'));
    } finally {
      setFavoriteSaving(false);
    }
  };

  const openPipelineModal = (candidates: CandidateListItem[]) => {
    if (candidates.length === 0) return;
    setPipelineTargets(candidates);
    setPipelineResult(null);
  };

  const handleAddToPipeline = async (demandId: number, reason: string, pushAfterAdd: boolean) => {
    if (!pipelineTargets || pipelineSubmitting) return;
    setPipelineSubmitting(true);
    try {
      const result = await candidatesApi.addToPipeline(
        demandId,
        pipelineTargets.map((candidate) => candidate.id),
        reason,
      );
      setPipelineResult(result);
      setSelectedIds(new Set());
      await loadCandidates();
      showToast(`已加入 ${result.added} 位，重新启用 ${result.reactivated} 位候选人`);
      const successfulCount = result.added + result.reactivated;
      if (pushAfterAdd && successfulCount > 0) {
        const failedIds = new Set(result.failures.map((item) => item.candidate_id));
        const successful = pipelineTargets
          .filter((candidate) => !failedIds.has(candidate.id))
          .slice(0, successfulCount)
          .map((candidate) => ({
            ...candidate,
            current_demand_id: demandId,
            current_stage: 'pending' as const,
          }));
        setPipelineTargets(null);
        setPipelineResult(null);
        setDemandFilter(demandId);
        openPushModal(successful);
      }
    } catch (error) {
      showToast(errorMessage(error, '加入招聘流程失败'));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  const openTransferModal = (candidate: CandidateListItem) => {
    if (!candidate.current_demand_id) return;
    setTransferError('');
    setTransferInvalidated(false);
    setTransferCandidate(candidate);
  };

  const handleTransferCandidate = async (targetDemandId: number, reason: string) => {
    if (!transferCandidate?.current_demand_id || transferSubmitting || transferInvalidated) return;
    setTransferSubmitting(true);
    setTransferError('');
    try {
      await candidatesApi.transferToDemand(
        transferCandidate.id,
        transferCandidate.current_demand_id,
        targetDemandId,
        reason,
      );
      showToast(`${transferCandidate.name_masked}已转到新的招聘需求`);
      setTransferCandidate(null);
      await loadCandidates();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const [response] = await Promise.all([loadCandidates(), loadDemands()]);
        const latest = response?.candidates.find((candidate) => candidate.id === transferCandidate.id) ?? null;
        if (latest?.current_demand_id) {
          setTransferCandidate(latest);
          setTransferInvalidated(false);
          setTransferError('数据已变化，已刷新候选人和需求状态，请核对后再操作');
        } else {
          setTransferInvalidated(true);
          setTransferError('数据已变化，该候选人已不在当前列表或活动流程中，请关闭后重新查看');
        }
      } else {
        setTransferError(errorMessage(error, '转移招聘需求失败'));
      }
    } finally {
      setTransferSubmitting(false);
    }
  };

  const openCandidatePipeline = (candidate: CandidateListItem) => {
    if (!candidate.current_demand_id) return;
    navigate(`/kanban?demand=${candidate.current_demand_id}&candidate=${candidate.id}${workflowSourceQuery}`);
  };

  const handlePushToBusiness = async (value: PushFormValue) => {
    if (!pushTargets || pushSubmitting) return;
    setPushSubmitting(true);
    setPushResults([]);
    const results: PushResultItem[] = [];

    if (reassignTask) {
      const target = pushTargets[0];
      try {
        const task = await businessReviewsApi.reassignTask(reassignTask.id, value.reviewerId);
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'created',
          message: task.unchanged ? '接收人没有变化' : `已改派给 ${task.reviewer_name || '新业务筛选人'}`,
        });
        await loadReviewTasks();
        showToast(task.unchanged ? '业务筛选人没有变化' : `已改派给 ${task.reviewer_name || '新业务筛选人'}`);
      } catch (error) {
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '改派失败'),
        });
      } finally {
        setPushResults(results);
        setPushSubmitting(false);
      }
      return;
    }

    for (const target of pushTargets) {
      try {
        const task = await candidatesApi.pushToBusinessReview({
          demand_id: value.demandId,
          candidate_id: target.candidateId,
          reviewer_id: value.reviewerId,
          hr_note: value.hrNote,
          due_at: value.dueAt,
        });
        const deduplicated = task.deduplicated === true;
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: deduplicated ? 'deduplicated' : 'created',
          message: deduplicated ? '该候选人已在等待业务筛选' : '业务筛选任务已创建',
        });
      } catch (error) {
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '推送失败'),
        });
      }
    }

    setPushResults(results);
    setPushSubmitting(false);
    if (results.some((result) => result.status !== 'failed')) {
      await loadCandidates();
      await loadReviewTasks();
      const created = results.filter((result) => result.status === 'created');
      const duplicate = results.filter((result) => result.status === 'deduplicated');
      if (created.length > 0) {
        showToast(`已根据后端结果创建 ${created.length} 个业务筛选任务`);
      } else if (duplicate.length > 0) {
        showToast('该候选人已在等待业务筛选');
      }
    }
  };

  const initialPushDemandId = demandFilter || null;
  const renderCandidateBusinessAction = (candidate: CandidateListItem, compact = false) => {
    if (!candidateResumeReady(candidate)) {
      return <span className="text-xs font-medium text-amber-700">简历待确认，处理后才能加入流程</span>;
    }
    const demandId = candidate.current_demand_id;
    const candidateTasks = reviewTasks.filter((task) => (
      task.candidate_id === candidate.id
      && (!demandId || task.demand_id === demandId)
    ));
    const pendingTask = candidateTasks.find((task) => task.status === 'pending') ?? null;
    const latestTask = candidateTasks[0] ?? null;
    const action = candidateBusinessAction({
      currentDemandId: demandId,
      currentStage: candidate.current_stage,
      pendingTask,
      latestTask,
    });
    const primaryClass = compact
      ? 'inline-flex min-h-8 items-center justify-center rounded-lg bg-primary-500 px-2.5 text-xs font-medium text-white hover:bg-primary-600'
      : 'inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600';
    const secondaryClass = compact
      ? 'inline-flex min-h-8 items-center justify-center rounded-lg border border-primary-200 bg-white px-2.5 text-xs font-medium text-primary-700 hover:bg-primary-50'
      : 'inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50';

    if (action.kind === 'join_and_push') {
      return <button type="button" onClick={() => openPipelineModal([candidate])} className={primaryClass}><UserPlus size={14} aria-hidden="true" />{action.label}</button>;
    }
    if (action.kind === 'push') {
      return <button type="button" onClick={() => openPushModal([candidate])} className={primaryClass}><Send size={14} aria-hidden="true" />{action.label}</button>;
    }
    if (action.kind === 'waiting' && pendingTask) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-xs font-medium text-amber-700">{action.label}</span>
          <button type="button" onClick={() => openReassignModal(pendingTask)} className={secondaryClass}>改派筛选人</button>
        </div>
      );
    }
    if (action.kind === 'schedule_interview' && demandId) {
      return <button type="button" aria-label="安排正式面试" onClick={() => navigate(`/interviews?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={primaryClass}>{action.label}</button>;
    }
    if (action.kind === 'needs_info' && latestTask) {
      return <button type="button" onClick={() => repeatBusinessReview(latestTask)} className={primaryClass}>{action.label}</button>;
    }
    if (action.kind === 'rejected' && demandId) {
      return <button type="button" onClick={() => navigate(`/kanban?demand=${demandId}&candidate=${candidate.id}&target=rejected`)} className={secondaryClass}>{action.label}</button>;
    }
    if (action.kind === 'later_stage' && demandId && candidate.current_stage === 'interview') {
      return <button type="button" onClick={() => navigate(`/interviews?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={secondaryClass}>{action.label}</button>;
    }
    if (action.kind === 'later_stage' && demandId && candidate.current_stage === 'offer') {
      return <button type="button" onClick={() => navigate(`/offers?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={secondaryClass}>{action.label}</button>;
    }
    return <span className="text-xs font-medium text-foreground-500">{action.label}</span>;
  };


  return {
    ...filters,
    ...upload,
    role,
    showToast,
    candidateResponse,
    candidatesLoading,
    candidatesError,
    demands,
    demandsLoading,
    demandError,
    reviewers,
    reviewersLoading,
    reviewerError,
    reviewTasksError,
    selectedIds,
    setSelectedIds,
    favoriteSaving,
    pipelineTargets,
    setPipelineTargets,
    pipelineSubmitting,
    pipelineResult,
    setPipelineResult,
    transferCandidate,
    setTransferCandidate,
    transferSubmitting,
    transferError,
    transferInvalidated,
    duplicatesOpen,
    setDuplicatesOpen,
    detailCandidate,
    setDetailCandidate,
    detailTab,
    setDetailTab,
    detailEditRequested,
    resumeDetail,
    setResumeDetail,
    candidateJourney,
    journeyError,
    detailLoading,
    detailError,
    resumePreviewUrl,
    originalResumeLoading,
    originalResumeError,
    pushTargets,
    setPushTargets,
    pushSubmitting,
    pushResults,
    setPushResults,
    pushInitialReviewerId,
    setPushInitialReviewerId,
    reassignTask,
    setReassignTask,
    activeDemands,
    pushDemandOptions,
    visibleCandidates,
    localDemoRecordCount,
    selectedCandidates,
    loadCandidates,
    loadDemands,
    loadReviewers,
    loadReviewTasks,
    toggleCandidate,
    toggleAllVisible,
    loadCandidateDetail,
    openCandidateDetail,
    visibleReviewResults,
    detailReview,
    closeCandidateDetail,
    previewOriginalResume,
    downloadOriginalResume,
    openPushModal,
    renderReviewAction,
    updateFavorites,
    openPipelineModal,
    handleAddToPipeline,
    openTransferModal,
    handleTransferCandidate,
    openCandidatePipeline,
    handlePushToBusiness,
    initialPushDemandId,
    allVisibleSelected,
    selectedAllFavorite,
    selectedAllInPipeline,
    selectedAllReviewable,
    renderCandidateBusinessAction,
  } as const;
}

export type CandidateLibraryController = ReturnType<typeof useCandidateLibraryController>;
