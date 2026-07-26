import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidateMatchResult,
  CandidatePipelineAddResult,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import type { PushTarget } from '@/pages/candidates/components/PushToReviewerModal';

interface DemandCandidateDrawerProps {
  demand: RecruitmentDemand;
  onClose: () => void;
  onChanged: () => void;
  onReadyToPush: (demand: RecruitmentDemand, targets: PushTarget[]) => void;
}

const supportedResumePattern = /\.(pdf|doc|docx|jpe?g|png|webp|gif|zip)$/i;
const supportedResumeAccept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.zip,image/jpeg,image/png,image/webp,image/gif,application/zip';

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function candidateStatus(candidate: CandidateListItem, demandId: number, match?: CandidateMatchResult) {
  if (candidate.current_demand_id === demandId) {
    const canPush = !match?.latest_stage || ['pending', 'ai_screen', 'business_review'].includes(match.latest_stage);
    return canPush
      ? { label: '已在当前需求，可推送', selectable: true, action: 'push', tone: 'text-primary-700 bg-primary-50' }
      : { label: '已进入后续阶段', selectable: false, action: 'blocked', tone: 'text-foreground-600 bg-background-100' };
  }
  if (candidate.current_demand_id) {
    return {
      label: candidate.current_demand?.job_title
        ? `当前岗位：${candidate.current_demand.job_title}`
        : '其他需求流程中',
      selectable: true,
      action: 'transfer',
      tone: 'text-amber-700 bg-amber-50',
    };
  }
  if (match?.latest_stage === 'rejected') return { label: '当前需求曾淘汰', selectable: true, action: 'add', tone: 'text-red-700 bg-red-50' };
  if (match?.latest_stage) return { label: '已有当前需求记录', selectable: false, action: 'blocked', tone: 'text-foreground-600 bg-background-100' };
  return { label: '可加入', selectable: true, action: 'add', tone: 'text-emerald-700 bg-emerald-50' };
}

function resultSummary(result: CandidatePipelineAddResult) {
  const successful = result.added + result.reactivated;
  if (successful === 0 && result.failures.length > 0) return result.failures.map((item) => item.error).join('；');
  const parts = [`成功加入 ${successful} 位`];
  if (result.skipped_existing) parts.push(`${result.skipped_existing} 位已存在`);
  if (result.skipped_conflict) parts.push(`${result.skipped_conflict} 位存在流程冲突`);
  return parts.join('，');
}

export default function DemandCandidateDrawer({ demand, onClose, onChanged, onReadyToPush }: DemandCandidateDrawerProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [matches, setMatches] = useState<Map<number, CandidateMatchResult>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [reactivationReason, setReactivationReason] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadResponse, setUploadResponse] = useState<ResumeUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState('');

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await candidatesApi.listCandidates({
        search: search.trim() || undefined,
        page: 1,
        per_page: 50,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
      setCandidates(response.candidates);
      setSelectedIds((current) => new Set(response.candidates.filter((item) => current.has(item.id)).map((item) => item.id)));
      if (response.candidates.length === 0) {
        setMatches(new Map());
      } else {
        const preview = await candidatesApi.previewMatches(demand.id, response.candidates.map((item) => item.id));
        setMatches(new Map(preview.results.map((item) => [item.candidate_id, item])));
      }
    } catch (error) {
      setLoadError(messageOf(error, '候选人加载失败'));
    } finally {
      setLoading(false);
    }
  }, [demand.id, search]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const visibleCandidates = useMemo(
    () => [...candidates].sort((left, right) => {
      const leftSelectable = candidateStatus(left, demand.id, matches.get(left.id)).selectable ? 1 : 0;
      const rightSelectable = candidateStatus(right, demand.id, matches.get(right.id)).selectable ? 1 : 0;
      return rightSelectable - leftSelectable
        || (matches.get(right.id)?.score ?? -1) - (matches.get(left.id)?.score ?? -1);
    }),
    [candidates, demand.id, matches],
  );

  const selectedCandidates = useMemo(
    () => visibleCandidates.filter((item) => selectedIds.has(item.id)),
    [selectedIds, visibleCandidates],
  );
  const needsReactivationReason = selectedCandidates.some((item) => matches.get(item.id)?.latest_stage === 'rejected');
  const transferCandidates = selectedCandidates.filter(
    (item) => item.current_demand_id && item.current_demand_id !== demand.id,
  );
  const needsTransferReason = transferCandidates.length > 0;
  const needsPipelineChange = selectedCandidates.some(
    (item) => item.current_demand_id !== demand.id,
  );

  const toggleCandidate = (candidate: CandidateListItem) => {
    const status = candidateStatus(candidate, demand.id, matches.get(candidate.id));
    if (!status.selectable) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
    setSaveMessage('');
  };

  const submitSelected = async (pushAfterSave: boolean) => {
    if (selectedIds.size === 0 || saving) return;
    if (needsReactivationReason && !reactivationReason.trim()) {
      setSaveMessage('重新启用曾淘汰的候选人时，请填写原因。');
      return;
    }
    if (needsTransferReason && !transferReason.trim()) {
      setSaveMessage('从其他岗位转入当前需求时，请填写转入原因。');
      return;
    }
    setSaving(true);
    setSaveMessage('');
    try {
      const readyToPush = new Set<number>();
      selectedCandidates
        .filter((item) => item.current_demand_id === demand.id)
        .forEach((item) => readyToPush.add(item.id));

      for (const candidate of transferCandidates) {
        await candidatesApi.transferToDemand(
          candidate.id,
          candidate.current_demand_id as number,
          demand.id,
          transferReason,
        );
        readyToPush.add(candidate.id);
      }

      const addCandidates = selectedCandidates.filter((item) => !item.current_demand_id);
      let summary = '';
      if (addCandidates.length > 0) {
        const result = await candidatesApi.addToPipeline(
          demand.id,
          addCandidates.map((item) => item.id),
          needsReactivationReason ? reactivationReason.trim() : undefined,
        );
        const failedIds = new Set(result.failures.map((item) => item.candidate_id));
        addCandidates
          .filter((item) => !failedIds.has(item.id))
          .forEach((item) => readyToPush.add(item.id));
        summary = resultSummary(result);
      }

      if (transferCandidates.length > 0) {
        summary = `${summary ? `${summary}，` : ''}成功转入 ${transferCandidates.length} 位`;
      }
      if (readyToPush.size === 0) throw new Error(summary || '所选候选人未能进入当前需求');

      await onChanged();
      if (pushAfterSave) {
        onReadyToPush(
          demand,
          selectedCandidates
            .filter((item) => readyToPush.has(item.id))
            .map((item) => ({
              candidateId: item.id,
              candidateName: item.name_masked,
              currentDemandId: demand.id,
              currentStage: matches.get(item.id)?.latest_stage || 'pending',
            })),
        );
        return;
      }

      setSaveMessage(summary || `已处理 ${readyToPush.size} 位候选人`);
      setSelectedIds(new Set());
      setReactivationReason('');
      setTransferReason('');
      await loadCandidates();
    } catch (error) {
      setSaveMessage(messageOf(error, '加入或转入当前需求失败'));
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    const accepted = files.filter((file) => supportedResumePattern.test(file.name));
    if (accepted.length === 0 || uploading) {
      if (files.length > 0 && accepted.length === 0) setUploadError('文件格式不支持，请上传 PDF、DOCX、图片或 ZIP。');
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadResponse(null);
    try {
      const response = await candidatesApi.uploadResumes(accepted, {
        target_demand_id: demand.id,
        source_note: `从需求「${demand.job_title}」直接导入`,
      });
      setUploadResponse(response);
      await loadCandidates();
      onChanged();
    } catch (error) {
      setUploadError(messageOf(error, '简历上传失败'));
    } finally {
      setUploading(false);
    }
  };

  const handleUploadSelect = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(event.target.files ?? []));
    event.currentTarget.value = '';
  };

  const handleUploadDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setUploadDragOver(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground-900/35" role="presentation">
      <button type="button" aria-label="关闭需求候选人工作区" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" aria-label={`${demand.job_title}候选人工作区`}>
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground-900">当前需求候选人</h2>
            <p className="mt-1 text-sm text-foreground-500">
              {demand.request_no} · {demand.job_title} · {demand.job_city || '城市未填写'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_300px]">
          <section className="flex min-h-0 flex-col border-r border-background-200">
            <div className="flex gap-2 border-b border-background-100 px-5 py-3">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" size={16} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索姓名、公司、学校、岗位或技能"
                  className="h-9 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400"
                />
              </label>
              <button type="button" onClick={() => void loadCandidates()} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg border border-background-300 px-3 text-sm text-foreground-600 disabled:opacity-50">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />刷新
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex min-h-56 items-center justify-center text-sm text-foreground-500"><LoaderCircle className="mr-2 animate-spin" size={18} />正在计算岗位匹配度...</div>
              ) : loadError ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center">
                  <AlertCircle size={24} className="text-red-600" />
                  <p className="mt-3 text-sm text-red-700">{loadError}</p>
                  <button type="button" onClick={() => void loadCandidates()} className="mt-3 rounded-lg border px-3 py-2 text-sm">重试</button>
                </div>
              ) : visibleCandidates.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-sm text-foreground-500">
                  <UserPlus size={26} className="mb-3 text-foreground-300" />没有找到候选人，可在右侧直接导入简历。
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleCandidates.map((candidate) => {
                    const match = matches.get(candidate.id);
                    const status = candidateStatus(candidate, demand.id, match);
                    const selected = selectedIds.has(candidate.id);
                    return (
                      <button
                        type="button"
                        key={candidate.id}
                        onClick={() => toggleCandidate(candidate)}
                        disabled={!status.selectable}
                        className={`grid w-full grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${selected ? 'border-primary-400 bg-primary-50' : 'border-background-200 bg-white hover:border-background-300'} disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-primary-500 text-white' : 'bg-background-100 text-foreground-600'}`}>
                          {selected ? '✓' : (candidate.name_masked.slice(0, 1) || '候')}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground-900">{candidate.name_masked}</span>
                            <span className={`rounded px-2 py-0.5 text-[11px] ${status.tone}`}>{status.label}</span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-foreground-500">
                            {candidate.education_summary || '学历信息待补充'} · {candidate.top_tags?.slice(0, 3).map((item) => item.tag).join('、') || '技能待补充'}
                          </span>
                          {match?.matched_tags.length ? <span className="mt-1 block truncate text-[11px] text-primary-600">命中：{match.matched_tags.slice(0, 4).join('、')}</span> : null}
                        </span>
                        <span className="text-right">
                          <span className="block text-lg font-bold text-primary-700">{Math.round(match?.score ?? 0)}</span>
                          <span className="text-[11px] text-foreground-400">岗位匹配度</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="border-t border-background-200 px-5 py-3">
              {needsReactivationReason && (
                <input
                  value={reactivationReason}
                  onChange={(event) => setReactivationReason(event.target.value)}
                  placeholder="请填写重新启用曾淘汰候选人的原因"
                  className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm outline-none focus:border-amber-500"
                />
              )}
              {needsTransferReason && (
                <input
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  placeholder="请填写从其他岗位转入当前需求的原因"
                  className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm outline-none focus:border-amber-500"
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-foreground-500">已选 {selectedIds.size} 位候选人{saveMessage ? ` · ${saveMessage}` : ''}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {needsPipelineChange && (
                    <button type="button" onClick={() => void submitSelected(false)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? <LoaderCircle className="animate-spin" size={15} /> : <UserPlus size={15} />}
                      加入/转入当前需求
                    </button>
                  )}
                  <button type="button" onClick={() => void submitSelected(true)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}
                    {needsPipelineChange ? '加入/转入并推送业务筛选' : '推送业务筛选'}
                  </button>
                </div>
              </div>
            </footer>
          </section>

          <section className="p-5">
            <h3 className="text-sm font-semibold text-foreground-900">直接导入当前需求</h3>
            <p className="mt-1 text-xs leading-5 text-foreground-500">拖入后自动关联“{demand.job_title}”，无需再次选择需求。</p>
            <input ref={uploadInputRef} type="file" multiple accept={supportedResumeAccept} onChange={handleUploadSelect} className="hidden" />
            <div
              onDragOver={(event) => { event.preventDefault(); setUploadDragOver(true); }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleUploadDrop}
              className={`mt-4 flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition-colors ${uploadDragOver ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50'}`}
            >
              {uploading ? <LoaderCircle className="animate-spin text-primary-600" size={28} /> : <FileUp className="text-foreground-400" size={28} />}
              <p className="mt-3 text-sm font-medium text-foreground-700">拖入简历到这里</p>
              <p className="mt-1 text-xs text-foreground-400">PDF、DOCX、图片或 ZIP</p>
              <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading} className="mt-3 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-700 disabled:opacity-50">选择文件</button>
            </div>
            {uploadError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</p>}
            {uploadResponse && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                <p className="flex items-center gap-2 font-medium"><CheckCircle2 size={15} />已处理 {uploadResponse.total} 份文件</p>
                <p className="mt-1">成功 {uploadResponse.results.filter((item) => item.status === 'ok').length} 份，失败 {uploadResponse.results.filter((item) => item.status !== 'ok').length} 份。</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
