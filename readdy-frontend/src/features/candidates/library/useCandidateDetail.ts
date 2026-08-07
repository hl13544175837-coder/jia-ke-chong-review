import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { isActionableBusinessReviewResult } from '@/features/businessReviews/stages';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import { candidateFromReviewTask, errorMessage } from '@/features/candidates/library';
import { externalApiBaseUrl } from '@/lib/api';
import type {
  CandidateJourney,
  CandidateListItem,
  CandidateResumeDetail,
} from '@/features/candidates/types';

interface CandidateDetailOptions {
  candidates: CandidateListItem[];
  candidatesLoading: boolean;
  reviewTasks: BusinessReviewTask[];
  reviewTasksLoading: boolean;
  requestedCandidateId: number | null;
  requestedDetailTab: CandidateDetailTab;
  requestedDemandId: number | null;
  demandFilter: number | '';
  openCandidateInUrl: (candidateId: number | null, detailTab?: CandidateDetailTab) => void;
}

export function useCandidateDetail({
  candidates,
  candidatesLoading,
  reviewTasks,
  reviewTasksLoading,
  requestedCandidateId,
  requestedDetailTab,
  requestedDemandId,
  demandFilter,
  openCandidateInUrl,
}: CandidateDetailOptions) {
  const [detailCandidate, setDetailCandidate] = useState<CandidateListItem | null>(null);
  const [detailTab, setDetailTab] = useState<CandidateDetailTab>('interview');
  const [detailEditRequested, setDetailEditRequested] = useState(false);
  const [resumeDetail, setResumeDetail] = useState<CandidateResumeDetail | null>(null);
  const [candidateJourney, setCandidateJourney] = useState<CandidateJourney | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestId = useRef(0);
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [originalResumeLoading, setOriginalResumeLoading] = useState<'preview' | 'download' | null>(null);
  const [originalResumeError, setOriginalResumeError] = useState<string | null>(null);
  const handledCandidateQuery = useRef<number | null>(null);

  const loadCandidateDetail = useCallback(async (candidateId: number, targetDemandId: number | null) => {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setDetailError(null);
    setJourneyError(null);
    try {
      const [resumeResult, journeyResult] = await Promise.allSettled([
        candidatesApi.getResume(candidateId),
        targetDemandId ? candidatesApi.getJourney(candidateId, targetDemandId) : Promise.resolve(null),
      ]);
      if (requestId !== detailRequestId.current) return;
      if (resumeResult.status === 'rejected') throw resumeResult.reason;
      setResumeDetail(resumeResult.value);
      if (journeyResult.status === 'fulfilled') setCandidateJourney(journeyResult.value);
      else setJourneyError(errorMessage(journeyResult.reason, '完整招聘过程暂不可用'));
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setDetailError(errorMessage(error, '简历详情加载失败'));
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  const openCandidateDetail = useCallback((candidate: CandidateListItem, initialTab: CandidateDetailTab = 'interview', startEditing = false) => {
    handledCandidateQuery.current = candidate.id;
    setDetailCandidate(candidate);
    setDetailTab(initialTab);
    setDetailEditRequested(startEditing);
    setResumeDetail(null);
    setCandidateJourney(null);
    setJourneyError(null);
    setResumePreviewUrl(null);
    setOriginalResumeError(null);
    openCandidateInUrl(candidate.id, initialTab);
    void loadCandidateDetail(
      candidate.id,
      candidate.current_demand_id ?? candidate.latest_demand_id ?? requestedDemandId,
    );
  }, [loadCandidateDetail, openCandidateInUrl, requestedDemandId]);

  useEffect(() => {
    if (!requestedCandidateId) handledCandidateQuery.current = null;
  }, [requestedCandidateId]);

  const focusedReview = useMemo(() => reviewTasks.find((task) => (
    task.candidate_id === requestedCandidateId
    && (!requestedDemandId || task.demand_id === requestedDemandId)
  )) ?? null, [requestedCandidateId, requestedDemandId, reviewTasks]);

  const visibleReviewResults = useMemo(() => {
    if (focusedReview && isActionableBusinessReviewResult(
      focusedReview.status,
      focusedReview.candidate.current_stage,
    )) return [focusedReview];
    return reviewTasks
      .filter((task) => (
        isActionableBusinessReviewResult(task.status, task.candidate.current_stage)
        && (!demandFilter || task.demand_id === demandFilter)
      ))
      .slice(0, 5);
  }, [demandFilter, focusedReview, reviewTasks]);

  const detailReview = useMemo(() => {
    if (!detailCandidate) return null;
    return reviewTasks.find((task) => (
      task.candidate_id === detailCandidate.id
      && (!detailCandidate.current_demand_id || task.demand_id === detailCandidate.current_demand_id)
    )) ?? null;
  }, [detailCandidate, reviewTasks]);

  useEffect(() => {
    if (!requestedCandidateId || candidatesLoading || reviewTasksLoading) return;
    if (handledCandidateQuery.current === requestedCandidateId) return;
    const candidate = candidates.find((item) => item.id === requestedCandidateId)
      ?? (focusedReview ? candidateFromReviewTask(focusedReview) : null);
    if (!candidate) return;
    handledCandidateQuery.current = requestedCandidateId;
    openCandidateDetail(candidate, requestedDetailTab);
  }, [
    candidates,
    candidatesLoading,
    focusedReview,
    openCandidateDetail,
    requestedCandidateId,
    requestedDetailTab,
    reviewTasksLoading,
  ]);

  useEffect(() => () => {
    if (resumePreviewUrl) URL.revokeObjectURL(resumePreviewUrl);
  }, [resumePreviewUrl]);

  const closeCandidateDetail = () => {
    detailRequestId.current += 1;
    setDetailCandidate(null);
    setDetailEditRequested(false);
    setResumeDetail(null);
    setCandidateJourney(null);
    setJourneyError(null);
    setDetailError(null);
    setResumePreviewUrl(null);
    setOriginalResumeError(null);
    openCandidateInUrl(null);
  };

  const previewOriginalResume = async () => {
    if (!resumeDetail || originalResumeLoading) return;
    setOriginalResumeLoading('preview');
    setOriginalResumeError(null);
    try {
      const issued = await businessReviewsApi.createPreviewTicket(resumeDetail.id);
      window.open(`${externalApiBaseUrl()}${issued.url}`, '_blank', 'noopener');
    } catch (error) {
      setOriginalResumeError(errorMessage(error, '原版简历预览失败'));
    } finally {
      setOriginalResumeLoading(null);
    }
  };

  const downloadOriginalResume = async () => {
    if (!resumeDetail || originalResumeLoading) return;
    setOriginalResumeLoading('download');
    setOriginalResumeError(null);
    try {
      const blob = await businessReviewsApi.downloadResume(resumeDetail.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resumeDetail.original_resume.filename || `candidate-${resumeDetail.id}-resume`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setOriginalResumeError(errorMessage(error, '原版简历下载失败'));
    } finally {
      setOriginalResumeLoading(null);
    }
  };

  return {
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
  } as const;
}

export type CandidateDetailController = ReturnType<typeof useCandidateDetail>;
