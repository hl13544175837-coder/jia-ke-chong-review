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
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
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
import CandidateJourneySummary from '@/components/candidates/CandidateJourneySummary';
import PageHeader from '@/components/ui/PageHeader';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import ActionButton from '@/components/ui/ActionButton';
import DetailActionBar from '@/components/ui/DetailActionBar';
import CandidateDetailWorkspace from '@/features/candidates/components/CandidateDetailWorkspace';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  CandidatePipelineAddResult,
  CandidateStage,
  PipelineState,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { candidateBusinessAction } from '@/features/businessReviews/actions';
import type { BusinessReviewStatus, BusinessReviewTask } from '@/features/businessReviews/types';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/lib/api';
import PushToReviewerModal, {
  type PushFormValue,
  type PushResultItem,
  type PushTarget,
} from '@/features/businessReviews/components/PushToReviewerModal';
import { canEnterBusinessReview, isActionableBusinessReviewResult } from '@/features/businessReviews/stages';
import AddToPipelineModal from '@/features/candidates/components/AddToPipelineModal';
import CandidateDetailDrawer from '@/features/candidates/components/CandidateDetailDrawer';
import CandidateUploadModal from '@/features/candidates/components/CandidateUploadModal';
import DuplicateCandidatesModal from '@/features/candidates/components/DuplicateCandidatesModal';
import ResumeRecoveryPanel from '@/features/candidates/components/ResumeRecoveryPanel';
import CandidateColumnFilterHeader from '@/features/candidates/components/library/CandidateColumnFilterHeader';
import {
  belongsToSourceFile,
  activeCandidateStageOptions,
  candidateFromReviewTask,
  candidateResumeReady,
  candidateScopeTabs,
  candidateStageFromNavigation,
  candidateStageOptions,
  errorMessage,
  formatDate,
  isBusinessReviewer,
  isCandidateStage,
  isParseStatus,
  isPipelineStateFilter,
} from '@/features/candidates/library';
import { useCandidateLibraryFilters } from '@/features/candidates/library/useCandidateLibraryFilters';
import { useCandidateLibraryData } from '@/features/candidates/library/useCandidateLibraryData';
import { useCandidateDetail } from '@/features/candidates/library/useCandidateDetail';
import { buildCandidateLibraryViewModel } from '@/features/candidates/library/candidateLibraryViewModel';

const supportedResumePattern = /\.(pdf|doc|docx|jpe?g|png|webp|gif|zip)$/i;
const supportedReplacementPattern = /\.(pdf|docx|jpe?g|png|webp|gif)$/i;
const supportedResumeAccept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.zip,image/jpeg,image/png,image/webp,image/gif,application/zip';

type ResumeUploadResult = ResumeUploadResponse['results'][number];
type UploadRowAction = 'keeping' | 'replacing' | 'replaced' | 'retrying' | 'retry_failed';

const parseStatusMeta = {
  pending: { label: '待解析', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  processing: { label: '解析中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  ok: { label: '已解析', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '待确认', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  original_confirmed: { label: '原件已确认', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
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

const pipelineStateMeta: Record<PipelineState, { label: string; className: string }> = {
  in_pipeline: { label: '招聘流程中', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  never_entered: { label: '未进入流程', className: 'border-background-300 bg-background-50 text-foreground-600' },
  rejected: { label: '已淘汰', className: 'border-red-200 bg-red-50 text-red-700' },
  onboarded: { label: '已入职', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  transferred: { label: '已转出', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const sourceChannels = ['BOSS直聘', '58同城', '猎聘', '鱼泡直聘', '智联招聘', '前程无忧', '内推', '官网', 'LinkedIn'];
const sourceFilterOptions = [...sourceChannels, '其他'];
const educationOptions = ['博士', '硕士', '本科', '大专', '高中', '中专'];
const cityOptions = ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '苏州', '西安', '长沙', '重庆', '天津', '厦门', '合肥', '郑州', '青岛', '宁波', '佛山'];
const businessReviewStatusMeta: Record<BusinessReviewStatus, { label: string; className: string }> = {
  pending: { label: '等待业务负责人', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  approved: { label: '已通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '不合适', className: 'border-red-200 bg-red-50 text-red-700' },
  needs_info: { label: '待 HR 补充', className: 'border-sky-200 bg-sky-50 text-sky-700' },
};

const filterControlClass = 'h-9 w-full rounded-lg border border-background-300 bg-white px-2.5 text-xs text-foreground-800 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100';

export function useCandidateLibraryController() {
  const { role } = useProductRole();
  const { showToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const filters = useCandidateLibraryFilters({ clearSelection: () => setSelectedIds(new Set()) });
  const {
    navigate,
    requestedDemandId,
    requestedCandidateId,
    requestedDetailTab,
    navState,
    workflowSourceQuery,
    demandFilter,
    setDemandFilter,
    cityFilter,
    educationFilter,
    sourceFilter,
    parseStatusFilter,
    pipelineStateFilter,
    createdFrom,
    createdTo,
    libraryScope,
    stageFilter,
    sortBy,
    sortOrder,
    page,
    hideLocalDemoRecords,
    deferredSearch,
    openCandidateInUrl,
    consumeNavigationState,
  } = filters;
  const data = useCandidateLibraryData(filters, setSelectedIds);
  const {
    candidateResponse,
    candidatesLoading,
    candidatesError,
    demands,
    demandsLoading,
    demandError,
    reviewers,
    reviewersLoading,
    reviewerError,
    reviewTasks,
    reviewTasksLoading,
    reviewTasksError,
    interviewRows,
    interviewRowsError,
    activeDemands,
    pushDemandOptions,
    loadCandidates,
    loadDemands,
    loadReviewers,
    loadReviewTasks,
  } = data;

  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [pipelineTargets, setPipelineTargets] = useState<CandidateListItem[] | null>(null);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<CandidatePipelineAddResult | null>(null);
  const [transferCandidate, setTransferCandidate] = useState<CandidateListItem | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(Boolean(navState?.openUpload));
  const [uploadDemandId, setUploadDemandId] = useState<number | ''>(navState?.demandId ?? requestedDemandId ?? '');
  const [uploadSourceChannel, setUploadSourceChannel] = useState('');
  const [uploadNote, setUploadNote] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [lastSubmittedFiles, setLastSubmittedFiles] = useState<File[]>([]);
  const [uploadRowActions, setUploadRowActions] = useState<Record<string, UploadRowAction>>({});
  const [uploadResponse, setUploadResponse] = useState<ResumeUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navState?.openUpload) return;
    setUploadOpen(true);
    consumeNavigationState();
  }, [consumeNavigationState, navState?.openUpload]);

  const detail = useCandidateDetail({
    candidates: candidateResponse.candidates,
    candidatesLoading,
    reviewTasks,
    reviewTasksLoading,
    requestedCandidateId,
    requestedDetailTab,
    requestedDemandId,
    demandFilter,
    openCandidateInUrl,
  });
  const {
    detailCandidate,
    setDetailCandidate,
    detailTab,
    setDetailTab,
    detailEditRequested,
    resumeDetail,
    setResumeDetail,
    candidateJourney,
    journeyError,
    detailLoading,
    detailError,
    resumePreviewUrl,
    originalResumeLoading,
    originalResumeError,
    loadCandidateDetail,
    openCandidateDetail,
    visibleReviewResults,
    detailReview,
    closeCandidateDetail,
    previewOriginalResume,
    downloadOriginalResume,
  } = detail;

  const [pushTargets, setPushTargets] = useState<PushTarget[] | null>(null);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushResults, setPushResults] = useState<PushResultItem[]>([]);
  const [pushInitialReviewerId, setPushInitialReviewerId] = useState<number | null>(null);
  const [reassignTask, setReassignTask] = useState<BusinessReviewTask | null>(null);

  const candidateViewModel = useMemo(
    () => buildCandidateLibraryViewModel({
      candidates: candidateResponse.candidates,
      hideLocalDemoRecords,
      selectedIds,
    }),
    [candidateResponse.candidates, hideLocalDemoRecords, selectedIds],
  );
  const {
    visibleCandidates,
    localDemoRecordCount,
    selectedCandidates,
    allVisibleSelected,
    selectedAllFavorite,
    selectedAllInPipeline,
    selectedAllReviewable,
  } = candidateViewModel;

  const toggleCandidate = (candidateId: number) => {
    const candidate = candidateResponse.candidates.find((item) => item.id === candidateId);
    if (!candidate || !candidateResumeReady(candidate)) {
      showToast('简历待确认，处理后才能加入流程');
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const selectableCandidates = visibleCandidates.filter(candidateResumeReady);
    const allVisibleSelected = selectableCandidates.length > 0
      && selectableCandidates.every((candidate) => selectedIds.has(candidate.id));
    setSelectedIds(allVisibleSelected ? new Set() : new Set(selectableCandidates.map((candidate) => candidate.id)));
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
    setLastSubmittedFiles([]);
    setUploadRowActions({});
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
    setUploadRowActions({});
    setLastSubmittedFiles((current) => {
      const files = new Map(current.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]));
      uploadFiles.forEach((file) => files.set(`${file.name}-${file.size}-${file.lastModified}`, file));
      return Array.from(files.values());
    });
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
            return sourceResults.length === 0 || sourceResults.some((result) => !['ok', 'processing', 'duplicate', 'needs_confirmation'].includes(result.status));
          })
          .map((file) => file.name),
      );
      setUploadFiles((current) => current.filter((file) => failedSourceNames.has(file.name)));
      await loadCandidates();

      const successfulCount = uploadResponse.results.filter((result) => result.status === 'ok').length;
      const processingCount = uploadResponse.results.filter((result) => result.status === 'processing').length;
      const duplicateCount = uploadResponse.results.filter((result) => result.status === 'duplicate').length;
      const confirmationCount = uploadResponse.results.filter((result) => result.status === 'needs_confirmation').length;
      if (processingCount > 0) {
        showToast(`已上传 ${processingCount} 份，AI 正在后台解析，完成后列表会自动刷新`);
      } else if (uploadResponse.deduplicated && duplicateCount > 0) {
        showToast('导入失败：系统中已存在重复简历，未重复入库');
      } else if (uploadResponse.deduplicated) {
        showToast('该批文件与近期上传内容重复，已返回原处理结果');
      } else if (successfulCount > 0 && duplicateCount > 0) {
        showToast(`简历已处理：成功 ${successfulCount} 份，重复 ${duplicateCount} 份`);
      } else if (successfulCount > 0 && confirmationCount > 0) {
        showToast(`简历已处理：成功 ${successfulCount} 份，待确认 ${confirmationCount} 份`);
      } else if (successfulCount > 0) {
        showToast(`简历已处理，成功入库 ${successfulCount} 份`);
      } else if (confirmationCount > 0) {
        showToast(`有 ${confirmationCount} 份简历需要确认原件`);
      } else if (duplicateCount > 0) {
        showToast('导入失败：系统中已存在重复简历');
      } else {
        showToast('文件处理已完成，但没有成功解析的简历');
      }
    } catch (error) {
      setUploadError(errorMessage(error, '简历上传失败'));
    } finally {
      setUploadSubmitting(false);
    }
  };

  const openExistingCandidateFromUpload = useCallback((
    result: ResumeUploadResponse['results'][number],
  ) => {
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
    setUploadOpen(false);
    openCandidateDetail(existing);
  }, [candidateResponse.candidates, openCandidateDetail]);

  const openConfirmationCandidateFromUpload = useCallback((
    result: ResumeUploadResponse['results'][number],
  ) => {
    if (!result.candidate_id) return;
    const pending = candidateResponse.candidates.find(
      (candidate) => candidate.id === result.candidate_id,
    ) ?? {
      id: result.candidate_id,
      name_masked: result.file || '待确认候选人',
      owner_hr_id: null,
      is_favorite: false,
      created_at: '',
      parse_status: 'failed' as const,
      tag_count: 0,
      pipeline_state: 'never_entered' as const,
      has_rejected_history: false,
    };
    setUploadOpen(false);
    openCandidateDetail(pending);
  }, [candidateResponse.candidates, openCandidateDetail]);

  const sourceFileForUploadResult = (result: ResumeUploadResult) => (
    lastSubmittedFiles.find((file) => belongsToSourceFile(result.file, file.name))
    ?? uploadFiles.find((file) => belongsToSourceFile(result.file, file.name))
    ?? null
  );

  const keepExistingResumeVersion = (result: ResumeUploadResult) => {
    setUploadRowActions((current) => ({ ...current, [result.file]: 'keeping' }));
  };

  const replaceDuplicateAsCurrentVersion = async (result: ResumeUploadResult) => {
    const file = sourceFileForUploadResult(result);
    if (!result.existing_candidate_id || !file || !supportedReplacementPattern.test(file.name)) {
      setUploadError('该文件来自压缩包或原文件已不可用，请进入已有候选人详情后更换简历');
      return;
    }
    if (!window.confirm('将把这份文件设为候选人的当前简历，现有简历会自动归档为历史版本。确认继续吗？')) return;
    setUploadRowActions((current) => ({ ...current, [result.file]: 'replacing' }));
    setUploadError(null);
    try {
      await candidatesApi.replaceResume(result.existing_candidate_id, file);
      setUploadRowActions((current) => ({ ...current, [result.file]: 'replaced' }));
      showToast('新版简历已启用，旧版已保留在历史版本中');
      await loadCandidates();
    } catch (error) {
      setUploadRowActions((current) => ({ ...current, [result.file]: 'retry_failed' }));
      setUploadError(errorMessage(error, '设为新版简历失败'));
    }
  };

  const retrySingleUploadFile = async (result: ResumeUploadResult) => {
    const file = sourceFileForUploadResult(result);
    if (!file) {
      setUploadError('原文件已不可用，请重新选择该文件');
      return;
    }
    setUploadRowActions((current) => ({ ...current, [result.file]: 'retrying' }));
    setUploadError(null);
    try {
      const response = await candidatesApi.uploadResumes([file], {
        target_demand_id: uploadDemandId || undefined,
        source_channel: uploadSourceChannel || undefined,
        source_note: uploadNote.trim() || undefined,
      });
      setUploadResponse((current) => current ? {
        ...current,
        results: [
          ...current.results.filter((item) => !belongsToSourceFile(item.file, file.name)),
          ...response.results,
        ],
      } : response);
      const stillFailed = response.results.some((item) => !['ok', 'processing', 'duplicate', 'needs_confirmation'].includes(item.status));
      setUploadFiles((current) => stillFailed ? current : current.filter((item) => item !== file));
      setUploadRowActions((current) => {
        const next = { ...current };
        delete next[result.file];
        return next;
      });
      await loadCandidates();
      showToast(stillFailed ? '该文件仍未处理成功，请查看失败原因' : '该文件已重新处理');
    } catch (error) {
      setUploadRowActions((current) => ({ ...current, [result.file]: 'retry_failed' }));
      setUploadError(errorMessage(error, '单个文件重试失败'));
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
    setReassignTask(null);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const openReassignModal = (task: BusinessReviewTask) => {
    const candidate = candidateFromReviewTask(task);
    setDemandFilter(task.demand_id);
    setPushTargets([{
      candidateId: candidate.id,
      candidateName: candidate.name_masked,
      currentDemandId: task.demand_id,
      currentStage: stageLabels[candidate.current_stage || 'business_review'],
      currentStageCode: candidate.current_stage || 'business_review',
    }]);
    setPushResults([]);
    setPushInitialReviewerId(task.reviewer_id);
    setReassignTask(task);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const repeatBusinessReview = (task: BusinessReviewTask) => {
    setDemandFilter(task.demand_id);
    openPushModal([candidateFromReviewTask(task)], task.reviewer_id);
  };

  const renderReviewAction = (task: BusinessReviewTask) => {
    if (task.status === 'approved') {
      if (task.candidate.current_stage === 'offer') {
        return (
          <button
            type="button"
            onClick={() => navigate(`/offers?demand=${task.demand_id}&candidate=${task.candidate_id}${workflowSourceQuery}`)}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            查看 Offer
          </button>
        );
      }
      if (task.candidate.current_stage === 'onboarded') {
        return <span className="text-xs font-medium text-emerald-700">已入职，流程已完成</span>;
      }
      if (task.candidate.current_stage === 'rejected') {
        return <span className="text-xs font-medium text-red-700">已淘汰，流程已结束</span>;
      }
      if (task.candidate.current_stage === 'transferred') {
        return <span className="text-xs font-medium text-foreground-600">已转至其他招聘需求</span>;
      }
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
          onClick={() => navigate(`/interviews?demand=${task.demand_id}&candidate=${task.candidate_id}${workflowSourceQuery}`)}
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

  const handleAddToPipeline = async (demandId: number, reason: string, pushAfterAdd: boolean) => {
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
      const successfulCount = result.added + result.reactivated;
      if (pushAfterAdd && successfulCount > 0) {
        const failedIds = new Set(result.failures.map((item) => item.candidate_id));
        const successful = pipelineTargets
          .filter((candidate) => !failedIds.has(candidate.id))
          .slice(0, successfulCount)
          .map((candidate) => ({
            ...candidate,
            current_demand_id: demandId,
            current_stage: 'pending' as const,
          }));
        setPipelineTargets(null);
        setPipelineResult(null);
        setDemandFilter(demandId);
        openPushModal(successful);
      }
    } catch (error) {
      showToast(errorMessage(error, '加入招聘流程失败'));
    } finally {
      setPipelineSubmitting(false);
    }
  };

  const openTransferModal = (candidate: CandidateListItem) => {
    if (!candidate.current_demand_id) return;
    setTransferError('');
    setTransferCandidate(candidate);
  };

  const handleTransferCandidate = async (targetDemandId: number, reason: string) => {
    if (!transferCandidate?.current_demand_id || transferSubmitting) return;
    setTransferSubmitting(true);
    setTransferError('');
    try {
      await candidatesApi.transferToDemand(
        transferCandidate.id,
        transferCandidate.current_demand_id,
        targetDemandId,
        reason,
      );
      showToast(`${transferCandidate.name_masked}已转到新的招聘需求`);
      setTransferCandidate(null);
      await loadCandidates();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await Promise.all([loadCandidates(), loadDemands()]);
        setTransferError('数据已变化，已刷新候选人和需求状态，请核对后再操作');
      } else {
        setTransferError(errorMessage(error, '转移招聘需求失败'));
      }
    } finally {
      setTransferSubmitting(false);
    }
  };

  const openCandidatePipeline = (candidate: CandidateListItem) => {
    if (!candidate.current_demand_id) return;
    navigate(`/kanban?demand=${candidate.current_demand_id}&candidate=${candidate.id}${workflowSourceQuery}`);
  };

  const handlePushToBusiness = async (value: PushFormValue) => {
    if (!pushTargets || pushSubmitting) return;
    setPushSubmitting(true);
    setPushResults([]);
    const results: PushResultItem[] = [];

    if (reassignTask) {
      const target = pushTargets[0];
      try {
        const task = await businessReviewsApi.reassignTask(reassignTask.id, value.reviewerId);
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'created',
          message: task.unchanged ? '接收人没有变化' : `已改派给 ${task.reviewer_name || '新业务筛选人'}`,
        });
        await loadReviewTasks();
        showToast(task.unchanged ? '业务筛选人没有变化' : `已改派给 ${task.reviewer_name || '新业务筛选人'}`);
      } catch (error) {
        results.push({
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '改派失败'),
        });
      } finally {
        setPushResults(results);
        setPushSubmitting(false);
      }
      return;
    }

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
  const renderCandidateBusinessAction = (candidate: CandidateListItem, compact = false) => {
    if (!candidateResumeReady(candidate)) {
      return <span className="text-xs font-medium text-amber-700">简历待确认，处理后才能加入流程</span>;
    }
    const demandId = candidate.current_demand_id;
    const candidateTasks = reviewTasks.filter((task) => (
      task.candidate_id === candidate.id
      && (!demandId || task.demand_id === demandId)
    ));
    const pendingTask = candidateTasks.find((task) => task.status === 'pending') ?? null;
    const latestTask = candidateTasks[0] ?? null;
    const action = candidateBusinessAction({
      currentDemandId: demandId,
      currentStage: candidate.current_stage,
      pendingTask,
      latestTask,
    });
    const primaryClass = compact
      ? 'inline-flex min-h-8 items-center justify-center rounded-lg bg-primary-500 px-2.5 text-xs font-medium text-white hover:bg-primary-600'
      : 'inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600';
    const secondaryClass = compact
      ? 'inline-flex min-h-8 items-center justify-center rounded-lg border border-primary-200 bg-white px-2.5 text-xs font-medium text-primary-700 hover:bg-primary-50'
      : 'inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50';

    if (action.kind === 'join_and_push') {
      return <button type="button" onClick={() => openPipelineModal([candidate])} className={primaryClass}><UserPlus size={14} aria-hidden="true" />{action.label}</button>;
    }
    if (action.kind === 'push') {
      return <button type="button" onClick={() => openPushModal([candidate])} className={primaryClass}><Send size={14} aria-hidden="true" />{action.label}</button>;
    }
    if (action.kind === 'waiting' && pendingTask) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-xs font-medium text-amber-700">{action.label}</span>
          <button type="button" onClick={() => openReassignModal(pendingTask)} className={secondaryClass}>改派筛选人</button>
        </div>
      );
    }
    if (action.kind === 'schedule_interview' && demandId) {
      return <button type="button" aria-label="安排正式面试" onClick={() => navigate(`/interviews?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={primaryClass}>{action.label}</button>;
    }
    if (action.kind === 'needs_info' && latestTask) {
      return <button type="button" onClick={() => repeatBusinessReview(latestTask)} className={primaryClass}>{action.label}</button>;
    }
    if (action.kind === 'rejected' && demandId) {
      return <button type="button" onClick={() => navigate(`/kanban?demand=${demandId}&candidate=${candidate.id}&target=rejected`)} className={secondaryClass}>{action.label}</button>;
    }
    if (action.kind === 'later_stage' && demandId && candidate.current_stage === 'interview') {
      return <button type="button" onClick={() => navigate(`/interviews?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={secondaryClass}>{action.label}</button>;
    }
    if (action.kind === 'later_stage' && demandId && candidate.current_stage === 'offer') {
      return <button type="button" onClick={() => navigate(`/offers?demand=${demandId}&candidate=${candidate.id}${workflowSourceQuery}`)} className={secondaryClass}>{action.label}</button>;
    }
    return <span className="text-xs font-medium text-foreground-500">{action.label}</span>;
  };


  return {
    ...filters,
    AlertCircle,
    ArrowLeft,
    BriefcaseBusiness,
    CheckCircle2,
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
    X,
    StructuredResumeView,
    CandidateJourneySummary,
    PageHeader,
    WorkspaceTabs,
    ActionButton,
    DetailActionBar,
    CandidateDetailWorkspace,
    PushToReviewerModal,
    AddToPipelineModal,
    CandidateDetailDrawer,
    CandidateUploadModal,
    DuplicateCandidatesModal,
    ResumeRecoveryPanel,
    candidateResumeReady,
    candidateScopeTabs,
    candidateStageOptions,
    activeCandidateStageOptions,
    formatDate,
    isCandidateStage,
    isParseStatus,
    isPipelineStateFilter,
    supportedReplacementPattern,
    supportedResumeAccept,
    parseStatusMeta,
    stageLabels,
    pipelineStateMeta,
    sourceChannels,
    sourceFilterOptions,
    educationOptions,
    cityOptions,
    businessReviewStatusMeta,
    filterControlClass,
    CandidateColumnFilterHeader,
    role,
    showToast,
    candidateResponse,
    candidatesLoading,
    candidatesError,
    demands,
    demandsLoading,
    demandError,
    reviewers,
    reviewersLoading,
    reviewerError,
    reviewTasksError,
    selectedIds,
    setSelectedIds,
    favoriteSaving,
    pipelineTargets,
    setPipelineTargets,
    pipelineSubmitting,
    pipelineResult,
    setPipelineResult,
    transferCandidate,
    setTransferCandidate,
    transferSubmitting,
    transferError,
    duplicatesOpen,
    setDuplicatesOpen,
    uploadOpen,
    setUploadOpen,
    uploadDemandId,
    setUploadDemandId,
    uploadSourceChannel,
    setUploadSourceChannel,
    uploadNote,
    setUploadNote,
    uploadFiles,
    setUploadFiles,
    uploadRowActions,
    uploadResponse,
    uploadError,
    uploadSubmitting,
    uploadDragOver,
    setUploadDragOver,
    uploadInputRef,
    detailCandidate,
    setDetailCandidate,
    detailTab,
    setDetailTab,
    detailEditRequested,
    resumeDetail,
    setResumeDetail,
    candidateJourney,
    journeyError,
    detailLoading,
    detailError,
    resumePreviewUrl,
    originalResumeLoading,
    originalResumeError,
    pushTargets,
    setPushTargets,
    pushSubmitting,
    pushResults,
    setPushResults,
    pushInitialReviewerId,
    setPushInitialReviewerId,
    reassignTask,
    setReassignTask,
    activeDemands,
    pushDemandOptions,
    visibleCandidates,
    localDemoRecordCount,
    selectedCandidates,
    loadCandidates,
    loadDemands,
    loadReviewers,
    loadReviewTasks,
    toggleCandidate,
    toggleAllVisible,
    openUploadDialog,
    handleUploadFileSelect,
    handleUploadDrop,
    submitUpload,
    loadCandidateDetail,
    openCandidateDetail,
    openExistingCandidateFromUpload,
    openConfirmationCandidateFromUpload,
    sourceFileForUploadResult,
    keepExistingResumeVersion,
    replaceDuplicateAsCurrentVersion,
    retrySingleUploadFile,
    visibleReviewResults,
    detailReview,
    closeCandidateDetail,
    previewOriginalResume,
    downloadOriginalResume,
    openPushModal,
    renderReviewAction,
    updateFavorites,
    openPipelineModal,
    handleAddToPipeline,
    openTransferModal,
    handleTransferCandidate,
    openCandidatePipeline,
    handlePushToBusiness,
    initialPushDemandId,
    allVisibleSelected,
    selectedAllFavorite,
    selectedAllInPipeline,
    selectedAllReviewable,
    renderCandidateBusinessAction,
  } as const;
}

export type CandidateLibraryController = ReturnType<typeof useCandidateLibraryController>;
