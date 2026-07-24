import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidateResumeDetail,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { useToast } from '@/hooks/useToast';
import PushToReviewerModal, {
  type BusinessReviewerOption,
  type PushDemandOption,
  type PushFormValue,
  type PushResultItem,
  type PushTarget,
} from './components/PushToReviewerModal';

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

const parseStatusMeta = {
  pending: { label: '待解析', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  processing: { label: '解析中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  ok: { label: '已解析', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '解析失败', className: 'border-red-200 bg-red-50 text-red-700' },
} as const;

const stageLabels: Record<string, string> = {
  pending: 'HR 初筛',
  ai_screen: 'AI 筛选',
  business_review: '业务筛选',
  interview: '面试',
  offer: 'Offer',
  onboarded: '已入职',
  rejected: '已淘汰',
};

const sourceChannels = ['BOSS直聘', '58同城', '猎聘', '鱼泡直聘', '智联招聘', '前程无忧', '内推', '官网', 'LinkedIn'];

interface InterviewerApiItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

type PushTaskResponse = BusinessReviewTask & { deduplicated?: boolean };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
}

function formatResumeKey(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ResumeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-sm text-foreground-400">未提取</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-foreground-400">未提取</span>;
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={`${index}-${String(item).slice(0, 20)}`} className="rounded-lg border border-background-200 bg-background-50 px-3 py-2.5">
            <ResumeValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return <span className="text-sm text-foreground-400">未提取</span>;
    return (
      <dl className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, child]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-foreground-400">{formatResumeKey(key)}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground-700"><ResumeValue value={child} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="whitespace-pre-wrap break-words text-sm text-foreground-700">{String(value)}</span>;
}

function isBusinessReviewer(item: InterviewerApiItem): item is InterviewerApiItem & { role: 'interviewer' | 'manager' } {
  return item.role === 'interviewer' || item.role === 'manager';
}

function belongsToSourceFile(resultFile: string, sourceFile: string) {
  return resultFile === sourceFile || resultFile.startsWith(`${sourceFile} →`);
}

export default function CandidatesPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { fromJobs?: boolean; jobTitle?: string } | null;

  const [searchQuery, setSearchQuery] = useState('');
  const [demandFilter, setDemandFilter] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [candidateResponse, setCandidateResponse] = useState<CandidateListResponse>(emptyCandidateResponse);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const candidateRequestId = useRef(0);

  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [demandsLoading, setDemandsLoading] = useState(true);
  const [demandError, setDemandError] = useState<string | null>(null);

  const [reviewers, setReviewers] = useState<BusinessReviewerOption[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDemandId, setUploadDemandId] = useState<number | ''>('');
  const [uploadSourceChannel, setUploadSourceChannel] = useState('');
  const [uploadNote, setUploadNote] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadResponse, setUploadResponse] = useState<ResumeUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [detailCandidate, setDetailCandidate] = useState<CandidateListItem | null>(null);
  const [resumeDetail, setResumeDetail] = useState<CandidateResumeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestId = useRef(0);
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [originalResumeLoading, setOriginalResumeLoading] = useState<'preview' | 'download' | null>(null);
  const [originalResumeError, setOriginalResumeError] = useState<string | null>(null);

  const [pushTargets, setPushTargets] = useState<PushTarget[] | null>(null);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushResults, setPushResults] = useState<PushResultItem[]>([]);

  const activeDemands = useMemo(
    () => demands.filter((demand) => demand.status === 'active' && demand.approval_status === 'approved'),
    [demands],
  );

  const pushDemandOptions = useMemo<PushDemandOption[]>(
    () => activeDemands.map((demand) => ({
      id: demand.id,
      jobTitle: demand.job_title,
      requestNo: demand.request_no,
      department: demand.job_department,
    })),
    [activeDemands],
  );

  const selectedCandidates = useMemo(
    () => candidateResponse.candidates.filter((candidate) => selectedIds.has(candidate.id)),
    [candidateResponse.candidates, selectedIds],
  );

  const loadCandidates = useCallback(async () => {
    const requestId = ++candidateRequestId.current;
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const response = await candidatesApi.listCandidates({
        search: searchQuery.trim() || undefined,
        demand_id: demandFilter || undefined,
        page,
        per_page: PER_PAGE,
      });
      if (requestId !== candidateRequestId.current) return;
      setCandidateResponse(response);
      setSelectedIds((current) => new Set(response.candidates.filter((candidate) => current.has(candidate.id)).map((candidate) => candidate.id)));
    } catch (error) {
      if (requestId !== candidateRequestId.current) return;
      setCandidatesError(errorMessage(error, '候选人列表加载失败'));
    } finally {
      if (requestId === candidateRequestId.current) setCandidatesLoading(false);
    }
  }, [demandFilter, page, searchQuery]);

  const loadDemands = useCallback(async () => {
    setDemandsLoading(true);
    setDemandError(null);
    try {
      const response = await demandsApi.listDemands();
      setDemands(response.items);
    } catch (error) {
      setDemandError(errorMessage(error, '招聘需求加载失败'));
    } finally {
      setDemandsLoading(false);
    }
  }, []);

  const loadReviewers = useCallback(async () => {
    setReviewersLoading(true);
    setReviewerError(null);
    try {
      const response = await apiRequest<InterviewerApiItem[]>('/interview/interviewers');
      setReviewers(response.filter(isBusinessReviewer).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
      })));
    } catch (error) {
      setReviewerError(errorMessage(error, '业务评审人加载失败'));
    } finally {
      setReviewersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    void loadDemands();
  }, [loadDemands]);

  useEffect(() => () => {
    if (resumePreviewUrl) URL.revokeObjectURL(resumePreviewUrl);
  }, [resumePreviewUrl]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleDemandFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setDemandFilter(event.target.value ? Number(event.target.value) : '');
    setSelectedIds(new Set());
    setPage(1);
  };

  const toggleCandidate = (candidateId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allVisibleSelected = candidateResponse.candidates.length > 0
      && candidateResponse.candidates.every((candidate) => selectedIds.has(candidate.id));
    setSelectedIds(allVisibleSelected ? new Set() : new Set(candidateResponse.candidates.map((candidate) => candidate.id)));
  };

  const openUploadDialog = () => {
    setUploadOpen(true);
    setUploadDemandId(demandFilter || '');
    setUploadSourceChannel('');
    setUploadNote('');
    setUploadFiles([]);
    setUploadResponse(null);
    setUploadError(null);
  };

  const addUploadFiles = (incomingFiles: File[]) => {
    const validFiles = incomingFiles.filter((file) => supportedResumePattern.test(file.name));
    const invalidFiles = incomingFiles.filter((file) => !supportedResumePattern.test(file.name));
    if (invalidFiles.length > 0) {
      showToast(`以下文件格式不支持：${invalidFiles.map((file) => file.name).join('、')}`);
    }
    setUploadFiles((current) => {
      const byFingerprint = new Map(current.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
      validFiles.forEach((file) => byFingerprint.set(`${file.name}-${file.size}-${file.lastModified}`, file));
      return Array.from(byFingerprint.values());
    });
    setUploadResponse(null);
    setUploadError(null);
  };

  const handleUploadFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    addUploadFiles(Array.from(event.target.files ?? []));
    event.currentTarget.value = '';
  };

  const handleUploadDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setUploadDragOver(false);
    addUploadFiles(Array.from(event.dataTransfer.files));
  };

  const submitUpload = async () => {
    if (!uploadDemandId || uploadFiles.length === 0 || uploadSubmitting) return;
    setUploadSubmitting(true);
    setUploadError(null);
    setUploadResponse(null);
    try {
      const uploadResponse = await candidatesApi.uploadResumes(uploadFiles, {
        target_demand_id: uploadDemandId,
        source_channel: uploadSourceChannel || undefined,
        source_note: uploadNote.trim() || undefined,
      });
      setUploadResponse(uploadResponse);
      const failedSourceNames = new Set(
        uploadFiles
          .filter((sourceFile) => {
            const sourceResults = uploadResponse.results.filter((result) => belongsToSourceFile(result.file, sourceFile.name));
            return sourceResults.length === 0 || sourceResults.some((result) => result.status !== 'ok');
          })
          .map((file) => file.name),
      );
      setUploadFiles((current) => current.filter((file) => failedSourceNames.has(file.name)));
      await loadCandidates();

      const successfulCount = uploadResponse.results.filter((result) => result.status === 'ok').length;
      if (uploadResponse.deduplicated) {
        showToast(`上传批次 #${uploadResponse.batch_id} 与近期内容重复，已返回原处理结果`);
      } else if (successfulCount > 0) {
        showToast(`上传批次 #${uploadResponse.batch_id} 已处理，成功 ${successfulCount} 份`);
      } else {
        showToast(`上传批次 #${uploadResponse.batch_id} 已完成，但没有成功解析的简历`);
      }
    } catch (error) {
      setUploadError(errorMessage(error, '简历上传失败'));
    } finally {
      setUploadSubmitting(false);
    }
  };

  const loadCandidateDetail = useCallback(async (candidateId: number) => {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await candidatesApi.getResume(candidateId);
      if (requestId !== detailRequestId.current) return;
      setResumeDetail(detail);
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setDetailError(errorMessage(error, '简历详情加载失败'));
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  const openCandidateDetail = (candidate: CandidateListItem) => {
    setDetailCandidate(candidate);
    setResumeDetail(null);
    setResumePreviewUrl(null);
    setOriginalResumeError(null);
    void loadCandidateDetail(candidate.id);
  };

  const closeCandidateDetail = () => {
    detailRequestId.current += 1;
    setDetailCandidate(null);
    setResumeDetail(null);
    setDetailError(null);
    setResumePreviewUrl(null);
    setOriginalResumeError(null);
  };

  const previewOriginalResume = async () => {
    if (!resumeDetail || originalResumeLoading) return;
    setOriginalResumeLoading('preview');
    setOriginalResumeError(null);
    try {
      const blob = await businessReviewsApi.loadResume(resumeDetail.id);
      setResumePreviewUrl(URL.createObjectURL(blob));
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

  const openPushModal = (candidates: CandidateListItem[]) => {
    if (candidates.length === 0) return;
    setPushTargets(candidates.map((candidate) => ({
      candidateId: candidate.id,
      candidateName: candidate.name_masked,
      currentDemandId: candidate.current_demand_id ?? (demandFilter || null),
      currentStage: candidate.current_stage ? (stageLabels[candidate.current_stage] || candidate.current_stage) : null,
    })));
    setPushResults([]);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const handlePushToBusiness = async (value: PushFormValue) => {
    if (!pushTargets || pushSubmitting) return;
    setPushSubmitting(true);
    setPushResults([]);
    const results: PushResultItem[] = [];

    for (const target of pushTargets) {
      try {
        const task = await candidatesApi.pushToBusinessReview({
          demand_id: value.demandId,
          candidate_id: target.candidateId,
          reviewer_id: value.reviewerId,
          hr_note: value.hrNote,
          due_at: value.dueAt,
        }) as PushTaskResponse;
        const deduplicated = task.deduplicated === true;
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: deduplicated ? 'deduplicated' : 'created',
          taskId: task.id,
          message: deduplicated ? '该候选人已在等待业务筛选' : '业务筛选任务已创建',
        });
      } catch (error) {
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '推送失败'),
        });
      }
    }

    setPushResults(results);
    setPushSubmitting(false);
    if (results.some((result) => result.status !== 'failed')) {
      await loadCandidates();
      const created = results.filter((result) => result.status === 'created');
      const duplicate = results.filter((result) => result.status === 'deduplicated');
      if (created.length > 0) {
        showToast(`已根据后端结果创建 ${created.length} 个业务筛选任务`);
      } else if (duplicate.length > 0) {
        showToast('该候选人已在等待业务筛选');
      }
    }
  };

  const initialPushDemandId = demandFilter || null;
  const allVisibleSelected = candidateResponse.candidates.length > 0
    && candidateResponse.candidates.every((candidate) => selectedIds.has(candidate.id));

  return (
    <div className="space-y-5 px-4 pb-6 pt-3 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-background-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {navState?.fromJobs && (
              <button
                type="button"
                onClick={() => navigate('/jobs')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
                aria-label="返回招聘管理"
                title="返回招聘管理"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold text-foreground-900">简历库</h1>
              <p className="mt-0.5 text-xs text-foreground-500">
                {navState?.jobTitle ? `来自「${navState.jobTitle}」` : '候选人与业务筛选'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadCandidates()}
            disabled={candidatesLoading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 transition-colors hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="刷新候选人"
            title="刷新"
          >
            <RefreshCw className={candidatesLoading ? 'animate-spin' : ''} size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openUploadDialog}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            <Upload size={16} aria-hidden="true" />
            导入简历
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
            <span className="sr-only">搜索候选人</span>
            <input
              type="search"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="搜索姓名、联系方式或简历内容"
              className="h-10 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <label className="relative block sm:w-80">
            <BriefcaseBusiness className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
            <span className="sr-only">按招聘需求筛选</span>
            <select
              value={demandFilter}
              onChange={handleDemandFilterChange}
              disabled={demandsLoading}
              className="h-10 w-full appearance-none rounded-lg border border-background-300 bg-white pl-9 pr-8 text-sm text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-background-50"
            >
              <option value="">{demandsLoading ? '加载需求中' : '全部招聘需求'}</option>
              {demands.map((demand) => (
                <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="shrink-0 text-sm text-foreground-500">
          共 <span className="font-semibold text-foreground-900">{candidateResponse.total}</span> 位候选人
        </div>
      </section>

      {demandError && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{demandError}，需求筛选与上传目标暂不可用。</span>
          <button type="button" onClick={() => void loadDemands()} className="inline-flex items-center gap-1 font-medium hover:text-amber-900">
            <RefreshCw size={14} aria-hidden="true" />
            重试
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-3 border-y border-primary-200 bg-primary-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary-800">已选 {selectedIds.size} 位候选人</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm font-medium text-foreground-600 hover:text-foreground-900">取消选择</button>
            <button
              type="button"
              onClick={() => openPushModal(selectedCandidates)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              <Send size={15} aria-hidden="true" />
              推送业务筛选
            </button>
          </div>
        </div>
      )}

      <section className="overflow-hidden border-y border-background-200 bg-white">
        {candidatesLoading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-foreground-500">
            <LoaderCircle className="animate-spin text-primary-500" size={24} aria-hidden="true" />
            <p className="text-sm">加载候选人中</p>
          </div>
        ) : candidatesError ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-900">候选人加载失败</p>
            <p className="mt-1 max-w-lg text-sm text-foreground-500">{candidatesError}</p>
            <button
              type="button"
              onClick={() => void loadCandidates()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50"
            >
              <RefreshCw size={15} aria-hidden="true" />
              重试
            </button>
          </div>
        ) : candidateResponse.candidates.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Inbox className="text-foreground-300" size={32} aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-900">暂无候选人</p>
            <p className="mt-1 text-sm text-foreground-500">
              {searchQuery || demandFilter ? '当前条件下没有匹配结果' : '选择已审批的在招需求后导入简历'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="bg-background-50 text-xs font-medium text-foreground-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="选择当前页所有候选人"
                      className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200"
                    />
                  </th>
                  <th className="px-3 py-3">候选人</th>
                  <th className="px-3 py-3">解析状态</th>
                  <th className="px-3 py-3">学历摘要</th>
                  <th className="px-3 py-3">当前阶段</th>
                  <th className="px-3 py-3">入库日期</th>
                  <th className="w-32 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {candidateResponse.candidates.map((candidate) => {
                  const status = parseStatusMeta[candidate.parse_status];
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => openCandidateDetail(candidate)}
                      className="cursor-pointer transition-colors hover:bg-background-50"
                    >
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.id)}
                          onChange={() => toggleCandidate(candidate.id)}
                          aria-label={`选择 ${candidate.name_masked}`}
                          className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-200"
                        />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
                            {candidate.name_masked.slice(0, 1) || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground-900">{candidate.name_masked}</p>
                            <p className="mt-0.5 truncate text-xs text-foreground-400">
                              {candidate.phone_masked || candidate.email_masked || `ID ${candidate.id}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="max-w-64 px-3 py-3.5 text-sm text-foreground-600">
                        <span className="line-clamp-2">{candidate.education_summary || '—'}</span>
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-600">
                        {candidate.current_stage ? (stageLabels[candidate.current_stage] || candidate.current_stage) : '—'}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-500">{formatDate(candidate.created_at)}</td>
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openCandidateDetail(candidate)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
                            aria-label={`查看 ${candidate.name_masked} 简历`}
                            title="查看简历"
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPushModal([candidate])}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                            aria-label={`推送 ${candidate.name_masked} 进行业务筛选`}
                            title="推送业务筛选"
                          >
                            <Send size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!candidatesLoading && !candidatesError && candidateResponse.total > 0 && (
        <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="候选人分页">
          <p className="text-xs text-foreground-500">
            第 {candidateResponse.page} / {candidateResponse.pages} 页，每页 {candidateResponse.per_page} 条
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="上一页"
              title="上一页"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <span className="min-w-20 text-center text-sm font-medium text-foreground-700">{page} / {candidateResponse.pages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(candidateResponse.pages, current + 1))}
              disabled={page >= candidateResponse.pages}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-background-300 bg-white text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="下一页"
              title="下一页"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="presentation" onMouseDown={() => { if (!uploadSubmitting) setUploadOpen(false); }}>
          <div
            className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-resume-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
              <div>
                <h2 id="upload-resume-title" className="text-lg font-bold text-foreground-900">导入简历</h2>
                <p className="mt-1 text-sm text-foreground-500">简历将直接加入所选招聘需求</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                disabled={uploadSubmitting}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="关闭上传弹窗"
                title="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <label htmlFor="upload-demand" className="mb-2 block text-xs font-medium text-foreground-600">目标招聘需求 <span className="text-red-500">*</span></label>
                {demandsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-background-200 px-3 py-3 text-sm text-foreground-500">
                    <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                    加载已审批需求中
                  </div>
                ) : demandError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                    <p>{demandError}</p>
                    <button type="button" onClick={() => void loadDemands()} className="mt-2 inline-flex items-center gap-1 font-medium hover:text-red-800">
                      <RefreshCw size={14} aria-hidden="true" />
                      重试
                    </button>
                  </div>
                ) : activeDemands.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">暂无已审批且招聘中的需求</div>
                ) : (
                  <select
                    id="upload-demand"
                    value={uploadDemandId}
                    onChange={(event) => setUploadDemandId(event.target.value ? Number(event.target.value) : '')}
                    disabled={uploadSubmitting}
                    className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">请选择已审批的在招需求</option>
                    {activeDemands.map((demand) => (
                      <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title} · {demand.job_department}</option>
                    ))}
                  </select>
                )}
              </div>

              <div
                onDragOver={(event) => { event.preventDefault(); setUploadDragOver(true); }}
                onDragLeave={() => setUploadDragOver(false)}
                onDrop={handleUploadDrop}
                className={`flex min-h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-6 text-center transition-colors ${
                  uploadDragOver ? 'border-primary-400 bg-primary-50' : 'border-background-300 bg-background-50'
                }`}
              >
                <input ref={uploadInputRef} type="file" multiple accept={supportedResumeAccept} onChange={handleUploadFileSelect} className="hidden" />
                <Upload className="text-foreground-400" size={24} aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-foreground-800">拖入简历，或选择文件</p>
                <p className="mt-1 text-xs text-foreground-400">PDF、DOC、DOCX、JPG、PNG、WebP、GIF、ZIP</p>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploadSubmitting}
                  className="mt-3 rounded-lg border border-background-300 bg-white px-3 py-1.5 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  选择文件
                </button>
              </div>

              {uploadFiles.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-foreground-600">待上传文件（{uploadFiles.length}）</p>
                  <div className="max-h-36 space-y-2 overflow-y-auto">
                    {uploadFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-lg border border-background-200 px-3 py-2">
                        <FileText className="shrink-0 text-primary-500" size={16} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground-700">{file.name}</span>
                        <span className="shrink-0 text-xs text-foreground-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                        <button
                          type="button"
                          onClick={() => setUploadFiles((current) => current.filter((item) => item !== file))}
                          disabled={uploadSubmitting}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700"
                          aria-label={`移除 ${file.name}`}
                          title="移除"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="upload-source" className="mb-2 block text-xs font-medium text-foreground-600">来源渠道（选填）</label>
                  <select
                    id="upload-source"
                    value={uploadSourceChannel}
                    onChange={(event) => setUploadSourceChannel(event.target.value)}
                    disabled={uploadSubmitting}
                    className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="">未标注</option>
                    {sourceChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="upload-note" className="mb-2 block text-xs font-medium text-foreground-600">来源备注（选填）</label>
                  <input
                    id="upload-note"
                    value={uploadNote}
                    onChange={(event) => setUploadNote(event.target.value)}
                    disabled={uploadSubmitting}
                    maxLength={500}
                    placeholder="例如：7 月专场招聘"
                    className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none placeholder:text-foreground-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadResponse && (
                <div aria-live="polite">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-foreground-600">后端处理结果 · 批次 #{uploadResponse.batch_id}</p>
                    {uploadResponse.deduplicated && <span className="text-xs font-medium text-amber-700">重复批次</span>}
                  </div>
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {uploadResponse.results.map((result, index) => {
                      const success = result.status === 'ok';
                      return (
                        <div key={`${result.file}-${index}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                          {success ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" /> : <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={16} aria-hidden="true" />}
                          <div className="min-w-0 flex-1">
                            <p className={`break-words text-sm font-medium ${success ? 'text-emerald-800' : 'text-red-800'}`}>{result.file}</p>
                            <p className={`mt-0.5 text-xs ${success ? 'text-emerald-700' : 'text-red-700'}`}>
                              {success ? `已入库${result.candidate_id ? ` · 候选人 ID ${result.candidate_id}` : ''}` : (result.reason || `处理状态：${result.status}`)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-background-200 bg-background-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                disabled={uploadSubmitting}
                className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadResponse ? '完成' : '取消'}
              </button>
              <button
                type="button"
                onClick={() => void submitUpload()}
                disabled={uploadSubmitting || uploadFiles.length === 0 || !uploadDemandId}
                className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-background-300 disabled:text-foreground-500"
              >
                {uploadSubmitting ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                {uploadSubmitting ? '正在上传' : uploadResponse && uploadFiles.length > 0 ? '重试失败文件' : '上传并入库'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCandidate && (
        <div className="fixed inset-0 z-40 bg-black/30" role="presentation" onMouseDown={closeCandidateDetail}>
          <aside
            className="ml-auto flex h-full w-full max-w-[720px] flex-col bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-background-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="candidate-detail-title" className="truncate text-lg font-bold text-foreground-900">{detailCandidate.name_masked}</h2>
                <p className="mt-1 text-xs text-foreground-500">候选人 ID {detailCandidate.id}</p>
              </div>
              <button
                type="button"
                onClick={closeCandidateDetail}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700"
                aria-label="关闭简历详情"
                title="关闭"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {detailLoading ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-foreground-500">
                  <LoaderCircle className="animate-spin text-primary-500" size={24} aria-hidden="true" />
                  <p className="text-sm">加载简历详情中</p>
                </div>
              ) : detailError ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center">
                  <AlertCircle className="text-red-500" size={28} aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-foreground-900">简历详情加载失败</p>
                  <p className="mt-1 text-sm text-foreground-500">{detailError}</p>
                  <button
                    type="button"
                    onClick={() => void loadCandidateDetail(detailCandidate.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50"
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    重试
                  </button>
                </div>
              ) : resumeDetail ? (
                <div className="space-y-6">
                  <section className="grid grid-cols-2 gap-3 border-b border-background-200 pb-5 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-foreground-400">解析状态</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{parseStatusMeta[resumeDetail.parse_status].label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">HR 负责人 ID</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{resumeDetail.owner_hr_id ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">标签数</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{resumeDetail.tags.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">入库日期</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{formatDate(resumeDetail.created_at)}</p>
                    </div>
                  </section>

                  {resumeDetail.parse_error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{resumeDetail.parse_error}</span>
                    </div>
                  )}

                  <section>
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground-900">原版简历</h3>
                        <p className="mt-0.5 text-xs text-foreground-400">{resumeDetail.original_resume.filename || '未返回文件名'}</p>
                      </div>
                      {resumeDetail.original_resume.available && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void previewOriginalResume()}
                            disabled={originalResumeLoading !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {originalResumeLoading === 'preview' ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                            预览
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadOriginalResume()}
                            disabled={originalResumeLoading !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {originalResumeLoading === 'download' ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                            下载
                          </button>
                        </div>
                      )}
                    </div>
                    {!resumeDetail.original_resume.available ? (
                      <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-4 text-sm text-foreground-500">暂无可用的原版简历</div>
                    ) : originalResumeError ? (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                        <span>{originalResumeError}</span>
                      </div>
                    ) : null}
                    {resumePreviewUrl && (
                      <iframe
                        src={resumePreviewUrl}
                        title={`${resumeDetail.name_masked} 原版简历预览`}
                        className="mt-3 h-[520px] w-full rounded-lg border border-background-200 bg-background-50"
                      />
                    )}
                  </section>

                  {resumeDetail.tags.length > 0 && (
                    <section>
                      <h3 className="mb-3 text-sm font-semibold text-foreground-900">解析标签</h3>
                      <div className="flex flex-wrap gap-2">
                        {resumeDetail.tags.map((tag) => (
                          <span key={tag.tag} className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                            {tag.tag} · {tag.score}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-foreground-900">结构化简历</h3>
                    {Object.keys(resumeDetail.resume_json).length === 0 ? (
                      <div className="rounded-lg border border-background-200 bg-background-50 px-4 py-4 text-sm text-foreground-500">暂无可展示的结构化内容</div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(resumeDetail.resume_json).map(([key, value]) => (
                          <div key={key} className="border-t border-background-200 pt-4 first:border-t-0 first:pt-0">
                            <h4 className="mb-2 text-xs font-semibold uppercase text-foreground-500">{formatResumeKey(key)}</h4>
                            <ResumeValue value={value} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-background-200 bg-background-50 px-5 py-4 sm:px-6">
              <button type="button" onClick={closeCandidateDetail} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100">关闭</button>
              <button
                type="button"
                onClick={() => openPushModal([detailCandidate])}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                <Send size={15} aria-hidden="true" />
                推送业务筛选
              </button>
            </div>
          </aside>
        </div>
      )}

      {pushTargets && (
        <PushToReviewerModal
          targets={pushTargets}
          demands={pushDemandOptions}
          reviewers={reviewers}
          initialDemandId={initialPushDemandId}
          demandsLoading={demandsLoading}
          demandError={demandError}
          reviewersLoading={reviewersLoading}
          reviewerError={reviewerError}
          isSubmitting={pushSubmitting}
          results={pushResults}
          onRetryDemands={() => void loadDemands()}
          onRetryReviewers={() => void loadReviewers()}
          onClose={() => { setPushTargets(null); setPushResults([]); }}
          onPush={(value) => void handlePushToBusiness(value)}
        />
      )}
    </div>
  );
}
