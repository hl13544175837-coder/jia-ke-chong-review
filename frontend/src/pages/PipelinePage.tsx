// 候选人流程页 — 按招聘需求管理每位候选人的当前阶段，
// 并支持在右侧详情中推进、淘汰、跳转阶段与加入新候选人。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, KanbanSquare, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  PageHeader,
  Card,
  useToast,
} from '../components/ui';
import type {
  CandidateDispositionInput,
  PipelineStage,
  PipelineBoardCandidate,
  RecruitmentDemand,
} from '../types';
import { STAGES, stageLabel } from '../lib/pipelineStages';
import { AddToPipeline } from '../components/pipeline/AddToPipeline';
import { PipelineStageTabs } from '../components/pipeline/PipelineStageTabs';
import { PipelineCandidateList } from '../components/pipeline/PipelineCandidateList';
import { PipelineCandidatePanel } from '../components/pipeline/PipelineCandidatePanel';

function formatDemandOption(demand: RecruitmentDemand) {
  return [
    demand.request_no || `REQ-${demand.id}`,
    demand.job_title,
    demand.job_department,
    demand.job_city,
    demand.owner_hr_name,
  ].filter(Boolean).join(' · ');
}

const PREFERRED_STAGE_ORDER: PipelineStage[] = [
  'business_review',
  'interview',
  'offer',
  'ai_screen',
  'pending',
  'transferred',
  'rejected',
  'onboarded',
];

function parseStageParam(value: string | null): PipelineStage | null {
  if (!value) return null;
  return STAGES.some((stage) => stage.key === value) ? (value as PipelineStage) : null;
}

interface PendingMove {
  candidateId: number;
  toStage: PipelineStage;
}

export function PipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const demandParam = Number(searchParams.get('demand'));
  const jobParam = Number(searchParams.get('job'));
  const candidateParam = Number(searchParams.get('candidate'));
  const requestedStage = parseStageParam(searchParams.get('stage'));
  const requestedDemandId = Number.isFinite(demandParam) && demandParam > 0 ? demandParam : null;
  const requestedJobId = Number.isFinite(jobParam) && jobParam > 0 ? jobParam : null;
  const highlightedCandidateId =
    Number.isFinite(candidateParam) && candidateParam > 0 ? candidateParam : null;

  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100 }),
    [],
  );
  const [selectedDemandId, setSelectedDemandId] = useState<number | null>(requestedDemandId);

  const demandItems = demandsAsync.data?.items ?? [];
  const hasCompleteVisibleDemandList =
    demandsAsync.data !== null && demandsAsync.data.total === demandItems.length;
  const selectedDemand =
    selectedDemandId !== null
      ? demandItems.find((demand) => demand.id === selectedDemandId) ?? null
      : null;
  const legacyJobDemands =
    selectedDemandId === null && requestedJobId !== null
      ? demandItems.filter((demand) => demand.job_id === requestedJobId)
      : [];
  const effectiveDemand =
    selectedDemand ??
    (selectedDemandId !== null
      ? null
      : requestedJobId !== null
        ? hasCompleteVisibleDemandList && legacyJobDemands.length === 1
          ? legacyJobDemands[0]
          : null
        : demandItems[0] ?? null);
  const effectiveDemandId = effectiveDemand?.id ?? null;
  const effectiveJobId = effectiveDemand?.job_id ?? null;
  const demandResolutionError =
    !demandsAsync.loading && !demandsAsync.error
      ? selectedDemandId !== null && selectedDemand === null
        ? '该招聘需求不存在或你无权查看，请从下拉列表选择可访问的需求。'
        : selectedDemandId === null && requestedJobId !== null && !hasCompleteVisibleDemandList
          ? '这个旧岗位链接无法在当前列表中安全确认唯一需求，系统不会替你猜。请选择具体招聘需求。'
        : selectedDemandId === null && requestedJobId !== null && legacyJobDemands.length > 1
          ? '这个旧岗位链接对应多个招聘需求，系统不会替你猜。请选择具体招聘需求。'
          : selectedDemandId === null && requestedJobId !== null && legacyJobDemands.length === 0
            ? '这个旧岗位链接没有可访问的招聘需求，请从下拉列表重新选择。'
            : null
      : null;

  const boardAsync = useAsync(
    () =>
      effectiveDemandId !== null
        ? api.getDemandPipelineBoard(effectiveDemandId)
        : Promise.resolve(null),
      [effectiveDemandId],
  );

  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage>(requestedStage ?? 'pending');
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
    highlightedCandidateId,
  );
  const [showAddToPipeline, setShowAddToPipeline] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [recentlyMovedCandidateId, setRecentlyMovedCandidateId] = useState<number | null>(null);
  const autoStageKeyRef = useRef<string | null>(null);

  const candidates: PipelineBoardCandidate[] = useMemo(
    () => boardAsync.data?.candidates ?? [],
    [boardAsync.data],
  );
  const highlightedCandidate = highlightedCandidateId
    ? candidates.find((c) => c.candidate_id === highlightedCandidateId)
    : null;
  const listHighlightCandidateId = recentlyMovedCandidateId ?? highlightedCandidateId;

  useEffect(() => {
    setSelectedDemandId(requestedDemandId);
    setPendingMove(null);
    setRecentlyMovedCandidateId(null);
    setActiveStage(requestedStage ?? 'pending');
    setSelectedCandidateId(highlightedCandidateId);
    setShowAddToPipeline(false);
  }, [highlightedCandidateId, requestedDemandId, requestedStage]);

  // 已在本招聘需求流程中的候选人 id 集合（供"加入流程"排除）。
  const existingIds = useMemo(
    () => new Set(candidates.map((c) => c.candidate_id)),
    [candidates],
  );

  // 按阶段分桶。
  const byStage = useMemo(() => {
    const map: Partial<Record<PipelineStage, PipelineBoardCandidate[]>> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const c of candidates) {
      (map[c.stage] ??= []).push(c);
    }
    return map;
  }, [candidates]);

  const stageCounts = useMemo(
    () =>
      STAGES.reduce<Partial<Record<PipelineStage, number>>>((acc, stage) => {
        acc[stage.key] = byStage[stage.key]?.length ?? 0;
        return acc;
      }, {}),
    [byStage],
  );
  const activeStageConfig = STAGES.find((stage) => stage.key === activeStage) ?? STAGES[0];
  const activeCandidates = useMemo(
    () => byStage[activeStage] ?? [],
    [activeStage, byStage],
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.candidate_id === selectedCandidateId) ?? null;

  useEffect(() => {
    if (highlightedCandidate) {
      setActiveStage(highlightedCandidate.stage);
      setSelectedCandidateId(highlightedCandidate.candidate_id);
    }
  }, [highlightedCandidate]);

  useEffect(() => {
    if (pendingMove || highlightedCandidate || boardAsync.loading || boardAsync.error) return;
    if (effectiveDemandId === null || candidates.length === 0) return;

    const autoStageKey = [
      effectiveDemandId,
      requestedStage ?? 'auto',
      candidates.map((candidate) => `${candidate.candidate_id}:${candidate.stage}`).join(','),
    ].join('|');
    if (autoStageKeyRef.current === autoStageKey) return;
    autoStageKeyRef.current = autoStageKey;

    const requestedStageHasCandidates =
      requestedStage !== null && (stageCounts[requestedStage] ?? 0) > 0;
    const nextStage =
      requestedStageHasCandidates
        ? requestedStage
        : PREFERRED_STAGE_ORDER.find((stage) => (stageCounts[stage] ?? 0) > 0) ?? activeStage;

    if (nextStage !== activeStage) {
      setActiveStage(nextStage);
      setSelectedCandidateId(byStage[nextStage]?.[0]?.candidate_id ?? null);
      setSearchParams({ demand: String(effectiveDemandId), stage: nextStage }, { replace: true });
      return;
    }

    if (
      selectedCandidateId === null ||
      !byStage[nextStage]?.some((candidate) => candidate.candidate_id === selectedCandidateId)
    ) {
      setSelectedCandidateId(byStage[nextStage]?.[0]?.candidate_id ?? null);
    }
  }, [
    activeStage,
    boardAsync.error,
    boardAsync.loading,
    byStage,
    candidates,
    effectiveDemandId,
    highlightedCandidate,
    pendingMove,
    requestedStage,
    selectedCandidateId,
    setSearchParams,
    stageCounts,
  ]);

  useEffect(() => {
    if (!pendingMove) return;
    const movedCandidate = candidates.find(
      (candidate) =>
        candidate.candidate_id === pendingMove.candidateId &&
        candidate.stage === pendingMove.toStage,
    );
    if (!movedCandidate) return;
    setActiveStage(pendingMove.toStage);
    setSelectedCandidateId(pendingMove.candidateId);
    setRecentlyMovedCandidateId(pendingMove.candidateId);
    setPendingMove(null);
    setBusyId(null);
  }, [candidates, pendingMove]);

  useEffect(() => {
    if (!recentlyMovedCandidateId) return;
    const timer = window.setTimeout(() => {
      setRecentlyMovedCandidateId((current) =>
        current === recentlyMovedCandidateId ? null : current,
      );
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [recentlyMovedCandidateId]);

  useEffect(() => {
    if (!pendingMove || boardAsync.loading || !boardAsync.error) return;
    setPendingMove(null);
    setBusyId(null);
  }, [boardAsync.error, boardAsync.loading, pendingMove]);

  useEffect(() => {
    if (pendingMove) {
      return;
    }
    if (activeCandidates.length === 0) {
      setSelectedCandidateId(null);
      return;
    }
    if (
      selectedCandidateId === null ||
      !activeCandidates.some((candidate) => candidate.candidate_id === selectedCandidateId)
    ) {
      setSelectedCandidateId(activeCandidates[0].candidate_id);
    }
  }, [activeCandidates, pendingMove, selectedCandidateId]);

  const handleMove = useCallback(
    async (
      candidateId: number,
      toStage: PipelineStage,
      note?: string,
      disposition?: CandidateDispositionInput,
    ) => {
      if (effectiveDemandId === null) return;
      setBusyId(candidateId);
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      try {
        const res = await api.movePipeline({
          candidate_id: candidateId,
          demand_id: effectiveDemandId,
          stage: toStage,
          note,
          disposition,
        });
        setPendingMove({ candidateId, toStage });
        toast.success(`${res.name_masked || '候选人'} 已更新至「${stageLabel(toStage)}」`);
        boardAsync.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '操作失败');
        setBusyId(null);
      }
    },
    [effectiveDemandId, boardAsync, toast],
  );

  const handleDemandChange = useCallback(
    (demandId: number) => {
      setSelectedDemandId(demandId);
      setSearchParams({ demand: String(demandId), stage: activeStage });
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      setSelectedCandidateId(null);
      setShowAddToPipeline(false);
    },
    [activeStage, setSearchParams],
  );

  const handleStageSelect = useCallback(
    (stage: PipelineStage) => {
      setActiveStage(stage);
      setSelectedCandidateId(byStage[stage]?.[0]?.candidate_id ?? null);
      if (effectiveDemandId !== null) {
        setSearchParams({ demand: String(effectiveDemandId), stage });
      } else {
        setSearchParams({ stage });
      }
    },
    [byStage, effectiveDemandId, setSearchParams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="候选人流程"
        description="以看板查看每位候选人所处阶段，并就地推进、淘汰或调整其状态"
      />

      <details className="group rounded-md border border-hairline bg-canvas px-4 py-3 text-sm text-muted">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-body">
          <Info className="h-4 w-4 text-muted" />
          查看流程说明
          <span className="ml-auto text-xs text-muted-soft group-open:hidden">
            待筛选 → 面试中 → Offer
          </span>
        </summary>
        <p className="mt-2 text-xs leading-5 text-muted">
          待筛选 → AI 初筛 → 业务反馈 → 面试中 → Offer → 已入职 / 淘汰沉淀
        </p>
      </details>

      {demandsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载招聘需求…
        </div>
      )}

      {!demandsAsync.loading && demandsAsync.error && (
        <ErrorState message={demandsAsync.error.message} onRetry={demandsAsync.reload} />
      )}

      {!demandsAsync.loading && !demandsAsync.error && demandItems.length === 0 && (
        <Card>
          <EmptyState
            icon={KanbanSquare}
            title="暂无招聘需求"
            description="请先创建具体招聘需求，再加入候选人并推进流程"
            action={
              <Link to="/demands">
                <Button variant="secondary" size="sm">
                  新建招聘需求
                </Button>
              </Link>
            }
          />
        </Card>
      )}

      {!demandsAsync.loading && !demandsAsync.error && demandItems.length > 0 && (
        <>
          {/* 招聘需求选择 + 匹配入口 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <label htmlFor="demand-select" className="text-sm font-medium text-ink">
                当前招聘需求
              </label>
              <select
                id="demand-select"
                className="h-10 min-w-0 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:min-w-[360px]"
                value={effectiveDemandId ?? ''}
                onChange={(e) => handleDemandChange(Number(e.target.value))}
              >
                {effectiveDemandId === null && (
                  <option value="" disabled>
                    请选择具体招聘需求
                  </option>
                )}
                {demandItems.map((demand) => (
                  <option key={demand.id} value={demand.id}>
                    {formatDemandOption(demand)}
                  </option>
                ))}
              </select>
              {boardAsync.loading && <Spinner size="sm" />}
            </div>

            {effectiveDemandId !== null && effectiveJobId !== null && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddToPipeline((value) => !value)}
                  aria-expanded={showAddToPipeline}
                >
                  <UserPlus className="h-4 w-4" />
                  添加候选人
                </Button>
                <Link to={`/jobs/${effectiveJobId}/match?demand=${effectiveDemandId}`}>
                  <Button type="button" variant="ghost" size="sm">
                    去匹配更多候选人 →
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {demandResolutionError && (
            <Card>
              <EmptyState
                icon={KanbanSquare}
                title="无法定位招聘需求"
                description={demandResolutionError}
              />
            </Card>
          )}

          {/* 加入候选人到流程 */}
          {!demandResolutionError && effectiveDemandId !== null && effectiveJobId !== null && showAddToPipeline && (
            <AddToPipeline
              demandId={effectiveDemandId}
              jobId={effectiveJobId}
              existingIds={existingIds}
              onAdded={() => {
                boardAsync.reload();
                setShowAddToPipeline(false);
              }}
              onClose={() => setShowAddToPipeline(false)}
            />
          )}

          {highlightedCandidate && (
            <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              已定位到 {highlightedCandidate.name_masked}。下一步可在右侧详情推进主流程，
              面试轮次和反馈请进入「面试任务」记录。
            </div>
          )}

          {/* 候选人流程工作区 */}
          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.loading && boardAsync.error && (
            <ErrorState message={boardAsync.error.message} onRetry={boardAsync.reload} />
          )}

          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.error && (
            <div className="space-y-4">
              <PipelineStageTabs
                stages={STAGES}
                activeStage={activeStage}
                counts={stageCounts}
                onSelect={handleStageSelect}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <PipelineCandidateList
                  stage={activeStageConfig}
                  candidates={activeCandidates}
                  counts={stageCounts}
                  demandId={effectiveDemandId}
                  jobId={effectiveJobId}
                  selectedCandidateId={selectedCandidateId}
                  highlightedCandidateId={listHighlightCandidateId}
                  busyId={busyId}
                  onJumpToStage={handleStageSelect}
                  onSelect={(candidate) => setSelectedCandidateId(candidate.candidate_id)}
                />
                {effectiveDemandId !== null && effectiveJobId !== null && (
                  <PipelineCandidatePanel
                    candidate={selectedCandidate}
                    demandId={effectiveDemandId}
                    jobId={effectiveJobId}
                    busy={
                      selectedCandidate
                        ? busyId === selectedCandidate.candidate_id ||
                          pendingMove?.candidateId === selectedCandidate.candidate_id
                        : false
                    }
                    onMove={handleMove}
                    onTransferred={() => {
                      toast.success('已转入目标需求；原需求保留「已转出」记录');
                      boardAsync.reload();
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* 空流程提示 */}
          {!demandResolutionError && effectiveDemandId !== null && !boardAsync.loading && !boardAsync.error && candidates.length === 0 && (
            <p className="text-center text-sm text-muted-soft">
              本招聘需求中暂无候选人，可先点击「添加候选人」或去匹配更多候选人。
            </p>
          )}
        </>
      )}
    </div>
  );
}
