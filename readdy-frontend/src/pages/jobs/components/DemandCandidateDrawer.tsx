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
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileUp,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import { candidatesApi } from '@/features/candidates/api';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidateMatchResult,
  CandidatePipelineAddResult,
  CandidateResumeDetail,
  CandidateStage,
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

type OperationFilter = 'all' | 'actionable' | 'pushable';
type SortOption = 'created_desc' | 'created_asc' | 'name_asc';

const PER_PAGE = 20;
const supportedResumePattern = /\.(pdf|doc|docx|jpe?g|png|webp|gif|zip)$/i;
const supportedResumeAccept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.zip,image/jpeg,image/png,image/webp,image/gif,application/zip';
const emptyCandidateResponse: CandidateListResponse = {
  candidates: [],
  total: 0,
  page: 1,
  per_page: PER_PAGE,
  pages: 1,
};

const stageOptions: Array<{ value: '' | CandidateStage; label: string }> = [
  { value: '', label: '全部流程阶段' },
  { value: 'pending', label: '待初筛' },
  { value: 'ai_screen', label: 'AI 初筛' },
  { value: 'business_review', label: '业务筛选' },
  { value: 'interview', label: '面试中' },
  { value: 'offer', label: 'Offer' },
  { value: 'onboarded', label: '已入职' },
  { value: 'rejected', label: '已淘汰' },
  { value: 'transferred', label: '已转入其他需求' },
];

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function candidateStatus(candidate: CandidateListItem, demandId: number, match?: CandidateMatchResult) {
  if (candidate.current_demand_id === demandId) {
    const canPush = !match?.latest_stage || ['pending', 'ai_screen', 'business_review'].includes(match.latest_stage);
    return canPush
      ? { label: '已在当前需求，可推送', selectable: true, action: 'push' as const, tone: 'text-primary-700 bg-primary-50' }
      : { label: '已进入后续阶段', selectable: false, action: 'blocked' as const, tone: 'text-foreground-600 bg-background-100' };
  }
  if (candidate.current_demand_id) {
    return {
      label: candidate.current_demand?.job_title
        ? `当前岗位：${candidate.current_demand.job_title}`
        : '其他需求流程中',
      selectable: true,
      action: 'transfer' as const,
      tone: 'text-amber-700 bg-amber-50',
    };
  }
  if (match?.latest_stage === 'rejected') {
    return { label: '当前需求曾淘汰', selectable: true, action: 'add' as const, tone: 'text-red-700 bg-red-50' };
  }
  if (match?.latest_stage) {
    return { label: '已有当前需求记录', selectable: false, action: 'blocked' as const, tone: 'text-foreground-600 bg-background-100' };
  }
  return { label: '可加入', selectable: true, action: 'add' as const, tone: 'text-emerald-700 bg-emerald-50' };
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
  const [city, setCity] = useState('');
  const [education, setEducation] = useState('');
  const [skill, setSkill] = useState('');
  const [sourceChannel, setSourceChannel] = useState('');
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
  }, [city, demand.id, education, minScore, page, pipelineStatus, search, skill, sort, sourceChannel, stage]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

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
    setStage('');
    setMinScore('');
    setPipelineStatus('');
    setOperationFilter('all');
    setSort('created_desc');
    setPage(1);
  };

  const visibleCandidates = useMemo(() => candidateResponse.candidates.filter((candidate) => {
    const status = candidateStatus(candidate, demand.id, matches.get(candidate.id));
    if (operationFilter === 'actionable' && !status.selectable) return false;
    if (operationFilter === 'pushable' && status.action !== 'push') return false;
    return true;
  }).sort((left, right) => {
    if (operationFilter !== 'all') return 0;
    const leftSelectable = candidateStatus(left, demand.id, matches.get(left.id)).selectable ? 1 : 0;
    const rightSelectable = candidateStatus(right, demand.id, matches.get(right.id)).selectable ? 1 : 0;
    return rightSelectable - leftSelectable;
  }), [candidateResponse.candidates, demand.id, matches, operationFilter]);

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

  const openResume = async (candidate: CandidateListItem) => {
    setResumeCandidate(candidate);
    setResumeDetail(null);
    setResumeError('');
    setResumeFileError('');
    setResumeLoading(true);
    try {
      setResumeDetail(await candidatesApi.getResume(candidate.id));
    } catch (error) {
      setResumeError(messageOf(error, '完整简历加载失败'));
    } finally {
      setResumeLoading(false);
    }
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
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground-900/35" role="presentation">
      <button type="button" aria-label="关闭需求候选人工作区" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-6xl flex-col bg-white shadow-2xl" aria-label={`${demand.job_title}候选人工作区`}>
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
              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <input value={city} onChange={(event) => changeFilter(() => setCity(event.target.value))} placeholder="意向城市" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={education} onChange={(event) => changeFilter(() => setEducation(event.target.value))} placeholder="学历，如 本科" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={skill} onChange={(event) => changeFilter(() => setSkill(event.target.value))} placeholder="技能关键词" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <input value={sourceChannel} onChange={(event) => changeFilter(() => setSourceChannel(event.target.value))} placeholder="来源渠道" className="h-9 rounded-lg border border-background-300 px-3 text-xs" />
                <select value={stage} onChange={(event) => changeFilter(() => setStage(event.target.value as '' | CandidateStage))} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs">{stageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                <select value={pipelineStatus} onChange={(event) => changeFilter(() => setPipelineStatus(event.target.value as '' | 'in_pipeline' | 'not_in_pipeline'))} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="">全部流程状态</option><option value="in_pipeline">招聘流程中</option><option value="not_in_pipeline">人才库可用</option></select>
                <select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value as OperationFilter)} className="h-9 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="all">全部可见候选人</option><option value="actionable">本页只看可加入/转入</option><option value="pushable">本页只看当前需求可推送</option></select>
                <div className="flex gap-2">
                  <select value={minScore} onChange={(event) => changeFilter(() => setMinScore(event.target.value))} className="h-9 min-w-0 flex-1 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="">全部技能分</option><option value="3">技能分 ≥ 3</option><option value="4">技能分 ≥ 4</option><option value="5">技能分 = 5</option></select>
                  <select value={sort} onChange={(event) => changeFilter(() => setSort(event.target.value as SortOption))} className="h-9 min-w-0 flex-1 rounded-lg border border-background-300 bg-white px-2 text-xs"><option value="created_desc">最近入库</option><option value="created_asc">最早入库</option><option value="name_asc">姓名排序</option></select>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 text-[11px] text-foreground-400"><SlidersHorizontal size={13} />共 {candidateResponse.total} 位，当前第 {candidateResponse.page}/{candidateResponse.pages} 页</p>
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-primary-600 hover:text-primary-700">重置筛选</button>
              </div>
            </div>

            {matchConfigured === false && (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
                <strong>岗位技能尚未配置。</strong> 当前不能计算真实匹配度，请先在需求/JD 中补充技能关键词；候选人仍可按简历条件筛选和查看。
              </div>
            )}
            {matchConfigured && requiredSkills.length > 0 && (
              <div className="border-b border-primary-100 bg-primary-50/40 px-5 py-2 text-xs text-primary-700">岗位必备技能：{requiredSkills.join('、')}</div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex min-h-56 items-center justify-center text-sm text-foreground-500"><LoaderCircle className="mr-2 animate-spin" size={18} />正在读取候选人与岗位信息...</div>
              ) : loadError ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center"><AlertCircle size={24} className="text-red-600" /><p className="mt-3 text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void loadCandidates()} className="mt-3 rounded-lg border px-3 py-2 text-sm">重试</button></div>
              ) : visibleCandidates.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center text-sm text-foreground-500"><UserPlus size={26} className="mb-3 text-foreground-300" />没有符合条件的候选人，可调整筛选或在右侧直接导入简历。</div>
              ) : (
                <div className="space-y-2">
                  {visibleCandidates.map((candidate) => {
                    const match = matches.get(candidate.id);
                    const status = candidateStatus(candidate, demand.id, match);
                    const selected = selectedIds.has(candidate.id);
                    return (
                      <article key={candidate.id} className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 ${selected ? 'border-primary-400 bg-primary-50' : 'border-background-200 bg-white'}`}>
                        <button type="button" onClick={() => toggleCandidate(candidate)} disabled={!status.selectable} aria-label={`${selected ? '取消选择' : '选择'} ${candidate.name_masked}`} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-primary-500 text-white' : status.selectable ? 'bg-background-100 text-foreground-600 hover:bg-primary-100' : 'cursor-not-allowed bg-background-100 text-foreground-300'}`}>{selected ? '✓' : candidate.name_masked.slice(0, 1) || '候'}</button>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-foreground-900">{candidate.name_masked}</span><span className={`rounded px-2 py-0.5 text-[11px] ${status.tone}`}>{status.label}</span></div>
                          <p className="mt-1 truncate text-xs text-foreground-500">{candidate.education_summary || '学历信息待补充'} · {candidate.intent_city || '城市待补充'} · {candidate.top_tags?.slice(0, 3).map((item) => item.tag).join('、') || '技能待补充'}</p>
                          {match?.matched_tags.length ? <p className="mt-1 truncate text-[11px] text-primary-600">命中：{match.matched_tags.slice(0, 4).join('、')}</p> : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => void openResume(candidate)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 text-xs font-medium text-foreground-700 hover:bg-background-50"><Eye size={14} />查看简历</button>
                          <span className="min-w-16 text-right">
                            {matchConfigured === false ? <><span className="block text-xs font-semibold text-amber-700">未配置</span><span className="text-[10px] text-foreground-400">匹配度</span></> : <><span className="block text-lg font-bold text-primary-700">{Math.round(match?.score ?? 0)}</span><span className="text-[10px] text-foreground-400">岗位匹配度</span></>}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-background-100 px-5 py-2.5">
              <p className="text-xs text-foreground-500">第 {candidateResponse.page} / {candidateResponse.pages} 页 · 每页 {candidateResponse.per_page} 位</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 px-2.5 text-xs disabled:opacity-40"><ChevronLeft size={14} />上一页</button>
                <button type="button" onClick={() => setPage((current) => Math.min(candidateResponse.pages, current + 1))} disabled={loading || page >= candidateResponse.pages} className="inline-flex h-8 items-center gap-1 rounded-lg border border-background-300 px-2.5 text-xs disabled:opacity-40">下一页<ChevronRight size={14} /></button>
              </div>
            </div>

            <footer className="border-t border-background-200 px-5 py-3">
              {needsReactivationReason && <input value={reactivationReason} onChange={(event) => setReactivationReason(event.target.value)} placeholder="请填写重新启用曾淘汰候选人的原因" className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm" />}
              {needsTransferReason && <input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="请填写从其他岗位转入当前需求的原因" className="mb-2 h-9 w-full rounded-lg border border-amber-300 px-3 text-sm" />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-foreground-500">本页已选 {selectedIds.size} 位{saveMessage ? ` · ${saveMessage}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {needsPipelineChange && <button type="button" onClick={() => void submitSelected(false)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 text-sm font-medium text-primary-700 disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <UserPlus size={15} />}加入/转入当前需求</button>}
                  <button type="button" onClick={() => void submitSelected(true)} disabled={selectedIds.size === 0 || saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}{needsPipelineChange ? '加入/转入并推送业务筛选' : '推送业务筛选'}</button>
                </div>
              </div>
            </footer>
          </section>

          <section className="p-5">
            <h3 className="text-sm font-semibold text-foreground-900">直接导入当前需求</h3>
            <p className="mt-1 text-xs leading-5 text-foreground-500">拖入后自动关联“{demand.job_title}”，无需再次选择需求。</p>
            <input ref={uploadInputRef} type="file" multiple accept={supportedResumeAccept} onChange={handleUploadSelect} className="hidden" />
            <div onDragOver={(event) => { event.preventDefault(); setUploadDragOver(true); }} onDragLeave={() => setUploadDragOver(false)} onDrop={handleUploadDrop} className={`mt-4 flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center ${uploadDragOver ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50'}`}>
              {uploading ? <LoaderCircle className="animate-spin text-primary-600" size={28} /> : <FileUp className="text-foreground-400" size={28} />}
              <p className="mt-3 text-sm font-medium text-foreground-700">拖入简历到这里</p><p className="mt-1 text-xs text-foreground-400">PDF、DOCX、图片或 ZIP</p>
              <button type="button" onClick={() => uploadInputRef.current?.click()} disabled={uploading} className="mt-3 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-700 disabled:opacity-50">选择文件</button>
            </div>
            {uploadError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</p>}
            {uploadResponse && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800"><p className="flex items-center gap-2 font-medium"><CheckCircle2 size={15} />已处理 {uploadResponse.total} 份文件</p><p className="mt-1">成功 {uploadResponse.results.filter((item) => item.status === 'ok').length} 份，失败 {uploadResponse.results.filter((item) => item.status !== 'ok').length} 份。</p></div>}
          </section>
        </div>

        {resumeCandidate && (
          <div className="absolute inset-0 z-20 flex justify-end bg-foreground-900/30" role="presentation" onMouseDown={() => setResumeCandidate(null)}>
            <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label={`${resumeCandidate.name_masked}完整简历`} onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-foreground-900">{resumeCandidate.name_masked}</h3><p className="mt-1 text-sm text-foreground-500">完整候选人简历 · 查看不会改变勾选状态</p></div><button type="button" onClick={() => setResumeCandidate(null)} className="rounded-lg p-2 text-foreground-500 hover:bg-background-100"><X size={18} /></button></div>
              {resumeLoading ? <div className="py-20 text-center text-sm text-foreground-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20} />加载完整简历中...</div> : resumeError ? <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{resumeError}</div> : resumeDetail ? (
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-background-200 bg-background-50 px-4 py-3 text-sm text-foreground-600">
                    <span>{resumeDetail.original_resume.available ? `原版文件：${resumeDetail.original_resume.filename || '未命名文件'}` : '当前没有原版文件，以下为系统解析信息'}</span>
                    {resumeDetail.original_resume.available && (
                      <span className="flex gap-2">
                        <button type="button" onClick={() => void openOriginalResume('preview')} disabled={resumeFileAction !== null} className="inline-flex items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground-700 disabled:opacity-50"><Eye size={13} />{resumeFileAction === 'preview' ? '打开中' : '预览原版'}</button>
                        <button type="button" onClick={() => void openOriginalResume('download')} disabled={resumeFileAction !== null} className="inline-flex items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground-700 disabled:opacity-50"><Download size={13} />{resumeFileAction === 'download' ? '下载中' : '下载原版'}</button>
                      </span>
                    )}
                  </div>
                  {resumeFileError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{resumeFileError}</p>}
                  <StructuredResumeView resume={resumeDetail.resume_json} />
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </aside>
    </div>
  );
}
