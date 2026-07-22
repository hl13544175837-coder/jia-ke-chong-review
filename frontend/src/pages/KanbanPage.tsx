// 招聘进度看板（Readdy 视觉嫁接真实后端）
// 视觉/交互参考 Readdy kanban 页面：阶段列 + 候选人卡片 + 顶部 KPI。
// 数据全部来自真实 API：listDemands / getDemandPipelineBoard / movePipeline /
// listOffers / getDemandPipelineHistory，不引用任何 mock。

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowRightLeft,
  History,
  KanbanSquare,
  RefreshCw,
  UserX,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  DrawerShell,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  useToast,
} from '../components/ui';
import type {
  CandidateDispositionInput,
  OfferRecord,
  OfferStatus,
  PipelineBoardCandidate,
  PipelineStage,
  RecruitmentDemand,
} from '../types';
import { STAGES, STAGE_BY_KEY, stageLabel } from '../lib/pipelineStages';
import { isTerminalStage, NEXT_STAGE, stageAgeLabel } from '../lib/pipelineInsights';
import { cn } from '../lib/cn';

// 主流程列在前，终态列在后（沿用共享阶段配置，保证与旧看板口径一致）。
const MAIN_STAGES = STAGES.filter((stage) => !isTerminalStage(stage.key));
const TERMINAL_STAGES = STAGES.filter((stage) => isTerminalStage(stage.key));

const OFFER_STATUS_META: Record<OfferStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  draft: { label: 'Offer 草稿', tone: 'neutral' },
  pending: { label: 'Offer 审批中', tone: 'warning' },
  approved: { label: 'Offer 待发放', tone: 'info' },
  sent: { label: '等待候选人回复', tone: 'info' },
  accepted: { label: '候选人已接受', tone: 'success' },
  declined: { label: '候选人已拒绝', tone: 'danger' },
  withdrawn: { label: 'Offer 已撤回', tone: 'neutral' },
  expired: { label: 'Offer 已过期', tone: 'neutral' },
  onboarded: { label: '已入职', tone: 'success' },
};

function formatDemandOption(demand: RecruitmentDemand) {
  return [
    demand.request_no || `REQ-${demand.id}`,
    demand.job_title,
    demand.job_department,
    demand.status,
  ].filter(Boolean).join(' · ');
}

function offerKey(demandId: number, candidateId: number) {
  return `${demandId}:${candidateId}`;
}

function parsePositiveParam(value: string | null) {
  if (value === null) return { provided: false, value: null as number | null };
  const parsed = Number(value);
  return {
    provided: true,
    value: Number.isInteger(parsed) && parsed > 0 ? parsed : null,
  };
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2925]/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e5e6e1] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#ecece8] bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[#292b2a]">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#777b78]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#777b78] hover:bg-[#f3f4f1]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 淘汰弹窗：原因必填，沿用旧 PipelinePage 的处置表单字段。
function RejectModal({
  candidate,
  busy,
  onClose,
  onSubmit,
}: {
  candidate: PipelineBoardCandidate;
  busy: boolean;
  onClose: () => void;
  onSubmit: (disposition: CandidateDispositionInput, note: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [enterTalentPool, setEnterTalentPool] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('请填写淘汰原因');
      return;
    }
    setError(null);
    await onSubmit(
      { reason: trimmedReason, enter_talent_pool: enterTalentPool, note: note.trim() },
      note.trim() ? `淘汰原因：${trimmedReason}；${note.trim()}` : `淘汰原因：${trimmedReason}`,
    );
  }

  return (
    <ModalShell
      title={`淘汰 ${candidate.name_masked}`}
      description="淘汰是终态操作，原因会留痕用于复盘；可同时将候选人沉淀进人才库"
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-6">
        <label className="block text-sm font-medium text-[#454946]">
          淘汰原因（必填）
          <input
            className="mt-2 h-10 w-full rounded-lg border border-[#dadcd6] px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="例：经验年限不足 / 薪资不匹配"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#454946]">
          <input
            type="checkbox"
            checked={enterTalentPool}
            onChange={(event) => setEnterTalentPool(event.target.checked)}
          />
          沉淀到人才库，后续有其他需求可再次激活
        </label>
        <label className="block text-sm font-medium text-[#454946]">
          补充备注（可选）
          <textarea
            className="mt-2 min-h-20 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={240}
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
        <Button variant="danger" onClick={() => void confirm()} loading={busy}>确认淘汰</Button>
      </div>
    </ModalShell>
  );
}

// 修正阶段弹窗：目标阶段 + 修正原因必填，用于误推进/误淘汰补救。
function CorrectModal({
  candidate,
  busy,
  onClose,
  onSubmit,
}: {
  candidate: PipelineBoardCandidate;
  busy: boolean;
  onClose: () => void;
  onSubmit: (target: PipelineStage, note: string) => void | Promise<void>;
}) {
  const [target, setTarget] = useState<PipelineStage | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!target) {
      setError('请选择目标阶段');
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('请填写修正原因');
      return;
    }
    setError(null);
    await onSubmit(target, `阶段修正：${trimmedReason}`);
  }

  return (
    <ModalShell
      title={`修正 ${candidate.name_masked} 的阶段`}
      description="用于误推进、误淘汰等补救。修正会影响当前阶段和 BI 当前存量，历史记录会保留。"
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-6">
        <label className="block text-sm font-medium text-[#454946]">
          目标阶段
          <select
            className="mt-2 h-10 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value as PipelineStage);
              setError(null);
            }}
          >
            <option value="">选择阶段</option>
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key} disabled={stage.key === candidate.stage}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-[#454946]">
          修正原因（必填）
          <input
            className="mt-2 h-10 w-full rounded-lg border border-[#dadcd6] px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            placeholder="例如：刚才误点，改回待筛选"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={() => void confirm()} loading={busy} disabled={!target}>保存修正</Button>
      </div>
    </ModalShell>
  );
}

function TransferModal({
  candidate,
  targets,
  busy,
  onClose,
  onSubmit,
}: {
  candidate: PipelineBoardCandidate;
  targets: RecruitmentDemand[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (targetDemandId: number, reason: string) => void | Promise<void>;
}) {
  const [targetDemandId, setTargetDemandId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const targetId = Number(targetDemandId);
    if (!targetDemandId || !Number.isFinite(targetId)) {
      setError('请选择目标招聘需求');
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('请填写转需原因');
      return;
    }
    setError(null);
    await onSubmit(targetId, trimmedReason);
  }

  return (
    <ModalShell
      title={`转移 ${candidate.name_masked} 到其他需求`}
      description="原需求保留为「已转出」，目标需求从「待筛选」开始；转出不会计入淘汰。"
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-6">
        <label className="block text-sm font-medium text-[#454946]">
          目标招聘需求
          <select
            className="mt-2 h-10 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={targetDemandId}
            onChange={(event) => {
              setTargetDemandId(event.target.value);
              setError(null);
            }}
          >
            <option value="">选择目标需求</option>
            {targets.map((demand) => (
              <option key={demand.id} value={demand.id}>{formatDemandOption(demand)}</option>
            ))}
          </select>
        </label>
        {targets.length === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            暂无其他可用需求，请先到招聘管理创建或恢复需求。
          </p>
        )}
        <label className="block text-sm font-medium text-[#454946]">
          转需原因（必填）
          <textarea
            className="mt-2 min-h-20 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            maxLength={500}
            placeholder="例如：候选人更符合另一条招聘需求"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={() => void confirm()} loading={busy} disabled={targets.length === 0}>确认转需</Button>
      </div>
    </ModalShell>
  );
}

// 候选人阶段历史弹窗：真实时间线，来自 getDemandPipelineHistory。
function HistoryModal({
  demandId,
  candidate,
  onClose,
}: {
  demandId: number;
  candidate: PipelineBoardCandidate;
  onClose: () => void;
}) {
  const historyAsync = useAsync(
    () => api.getDemandPipelineHistory(demandId, candidate.candidate_id),
    [demandId, candidate.candidate_id],
  );
  const timeline = historyAsync.data?.timeline ?? [];

  return (
    <ModalShell
      title={`${candidate.name_masked} 的流程历史`}
      description="每次阶段变更都会留痕"
      onClose={onClose}
    >
      <div className="px-6 py-6">
        {historyAsync.loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-[#777b78]">
            <Spinner size="sm" />
            加载历史…
          </div>
        )}
        {!historyAsync.loading && historyAsync.error && (
          <ErrorState message={historyAsync.error.message} onRetry={historyAsync.reload} />
        )}
        {!historyAsync.loading && !historyAsync.error && timeline.length === 0 && (
          <p className="py-8 text-center text-sm text-[#777b78]">暂无阶段变更记录</p>
        )}
        {!historyAsync.loading && !historyAsync.error && timeline.length > 0 && (
          <div className="space-y-0">
            {timeline.map((step, index) => (
              <div key={`${step.stage}-${index}`} className="relative flex gap-3 pb-5">
                {index < timeline.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-[#dfe4de]" />
                )}
                <span className={cn('relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-[var(--enterprise-brand-soft)]', STAGE_BY_KEY[step.stage]?.dot ?? 'bg-[var(--enterprise-brand)]')} />
                <div>
                  <p className="text-sm font-medium text-[#3f4541]">{stageLabel(step.stage)}</p>
                  <p className="mt-0.5 text-xs text-[#858a86]">
                    {step.updated_by_name || '系统'} · {step.ts ? new Date(step.ts).toLocaleString('zh-CN') : '时间未知'}
                  </p>
                  {step.note && <p className="mt-1 text-sm text-[#5f6561]">{step.note}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function CandidateCard({
  candidate,
  offer,
  canMove,
  canTransfer,
  busy,
  onAdvance,
  onReject,
  onCorrect,
  onTransfer,
  onHistory,
  onOpen,
  highlighted,
}: {
  candidate: PipelineBoardCandidate;
  offer: OfferRecord | null;
  canMove: boolean;
  canTransfer: boolean;
  busy: boolean;
  onAdvance: () => void;
  onReject: () => void;
  onCorrect: () => void;
  onTransfer: () => void;
  onHistory: () => void;
  onOpen: () => void;
  highlighted?: boolean;
}) {
  const next = NEXT_STAGE[candidate.stage];
  const terminal = isTerminalStage(candidate.stage);
  const offerMeta = offer ? OFFER_STATUS_META[offer.status || offer.approval_status] : null;

  return (
    <div
      data-ui="kanban-candidate-card"
      onClick={onOpen}
      className={cn(
        'cursor-pointer rounded-xl border border-[#e8e7e1] bg-white p-3 shadow-sm',
        highlighted && 'ring-2 ring-[var(--enterprise-brand)] ring-offset-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--enterprise-brand-soft)] text-xs font-bold text-[var(--enterprise-brand-dark)]">
            {(candidate.name_masked || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              data-ui="kanban-candidate-name"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="block max-w-full truncate text-left text-sm font-semibold text-[var(--enterprise-brand-dark)] hover:underline"
            >
              {candidate.name_masked}
            </button>
            <p className="mt-0.5 text-xs text-[#858a86]">
              {stageAgeLabel(candidate.updated_at)}
              {candidate.updated_by_name ? ` · ${candidate.updated_by_name}` : ''}
            </p>
          </div>
        </div>
        {busy && <Spinner size="sm" />}
      </div>

      {offerMeta && (
        <div className="mt-2">
          <Badge tone={offerMeta.tone}>{offerMeta.label}</Badge>
        </div>
      )}
      {candidate.note && (
        <p className="mt-2 line-clamp-2 text-xs text-[#5f6561]" title={candidate.note}>
          {candidate.note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {canMove && next && (
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onAdvance();
            }}
            disabled={busy}
          >
            推进到{stageLabel(next)}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {canMove && !terminal && (
          <Button
            size="sm"
            variant="danger"
            onClick={(event) => {
              event.stopPropagation();
              onReject();
            }}
            disabled={busy}
          >
            <UserX className="h-3.5 w-3.5" />
            淘汰
          </Button>
        )}
        {canMove && candidate.stage !== 'transferred' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onCorrect();
            }}
            disabled={busy}
          >
            修正
          </Button>
        )}
        {canTransfer && !terminal && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onTransfer();
            }}
            disabled={busy}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            转到其他需求
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onHistory();
          }}
        >
          <History className="h-3.5 w-3.5" />
          历史
        </Button>
      </div>
    </div>
  );
}

export function KanbanPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const demandParam = parsePositiveParam(searchParams.get('demand'));
  const jobParam = parsePositiveParam(searchParams.get('job'));
  const candidateParam = parsePositiveParam(searchParams.get('candidate'));
  const requestedDemandId = demandParam.value;
  const requestedJobId = jobParam.value;
  const highlightedCandidateId = candidateParam.value;
  const rawStage = searchParams.get('stage');
  const requestedStage = STAGES.some((stage) => stage.key === rawStage)
    ? rawStage as PipelineStage
    : null;
  const invalidScopeParam =
    (demandParam.provided && requestedDemandId === null)
    || (!demandParam.provided && jobParam.provided && requestedJobId === null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PipelineBoardCandidate | null>(null);
  const [correctTarget, setCorrectTarget] = useState<PipelineBoardCandidate | null>(null);
  const [transferTarget, setTransferTarget] = useState<PipelineBoardCandidate | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PipelineBoardCandidate | null>(null);
  const [detailCandidateId, setDetailCandidateId] = useState<number | null>(null);

  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100 }),
    [],
  );
  const explicitDemandAsync = useAsync<RecruitmentDemand | null>(
    () => requestedDemandId !== null
      ? api.getDemand(requestedDemandId)
      : Promise.resolve(null),
    [requestedDemandId],
  );
  const demandItems = demandsAsync.data?.items ?? [];
  const hasCompleteVisibleDemandList =
    demandsAsync.data !== null && demandsAsync.data.total === demandItems.length;
  const requestedDemandFromList = requestedDemandId !== null
    ? demandItems.find((demand) => demand.id === requestedDemandId) ?? null
    : null;
  const requestedDemand = requestedDemandId !== null
    ? explicitDemandAsync.data?.id === requestedDemandId
      ? explicitDemandAsync.data
      : requestedDemandFromList
    : null;
  const selectableDemands = requestedDemand !== null
    && !demandItems.some((demand) => demand.id === requestedDemand.id)
    ? [requestedDemand, ...demandItems]
    : demandItems;
  const requestedJobDemands = requestedJobId !== null
    ? demandItems.filter((demand) => demand.job_id === requestedJobId)
    : [];
  const effectiveDemand = invalidScopeParam
    ? null
    : requestedDemandId !== null
      ? requestedDemand
      : requestedJobId !== null
        ? hasCompleteVisibleDemandList && requestedJobDemands.length === 1
          ? requestedJobDemands[0]
          : null
        : demandItems[0] ?? null;
  const effectiveDemandId = effectiveDemand?.id ?? null;

  useEffect(() => {
    setRejectTarget(null);
    setCorrectTarget(null);
    setTransferTarget(null);
    setHistoryTarget(null);
    setDetailCandidateId(null);
  }, [effectiveDemandId]);
  const demandResolutionError = !demandsAsync.loading
    && !demandsAsync.error
    && (requestedDemandId === null || !explicitDemandAsync.loading)
    ? demandParam.provided && requestedDemandId === null
      ? '链接中的招聘需求编号无效，系统不会默认选择其他需求。请从下拉列表重新选择。'
      : !demandParam.provided && jobParam.provided && requestedJobId === null
        ? '链接中的岗位编号无效，系统不会默认选择其他需求。请从下拉列表重新选择。'
        : requestedDemandId !== null && requestedDemand === null
      ? '该招聘需求不存在或你无权查看，请从下拉列表选择可访问的需求。'
      : requestedDemandId === null && requestedJobId !== null && !hasCompleteVisibleDemandList
        ? '这个旧岗位链接无法在当前列表中安全确认唯一需求，系统不会替你猜。请选择具体招聘需求。'
        : requestedDemandId === null && requestedJobId !== null && requestedJobDemands.length > 1
          ? '这个岗位对应多条招聘需求，系统不会替你猜。请选择具体招聘需求。'
          : requestedDemandId === null && requestedJobId !== null && requestedJobDemands.length === 0
            ? '这个岗位没有可访问的招聘需求，请从下拉列表重新选择。'
            : null
    : null;
  const stageResolutionError = rawStage !== null && requestedStage === null
    ? '链接中的阶段无效，已保留当前需求但不会猜测要定位的阶段。'
    : null;
  const isDemandWritable = Boolean(
    effectiveDemand && ['pending', 'active'].includes(effectiveDemand.status),
  );
  // 阶段推进要求 Demand 可写；转需只要求来源 flow 仍活跃，目标 Demand 另行限制。
  const canMove = role !== 'interviewer' && isDemandWritable;
  const canTransfer = role !== 'interviewer';
  const transferTargets = selectableDemands.filter(
    (demand) => demand.id !== effectiveDemandId && ['pending', 'active'].includes(demand.status),
  );

  const boardAsync = useAsync(
    () =>
      effectiveDemandId !== null
        ? api.getDemandPipelineBoard(effectiveDemandId)
        : Promise.resolve(null),
    [effectiveDemandId],
  );

  // Offer 阶段提示：一次性拉取 Offer 列表，按 demand+candidate 匹配到卡片上。
  const offersAsync = useAsync(() => api.listOffers({}), []);
  const offerByCandidate = useMemo(() => {
    const map = new Map<string, OfferRecord>();
    for (const offer of offersAsync.data?.items ?? []) {
      if (offer.demand_id != null && offer.candidate_id != null) {
        map.set(offerKey(offer.demand_id, offer.candidate_id), offer);
      }
    }
    return map;
  }, [offersAsync.data?.items]);

  const candidates: PipelineBoardCandidate[] = useMemo(
    () => boardAsync.data?.candidates ?? [],
    [boardAsync.data],
  );
  const detailCandidate = detailCandidateId === null
    ? null
    : candidates.find((candidate) => candidate.candidate_id === detailCandidateId) ?? null;
  const detailOffer = detailCandidate && effectiveDemandId !== null
    ? offerByCandidate.get(offerKey(effectiveDemandId, detailCandidate.candidate_id)) ?? null
    : null;
  const highlightedCandidateMissing = Boolean(
    candidateParam.provided
    && highlightedCandidateId !== null
    && effectiveDemandId !== null
    && !boardAsync.loading
    && !boardAsync.error
    && !candidates.some((candidate) => candidate.candidate_id === highlightedCandidateId),
  );
  const byStage = useMemo(() => {
    const map: Partial<Record<PipelineStage, PipelineBoardCandidate[]>> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const candidate of candidates) {
      (map[candidate.stage] ??= []).push(candidate);
    }
    return map;
  }, [candidates]);
  const countOf = (stage: PipelineStage) => byStage[stage]?.length ?? 0;

  async function moveCandidate(
    candidateId: number,
    toStage: PipelineStage,
    note?: string,
    disposition?: CandidateDispositionInput,
  ): Promise<boolean> {
    if (effectiveDemandId === null || !isDemandWritable) return false;
    setBusyId(candidateId);
    try {
      const res = await api.movePipeline({
        candidate_id: candidateId,
        demand_id: effectiveDemandId,
        stage: toStage,
        note,
        disposition,
      });
      toast.success(`${res.name_masked || '候选人'} 已更新至「${stageLabel(toStage)}」`);
      boardAsync.reload();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '操作失败，请重试');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function transferCandidate(targetDemandId: number, reason: string) {
    if (effectiveDemandId === null || transferTarget === null) return;
    setBusyId(transferTarget.candidate_id);
    try {
      await api.transferPipeline({
        candidate_id: transferTarget.candidate_id,
        from_demand_id: effectiveDemandId,
        to_demand_id: targetDemandId,
        reason,
      });
      toast.success(`${transferTarget.name_masked || '候选人'} 已转入目标需求；原需求保留已转出记录`);
      setTransferTarget(null);
      boardAsync.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '转需失败，请重试');
    } finally {
      setBusyId(null);
    }
  }

  const kpiCards: Array<{ label: string; value: number; stage: PipelineStage | null }> = [
    {
      label: '流程中候选人',
      value: MAIN_STAGES.reduce((sum, stage) => sum + countOf(stage.key), 0),
      stage: null,
    },
    { label: '面试中', value: countOf('interview'), stage: 'interview' },
    { label: 'Offer', value: countOf('offer'), stage: 'offer' },
    { label: '已入职', value: countOf('onboarded'), stage: 'onboarded' },
    { label: '已淘汰', value: countOf('rejected'), stage: 'rejected' },
  ];

  function focusStage(stage: PipelineStage | null) {
    const nextParams = new URLSearchParams(searchParams);
    if (effectiveDemandId !== null) {
      nextParams.set('demand', String(effectiveDemandId));
      nextParams.delete('job');
    }
    nextParams.delete('candidate');
    if (stage === null) {
      nextParams.delete('stage');
    } else {
      nextParams.set('stage', stage);
    }
    setSearchParams(nextParams, { replace: true });

    window.requestAnimationFrame(() => {
      const target = stage === null
        ? document.getElementById('kanban-main-stages')
        : document.getElementById(`kanban-stage-${stage}`)
          ?? document.getElementById('kanban-main-stages');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div data-ui="readdy-kanban" className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#292b2a]">招聘进度看板</h1>
          <p className="mt-1 text-sm text-[#777b78]">
            按招聘需求追踪每位候选人所处阶段，就地推进、淘汰或修正
          </p>
        </div>
        {effectiveDemandId !== null && (
          <Button
            variant="secondary"
            onClick={boardAsync.reload}
            disabled={boardAsync.loading}
          >
            <RefreshCw className="h-4 w-4" />
            刷新看板
          </Button>
        )}
      </div>

      {!canMove && (
        <div className="rounded-lg border border-[#f0e3c8] bg-[#fdf8ec] px-4 py-3 text-sm text-[#8a6d1f]">
          面试官角色仅可查看看板进度，推进、淘汰与修正由招聘负责人操作。
        </div>
      )}

      {/* 招聘需求选择器 */}
      {demandsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-[#777b78]">
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
            description="看板必须挂在具体招聘需求上。请先创建招聘需求，再把候选人加入流程。"
            action={
              <Link to="/jobs">
                <Button variant="secondary" size="sm">去招聘需求页创建</Button>
              </Link>
            }
          />
        </Card>
      )}
      {!demandsAsync.loading && !demandsAsync.error && demandItems.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor="kanban-demand-select" className="text-sm font-medium text-[#454946]">
            当前招聘需求
          </label>
          <select
            id="kanban-demand-select"
            className="h-10 min-w-0 rounded-lg border border-[#dadcd6] bg-white px-3 text-sm text-[#292b2a] outline-none focus:border-[var(--enterprise-brand)] sm:min-w-[380px]"
            value={effectiveDemandId ?? ''}
            onChange={(event) => {
              setSearchParams({
                demand: event.target.value,
                ...(requestedStage ? { stage: requestedStage } : {}),
              });
              setRejectTarget(null);
              setCorrectTarget(null);
              setTransferTarget(null);
              setHistoryTarget(null);
              setDetailCandidateId(null);
            }}
          >
            {effectiveDemandId === null && <option value="">请选择具体招聘需求</option>}
            {selectableDemands.map((demand) => (
              <option key={demand.id} value={demand.id}>
                {formatDemandOption(demand)}
              </option>
            ))}
          </select>
          {effectiveDemand && (
            <span className="text-xs text-[#858a86]">
              负责人 {effectiveDemand.owner_hr_name || '未分配'} · {effectiveDemand.job_city || '城市未填'}
            </span>
          )}
        </div>
      )}

      {demandResolutionError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {demandResolutionError}
        </div>
      )}
      {stageResolutionError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {stageResolutionError}
        </div>
      )}
      {highlightedCandidateMissing && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          高亮的候选人不在当前需求流程中，可能已转入其他需求或你无权查看；系统不会替你切换需求。
        </div>
      )}

      {effectiveDemand && !isDemandWritable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          当前需求状态为「{effectiveDemand.status}」，不能推进、淘汰或修正阶段；仍可查看历史，活动候选人可转入其他可用需求。
        </div>
      )}

      {offersAsync.error && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Offer 状态加载失败</p>
            <p className="mt-1 text-xs text-amber-800">
              候选人流程仍可查看，但卡片上的 Offer 状态暂时不完整：{offersAsync.error.message}
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={offersAsync.reload}>
            重试 Offer 状态
          </Button>
        </div>
      )}

      {/* 看板主体 */}
      {effectiveDemandId !== null && boardAsync.loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {kpiCards.map((card) => (
              <Skeleton key={card.label} className="h-20" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {MAIN_STAGES.map((stage) => (
              <Skeleton key={stage.key} className="h-64" />
            ))}
          </div>
        </div>
      )}

      {effectiveDemandId !== null && !boardAsync.loading && boardAsync.error && (
        <ErrorState message={boardAsync.error.message} onRetry={boardAsync.reload} />
      )}

      {effectiveDemandId !== null && !boardAsync.loading && !boardAsync.error && (
        <>
          {/* KPI 卡 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {kpiCards.map((card) => (
              <button
                key={card.label}
                type="button"
                data-ui="kanban-kpi-button"
                onClick={() => focusStage(card.stage)}
                aria-label={`定位到${card.label}`}
                className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left transition-colors hover:border-[var(--enterprise-brand)] hover:bg-[var(--enterprise-brand-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--enterprise-brand)]"
              >
                <p className="text-xs text-[#777b78]">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-[#292b2a]">{card.value}</p>
              </button>
            ))}
          </div>

          {candidates.length === 0 ? (
            <Card>
              <EmptyState
                icon={KanbanSquare}
                title="该需求暂无候选人"
                description="这是真实的空流程，不是加载失败。可先去候选人库或岗位匹配页把候选人加入本需求流程。"
                action={
                  <Link to="/candidates">
                    <Button variant="secondary" size="sm">去候选人库</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <div className="space-y-6">
              {/* 主流程阶段列 */}
              <div id="kanban-main-stages" className="grid scroll-mt-6 grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {MAIN_STAGES.map((stage) => (
                  <section
                    key={stage.key}
                    id={`kanban-stage-${stage.key}`}
                    className={cn(
                      'rounded-xl border p-3',
                      stage.bg,
                      stage.border,
                      requestedStage === stage.key && 'ring-2 ring-[var(--enterprise-brand)] ring-offset-2',
                    )}
                    aria-label={`${stage.label}阶段`}
                  >
                    <header className="mb-3 flex items-center justify-between">
                      <button
                        type="button"
                        data-ui="kanban-stage-button"
                        onClick={() => focusStage(stage.key)}
                        className="flex items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--enterprise-brand)]"
                        aria-label={`定位到${stage.label}阶段`}
                      >
                        <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
                        <h2 className={cn('text-sm font-semibold', stage.text)}>{stage.label}</h2>
                      </button>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', stage.badgeBg)}>
                        {countOf(stage.key)}
                      </span>
                    </header>
                    <div className="space-y-3">
                      {(byStage[stage.key] ?? []).map((candidate) => (
                        <CandidateCard
                          key={candidate.candidate_id}
                          candidate={candidate}
                          offer={
                            offerByCandidate.get(offerKey(effectiveDemandId, candidate.candidate_id)) ?? null
                          }
                          canMove={canMove}
                          canTransfer={canTransfer}
                          busy={busyId === candidate.candidate_id}
                          onAdvance={() => {
                            const next = NEXT_STAGE[candidate.stage];
                            if (next) void moveCandidate(candidate.candidate_id, next);
                          }}
                          onReject={() => setRejectTarget(candidate)}
                          onCorrect={() => setCorrectTarget(candidate)}
                          onTransfer={() => setTransferTarget(candidate)}
                          onHistory={() => setHistoryTarget(candidate)}
                          onOpen={() => setDetailCandidateId(candidate.candidate_id)}
                          highlighted={candidate.candidate_id === highlightedCandidateId}
                        />
                      ))}
                      {(byStage[stage.key] ?? []).length === 0 && (
                        <p className="rounded-lg border border-dashed border-[#d8d9d3] px-3 py-6 text-center text-xs text-[#929793]">
                          暂无候选人
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>

              {/* 终态阶段列（淘汰 / 已转出） */}
              {TERMINAL_STAGES.some((stage) => countOf(stage.key) > 0) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {TERMINAL_STAGES.filter((stage) => countOf(stage.key) > 0).map((stage) => (
                    <section
                      key={stage.key}
                      id={`kanban-stage-${stage.key}`}
                      className={cn(
                        'rounded-xl border p-3',
                        stage.bg,
                        stage.border,
                        requestedStage === stage.key && 'ring-2 ring-[var(--enterprise-brand)] ring-offset-2',
                      )}
                      aria-label={`${stage.label}阶段`}
                    >
                      <header className="mb-3 flex items-center justify-between">
                        <button
                          type="button"
                          data-ui="kanban-stage-button"
                          onClick={() => focusStage(stage.key)}
                          className="flex items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--enterprise-brand)]"
                          aria-label={`定位到${stage.label}阶段`}
                        >
                          <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
                          <h2 className={cn('text-sm font-semibold', stage.text)}>{stage.label}</h2>
                        </button>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', stage.badgeBg)}>
                          {countOf(stage.key)}
                        </span>
                      </header>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(byStage[stage.key] ?? []).map((candidate) => (
                          <CandidateCard
                            key={candidate.candidate_id}
                            candidate={candidate}
                            offer={null}
                            canMove={canMove}
                            canTransfer={canTransfer}
                            busy={busyId === candidate.candidate_id}
                            onAdvance={() => undefined}
                            onReject={() => setRejectTarget(candidate)}
                            onCorrect={() => setCorrectTarget(candidate)}
                            onTransfer={() => setTransferTarget(candidate)}
                            onHistory={() => setHistoryTarget(candidate)}
                            onOpen={() => setDetailCandidateId(candidate.candidate_id)}
                            highlighted={candidate.candidate_id === highlightedCandidateId}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <DrawerShell
        open={detailCandidate !== null}
        onClose={() => setDetailCandidateId(null)}
        eyebrow="候选人流程详情"
        title={detailCandidate?.name_masked || '候选人详情'}
        description={effectiveDemand
          ? `${effectiveDemand.request_no || `REQ-${effectiveDemand.id}`} · ${effectiveDemand.job_title}`
          : '当前招聘需求'}
        size="md"
        testId="kanban-candidate-drawer"
        footer={detailCandidate ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Link
              to={`/candidates/${detailCandidate.candidate_id}`}
              className="text-sm font-semibold text-accent-blue hover:underline"
            >
              查看完整档案
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setHistoryTarget(detailCandidate);
                setDetailCandidateId(null);
              }}
            >
              <History className="h-4 w-4" />
              查看流程历史
            </Button>
          </div>
        ) : undefined}
      >
        {detailCandidate && (
          <div data-ui="kanban-candidate-drawer" className="space-y-5">
            <section className="grid grid-cols-2 gap-3 rounded-xl bg-[#f7f9f7] p-4 text-sm">
              <div>
                <p className="text-xs text-[#858a86]">当前阶段</p>
                <div className="mt-1"><Badge tone="info">{stageLabel(detailCandidate.stage)}</Badge></div>
              </div>
              <div>
                <p className="text-xs text-[#858a86]">阶段停留</p>
                <p className="mt-1 font-medium text-[#292b2a]">{stageAgeLabel(detailCandidate.updated_at)}</p>
              </div>
              <div>
                <p className="text-xs text-[#858a86]">最近操作人</p>
                <p className="mt-1 font-medium text-[#292b2a]">{detailCandidate.updated_by_name || '系统'}</p>
              </div>
              <div>
                <p className="text-xs text-[#858a86]">Offer 状态</p>
                <div className="mt-1">
                  {detailOffer ? (
                    <Badge tone={OFFER_STATUS_META[detailOffer.status || detailOffer.approval_status].tone}>
                      {OFFER_STATUS_META[detailOffer.status || detailOffer.approval_status].label}
                    </Badge>
                  ) : (
                    <span className="text-sm text-[#777b78]">暂无 Offer 记录</span>
                  )}
                </div>
              </div>
            </section>

            {effectiveDemand && (
              <section className="rounded-xl border border-[#e8e7e1] p-4">
                <h3 className="font-semibold text-[#292b2a]">当前招聘需求</h3>
                <p className="mt-2 text-sm font-medium text-[#454946]">{effectiveDemand.job_title}</p>
                <p className="mt-1 text-xs text-[#777b78]">
                  {[
                    effectiveDemand.request_no || `REQ-${effectiveDemand.id}`,
                    effectiveDemand.job_department,
                    effectiveDemand.job_city,
                  ].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-3 text-xs text-[#777b78]">
                  负责人：{effectiveDemand.owner_hr_name || '未分配'}
                </p>
              </section>
            )}

            <section>
              <h3 className="font-semibold text-[#292b2a]">最近流程备注</h3>
              <p className="mt-2 rounded-xl border border-[#e8e7e1] p-4 text-sm text-[#5f6561]">
                {detailCandidate.note || '暂无备注'}
              </p>
            </section>
          </div>
        )}
      </DrawerShell>

      {rejectTarget && (
        <RejectModal
          candidate={rejectTarget}
          busy={busyId === rejectTarget.candidate_id}
          onClose={() => setRejectTarget(null)}
          onSubmit={async (disposition, note) => {
            const moved = await moveCandidate(rejectTarget.candidate_id, 'rejected', note, disposition);
            if (moved) setRejectTarget(null);
          }}
        />
      )}
      {correctTarget && (
        <CorrectModal
          candidate={correctTarget}
          busy={busyId === correctTarget.candidate_id}
          onClose={() => setCorrectTarget(null)}
          onSubmit={async (target, note) => {
            const moved = await moveCandidate(correctTarget.candidate_id, target, note);
            if (moved) setCorrectTarget(null);
          }}
        />
      )}
      {transferTarget && effectiveDemandId !== null && (
        <TransferModal
          candidate={transferTarget}
          targets={transferTargets}
          busy={busyId === transferTarget.candidate_id}
          onClose={() => setTransferTarget(null)}
          onSubmit={transferCandidate}
        />
      )}
      {historyTarget && effectiveDemandId !== null && (
        <HistoryModal
          demandId={effectiveDemandId}
          candidate={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

export default KanbanPage;
