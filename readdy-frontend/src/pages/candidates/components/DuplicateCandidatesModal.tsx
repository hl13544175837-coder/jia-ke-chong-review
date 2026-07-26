import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Files,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateDuplicateResponse, DuplicateCandidateGroup } from '@/features/candidates/types';

interface Props {
  onClose: () => void;
  onMerged: () => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '入库时间未知' : new Intl.DateTimeFormat('zh-CN').format(date);
}

export default function DuplicateCandidatesModal({ onClose, onMerged }: Props) {
  const [response, setResponse] = useState<CandidateDuplicateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [primaryCandidateId, setPrimaryCandidateId] = useState(0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const next = await candidatesApi.getDuplicateGroups();
      setResponse(next);
      setSelectedKey((current) => (
        next.groups.some((group) => group.key === current)
          ? current
          : next.groups[0]?.key ?? ''
      ));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '重复候选人加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const selectedGroup = useMemo<DuplicateCandidateGroup | null>(
    () => response?.groups.find((group) => group.key === selectedKey) ?? null,
    [response, selectedKey],
  );
  const historyCandidate = selectedGroup?.candidates.find((candidate) => candidate.has_business_history) ?? null;

  useEffect(() => {
    if (!selectedGroup) {
      setPrimaryCandidateId(0);
      return;
    }
    const preferred = selectedGroup.candidates.find((candidate) => candidate.has_business_history)
      ?? selectedGroup.candidates[0];
    setPrimaryCandidateId(preferred?.id ?? 0);
    setReason('');
    setSubmitError('');
    setSuccessMessage('');
  }, [selectedGroup]);

  const handleMerge = async () => {
    if (!selectedGroup || !primaryCandidateId || !reason.trim() || submitting) return;
    const duplicateIds = selectedGroup.candidates
      .filter((candidate) => candidate.id !== primaryCandidateId)
      .map((candidate) => candidate.id);
    setSubmitting(true);
    setSubmitError('');
    setSuccessMessage('');
    try {
      const result = await candidatesApi.mergeDuplicates(primaryCandidateId, duplicateIds, reason.trim());
      setSuccessMessage(`已将 ${result.merged_count} 份重复档案合入 ${result.primary_candidate_name}`);
      onMerged();
      await loadGroups();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '候选人合并失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="presentation" onMouseDown={handleClose}>
      <div
        className="flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-candidates-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div>
            <h2 id="duplicate-candidates-title" className="text-lg font-bold text-foreground-900">候选人查重合并</h2>
            <p className="mt-1 text-sm text-foreground-500">按完整手机号或邮箱识别重复档案，合并前由 HR 确认主档</p>
          </div>
          <button type="button" onClick={handleClose} disabled={submitting} className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:opacity-50" aria-label="关闭查重合并弹窗" title="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-foreground-500">
            <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
            正在检查重复候选人
          </div>
        ) : loadError ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
            <p className="mt-3 text-sm text-red-700">{loadError}</p>
            <button type="button" onClick={() => void loadGroups()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              <RefreshCw size={14} aria-hidden="true" />
              重新检查
            </button>
          </div>
        ) : !response || response.groups.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="text-emerald-500" size={30} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-800">当前没有手机号或邮箱完全一致的重复档案</p>
            <p className="mt-1 text-xs text-foreground-400">模糊姓名不会自动判重，避免误合并同名候选人。</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="max-h-56 overflow-y-auto border-b border-background-200 bg-background-50 p-3 md:max-h-none md:border-b-0 md:border-r">
              <p className="px-2 pb-2 text-xs font-medium text-foreground-500">发现 {response.total_groups} 组待确认</p>
              <div className="space-y-1">
                {response.groups.map((group, index) => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setSelectedKey(group.key)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left ${selectedKey === group.key ? 'bg-primary-100 text-primary-800' : 'text-foreground-700 hover:bg-background-100'}`}
                  >
                    <span className="block text-sm font-medium">重复组 {index + 1} · {group.candidates.length} 份</span>
                    <span className="mt-0.5 block truncate text-xs opacity-70">{group.match_basis.join('、')}</span>
                  </button>
                ))}
              </div>
            </aside>

            {selectedGroup && (
              <main className="min-h-0 overflow-y-auto px-6 py-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground-800">
                  <Files size={16} aria-hidden="true" />
                  选择保留的主档
                </div>
                <div className="space-y-2">
                  {selectedGroup.candidates.map((candidate) => {
                    const selected = candidate.id === primaryCandidateId;
                    const mustKeepHistory = Boolean(historyCandidate && historyCandidate.id !== candidate.id);
                    return (
                      <label key={candidate.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${selected ? 'border-primary-400 bg-primary-50' : 'border-background-200 bg-white'} ${mustKeepHistory ? 'cursor-not-allowed opacity-60' : 'hover:border-background-400'}`}>
                        <input
                          type="radio"
                          name="primary-candidate"
                          checked={selected}
                          disabled={mustKeepHistory || submitting}
                          onChange={() => setPrimaryCandidateId(candidate.id)}
                          className="mt-1 h-4 w-4 border-background-300 text-primary-500 focus:ring-primary-200"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground-900">{candidate.name_masked}</span>
                            {candidate.has_business_history && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">已有招聘历史，必须保留</span>}
                            {selected && <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[11px] font-medium text-primary-800">主档</span>}
                          </span>
                          <span className="mt-1 block text-xs text-foreground-500">{[candidate.phone_masked, candidate.email_masked].filter(Boolean).join(' · ') || '联系方式待补充'}</span>
                          <span className="mt-0.5 block text-xs text-foreground-400">{candidate.education_summary || '学历待补充'} · {formatDate(candidate.created_at)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {!selectedGroup.can_merge && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    <ShieldAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                    该组有多份档案已经产生招聘业务历史，系统不会自动迁移面试或 Offer。请先人工核对并保留为独立档案。
                  </div>
                )}

                {selectedGroup.can_merge && (
                  <div className="mt-5">
                    <label htmlFor="candidate-merge-reason" className="mb-2 block text-xs font-medium text-foreground-600">合并原因 <span className="text-red-500">*</span></label>
                    <textarea
                      id="candidate-merge-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      disabled={submitting}
                      maxLength={240}
                      rows={3}
                      placeholder="例如：同一候选人重复上传，经手机号核对确认"
                      className="w-full resize-none rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                )}

                {submitError && <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{submitError}</div>}
                {successMessage && <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{successMessage}</div>}

                {selectedGroup.can_merge && (
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleMerge()}
                      disabled={!primaryCandidateId || !reason.trim() || submitting}
                      className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500"
                    >
                      {submitting && <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />}
                      {submitting ? '正在合并' : `合并其余 ${selectedGroup.candidates.length - 1} 份`}
                    </button>
                  </div>
                )}
              </main>
            )}
          </div>
        )}

        <footer className="flex justify-end border-t border-background-200 bg-background-50 px-6 py-4">
          <button type="button" onClick={handleClose} disabled={submitting} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:opacity-50">完成</button>
        </footer>
      </div>
    </div>
  );
}
