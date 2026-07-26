import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import type { CandidateStage } from '@/features/candidates/types';

export const BUSINESS_REVIEW_ENTRY_STAGES = new Set<CandidateStage>([
  'pending',
  'ai_screen',
  'business_review',
]);

export function canEnterBusinessReview(stage?: CandidateStage | null) {
  return !stage || BUSINESS_REVIEW_ENTRY_STAGES.has(stage);
}

export interface PushTarget {
  candidateId: number;
  candidateName: string;
  currentDemandId?: number | null;
  currentStage?: string | null;
  currentStageCode?: CandidateStage | null;
}

export interface PushDemandOption {
  id: number;
  jobTitle: string;
  requestNo: string;
  department: string;
}

export interface BusinessReviewerOption {
  id: number;
  name: string;
  email: string;
  role: 'interviewer' | 'manager';
}

export interface PushFormValue {
  demandId: number;
  reviewerId: number;
  hrNote: string;
  dueAt: string | null;
}

export interface PushResultItem {
  candidateId: number;
  candidateName: string;
  status: 'created' | 'deduplicated' | 'failed';
  message: string;
}

interface PushToReviewerModalProps {
  targets: PushTarget[];
  demands: PushDemandOption[];
  reviewers: BusinessReviewerOption[];
  initialDemandId?: number | null;
  initialReviewerId?: number | null;
  demandsLoading: boolean;
  demandError: string | null;
  reviewersLoading: boolean;
  reviewerError: string | null;
  isSubmitting: boolean;
  results: PushResultItem[];
  onRetryDemands: () => void;
  onRetryReviewers: () => void;
  onClose: () => void;
  onPush: (value: PushFormValue) => void;
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function PushToReviewerModal({
  targets,
  demands,
  reviewers,
  initialDemandId,
  initialReviewerId,
  demandsLoading,
  demandError,
  reviewersLoading,
  reviewerError,
  isSubmitting,
  results,
  onRetryDemands,
  onRetryReviewers,
  onClose,
  onPush,
}: PushToReviewerModalProps) {
  const fallbackDemandId = useMemo(() => {
    if (initialDemandId && demands.some((demand) => demand.id === initialDemandId)) {
      return initialDemandId;
    }
    const targetDemandIds = new Set(
      targets
        .map((target) => target.currentDemandId)
        .filter((value): value is number => typeof value === 'number'),
    );
    if (targetDemandIds.size !== 1) return 0;
    const [candidateDemandId] = targetDemandIds;
    return demands.some((demand) => demand.id === candidateDemandId) ? candidateDemandId : 0;
  }, [demands, initialDemandId, targets]);

  const [demandId, setDemandId] = useState(fallbackDemandId);
  const fallbackReviewerId = initialReviewerId && reviewers.some((reviewer) => reviewer.id === initialReviewerId)
    ? initialReviewerId
    : 0;
  const [reviewerId, setReviewerId] = useState(fallbackReviewerId);
  const [hrNote, setHrNote] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (demandId === 0 && fallbackDemandId > 0) setDemandId(fallbackDemandId);
  }, [demandId, fallbackDemandId]);

  useEffect(() => {
    if (reviewerId === 0 && fallbackReviewerId > 0) setReviewerId(fallbackReviewerId);
  }, [fallbackReviewerId, reviewerId]);

  const selectedDemand = demands.find((demand) => demand.id === demandId) ?? null;
  const selectedReviewer = reviewers.find((reviewer) => reviewer.id === reviewerId) ?? null;
  const blockedTargets = targets.filter((target) => !canEnterBusinessReview(target.currentStageCode));
  const canSubmit = Boolean(
    selectedDemand
    && selectedReviewer
    && targets.length > 0
    && blockedTargets.length === 0,
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    onPush({
      demandId,
      reviewerId,
      hrNote: hrNote.trim(),
      dueAt: dueDate ? `${dueDate}T23:59:59` : null,
    });
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="presentation"
      onMouseDown={handleClose}
    >
      <div
        className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="push-review-title" className="text-lg font-bold text-foreground-900">推送业务负责人筛选</h2>
            <p className="mt-1 text-sm text-foreground-500">通过后由招聘专员安排面试，每位候选人会生成一条待办</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 transition-colors hover:bg-background-100 hover:text-foreground-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="关闭推送弹窗"
            title="关闭"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-600">
                <UserRound size={14} aria-hidden="true" />
                推送候选人
              </div>
              <div className="max-h-36 space-y-2 overflow-y-auto">
                {targets.map((target) => {
                  const blocked = !canEnterBusinessReview(target.currentStageCode);
                  return (
                  <div
                    key={target.candidateId}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                      blocked ? 'border-red-200 bg-red-50' : 'border-background-200 bg-background-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground-900">{target.candidateName}</p>
                      <p className="mt-0.5 text-xs text-foreground-500">{target.currentStage || '候选人档案'}</p>
                    </div>
                    <span className={`ml-3 text-xs ${blocked ? 'text-red-700' : 'text-foreground-400'}`}>
                      {blocked ? '已进入后续流程，不能退回业务筛选' : '待推送业务筛选'}
                    </span>
                  </div>
                  );
                })}
              </div>
              {blockedTargets.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>请移除已进入面试、Offer、入职、淘汰或转入其他需求的候选人。</span>
                </div>
              )}
            </section>

            <section>
              <label htmlFor="push-demand" className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-600">
                <BriefcaseBusiness size={14} aria-hidden="true" />
                已审批在招需求 <span className="text-red-500">*</span>
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  暂无可推送的已审批在招需求
                </div>
              ) : (
                <select
                  id="push-demand"
                  value={demandId || ''}
                  onChange={(event) => setDemandId(Number(event.target.value))}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">请选择候选人所在需求</option>
                  {demands.map((demand) => (
                    <option key={demand.id} value={demand.id}>
                      {demand.requestNo} · {demand.jobTitle} · {demand.department}
                    </option>
                  ))}
                </select>
              )}
            </section>

            <section>
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-600">
                <UserRound size={14} aria-hidden="true" />
                业务评审人 <span className="text-red-500">*</span>
              </p>
              {reviewersLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-background-200 px-3 py-3 text-sm text-foreground-500">
                  <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                  加载业务评审人中
                </div>
              ) : reviewerError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  <p>{reviewerError}</p>
                  <button type="button" onClick={onRetryReviewers} className="mt-2 inline-flex items-center gap-1 font-medium hover:text-red-800">
                    <RefreshCw size={14} aria-hidden="true" />
                    重试
                  </button>
                </div>
              ) : reviewers.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  暂无启用的业务评审人
                </div>
              ) : (
                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {reviewers.map((reviewer) => {
                    const selected = reviewer.id === reviewerId;
                    return (
                      <button
                        type="button"
                        key={reviewer.id}
                        onClick={() => setReviewerId(reviewer.id)}
                        disabled={isSubmitting}
                        className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-background-200 bg-white hover:border-background-400'
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${selected ? 'bg-primary-100 text-primary-700' : 'bg-background-100 text-foreground-600'}`}>
                          {reviewer.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground-900">{reviewer.name}</span>
                          <span className="block truncate text-xs text-foreground-400">{reviewer.email}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="push-due-date" className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-600">
                  <CalendarDays size={14} aria-hidden="true" />
                  期望完成日期（选填）
                </label>
                <input
                  id="push-due-date"
                  type="date"
                  min={tomorrowDate()}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label htmlFor="push-note" className="mb-2 block text-xs font-medium text-foreground-600">
                  HR 备注（选填）
                </label>
                <textarea
                  id="push-note"
                  value={hrNote}
                  onChange={(event) => setHrNote(event.target.value)}
                  disabled={isSubmitting}
                  maxLength={1000}
                  rows={3}
                  placeholder="填写需要业务重点关注的经历或疑问"
                  className="w-full resize-none rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {results.length > 0 && (
              <section aria-live="polite">
                <p className="mb-2 text-xs font-medium text-foreground-600">后端推送结果</p>
                <div className="space-y-2">
                  {results.map((result) => {
                    const failed = result.status === 'failed';
                    return (
                      <div
                        key={result.candidateId}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${
                          failed ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
                        }`}
                      >
                        {failed ? (
                          <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={16} aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />
                        )}
                        <div className="min-w-0 text-sm">
                          <p className={`font-medium ${failed ? 'text-red-800' : 'text-emerald-800'}`}>
                            {result.candidateName}
                          </p>
                          <p className={`mt-0.5 text-xs ${failed ? 'text-red-700' : 'text-emerald-700'}`}>
                            {result.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-background-200 bg-background-50 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {results.length > 0 ? '完成' : '取消'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500"
          >
            {isSubmitting ? (
              <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
            {isSubmitting ? '正在推送' : results.some((result) => result.status === 'failed') ? '重试推送' : '确认推送'}
          </button>
        </div>
      </div>
    </div>
  );
}
