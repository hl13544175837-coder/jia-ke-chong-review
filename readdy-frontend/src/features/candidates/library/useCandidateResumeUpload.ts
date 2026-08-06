import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { candidatesApi } from '@/features/candidates/api';
import type {
  CandidateListItem,
  ResumeUploadResponse,
} from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import {
  belongsToSourceFile,
  errorMessage,
  supportedReplacementPattern,
  supportedResumePattern,
} from '@/features/candidates/library';
import { reconcileResumeUploadProgress } from '@/features/candidates/library/resumeUploadProgress';

type ResumeUploadResult = ResumeUploadResponse['results'][number];
type UploadRowAction = 'keeping' | 'replacing' | 'replaced' | 'retrying' | 'retry_failed';

interface CandidateResumeUploadOptions {
  initialOpen: boolean;
  initialDemandId: number | '';
  demandFilter: number | '';
  activeDemands: RecruitmentDemand[];
  candidates: CandidateListItem[];
  loadCandidates: () => Promise<unknown>;
  openCandidateDetail: (candidate: CandidateListItem) => void;
  showToast: (message: string) => void;
}

export function useCandidateResumeUpload({
  initialOpen,
  initialDemandId,
  demandFilter,
  activeDemands,
  candidates,
  loadCandidates,
  openCandidateDetail,
  showToast,
}: CandidateResumeUploadOptions) {
  const [uploadOpen, setUploadOpen] = useState(initialOpen);
  const [uploadDemandId, setUploadDemandId] = useState<number | ''>(initialDemandId);
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
    setUploadResponse((current) => (
      current ? reconcileResumeUploadProgress(current, candidates) : current
    ));
  }, [candidates]);

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
      const byFingerprint = new Map(
        current.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]),
      );
      validFiles.forEach((file) => {
        byFingerprint.set(`${file.name}-${file.size}-${file.lastModified}`, file);
      });
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
      const files = new Map(
        current.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file]),
      );
      uploadFiles.forEach((file) => {
        files.set(`${file.name}-${file.size}-${file.lastModified}`, file);
      });
      return Array.from(files.values());
    });
    try {
      const response = await candidatesApi.uploadResumes(uploadFiles, {
        target_demand_id: uploadDemandId || undefined,
        source_channel: uploadSourceChannel || undefined,
        source_note: uploadNote.trim() || undefined,
      });
      setUploadResponse(response);
      const failedSourceNames = new Set(
        uploadFiles
          .filter((sourceFile) => {
            const sourceResults = response.results.filter((result) => (
              belongsToSourceFile(result.file, sourceFile.name)
            ));
            return sourceResults.length === 0 || sourceResults.some((result) => (
              !['ok', 'processing', 'duplicate', 'needs_confirmation'].includes(result.status)
            ));
          })
          .map((file) => file.name),
      );
      setUploadFiles((current) => (
        current.filter((file) => failedSourceNames.has(file.name))
      ));
      await loadCandidates();

      const successfulCount = response.results.filter((result) => result.status === 'ok').length;
      const processingCount = response.results.filter((result) => result.status === 'processing').length;
      const duplicateCount = response.results.filter((result) => result.status === 'duplicate').length;
      const confirmationCount = response.results.filter((result) => result.status === 'needs_confirmation').length;
      if (processingCount > 0) {
        showToast(`已上传 ${processingCount} 份，AI 正在后台解析，完成后列表会自动刷新`);
      } else if (response.deduplicated && duplicateCount > 0) {
        showToast('导入失败：系统中已存在重复简历，未重复入库');
      } else if (response.deduplicated) {
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

  const openExistingCandidateFromUpload = useCallback((result: ResumeUploadResult) => {
    if (!result.existing_candidate_id) return;
    const existing = candidates.find(
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
  }, [candidates, openCandidateDetail]);

  const openConfirmationCandidateFromUpload = useCallback((result: ResumeUploadResult) => {
    if (!result.candidate_id) return;
    const pending = candidates.find(
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
  }, [candidates, openCandidateDetail]);

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
    if (
      !result.existing_candidate_id
      || !file
      || !supportedReplacementPattern.test(file.name)
    ) {
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
          ...current.results.filter((item) => (
            !belongsToSourceFile(item.file, file.name)
          )),
          ...response.results,
        ],
      } : response);
      const stillFailed = response.results.some((item) => (
        !['ok', 'processing', 'duplicate', 'needs_confirmation'].includes(item.status)
      ));
      setUploadFiles((current) => (
        stillFailed ? current : current.filter((item) => item !== file)
      ));
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

  return {
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
    openUploadDialog,
    handleUploadFileSelect,
    handleUploadDrop,
    submitUpload,
    openExistingCandidateFromUpload,
    openConfirmationCandidateFromUpload,
    sourceFileForUploadResult,
    keepExistingResumeVersion,
    replaceDuplicateAsCurrentVersion,
    retrySingleUploadFile,
  } as const;
}
