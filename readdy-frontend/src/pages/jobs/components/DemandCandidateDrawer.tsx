import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidateMatchResult,
  CandidateJourney,
  CandidateResumeDetail,
  CandidateStage,
  ParseStatus,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import type { PushTarget } from '@/features/businessReviews/components/PushToReviewerModal';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import DetailDrawerShell from '@/components/ui/DetailDrawerShell';
import DemandCandidateResumeDetail from '@/pages/jobs/components/DemandCandidateResumeDetail';
import DemandCandidateResults from '@/pages/jobs/components/DemandCandidateResults';
import DemandCandidateImportPanel from '@/pages/jobs/components/DemandCandidateImportPanel';
import { supportedResumePattern } from '@/features/candidates/library';
import {
  candidateStatus,
  emptyCandidateResponse,
  messageOf,
  parseStatusOptions,
  PER_PAGE,
  resultSummary,
  stageOptions,
  type OperationFilter,
  type SortOption,
} from '@/pages/jobs/components/demandCandidateModel';

interface DemandCandidateDrawerProps {
  demand: RecruitmentDemand;
  onClose: () => void;
  onChanged: () => void;
  onReadyToPush: (demand: RecruitmentDemand, targets: PushTarget[], task?: BusinessReviewTask) => void;
}

export default function DemandCandidateDrawer({ demand, onClose, onChanged, onReadyToPush }: DemandCandidateDrawerProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [education, setEducation] = useState('');
  const [skill, setSkill] = useState('');
  const [sourceChannel, setSourceChannel] = useState('');
  const [parseStatus, setParseStatus] = useState<'' | ParseStatus>('');
  const [stage, setStage] = useState<'' | CandidateStage>('');
  const [minScore, setMinScore] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState<'' | 'in_pipeline' | 'not_in_pipeline'>('');
  const [operationFilter, setOperationFilter] = useState<OperationFilter>('all');
  const [sort, setSort] = useState<SortOption>('created_desc');
  const [page, setPage] = useState(1);
  const [candidateResponse, setCandidateResponse] = useState<CandidateListResponse>(emptyCandidateResponse);
  const [matches, setMatches] = useState<Map<number, CandidateMatchResult>>(new Map());
  const [matchConfigured, setMatchConfigured] = useState<boolean | null>(null);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
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
  const [resumeCandidate, setResumeCandidate] = useState<CandidateListItem | null>(null);
  const [resumeDetail, setResumeDetail] = useState<CandidateResumeDetail | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [resumeFileAction, setResumeFileAction] = useState<'preview' | 'download' | null>(null);
  const [resumeFileError, setResumeFileError] = useState('');
  const [resumeTab, setResumeTab] = useState<CandidateDetailTab>('interview');
  const [resumeJourney, setResumeJourney] = useState<CandidateJourney | null>(null);
  const [resumeJourneyLoading, setResumeJourneyLoading] = useState(false);
  const [resumeJourneyError, setResumeJourneyError] = useState('');
  const [reviewTasks, setReviewTasks] = useState<BusinessReviewTask[]>([]);
  const [reviewTasksError, setReviewTasksError] = useState('');

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [sortBy, sortOrder] = sort === 'name_asc'
        ? ['name_masked', 'asc'] as const
        : ['created_at', sort === 'created_asc' ? 'asc' : 'desc'] as const;
      const response = await candidatesApi.listCandidates({
        search: search.trim() || undefined,
        city: city.trim() || undefined,
        education: education.trim() || undefined,
        skill: skill.trim() || undefined,
        source_channel: sourceChannel.trim() || undefined,
        parse_status: parseStatus || undefined,
        stage: stage || undefined,
        min_score: minScore ? Number(minScore) : undefined,
        pipeline_status: pipelineStatus || undefined,
        page: page,
        per_page: PER_PAGE,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setCandidateResponse(response);
      setSelectedIds(new Set());
      if (response.candidates.length === 0) {
        setMatches(new Map());
      } else {
        const preview = await candidatesApi.previewMatches(
          demand.id,
          response.candidates.map((item) => item.id),
        );
        setMatches(new Map(preview.results.map((item) => [item.candidate_id, item])));
        setMatchConfigured(preview.match_configured);
        setRequiredSkills(preview.required_skills);
      }
    } catch (error) {
      setLoadError(messageOf(error, '候选人加载失败'));
    } finally {
      setLoading(false);
    }
  }, [city, demand.id, education, minScore, page, parseStatus, pipelineStatus, search, skill, sort, sourceChannel, stage]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    setReviewTasksError('');
    void businessReviewsApi.listForHr()
      .then((response) => setReviewTasks(response.items))
      .catch((error: unknown) => setReviewTasksError(messageOf(error, '业务筛选状态加载失败')));
  }, [demand.id]);

  const changeFilter = (change: () => void) => {
    change();
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setCity('');
    setEducation('');
    setSkill('');
    setSourceChannel('');
    setParseStatus('');
    setStage('');
    setMinScore('');
    setPipelineStatus('');
    setOperationFilter('all');
    setSort('created_desc');
    setPage(1);
  };

  const visibleCandidates = useMemo(() => candidateResponse.candidates.filter((candidate) => {
    const status = candidateStatus(candidate, demand.id, matches.get(candidate.id), reviewTasks);
    if (operationFilter === 'actionable' && !status.selectable) return false;
    if (operationFilter === 'pushable' && status.action !== 'push') return false;
    return true;
  }).sort((left, right) => {
    if (operationFilter !== 'all') return 0;
    const leftSelectable = candidateStatus(left, demand.id, matches.get(left.id), reviewTasks).selectable ? 1 : 0;
    const rightSelectable = candidateStatus(right, demand.id, matches.get(right.id), reviewTasks).selectable ? 1 : 0;
    return rightSelectable - leftSelectable;
  }), [candidateResponse.candidates, demand.id, matches, operationFilter, reviewTasks]);

  const selectedCandidates = useMemo(
    () => candidateResponse.candidates.filter((item) => selectedIds.has(item.id)),
    [candidateResponse.candidates, selectedIds],
  );
  const needsReactivationReason = selectedCandidates.some((item) => matches.get(item.id)?.latest_stage === 'rejected');
  const transferCandidates = selectedCandidates.filter(
    (item) => item.current_demand_id && item.current_demand_id !== demand.id,
  );
  const needsTransferReason = transferCandidates.length > 0;
  const needsPipelineChange = selectedCandidates.some((item) => item.current_demand_id !== demand.id);
  const selectedPendingTask = selectedCandidates.length === 1
    ? reviewTasks.find((task) => (
        task.candidate_id === selectedCandidates[0].id
        && task.demand_id === demand.id
        && task.status === 'pending'
      )) ?? null
    : null;

  const toggleCandidate = (candidate: CandidateListItem) => {
    const status = candidateStatus(candidate, demand.id, matches.get(candidate.id), reviewTasks);
    if (!status.selectable) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
    setSaveMessage('');
  };

  const openResume = async (candidate: CandidateListItem) => {
    setResumeCandidate(candidate);
    setResumeTab('interview');
    setResumeDetail(null);
    setResumeError('');
    setResumeFileError('');
    setResumeJourney(null);
    setResumeJourneyError('');
    setResumeLoading(true);
    setResumeJourneyLoading(true);
    const [resumeResult, journeyResult] = await Promise.allSettled([
      candidatesApi.getResume(candidate.id),
      candidatesApi.getJourney(candidate.id, demand.id),
    ]);
    if (resumeResult.status === 'fulfilled') setResumeDetail(resumeResult.value);
    else setResumeError(messageOf(resumeResult.reason, '完整简历加载失败'));
    if (journeyResult.status === 'fulfilled') setResumeJourney(journeyResult.value);
    else setResumeJourneyError(messageOf(journeyResult.reason, '历史面试评价暂时无法读取'));
    setResumeLoading(false);
    setResumeJourneyLoading(false);
  };

  const openDuplicateCandidate = (result: ResumeUploadResponse['results'][number]) => {
    if (!result.existing_candidate_id) return;
    const existing = candidateResponse.candidates.find(
      (candidate) => candidate.id === result.existing_candidate_id,
    ) ?? {
      id: result.existing_candidate_id,
      name_masked: result.existing_candidate_name || '已有候选人',
      owner_hr_id: null,
      is_favorite: false,
      created_at: '',
      parse_status: 'ok' as const,
      tag_count: 0,
      pipeline_state: 'never_entered' as const,
      has_rejected_history: false,
    };
    void openResume(existing);
  };

  const openOriginalResume = async (mode: 'preview' | 'download') => {
    if (!resumeDetail?.original_resume.available || resumeFileAction) return;
    setResumeFileAction(mode);
    setResumeFileError('');
    try {
      const blob = mode === 'preview'
        ? await businessReviewsApi.loadResume(resumeDetail.id)
        : await businessReviewsApi.downloadResume(resumeDetail.id);
      const url = URL.createObjectURL(blob);
      if (mode === 'preview') {
        const previewWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (!previewWindow) throw new Error('浏览器阻止了新标签页，请允许弹出窗口后重试');
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = resumeDetail.original_resume.filename || `candidate-${resumeDetail.id}-resume`;
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), mode === 'preview' ? 60_000 : 1_000);
    } catch (error) {
      setResumeFileError(messageOf(error, '原版简历读取失败'));
    } finally {
      setResumeFileAction(null);
    }
  };

  const handleResumeDetailUpdated = (updated: CandidateResumeDetail) => {
    setResumeDetail(updated);
    setResumeCandidate((current) => current ? {
      ...current,
      name_masked: updated.name_masked,
      parse_status: updated.parse_status,
      parse_error: updated.parse_error,
    } : current);
    void loadCandidates();
    onChanged();
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
        addCandidates.filter((item) => !failedIds.has(item.id)).forEach((item) => readyToPush.add(item.id));
        summary = resultSummary(result);
      }
      if (transferCandidates.length > 0) summary = `${summary ? `${summary}，` : ''}成功转入 ${transferCandidates.length} 位`;
      if (readyToPush.size === 0) throw new Error(summary || '所选候选人未能进入当前需求');

      await onChanged();
      if (pushAfterSave) {
        onReadyToPush(demand, selectedCandidates.filter((item) => readyToPush.has(item.id)).map((item) => ({
          candidateId: item.id,
          candidateName: item.name_masked,
          currentDemandId: demand.id,
          currentStage: matches.get(item.id)?.latest_stage || 'pending',
          currentStageCode: matches.get(item.id)?.latest_stage || 'pending',
        })));
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
    <DetailDrawerShell
      ariaLabel={`${demand.job_title}候选人工作区`}
      closeLabel="关闭需求候选人工作区"
      onClose={onClose}
      modal
      backdropClassName="fixed inset-0 z-50 cursor-default bg-foreground-900/35"
      panelClassName="fixed inset-y-0 right-0 z-[60] flex h-full w-full max-w-6xl flex-col bg-white shadow-2xl"
    >
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground-900">当前需求候选人</h2>
            <p className="mt-1 text-sm text-foreground-500">{demand.request_no} · {demand.job_title} · {demand.job_city || '城市未填写'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100"><X size={19} /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-h-0 flex-col border-r border-background-200">
            <div className="border-b border-background-100 px-5 py-3">
              <div className="flex gap-2">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" size={16} />
                  <input value={search} onChange={(event) => changeFilter(() => setSearch(event.target.value))} placeholder="搜索姓名、公司、学校、岗位或技能" className="h-9 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400" />
                </label>
                <button type="button" onClick={() => void loadCandidates()} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg border border-background-300 px-3 text-sm text-foreground-600 disabled:opacity-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />刷新</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
                <input value={city} onChange={(event) => changeFilter(() => setCity(event.target.value))} placeholder="全部城市或输入城市" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={education} onChange={(event) => changeFilter(() => setEducation(event.target.value))} placeholder="全部学历或输入学历" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={skill} onChange={(event) => changeFilter(() => setSkill(event.target.value))} placeholder="如 Java、Python" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={sourceChannel} onChange={(event) => changeFilter(() => setSourceChannel(event.target.value))} placeholder="全部来源或输入渠道" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <select value={parseStatus} onChange={(event) => changeFilter(() => setParseStatus(event.target.value as '' | ParseStatus))} aria-label="解析状态" className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs">{parseStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <select value={stage} onChange={(event) => changeFilter(() => setStage(event.target.value as '' | CandidateStage))} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs">{stageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <select value={pipelineStatus} onChange={(event) => changeFilter(() => setPipelineStatus(event.target.value as '' | 'in_pipeline' | 'not_in_pipeline'))} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="">全部流程状态</option><option value="in_pipeline">招聘流程中</option><option value="not_in_pipeline">公司人才库</option></select>
                <select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value as OperationFilter)} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="all">全部可见候选人</option><option value="actionable">本页只看可加入/转入</option><option value="pushable">本页只看当前需求可推送</option></select>
                <select value={minScore} onChange={(event) => changeFilter(() => setMinScore(event.target.value))} aria-label="最低技能分" className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="">全部技能分</option><option value="3">技能分 ≥ 3</option><option value="4">技能分 ≥ 4</option><option value="5">技能分 = 5</option></select>
                <select value={sort} onChange={(event) => changeFilter(() => setSort(event.target.value as SortOption))} aria-label="排序方式" className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="created_desc">最近入库</option><option value="created_asc">最早入库</option><option value="name_asc">姓名排序</option></select>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-[11px] text-foreground-400"><SlidersHorizontal size={13} />共 {candidateResponse.total} 位，当前第 {candidateResponse.page}/{candidateResponse.pages} 页</p>
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-primary-600 hover:text-primary-700">重置筛选</button>
              </div>
            </div>

            <DemandCandidateResults
              matchConfigured={matchConfigured}
              requiredSkills={requiredSkills}
              loading={loading}
              loadError={loadError}
              onReload={() => void loadCandidates()}
              candidates={visibleCandidates}
              matches={matches}
              selectedIds={selectedIds}
              getStatus={(candidate) => candidateStatus(candidate, demand.id, matches.get(candidate.id), reviewTasks)}
              onToggle={toggleCandidate}
              onOpenResume={(candidate) => void openResume(candidate)}
              response={candidateResponse}
              page={page}
              onPageChange={setPage}
            />

            <footer className="border-t border-background-200 px-5 py-3">
              {reviewTasksError && <p className="mb-2 text-xs text-red-700">{reviewTasksError}</p>}
              {needsReactivationReason && <input value={reactivationReason} onChange={(event) => setReactivationReason(event.target.value)} placeholder="请填写重新启用曾淘汰候选人的原因" className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm" />}
              {needsTransferReason && <input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="请填写从其他岗位转入当前需求的原因" className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm" />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-foreground-500">本页已选 {selectedIds.size} 位{saveMessage ? ` · ${saveMessage}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPendingTask ? (
                    <>
                      <span className="inline-flex h-9 items-center text-sm font-medium text-amber-700">等待「{selectedPendingTask.reviewer_name || '业务筛选人'}」反馈</span>
                      <button
                        type="button"
                        onClick={() => onReadyToPush(demand, selectedCandidates.map((item) => ({ candidateId: item.id, candidateName: item.name_masked, currentDemandId: demand.id, currentStage: '业务筛选', currentStageCode: 'business_review' })), selectedPendingTask)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 hover:bg-primary-50"
                      >改派筛选人</button>
                    </>
                  ) : (
                    <>
                      {needsPipelineChange && <button type="button" onClick={() => void submitSelected(false)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <UserPlus size={15} />}仅加入/转入当前需求</button>}
                      <button type="button" onClick={() => void submitSelected(true)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}{needsPipelineChange ? '加入/转入并推送业务筛选' : '推送业务筛选'}</button>
                    </>
                  )}
                </div>
              </div>
            </footer>
          </section>

          <DemandCandidateImportPanel
            demand={demand}
            inputRef={uploadInputRef}
            dragOver={uploadDragOver}
            onDragOverChange={setUploadDragOver}
            uploading={uploading}
            error={uploadError}
            response={uploadResponse}
            onFileSelect={handleUploadSelect}
            onDrop={handleUploadDrop}
            onOpenDuplicate={openDuplicateCandidate}
            onOpenConfirmation={(item) => void openResume({
              id: item.candidate_id as number,
              name_masked: item.file,
              owner_hr_id: null,
              is_favorite: false,
              created_at: '',
              parse_status: 'failed',
              tag_count: 0,
              pipeline_state: 'never_entered',
              has_rejected_history: false,
            })}
          />
        </div>

        {resumeCandidate && (
          <DemandCandidateResumeDetail
            candidate={resumeCandidate}
            demand={demand}
            match={matches.get(resumeCandidate.id)}
            tab={resumeTab}
            onTabChange={setResumeTab}
            detail={resumeDetail}
            journey={resumeJourney}
            loading={resumeLoading}
            error={resumeError}
            journeyLoading={resumeJourneyLoading}
            journeyError={resumeJourneyError}
            fileAction={resumeFileAction}
            fileError={resumeFileError}
            onDetailUpdated={handleResumeDetailUpdated}
            onPreview={() => void openOriginalResume('preview')}
            onDownload={() => void openOriginalResume('download')}
            onClose={() => setResumeCandidate(null)}
          />
        )}
    </DetailDrawerShell>
  );
}
