import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidateMatchResult,
  CandidatePipelineAddResult,
} from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';

interface Props {
  candidates: CandidateListItem[];
  demands: RecruitmentDemand[];
  initialDemandId?: number | null;
  demandsLoading: boolean;
  demandError: string | null;
  submitting: boolean;
  result: CandidatePipelineAddResult | null;
  onRetryDemands: () => void;
  onClose: () => void;
  onAdd: (demandId: number, reason: string, pushAfterAdd: boolean) => void;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : '岗位匹配暂时不可用';
}

export default function AddToPipelineModal({
  candidates,
  demands,
  initialDemandId,
  demandsLoading,
  demandError,
  submitting,
  result,
  onRetryDemands,
  onClose,
  onAdd,
}: Props) {
  const initial = initialDemandId && demands.some((demand) => demand.id === initialDemandId)
    ? initialDemandId
    : 0;
  const [demandId, setDemandId] = useState(initial);
  const [reason, setReason] = useState('');
  const [matches, setMatches] = useState<Map<number, CandidateMatchResult>>(new Map());
  const [matchedDemandId, setMatchedDemandId] = useState(0);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchConfigured, setMatchConfigured] = useState<boolean | null>(null);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const matchRequestId = useRef(0);

  useEffect(() => {
    if (demandId === 0 && initial > 0) setDemandId(initial);
  }, [demandId, initial]);

  useEffect(() => {
    const requestId = ++matchRequestId.current;
    setMatches(new Map());
    setMatchedDemandId(0);
    setMatchError('');
    setMatchConfigured(null);
    setRequiredSkills([]);
    if (!demandId || candidates.length === 0) {
      setMatchLoading(false);
      return;
    }
    setMatchLoading(true);
    void candidatesApi.previewMatches(demandId, candidates.map((candidate) => candidate.id))
      .then((response) => {
        if (matchRequestId.current !== requestId) return;
        setMatches(new Map(response.results.map((item) => [item.candidate_id, item])));
        setMatchedDemandId(demandId);
        setMatchConfigured(response.match_configured);
        setRequiredSkills(response.required_skills);
      })
      .catch((error: unknown) => {
        if (matchRequestId.current !== requestId) return;
        setMatchError(errorMessage(error));
      })
      .finally(() => {
        if (matchRequestId.current === requestId) setMatchLoading(false);
      });
  }, [candidates, demandId]);

  const selectedDemand = demands.find((demand) => demand.id === demandId) ?? null;
  const needsRetryReason = Boolean(
    result?.failures.some((failure) => failure.code === 'reactivation_reason_required'),
  );
  const needsReactivationReason = useMemo(
    () => needsRetryReason
      || (matchedDemandId === demandId
        && Array.from(matches.values()).some((match) => match.latest_stage === 'rejected'))
      || candidates.some((candidate) => (
        candidate.current_stage === 'rejected'
        && candidate.latest_demand_id === demandId
      )),
    [candidates, demandId, matchedDemandId, matches, needsRetryReason],
  );
  const canSubmit = Boolean(
    selectedDemand
    && candidates.length > 0
    && !matchLoading
    && (!needsReactivationReason || reason.trim()),
  );

  const handleClose = () => {
    if (!submitting) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="presentation" onMouseDown={handleClose}>
      <div
        className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-pipeline-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="add-pipeline-title" className="text-lg font-bold text-foreground-900">加入招聘流程</h2>
            <p className="mt-1 text-sm text-foreground-500">已选 {candidates.length} 位候选人，先核对岗位匹配再进入 HR 初筛</p>
          </div>
          <button type="button" onClick={handleClose} disabled={submitting} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:opacity-50" aria-label="关闭加入流程弹窗" title="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <label htmlFor="pipeline-demand" className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-600">
              <BriefcaseBusiness size={14} aria-hidden="true" />
              目标招聘需求 <span className="text-red-500">*</span>
            </label>
            {demandsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-background-200 px-3 py-3 text-sm text-foreground-500">
                <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                加载需求中
              </div>
            ) : demandError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                <p>{demandError}</p>
                <button type="button" onClick={onRetryDemands} className="mt-2 inline-flex items-center gap-1 font-medium hover:text-red-800">
                  <RefreshCw size={14} aria-hidden="true" />
                  重试
                </button>
              </div>
            ) : demands.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">暂无已审批且招聘中的需求，请先创建或恢复招聘需求。</div>
            ) : (
              <select
                id="pipeline-demand"
                value={demandId || ''}
                onChange={(event) => setDemandId(Number(event.target.value))}
                disabled={submitting}
                className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
                <option value="">请选择目标招聘需求</option>
                {demands.map((demand) => (
                  <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title} · {demand.job_department}</option>
                ))}
              </select>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground-600">候选人与岗位匹配</p>
              {matchLoading && <span className="inline-flex items-center gap-1 text-xs text-foreground-400"><LoaderCircle className="animate-spin" size={13} aria-hidden="true" />计算中</span>}
            </div>
            {matchError && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertCircle size={14} aria-hidden="true" />
                {matchError}，仍可由 HR 人工判断后加入流程。
              </div>
            )}
            {matchConfigured === false && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>岗位技能尚未配置。</strong> 当前分数未知，不等于候选人匹配度为 0；请由 HR 核对简历，或先补充 JD 技能关键词。</span>
              </div>
            )}
            {matchConfigured && requiredSkills.length > 0 && (
              <p className="mb-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">岗位必备技能：{requiredSkills.join('、')}</p>
            )}
            <div className="max-h-64 divide-y divide-background-200 overflow-y-auto rounded-lg border border-background-200">
              {candidates.map((candidate) => {
                const match = matchedDemandId === demandId ? matches.get(candidate.id) : undefined;
                const sameRejectedDemand = match?.latest_stage === 'rejected'
                  || (candidate.current_stage === 'rejected' && candidate.latest_demand_id === demandId);
                return (
                  <div key={candidate.id} className="flex items-start justify-between gap-4 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground-900">{candidate.name_masked}</p>
                      <p className="mt-0.5 truncate text-xs text-foreground-500">{candidate.education_summary || candidate.latest_experience?.position || '档案信息待补充'}</p>
                      {sameRejectedDemand && <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700"><RotateCcw size={12} aria-hidden="true" />该需求中曾被淘汰，将按原因重新启用</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-primary-700">{matchConfigured === false ? '未配置' : match ? `${Math.round(match.score)} 分` : '—'}</p>
                      <p className="mt-0.5 max-w-56 truncate text-xs text-foreground-400">{matchConfigured === false ? '匹配度暂未知' : match?.matched_tags.length ? `命中：${match.matched_tags.slice(0, 3).join('、')}` : '暂无明确命中技能'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <label htmlFor="reactivation-reason" className="mb-2 block text-xs font-medium text-foreground-600">
              重新启用原因{needsReactivationReason ? <span className="text-red-500"> *</span> : '（选填）'}
            </label>
            <textarea
              id="reactivation-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              maxLength={240}
              rows={3}
              placeholder={needsReactivationReason ? '说明本次重新评估或重新启用的原因' : '候选人曾在该需求被淘汰时，填写原因后可重新启用'}
              className="w-full resize-none rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </section>

          {result && (
            <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" aria-live="polite">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} aria-hidden="true" />后端处理完成</p>
              <p className="mt-1 text-xs">新加入 {result.added} 位，重新启用 {result.reactivated} 位，已存在 {result.skipped_existing} 位，冲突 {result.skipped_conflict} 位。</p>
              {result.failures.length > 0 && <p className="mt-1 text-xs">{result.failures.map((item) => item.error).join('；')}</p>}
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-background-200 bg-background-50 px-6 py-4">
          <button type="button" onClick={handleClose} disabled={submitting} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:opacity-50">
            {result ? '完成' : '取消'}
          </button>
          {(!result || needsRetryReason) && (
            <>
              <button
                type="button"
                onClick={() => onAdd(demandId, reason.trim(), false)}
                disabled={!canSubmit || submitting}
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                仅加入当前需求
              </button>
              <button
                type="button"
                onClick={() => onAdd(demandId, reason.trim(), true)}
                disabled={!canSubmit || submitting}
                className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500"
              >
                {submitting ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {submitting ? '正在加入' : '加入当前需求并推送业务筛选'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
