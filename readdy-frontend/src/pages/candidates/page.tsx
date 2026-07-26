import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  GitMerge,
  Inbox,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Star,
  Upload,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { useProductRole } from '@/auth/productRole';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import { apiRequest } from '@/lib/api';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidateListResponse,
  CandidatePipelineAddResult,
  CandidateResumeDetail,
  CandidateStage,
  ParseStatus,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewStatus, BusinessReviewTask } from '@/features/businessReviews/types';
import { interviewsApi } from '@/features/interviews/api';
import type { InterviewManagementRow } from '@/features/interviews/types';
import { useToast } from '@/hooks/useToast';
import PushToReviewerModal, {
  type BusinessReviewerOption,
  type PushDemandOption,
  type PushFormValue,
  type PushResultItem,
  type PushTarget,
} from './components/PushToReviewerModal';
import { canEnterBusinessReview } from '@/features/businessReviews/stages';
import AddToPipelineModal from './components/AddToPipelineModal';
import DuplicateCandidatesModal from './components/DuplicateCandidatesModal';

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

const stageLabels: Record<CandidateStage, string> = {
  pending: 'HR 初筛',
  ai_screen: 'AI 筛选',
  business_review: '业务筛选',
  interview: '面试',
  offer: 'Offer',
  onboarded: '已入职',
  rejected: '已淘汰',
  transferred: '已转需求',
};

const sourceChannels = ['BOSS直聘', '58同城', '猎聘', '鱼泡直聘', '智联招聘', '前程无忧', '内推', '官网', 'LinkedIn'];
const sourceFilterOptions = [...sourceChannels, '其他'];
const educationOptions = ['博士', '硕士', '本科', '大专', '高中', '中专'];
const cityOptions = ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '苏州', '西安', '长沙', '重庆', '天津', '厦门', '合肥', '郑州', '青岛', '宁波', '佛山'];
const candidateStageOptions: CandidateStage[] = [
  'pending',
  'ai_screen',
  'business_review',
  'interview',
  'offer',
  'onboarded',
  'rejected',
  'transferred',
];

const businessReviewStatusMeta: Record<BusinessReviewStatus, { label: string; className: string }> = {
  pending: { label: '等待业务负责人', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  approved: { label: '已通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '不合适', className: 'border-red-200 bg-red-50 text-red-700' },
  needs_info: { label: '待 HR 补充', className: 'border-sky-200 bg-sky-50 text-sky-700' },
};

type CandidateColumnFilter = 'identity' | 'parse' | 'profile' | 'skills' | 'source' | 'stage' | 'created';
type PipelineStatusFilter = '' | 'in_pipeline' | 'not_in_pipeline';
type CandidateSortBy = 'created_at' | 'name_masked';
type SortOrder = 'asc' | 'desc';

const filterControlClass = 'h-9 w-full rounded-lg border border-background-300 bg-white px-2.5 text-xs text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

function isCandidateStage(value: string): value is CandidateStage {
  return candidateStageOptions.some((stage) => stage === value);
}

function isParseStatus(value: string): value is ParseStatus {
  return value === 'pending' || value === 'processing' || value === 'ok' || value === 'failed';
}

function isPipelineStatus(value: string): value is Exclude<PipelineStatusFilter, ''> {
  return value === 'in_pipeline' || value === 'not_in_pipeline';
}

function positiveSearchId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function candidateFromReviewTask(task: BusinessReviewTask): CandidateListItem {
  const parseStatus = isParseStatus(task.candidate.parse_status)
    ? task.candidate.parse_status
    : 'pending';
  return {
    id: task.candidate_id,
    name_masked: task.candidate.name_masked,
    owner_hr_id: task.demand.owner_hr_id,
    current_demand_id: task.demand_id,
    latest_demand_id: task.demand_id,
    is_favorite: false,
    created_at: task.created_at,
    parse_status: parseStatus,
    tag_count: 0,
    current_stage: 'business_review',
  };
}

function CandidateColumnFilterHeader({
  'data-ui': dataUi,
  label,
  open,
  onToggle,
  children,
}: {
  'data-ui': string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <th
      className="relative px-3 py-3 font-medium"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <button
        type="button"
        data-ui={dataUi}
        aria-expanded={open}
        aria-controls={`${dataUi}-panel`}
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded text-left hover:text-foreground-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${dataUi}-panel`}
          role="group"
          aria-label={`${label}筛选条件`}
          className="absolute left-3 top-full z-30 mt-1 w-60 space-y-2 rounded-lg border border-background-200 bg-white p-3 shadow-xl"
        >
          {children}
        </div>
      )}
    </th>
  );
}

interface InterviewerApiItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

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

function isBusinessReviewer(item: InterviewerApiItem): item is InterviewerApiItem & { role: 'interviewer' | 'manager' } {
  return item.role === 'interviewer' || item.role === 'manager';
}

function belongsToSourceFile(resultFile: string, sourceFile: string) {
  return resultFile === sourceFile || resultFile.startsWith(`${sourceFile} →`);
}

interface CandidateNavigationState {
  fromJobs?: boolean;
  jobTitle?: string;
  demandId?: number;
  targetStage?: string;
}

function isCandidateNavigationState(value: unknown): value is CandidateNavigationState {
  if (typeof value !== 'object' || value === null) return false;
  if ('fromJobs' in value && typeof value.fromJobs !== 'boolean') return false;
  if ('jobTitle' in value && typeof value.jobTitle !== 'string') return false;
  if (
    'demandId' in value
    && value.demandId !== undefined
    && (!Number.isInteger(value.demandId) || Number(value.demandId) <= 0)
  ) return false;
  if ('targetStage' in value && typeof value.targetStage !== 'string') return false;
  return true;
}

function candidateStageFromNavigation(value: string | undefined): '' | CandidateStage {
  if (!value || value === 'all') return '';
  if (value === 'feedback') return 'business_review';
  return isCandidateStage(value) ? value : '';
}

export default function CandidatesPage() {
  const { role } = useProductRole();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedDemandId = positiveSearchId(searchParams.get('demand'));
  const requestedCandidateId = positiveSearchId(searchParams.get('candidate'));
  const navState = isCandidateNavigationState(location.state)
    ? location.state
    : requestedDemandId
      ? { demandId: requestedDemandId }
      : null;

  const [searchQuery, setSearchQuery] = useState('');
  const [demandFilter, setDemandFilter] = useState<number | ''>(navState?.demandId ?? '');
  const [cityFilter, setCityFilter] = useState('');
  const [educationFilter, setEducationFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [parseStatusFilter, setParseStatusFilter] = useState<'' | ParseStatus>('');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<PipelineStatusFilter>('');
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [stageFilter, setStageFilter] = useState<'' | CandidateStage>(candidateStageFromNavigation(navState?.targetStage));
  const [scoreFilter, setScoreFilter] = useState('0');
  const [sortBy, setSortBy] = useState<CandidateSortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [openColumnFilter, setOpenColumnFilter] = useState<CandidateColumnFilter | null>(null);
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

  const [reviewTasks, setReviewTasks] = useState<BusinessReviewTask[]>([]);
  const [reviewTasksLoading, setReviewTasksLoading] = useState(true);
  const [reviewTasksError, setReviewTasksError] = useState<string | null>(null);
  const [interviewRows, setInterviewRows] = useState<InterviewManagementRow[]>([]);
  const [interviewRowsError, setInterviewRowsError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [pipelineTargets, setPipelineTargets] = useState<CandidateListItem[] | null>(null);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<CandidatePipelineAddResult | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDemandId, setUploadDemandId] = useState<number | ''>(navState?.demandId ?? '');
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
  const [pushInitialReviewerId, setPushInitialReviewerId] = useState<number | null>(null);
  const handledCandidateQuery = useRef<number | null>(null);
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const deferredSkill = useDeferredValue(skillFilter.trim());

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
        search: deferredSearch || undefined,
        demand_id: demandFilter || undefined,
        city: cityFilter || undefined,
        education: educationFilter || undefined,
        skill: deferredSkill || undefined,
        min_score: Number(scoreFilter) || undefined,
        source_channel: sourceFilter || undefined,
        parse_status: parseStatusFilter || undefined,
        pipeline_status: pipelineStatusFilter || undefined,
        favorite: favoriteFilter || undefined,
        stage: stageFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
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
  }, [
    cityFilter,
    deferredSearch,
    deferredSkill,
    demandFilter,
    educationFilter,
    favoriteFilter,
    page,
    parseStatusFilter,
    pipelineStatusFilter,
    scoreFilter,
    sortBy,
    sortOrder,
    sourceFilter,
    stageFilter,
  ]);

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

  const loadReviewTasks = useCallback(async () => {
    setReviewTasksLoading(true);
    setReviewTasksError(null);
    try {
      const response = await businessReviewsApi.listForHr();
      setReviewTasks(response.items);
    } catch (error) {
      setReviewTasksError(errorMessage(error, '业务筛选结果加载失败'));
    } finally {
      setReviewTasksLoading(false);
    }
  }, []);

  const loadInterviewRows = useCallback(async () => {
    setInterviewRowsError(null);
    try {
      setInterviewRows(await interviewsApi.listManagementRows());
    } catch (error) {
      setInterviewRowsError(errorMessage(error, '面试安排状态加载失败'));
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    void loadDemands();
  }, [loadDemands]);

  useEffect(() => {
    void Promise.all([loadReviewTasks(), loadInterviewRows()]);
    const refreshWorkflowFacts = () => void Promise.all([loadReviewTasks(), loadInterviewRows()]);
    window.addEventListener('focus', refreshWorkflowFacts);
    return () => window.removeEventListener('focus', refreshWorkflowFacts);
  }, [loadInterviewRows, loadReviewTasks]);

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

  const changeFilter = (change: () => void) => {
    change();
    setSelectedIds(new Set());
    setPage(1);
  };

  const resetCandidateFilters = () => {
    setSearchQuery('');
    setDemandFilter('');
    setCityFilter('');
    setEducationFilter('');
    setSkillFilter('');
    setSourceFilter('');
    setParseStatusFilter('');
    setPipelineStatusFilter('');
    setFavoriteFilter(false);
    setStageFilter('');
    setScoreFilter('0');
    setSortBy('created_at');
    setSortOrder('desc');
    setOpenColumnFilter(null);
    setSelectedIds(new Set());
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim()
    || demandFilter
    || cityFilter
    || educationFilter
    || skillFilter.trim()
    || sourceFilter
    || parseStatusFilter
    || pipelineStatusFilter
    || favoriteFilter
    || stageFilter
    || scoreFilter !== '0'
    || sortBy !== 'created_at'
    || sortOrder !== 'desc',
  );

  const toggleColumnFilter = (column: CandidateColumnFilter) => {
    setOpenColumnFilter((current) => current === column ? null : column);
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
    setUploadDemandId(
      demandFilter && activeDemands.some((demand) => demand.id === demandFilter)
        ? demandFilter
        : '',
    );
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
    if (uploadFiles.length === 0 || uploadSubmitting) return;
    setUploadSubmitting(true);
    setUploadError(null);
    setUploadResponse(null);
    try {
      const uploadResponse = await candidatesApi.uploadResumes(uploadFiles, {
        target_demand_id: uploadDemandId || undefined,
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
        showToast('该批文件与近期上传内容重复，已返回原处理结果');
      } else if (successfulCount > 0) {
        showToast(`简历已处理，成功入库 ${successfulCount} 份`);
      } else {
        showToast('文件处理已完成，但没有成功解析的简历');
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

  const openCandidateDetail = useCallback((candidate: CandidateListItem) => {
    setDetailCandidate(candidate);
    setResumeDetail(null);
    setResumePreviewUrl(null);
    setOriginalResumeError(null);
    void loadCandidateDetail(candidate.id);
  }, [loadCandidateDetail]);

  const focusedReview = useMemo(() => reviewTasks.find((task) => (
    task.candidate_id === requestedCandidateId
    && (!requestedDemandId || task.demand_id === requestedDemandId)
  )) ?? null, [requestedCandidateId, requestedDemandId, reviewTasks]);

  const visibleReviewResults = useMemo(() => {
    if (focusedReview) return [focusedReview];
    return reviewTasks
      .filter((task) => task.status !== 'pending' && (!demandFilter || task.demand_id === demandFilter))
      .slice(0, 5);
  }, [demandFilter, focusedReview, reviewTasks]);

  const detailReview = useMemo(() => {
    if (!detailCandidate) return null;
    return reviewTasks.find((task) => (
      task.candidate_id === detailCandidate.id
      && (!detailCandidate.current_demand_id || task.demand_id === detailCandidate.current_demand_id)
    )) ?? null;
  }, [detailCandidate, reviewTasks]);

  useEffect(() => {
    if (!requestedCandidateId || candidatesLoading || reviewTasksLoading) return;
    if (handledCandidateQuery.current === requestedCandidateId) return;
    const candidate = candidateResponse.candidates.find((item) => item.id === requestedCandidateId)
      ?? (focusedReview ? candidateFromReviewTask(focusedReview) : null);
    if (!candidate) return;
    handledCandidateQuery.current = requestedCandidateId;
    openCandidateDetail(candidate);
  }, [
    candidateResponse.candidates,
    candidatesLoading,
    focusedReview,
    openCandidateDetail,
    requestedCandidateId,
    reviewTasksLoading,
  ]);

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

  const openPushModal = (candidates: CandidateListItem[], reviewerId: number | null = null) => {
    if (candidates.length === 0) return;
    setPushTargets(candidates.map((candidate) => ({
      candidateId: candidate.id,
      candidateName: candidate.name_masked,
      currentDemandId: candidate.current_demand_id ?? (demandFilter || null),
      currentStage: candidate.current_stage ? stageLabels[candidate.current_stage] : null,
      currentStageCode: candidate.current_stage,
    })));
    setPushResults([]);
    setPushInitialReviewerId(reviewerId);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const repeatBusinessReview = (task: BusinessReviewTask) => {
    setDemandFilter(task.demand_id);
    openPushModal([candidateFromReviewTask(task)], task.reviewer_id);
  };

  const renderReviewAction = (task: BusinessReviewTask) => {
    if (task.status === 'approved') {
      if (interviewRowsError) {
        return <span className="text-xs text-amber-700">面试状态暂不可用，请刷新后再操作</span>;
      }
      const hasScheduledInterview = interviewRows.some((row) => (
        row.demand_id === task.demand_id
        && row.candidate_id === task.candidate_id
        && row.assignment_id !== null
        && row.assignment_status !== 'unassigned'
      ));
      return (
        <button
          type="button"
          onClick={() => navigate(`/interviews?demand=${task.demand_id}&candidate=${task.candidate_id}`)}
          className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          {hasScheduledInterview ? '查看/调整面试' : '安排面试'}
        </button>
      );
    }
    if (task.status === 'rejected') {
      return (
        <button
          type="button"
          onClick={() => navigate(`/kanban?demand=${task.demand_id}&candidate=${task.candidate_id}&target=rejected`)}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          去流程处理
        </button>
      );
    }
    if (task.status === 'needs_info') {
      return (
        <button
          type="button"
          onClick={() => repeatBusinessReview(task)}
          className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          补充并再次推送
        </button>
      );
    }
    return <span className="text-xs text-foreground-500">等待业务负责人处理</span>;
  };

  const updateFavorites = async (candidates: CandidateListItem[], favorite: boolean) => {
    if (candidates.length === 0 || favoriteSaving) return;
    setFavoriteSaving(true);
    try {
      await candidatesApi.setFavorites(candidates.map((candidate) => candidate.id), favorite);
      showToast(favorite ? `已收藏 ${candidates.length} 位候选人` : `已取消收藏 ${candidates.length} 位候选人`);
      await loadCandidates();
    } catch (error) {
      showToast(errorMessage(error, favorite ? '收藏候选人失败' : '取消收藏失败'));
    } finally {
      setFavoriteSaving(false);
    }
  };

  const openPipelineModal = (candidates: CandidateListItem[]) => {
    if (candidates.length === 0) return;
    setPipelineTargets(candidates);
    setPipelineResult(null);
  };

  const handleAddToPipeline = async (demandId: number, reason: string) => {
    if (!pipelineTargets || pipelineSubmitting) return;
    setPipelineSubmitting(true);
    try {
      const result = await candidatesApi.addToPipeline(
        demandId,
        pipelineTargets.map((candidate) => candidate.id),
        reason,
      );
      setPipelineResult(result);
      setSelectedIds(new Set());
      await loadCandidates();
      showToast(`已加入 ${result.added} 位，重新启用 ${result.reactivated} 位候选人`);
    } catch (error) {
      showToast(errorMessage(error, '加入招聘流程失败'));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  const selectLibraryScope = (scope: 'all' | 'in_pipeline' | 'talent_pool' | 'favorite') => {
    changeFilter(() => {
      setFavoriteFilter(scope === 'favorite');
      setPipelineStatusFilter(
        scope === 'in_pipeline' ? 'in_pipeline' : scope === 'talent_pool' ? 'not_in_pipeline' : '',
      );
    });
  };

  const libraryScope = favoriteFilter
    ? 'favorite'
    : pipelineStatusFilter === 'in_pipeline'
      ? 'in_pipeline'
      : pipelineStatusFilter === 'not_in_pipeline'
        ? 'talent_pool'
        : 'all';

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
        });
        const deduplicated = task.deduplicated === true;
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: deduplicated ? 'deduplicated' : 'created',
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
      await loadReviewTasks();
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
  const selectedAllFavorite = selectedCandidates.length > 0
    && selectedCandidates.every((candidate) => candidate.is_favorite);
  const selectedAllInPipeline = selectedCandidates.length > 0
    && selectedCandidates.every((candidate) => candidate.current_demand_id);
  const selectedAllReviewable = selectedCandidates.length > 0
    && selectedCandidates.every((candidate) => canEnterBusinessReview(candidate.current_stage));

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
              <h1 className="text-lg font-bold text-foreground-900">
                {navState?.jobTitle ? '当前需求候选人' : '简历库'}
              </h1>
              <p className="mt-0.5 text-xs text-foreground-500">
                {navState?.jobTitle ? `${navState.jobTitle} · 已自动带入需求和阶段条件` : '候选人与业务筛选'}
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
          {(role === 'manager' || role === 'admin') && (
            <button
              type="button"
              onClick={() => setDuplicatesOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3.5 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-50"
            >
              <GitMerge size={16} aria-hidden="true" />
              查重合并
            </button>
          )}
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

      {(visibleReviewResults.length > 0 || (requestedCandidateId && reviewTasksError)) && (
        <section className="rounded-lg border border-primary-200 bg-primary-50/40 px-4 py-4" aria-label="业务筛选结果">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground-900">业务筛选结果</h2>
              <p className="mt-0.5 text-xs text-foreground-500">业务负责人只给结论，最终推进由招聘专员确认</p>
            </div>
            <button type="button" onClick={() => void loadReviewTasks()} className="text-xs font-medium text-primary-700 hover:text-primary-800">
              刷新结果
            </button>
          </div>
          {reviewTasksError ? (
            <p className="mt-3 text-sm text-red-700">{reviewTasksError}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleReviewResults.map((task) => {
                const meta = businessReviewStatusMeta[task.status];
                return (
                  <article key={task.id} className="flex flex-col gap-3 rounded-lg border border-background-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground-900">{task.candidate.name_masked}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground-500">{task.demand.job_title} · 业务负责人：{task.reviewer_name || '未显示'}</p>
                      {task.business_note && <p className="mt-1 text-xs text-foreground-700">业务备注：{task.business_note}</p>}
                    </div>
                    <div className="shrink-0">{renderReviewAction(task)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1 border-b border-background-200" role="tablist" aria-label="候选人库范围">
          {([
            ['all', '全部候选人'],
            ['in_pipeline', '招聘流程中'],
            ['talent_pool', '公司人才库'],
            ['favorite', '我的收藏'],
          ] as const).map(([scope, label]) => (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={libraryScope === scope}
              onClick={() => selectLibraryScope(scope)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${libraryScope === scope ? 'border-primary-500 text-primary-700' : 'border-transparent text-foreground-500 hover:text-foreground-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400" size={16} aria-hidden="true" />
              <span className="sr-only">搜索候选人</span>
              <input
                type="search"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="搜索姓名、联系方式、公司、学校或简历内容"
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
        </div>

        <div className="grid gap-2 border-y border-background-200 bg-background-50 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">意向城市</span>
            <input
              list="candidate-city-options"
              value={cityFilter}
              onChange={(event) => changeFilter(() => setCityFilter(event.target.value))}
              placeholder="全部城市或输入城市"
              className={filterControlClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">学历</span>
            <select value={educationFilter} onChange={(event) => changeFilter(() => setEducationFilter(event.target.value))} className={filterControlClass}>
              <option value="">全部学历</option>
              {educationOptions.map((education) => <option key={education} value={education}>{education}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">技能关键词</span>
            <input value={skillFilter} onChange={(event) => changeFilter(() => setSkillFilter(event.target.value))} placeholder="如 Java、Python" className={filterControlClass} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">来源渠道</span>
            <input
              list="candidate-source-options"
              value={sourceFilter}
              onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))}
              placeholder="全部来源或输入渠道"
              className={filterControlClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">解析状态</span>
            <select
              value={parseStatusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === '' || isParseStatus(nextStatus)) changeFilter(() => setParseStatusFilter(nextStatus));
              }}
              className={filterControlClass}
            >
              <option value="">全部状态</option>
              {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">流程状态</span>
            <select
              value={pipelineStatusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === '' || isPipelineStatus(nextStatus)) changeFilter(() => setPipelineStatusFilter(nextStatus));
              }}
              className={filterControlClass}
            >
              <option value="">全部流程状态</option>
              <option value="not_in_pipeline">未进入流程</option>
              <option value="in_pipeline">已进入流程</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">招聘阶段</span>
            <select
              value={stageFilter}
              onChange={(event) => {
                const nextStage = event.target.value;
                if (nextStage === '' || isCandidateStage(nextStage)) changeFilter(() => setStageFilter(nextStage));
              }}
              className={filterControlClass}
            >
              <option value="">全部阶段</option>
              {candidateStageOptions.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">最低技能分</span>
            <select value={scoreFilter} onChange={(event) => changeFilter(() => setScoreFilter(event.target.value))} className={filterControlClass}>
              <option value="0">全部分数</option>
              <option value="3">3 分及以上</option>
              <option value="4">4 分及以上</option>
              <option value="5">5 分</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-foreground-500">排序方式</span>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(event) => {
                const [nextSortBy, nextSortOrder] = event.target.value.split(':');
                if (
                  (nextSortBy === 'created_at' || nextSortBy === 'name_masked')
                  && (nextSortOrder === 'asc' || nextSortOrder === 'desc')
                ) {
                  changeFilter(() => {
                    setSortBy(nextSortBy);
                    setSortOrder(nextSortOrder);
                  });
                }
              }}
              className={filterControlClass}
            >
              <option value="created_at:desc">最近入库</option>
              <option value="created_at:asc">最早入库</option>
              <option value="name_masked:asc">候选人名称升序</option>
              <option value="name_masked:desc">候选人名称降序</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetCandidateFilters}
              disabled={!hasActiveFilters}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-600 hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" />
              重置筛选
            </button>
          </div>
          <datalist id="candidate-city-options">
            {cityOptions.map((city) => <option key={city} value={city} />)}
          </datalist>
          <datalist id="candidate-source-options">
            {sourceFilterOptions.map((source) => <option key={source} value={source} />)}
          </datalist>
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
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm font-medium text-foreground-600 hover:text-foreground-900">取消选择</button>
            <button
              type="button"
              onClick={() => void updateFavorites(selectedCandidates, !selectedAllFavorite)}
              disabled={favoriteSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
            >
              <Star size={15} fill={selectedAllFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
              {selectedAllFavorite ? '取消收藏' : '批量收藏'}
            </button>
            <button
              type="button"
              onClick={() => openPipelineModal(selectedCandidates)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              <UserPlus size={15} aria-hidden="true" />
              加入招聘流程
            </button>
            {selectedAllInPipeline && selectedAllReviewable && (
              <button
                type="button"
                onClick={() => openPushModal(selectedCandidates)}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-3.5 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
              >
                <Send size={15} aria-hidden="true" />
                推送业务筛选
              </button>
            )}
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
              {hasActiveFilters ? '当前筛选条件下没有匹配结果' : '导入简历建立公司人才库，再按岗位筛选并加入招聘流程'}
            </p>
            {hasActiveFilters && (
              <button type="button" onClick={resetCandidateFilters} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 px-3 py-2 text-sm font-medium text-foreground-600 hover:bg-background-50">
                <RotateCcw size={14} aria-hidden="true" />
                重置筛选
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1460px] border-collapse text-left">
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
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-identity"
                    label="候选人"
                    open={openColumnFilter === 'identity'}
                    onToggle={() => toggleColumnFilter('identity')}
                  >
                    <input
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="姓名、联系方式或经历"
                      aria-label="按候选人信息筛选"
                      className={filterControlClass}
                    />
                    <select
                      value={sortBy === 'name_masked' ? sortOrder : ''}
                      onChange={(event) => {
                        const nextOrder = event.target.value;
                        if (nextOrder === 'asc' || nextOrder === 'desc') {
                          changeFilter(() => {
                            setSortBy('name_masked');
                            setSortOrder(nextOrder);
                          });
                        }
                      }}
                      aria-label="按候选人名称排序"
                      className={filterControlClass}
                    >
                      <option value="">默认排序</option>
                      <option value="asc">名称升序</option>
                      <option value="desc">名称降序</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-parse"
                    label="解析状态"
                    open={openColumnFilter === 'parse'}
                    onToggle={() => toggleColumnFilter('parse')}
                  >
                    <select
                      value={parseStatusFilter}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === '' || isParseStatus(nextStatus)) changeFilter(() => setParseStatusFilter(nextStatus));
                      }}
                      aria-label="按解析状态筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部解析状态</option>
                      {Object.entries(parseStatusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-profile"
                    label="学历 / 城市"
                    open={openColumnFilter === 'profile'}
                    onToggle={() => toggleColumnFilter('profile')}
                  >
                    <select value={educationFilter} onChange={(event) => changeFilter(() => setEducationFilter(event.target.value))} aria-label="按学历筛选" className={filterControlClass}>
                      <option value="">全部学历</option>
                      {educationOptions.map((education) => <option key={education} value={education}>{education}</option>)}
                    </select>
                    <input
                      list="candidate-city-options"
                      value={cityFilter}
                      onChange={(event) => changeFilter(() => setCityFilter(event.target.value))}
                      placeholder="输入意向城市"
                      aria-label="按意向城市筛选"
                      className={filterControlClass}
                    />
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-skills"
                    label="核心技能"
                    open={openColumnFilter === 'skills'}
                    onToggle={() => toggleColumnFilter('skills')}
                  >
                    <input value={skillFilter} onChange={(event) => changeFilter(() => setSkillFilter(event.target.value))} placeholder="技能关键词" aria-label="按技能关键词筛选" className={filterControlClass} />
                    <select value={scoreFilter} onChange={(event) => changeFilter(() => setScoreFilter(event.target.value))} aria-label="按最低技能分筛选" className={filterControlClass}>
                      <option value="0">全部分数</option>
                      <option value="3">3 分及以上</option>
                      <option value="4">4 分及以上</option>
                      <option value="5">5 分</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-source"
                    label="来源"
                    open={openColumnFilter === 'source'}
                    onToggle={() => toggleColumnFilter('source')}
                  >
                    <input
                      list="candidate-source-options"
                      value={sourceFilter}
                      onChange={(event) => changeFilter(() => setSourceFilter(event.target.value))}
                      placeholder="输入来源渠道"
                      aria-label="按来源渠道筛选"
                      className={filterControlClass}
                    />
                  </CandidateColumnFilterHeader>
                  <th className="min-w-48 px-3 py-3">目标岗位</th>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-stage"
                    label="当前阶段"
                    open={openColumnFilter === 'stage'}
                    onToggle={() => toggleColumnFilter('stage')}
                  >
                    <select
                      value={stageFilter}
                      onChange={(event) => {
                        const nextStage = event.target.value;
                        if (nextStage === '' || isCandidateStage(nextStage)) changeFilter(() => setStageFilter(nextStage));
                      }}
                      aria-label="按招聘阶段筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部阶段</option>
                      {candidateStageOptions.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
                    </select>
                    <select
                      value={pipelineStatusFilter}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === '' || isPipelineStatus(nextStatus)) changeFilter(() => setPipelineStatusFilter(nextStatus));
                      }}
                      aria-label="按流程状态筛选"
                      className={filterControlClass}
                    >
                      <option value="">全部流程状态</option>
                      <option value="not_in_pipeline">未进入流程</option>
                      <option value="in_pipeline">已进入流程</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <CandidateColumnFilterHeader
                    data-ui="candidate-column-filter-created"
                    label="入库日期"
                    open={openColumnFilter === 'created'}
                    onToggle={() => toggleColumnFilter('created')}
                  >
                    <select
                      value={sortBy === 'created_at' ? sortOrder : ''}
                      onChange={(event) => {
                        const nextOrder = event.target.value;
                        if (nextOrder === 'asc' || nextOrder === 'desc') {
                          changeFilter(() => {
                            setSortBy('created_at');
                            setSortOrder(nextOrder);
                          });
                        }
                      }}
                      aria-label="按入库日期排序"
                      className={filterControlClass}
                    >
                      <option value="">默认排序</option>
                      <option value="desc">最近入库</option>
                      <option value="asc">最早入库</option>
                    </select>
                  </CandidateColumnFilterHeader>
                  <th className="w-32 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-background-200">
                {candidateResponse.candidates.map((candidate) => {
                  const status = parseStatusMeta[candidate.parse_status];
                  const targetDemand = candidate.current_demand ?? candidate.latest_demand;
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
                              {candidate.phone_masked || candidate.email_masked || '暂无联系方式'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="max-w-64 px-3 py-3.5 text-sm text-foreground-600">
                        <span className="line-clamp-2">{candidate.education_summary || '—'}</span>
                        {candidate.intent_city && <span className="mt-1 block text-xs text-foreground-400">意向 {candidate.intent_city}</span>}
                      </td>
                      <td className="max-w-64 px-3 py-3.5">
                        {candidate.top_tags?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {candidate.top_tags.slice(0, 3).map((tag) => (
                              <span key={tag.tag} className="inline-flex rounded-md bg-primary-50 px-2 py-1 text-xs text-primary-700">
                                {tag.tag}{tag.score ? ` · ${tag.score}分` : ''}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-sm text-foreground-400">—</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-600">
                        {candidate.source?.channel || '—'}
                      </td>
                      <td className="max-w-56 px-3 py-3.5">
                        {targetDemand ? (
                          <div>
                            <p className="truncate text-sm font-medium text-foreground-800">{targetDemand.job_title}</p>
                            <p className="mt-0.5 truncate text-xs text-foreground-400">
                              {candidate.current_demand ? '当前需求' : '最近需求'} · {targetDemand.request_no || '未编号'}
                            </p>
                          </div>
                        ) : <span className="text-sm text-foreground-400">待匹配岗位</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-600">
                        {candidate.current_stage ? stageLabels[candidate.current_stage] : '—'}
                      </td>
                      <td className="px-3 py-3.5 text-sm text-foreground-500">{formatDate(candidate.created_at)}</td>
                      <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void updateFavorites([candidate], !candidate.is_favorite)}
                            disabled={favoriteSaving}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${candidate.is_favorite ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'text-foreground-400 hover:bg-background-100 hover:text-amber-600'}`}
                            aria-label={`${candidate.is_favorite ? '取消收藏' : '收藏'} ${candidate.name_masked}`}
                            title={candidate.is_favorite ? '取消收藏' : '收藏'}
                          >
                            <Star size={16} fill={candidate.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPipelineModal([candidate])}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                            aria-label={`将 ${candidate.name_masked} 加入招聘流程`}
                            title="加入招聘流程"
                          >
                            <UserPlus size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openCandidateDetail(candidate)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
                            aria-label={`查看 ${candidate.name_masked} 简历`}
                            title="查看简历"
                          >
                            <Eye size={16} aria-hidden="true" />
                          </button>
                          {candidate.current_demand_id && canEnterBusinessReview(candidate.current_stage) && (
                            <button
                              type="button"
                              onClick={() => openPushModal([candidate])}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                              aria-label={`推送 ${candidate.name_masked} 进行业务筛选`}
                              title="推送业务筛选"
                            >
                              <Send size={16} aria-hidden="true" />
                            </button>
                          )}
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
                <p className="mt-1 text-sm text-foreground-500">可先存入公司人才库，也可在入库时关联招聘需求</p>
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
                <label htmlFor="upload-demand" className="mb-2 block text-xs font-medium text-foreground-600">入库后关联需求（选填）</label>
                <select
                  id="upload-demand"
                  value={uploadDemandId}
                  onChange={(event) => setUploadDemandId(event.target.value ? Number(event.target.value) : '')}
                  disabled={uploadSubmitting || demandsLoading}
                  className="w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-background-50"
                >
                  <option value="">暂不关联，先存公司人才库</option>
                  {activeDemands.map((demand) => (
                    <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title} · {demand.job_department}</option>
                  ))}
                </select>
                {demandsLoading && <p className="mt-1 text-xs text-foreground-400">正在加载可关联的招聘需求</p>}
                {demandError && (
                  <p className="mt-1 text-xs text-amber-700">
                    招聘需求暂时不可用，仍可先入人才库。
                    <button type="button" onClick={() => void loadDemands()} className="ml-1 font-medium hover:text-amber-800">重试</button>
                  </p>
                )}
                {!demandsLoading && !demandError && activeDemands.length === 0 && <p className="mt-1 text-xs text-foreground-400">暂无在招需求，本次简历将保存到公司人才库</p>}
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
                    <p className="text-xs font-medium text-foreground-600">文件处理结果</p>
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
                              {success ? '候选人档案已入库' : (result.reason || `处理状态：${result.status}`)}
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
                disabled={uploadSubmitting || uploadFiles.length === 0}
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
                <p className="mt-1 text-xs text-foreground-500">{detailCandidate.is_favorite ? '已收藏' : '公司候选人档案'} · 入库于 {formatDate(detailCandidate.created_at)}</p>
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
                  {(detailCandidate.current_demand ?? detailCandidate.latest_demand) && (
                    <section className="rounded-lg border border-background-200 bg-background-50 px-4 py-3">
                      <p className="text-xs text-foreground-400">目标岗位</p>
                      <p className="mt-1 text-sm font-semibold text-foreground-900">
                        {(detailCandidate.current_demand ?? detailCandidate.latest_demand)?.job_title}
                      </p>
                      <p className="mt-1 text-xs text-foreground-500">
                        {detailCandidate.current_demand ? '当前需求' : '最近需求'} · {(detailCandidate.current_demand ?? detailCandidate.latest_demand)?.request_no || '未编号'}
                      </p>
                    </section>
                  )}
                  {detailReview && (
                    <section className="rounded-lg border border-primary-200 bg-primary-50/40 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground-900">业务筛选结果</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${businessReviewStatusMeta[detailReview.status].className}`}>
                              {businessReviewStatusMeta[detailReview.status].label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-foreground-500">
                            {detailReview.demand.job_title} · 业务负责人：{detailReview.reviewer_name || '未显示'}
                          </p>
                          {detailReview.business_note && (
                            <p className="mt-2 text-sm text-foreground-700">业务备注：{detailReview.business_note}</p>
                          )}
                        </div>
                        <div className="shrink-0">{renderReviewAction(detailReview)}</div>
                      </div>
                    </section>
                  )}

                  <section className="grid grid-cols-2 gap-3 border-b border-background-200 pb-5 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-foreground-400">解析状态</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{parseStatusMeta[resumeDetail.parse_status].label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-400">HR 负责人</p>
                      <p className="mt-1 text-sm font-medium text-foreground-800">{resumeDetail.owner_hr_id ? '已分配' : '待分配'}</p>
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
                    <StructuredResumeView resume={resumeDetail.resume_json} />
                  </section>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-background-200 bg-background-50 px-5 py-4 sm:px-6">
              <button type="button" onClick={closeCandidateDetail} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 hover:bg-background-100">关闭</button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPipelineModal([detailCandidate])}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50"
                >
                  <UserPlus size={15} aria-hidden="true" />
                  加入招聘流程
                </button>
                {detailCandidate.current_demand_id && canEnterBusinessReview(detailCandidate.current_stage) && (
                  <button
                    type="button"
                    onClick={() => openPushModal([detailCandidate])}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                  >
                    <Send size={15} aria-hidden="true" />
                    推送业务筛选
                  </button>
                )}
              </div>
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
          initialReviewerId={pushInitialReviewerId}
          demandsLoading={demandsLoading}
          demandError={demandError}
          reviewersLoading={reviewersLoading}
          reviewerError={reviewerError}
          isSubmitting={pushSubmitting}
          results={pushResults}
          onRetryDemands={() => void loadDemands()}
          onRetryReviewers={() => void loadReviewers()}
          onClose={() => { setPushTargets(null); setPushResults([]); setPushInitialReviewerId(null); }}
          onPush={(value) => void handlePushToBusiness(value)}
        />
      )}

      {pipelineTargets && (
        <AddToPipelineModal
          candidates={pipelineTargets}
          demands={activeDemands}
          initialDemandId={demandFilter || null}
          demandsLoading={demandsLoading}
          demandError={demandError}
          submitting={pipelineSubmitting}
          result={pipelineResult}
          onRetryDemands={() => void loadDemands()}
          onClose={() => { setPipelineTargets(null); setPipelineResult(null); }}
          onAdd={(demandId, reason) => void handleAddToPipeline(demandId, reason)}
        />
      )}

      {duplicatesOpen && (
        <DuplicateCandidatesModal
          onClose={() => setDuplicatesOpen(false)}
          onMerged={() => {
            showToast('重复候选人档案已合并');
            void loadCandidates();
          }}
        />
      )}
    </div>
  );
}
