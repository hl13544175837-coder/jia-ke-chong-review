import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  History,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { useProductRole } from '@/auth/productRole';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { pipelineApi } from '@/features/pipeline/api';
import type {
  PipelineBoard,
  PipelineBoardCandidate,
  PipelineHistory,
  PipelineStage,
} from '@/features/pipeline/types';
import { kpiStandardsApi } from '@/features/kpiStandards/api';
import type { KpiStandardConfig } from '@/features/kpiStandards/types';
import BlockagePanel from '@/pages/kanban/components/BlockagePanel';

const stages: Array<{ key: PipelineStage; label: string; tone: string }> = [
  { key: 'pending', label: '简历收录', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
  { key: 'ai_screen', label: 'HR 筛选', tone: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  { key: 'business_review', label: '业务筛选', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  { key: 'interview', label: '面试中', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  { key: 'offer', label: 'Offer', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { key: 'onboarded', label: '已入职', tone: 'border-teal-200 bg-teal-50 text-teal-700' },
  { key: 'rejected', label: '已淘汰', tone: 'border-red-200 bg-red-50 text-red-700' },
  { key: 'transferred', label: '已转出', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
];

const stageLabels = Object.fromEntries(stages.map((item) => [item.key, item.label])) as Record<string, string>;
const KANBAN_DEMAND_MEMORY_KEY = 'zhipin.kanban.last-demand';

function rememberedKanbanDemandId() {
  if (typeof window === 'undefined') return null;
  const value = Number(sessionStorage.getItem(KANBAN_DEMAND_MEMORY_KEY));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function moveTargets(stage: PipelineStage): PipelineStage[] {
  if (stage === 'pending') return ['ai_screen', 'business_review', 'rejected'];
  if (stage === 'ai_screen') return ['business_review', 'rejected'];
  if (stage === 'business_review') return ['interview', 'rejected'];
  if (stage === 'interview') return ['offer', 'rejected'];
  if (stage === 'rejected') return ['pending'];
  return [];
}

function formatTime(value: string | null | undefined) {
  if (!value) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

interface MoveDialogProps {
  candidate: PipelineBoardCandidate;
  initialTarget?: PipelineStage | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (stage: PipelineStage, reason: string) => void;
}

function MoveDialog({ candidate, initialTarget, busy, error, onClose, onSubmit }: MoveDialogProps) {
  const targets = moveTargets(candidate.stage);
  const [target, setTarget] = useState<PipelineStage | ''>(
    initialTarget && targets.includes(initialTarget) ? initialTarget : targets[0] || '',
  );
  const [reason, setReason] = useState('');
  const reasonRequired = target === 'rejected' || candidate.stage === 'rejected';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="推进候选人"
      onClick={busy ? undefined : onClose}
    >
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-foreground-900">更新候选人阶段</h2>
            <p className="mt-1 text-sm text-foreground-500">
              {candidate.name_masked} · 当前 {stageLabels[candidate.stage] || candidate.stage}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭" className="rounded-md p-2 text-foreground-400 hover:bg-background-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          {candidate.pending_feedback && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              该候选人面试官尚未提交反馈，推进前请确认。
            </p>
          )}
          <label className="block text-sm font-medium text-foreground-700">
            目标阶段
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as PipelineStage)}
              className="mt-2 h-10 w-full rounded-md border border-background-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
            >
              {targets.map((item) => <option key={item} value={item}>{stageLabels[item] || item}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground-700">
            操作原因{reasonRequired ? '（必填）' : '（选填）'}
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              rows={4}
              maxLength={500}
              placeholder={target === 'rejected' ? '请填写不合适的具体原因' : '记录本次推进依据'}
              className="mt-2 w-full resize-none rounded-md border border-background-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-background-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-background-200 px-4 py-2 text-sm text-foreground-600">取消</button>
          <button
            type="button"
            onClick={() => target && onSubmit(target, reason.trim())}
            disabled={!target || busy || (reasonRequired && !reason.trim())}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-md bg-foreground-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-background-300"
          >
            <ArrowRight size={15} /> {busy ? '保存中...' : '确认更新'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { role } = useProductRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const requestedTarget = searchParams.get('target') === 'rejected' ? 'rejected' : null;
  const requestedDetailCandidateId = Number(searchParams.get('detailCandidate')) || null;
  const handledCandidateId = useRef<number | null>(null);
  const handledDetailCandidateId = useRef<number | null>(null);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [demandId, setDemandId] = useState<number | null>(
    () => requestedDemandId ?? rememberedKanbanDemandId(),
  );
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [loadingDemands, setLoadingDemands] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [history, setHistory] = useState<PipelineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [moveCandidate, setMoveCandidate] = useState<PipelineBoardCandidate | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [kpiConfig, setKpiConfig] = useState<KpiStandardConfig | null>(null);

  const canViewKpiConfig = role === 'manager' || role === 'admin';

  const activeDemands = useMemo(
    () => demands.filter((item) => item.status === 'active' && item.approval_status === 'approved'),
    [demands],
  );

  const loadDemands = useCallback(async () => {
    setLoadingDemands(true);
    setLoadError('');
    try {
      const response = await demandsApi.listDemands();
      setDemands(response.items);
      const firstActive = response.items.find(
        (item) => item.status === 'active' && item.approval_status === 'approved',
      );
      setDemandId((current) => current && response.items.some(
        (item) => item.id === current && item.status === 'active' && item.approval_status === 'approved',
      )
        ? current
        : firstActive?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载招聘需求失败');
    } finally {
      setLoadingDemands(false);
    }
  }, []);

  const loadBoard = useCallback(async (nextDemandId: number) => {
    setLoadingBoard(true);
    setLoadError('');
    try {
      setBoard(await pipelineApi.getBoard(nextDemandId));
    } catch (error) {
      setBoard(null);
      setLoadError(error instanceof Error ? error.message : '加载招聘进度失败');
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    void loadDemands();
  }, [loadDemands]);

  useEffect(() => {
    if (demandId) void loadBoard(demandId);
    else setBoard(null);
  }, [demandId, loadBoard]);

  useEffect(() => {
    if (demandId) sessionStorage.setItem(KANBAN_DEMAND_MEMORY_KEY, String(demandId));
    else sessionStorage.removeItem(KANBAN_DEMAND_MEMORY_KEY);
  }, [demandId]);

  useEffect(() => {
    if (!canViewKpiConfig || !demandId) {
      setKpiConfig(null);
      return;
    }
    let cancelled = false;
    kpiStandardsApi.get()
      .then((payload) => { if (!cancelled) setKpiConfig(payload.config); })
      .catch(() => { if (!cancelled) setKpiConfig(null); });
    return () => { cancelled = true; };
  }, [canViewKpiConfig, demandId]);

  const rememberDetailCandidate = useCallback((candidateId: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (candidateId) {
      if (demandId) next.set('demand', String(demandId));
      next.set('detailCandidate', String(candidateId));
      next.delete('candidate');
      next.delete('target');
    } else {
      next.delete('detailCandidate');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [demandId, searchParams, setSearchParams]);

  const changeDemand = useCallback((nextDemandId: number | null) => {
    setSelectedCandidate(null);
    setHistory(null);
    setHistoryError('');
    setMoveCandidate(null);
    setMoveError('');
    handledCandidateId.current = null;
    handledDetailCandidateId.current = null;

    const next = new URLSearchParams(searchParams);
    if (nextDemandId) next.set('demand', String(nextDemandId));
    else next.delete('demand');
    next.delete('detailCandidate');
    next.delete('candidate');
    next.delete('target');
    setSearchParams(next, { replace: true });
    setDemandId(nextDemandId);
  }, [searchParams, setSearchParams]);

  const openHistory = useCallback(async (
    candidate: PipelineBoardCandidate,
    updateAddress = true,
  ) => {
    if (!demandId) return;
    handledDetailCandidateId.current = candidate.candidate_id;
    setSelectedCandidate(candidate);
    setHistory(null);
    setHistoryError('');
    if (updateAddress) rememberDetailCandidate(candidate.candidate_id);
    setHistoryLoading(true);
    try {
      setHistory(await pipelineApi.getHistory(demandId, candidate.candidate_id));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '加载流程历史失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [demandId, rememberDetailCandidate]);

  const closeHistory = useCallback(() => {
    setSelectedCandidate(null);
    setHistory(null);
    setHistoryError('');
    handledDetailCandidateId.current = null;
    rememberDetailCandidate(null);
  }, [rememberDetailCandidate]);

  const closeMoveDialog = useCallback(() => {
    setMoveCandidate(null);
    setMoveError('');
    const next = new URLSearchParams(searchParams);
    next.delete('candidate');
    next.delete('target');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!(board && requestedCandidateId && requestedTarget)
      || handledCandidateId.current === requestedCandidateId) return;
    const candidate = board.candidates.find((item) => item.candidate_id === requestedCandidateId);
    if (!candidate) return;
    handledCandidateId.current = requestedCandidateId;
    setMoveCandidate(candidate);
  }, [board, requestedCandidateId, requestedTarget]);

  useEffect(() => {
    if (!board || !requestedDetailCandidateId
      || handledDetailCandidateId.current === requestedDetailCandidateId) return;
    const candidate = board.candidates.find((item) => item.candidate_id === requestedDetailCandidateId);
    if (!candidate) return;
    handledDetailCandidateId.current = requestedDetailCandidateId;
    void openHistory(candidate, false);
  }, [board, openHistory, requestedDetailCandidateId]);

  const submitMove = async (target: PipelineStage, reason: string) => {
    if (!demandId || !moveCandidate) return;
    setMoveBusy(true);
    setMoveError('');
    try {
      await pipelineApi.moveCandidate(demandId, {
        candidate_id: moveCandidate.candidate_id,
        stage: target,
        note: reason,
        disposition: target === 'rejected'
          ? { reason, enter_talent_pool: true, note: reason }
          : undefined,
      });
      const movedCandidateId = moveCandidate.candidate_id;
      closeMoveDialog();
      await loadBoard(demandId);
      if (selectedCandidate?.candidate_id === movedCandidateId) {
        closeHistory();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setMoveError('候选人状态已变化，请刷新最新状态后重试');
      } else {
        setMoveError(error instanceof Error ? error.message : '更新候选人阶段失败');
      }
    } finally {
      setMoveBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<PipelineStage, PipelineBoardCandidate[]>();
    stages.forEach((stage) => map.set(stage.key, []));
    (board?.candidates || []).forEach((candidate) => {
      const rows = map.get(candidate.stage) || [];
      rows.push(candidate);
      map.set(candidate.stage, rows);
    });
    return map;
  }, [board]);

  const currentDemand = activeDemands.find((item) => item.id === demandId) || null;

  return (
    <div className="space-y-5 p-6" data-ui="real-pipeline-board">
      <PageHeader
        title="招聘进度"
        description="按招聘需求查看候选人当前阶段并由 HR 确认推进"
        actions={(
          <button
            type="button"
            onClick={() => demandId ? void loadBoard(demandId) : void loadDemands()}
            disabled={loadingDemands || loadingBoard}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-background-200 bg-white px-3 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loadingDemands || loadingBoard ? 'animate-spin' : ''} /> 刷新
          </button>
        )}
      />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-background-200 bg-white p-4">
        <label className="min-w-[280px] flex-1 text-sm font-medium text-foreground-700">
          招聘需求
          <select
            value={demandId ?? ''}
            onChange={(event) => {
              changeDemand(event.target.value ? Number(event.target.value) : null);
            }}
            disabled={loadingDemands}
            className="mt-2 h-10 w-full rounded-md border border-background-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
          >
            <option value="">请选择已通过的招聘需求</option>
            {activeDemands.map((item) => (
              <option key={item.id} value={item.id}>
                {item.request_no} · {item.job_title} · {item.requester_department}
              </option>
            ))}
          </select>
        </label>
        {currentDemand && (
          <div className="flex min-w-[250px] items-center gap-3 rounded-md bg-background-50 px-4 py-3">
            <BriefcaseBusiness size={18} className="text-primary-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground-800">{currentDemand.job_title}</p>
              <p className="truncate text-xs text-foreground-500">HC {currentDemand.metrics.onboarded_count}/{currentDemand.headcount} · {currentDemand.owner_hr_name}</p>
            </div>
          </div>
        )}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-7 text-center">
          <AlertCircle size={20} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={() => demandId ? void loadBoard(demandId) : void loadDemands()} className="mt-3 rounded-md border border-red-200 bg-white px-4 py-2 text-sm text-red-700">重新加载</button>
        </div>
      ) : loadingDemands || loadingBoard ? (
        <div className="rounded-lg border border-background-200 bg-white py-20 text-center text-sm text-foreground-500">
          <RefreshCw size={19} className="mx-auto mb-2 animate-spin" /> 正在加载招聘进度...
        </div>
      ) : !demandId ? (
        <div className="rounded-lg border border-background-200 bg-white py-20 text-center">
          <BriefcaseBusiness size={30} className="mx-auto mb-3 text-foreground-300" />
          <p className="text-sm font-medium text-foreground-600">暂无已通过且正在招聘的需求</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1200px] grid-cols-6 gap-3">
            {stages.map((stage) => {
              const candidates = grouped.get(stage.key) || [];
              return (
                <section key={stage.key} className="min-h-[470px] rounded-lg border border-background-200 bg-background-50">
                  <header className="flex items-center justify-between border-b border-background-200 px-3 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stage.tone}`}>{stage.label}</span>
                    <span className="text-xs font-medium text-foreground-400">{candidates.length}</span>
                  </header>
                  <div className="space-y-2 p-2">
                    {candidates.map((candidate) => (
                      <article key={candidate.candidate_id} className="rounded-md border border-background-200 bg-white p-3 shadow-sm">
                        <button type="button" onClick={() => void openHistory(candidate)} className="w-full text-left">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 text-xs font-bold text-primary-700">
                              {candidate.name_masked.slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground-800">{candidate.name_masked}</span>
                          </div>
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground-400">
                            <Clock3 size={12} /> {formatTime(candidate.updated_at)}
                          </p>
                        </button>
                        {moveTargets(candidate.stage).length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setMoveError(''); setMoveCandidate(candidate); }}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-foreground-800"
                          >
                            <ArrowRight size={13} /> 更新阶段
                          </button>
                        )}
                      </article>
                    ))}
                    {candidates.length === 0 && <p className="py-8 text-center text-xs text-foreground-400">暂无候选人</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {currentDemand && (
        <BlockagePanel demand={currentDemand} kpiConfig={kpiConfig} />
      )}

      {selectedCandidate && (
        <>
          <button type="button" aria-label="关闭历史" onClick={closeHistory} className="workspace-detail-backdrop fixed inset-0 z-40 bg-foreground-900/40 lg:left-[var(--workspace-sidebar-width)] lg:top-14" />
          <aside role="dialog" aria-label="候选人流程历史" data-ui="pipeline-history-drawer" className="workspace-detail-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-white shadow-2xl lg:top-14">
            <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-bold text-foreground-900">{selectedCandidate.name_masked}</h2>
                <p className="mt-1 text-sm text-foreground-500">当前阶段：{stageLabels[selectedCandidate.stage] || selectedCandidate.stage}</p>
              </div>
              <button type="button" onClick={closeHistory} aria-label="关闭" className="rounded-md p-2 text-foreground-400 hover:bg-background-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><History size={16} /> 流程历史</h3>
              {historyLoading ? (
                <RefreshCw size={18} className="mx-auto mt-16 animate-spin text-foreground-400" />
              ) : historyError ? (
                <div className="mt-4 rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">
                  <p>{historyError}</p>
                  <button
                    type="button"
                    onClick={() => void openHistory(selectedCandidate, false)}
                    className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 font-medium text-red-700"
                  >重新加载</button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {(history?.timeline || []).map((item, index) => (
                    <div key={`${item.stage}-${item.ts}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-primary-700"><UserRound size={14} /></span>
                      <div className="rounded-md border border-background-200 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-foreground-800">{stageLabels[item.stage] || item.stage}</span>
                          <span className="text-xs text-foreground-400">{formatTime(item.ts)}</span>
                        </div>
                        <p className="mt-1 text-xs text-foreground-500">{item.updated_by_name || '系统'}{item.note ? ` · ${item.note}` : ''}</p>
                      </div>
                    </div>
                  ))}
                  {(history?.timeline || []).length === 0 && <p className="py-12 text-center text-sm text-foreground-500">暂无流程历史</p>}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {moveCandidate && (
        <MoveDialog
          candidate={moveCandidate}
          initialTarget={requestedTarget}
          busy={moveBusy}
          error={moveError}
          onClose={() => !moveBusy && closeMoveDialog()}
          onSubmit={(stage, reason) => void submitMove(stage, reason)}
        />
      )}
    </div>
  );
}
