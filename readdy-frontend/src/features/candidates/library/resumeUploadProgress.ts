import type {
  CandidateListItem,
  ResumeUploadResponse,
} from '@/features/candidates/types';

export const RESUME_PARSE_TIMEOUT_MS = 120_000;

export async function refreshCandidatesAfterUpload(
  loadCandidates: () => Promise<unknown>,
): Promise<void> {
  try {
    await loadCandidates();
  } catch {
    // The upload result is already authoritative. A temporary list refresh
    // failure must not be presented as an upload failure.
  }
}

export function reconcileResumeUploadProgress(
  response: ResumeUploadResponse,
  candidates: CandidateListItem[],
): ResumeUploadResponse {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  let changed = false;

  const results = response.results.map((result) => {
    if (result.status !== 'processing' || !result.candidate_id) return result;

    const candidate = candidatesById.get(result.candidate_id);
    if (!candidate) return result;

    if (candidate.parse_status === 'ok') {
      changed = true;
      return {
        ...result,
        status: 'ok' as const,
        reason: '简历解析成功',
        name_masked: candidate.name_masked,
      };
    }

    if (candidate.parse_status === 'failed' || candidate.parse_status === 'original_confirmed') {
      changed = true;
      const reason = candidate.parse_error || 'AI 未能识别该简历，请确认原文件或手动补录';
      return {
        ...result,
        status: 'needs_confirmation' as const,
        reason,
        parse_error: candidate.parse_error || undefined,
      };
    }

    return result;
  });

  return changed ? { ...response, results } : response;
}

interface ResumeDetailStatus {
  parse_status: string;
  parse_error?: string | null;
  name_masked?: string;
}

export function reconcileResumeUploadProgressFromDetail(
  response: ResumeUploadResponse,
  details: Record<number, ResumeDetailStatus>,
): ResumeUploadResponse {
  let changed = false;

  const results = response.results.map((result) => {
    if (result.status !== 'processing' || !result.candidate_id) return result;
    const detail = details[result.candidate_id];
    if (!detail) return result;

    if (detail.parse_status === 'ok') {
      changed = true;
      return {
        ...result,
        status: 'ok' as const,
        reason: '简历解析成功',
        name_masked: detail.name_masked,
      };
    }

    if (detail.parse_status === 'failed' || detail.parse_status === 'original_confirmed') {
      changed = true;
      const reason = detail.parse_error || 'AI 未能识别该简历，请确认原文件或手动补录';
      return {
        ...result,
        status: 'needs_confirmation' as const,
        reason,
        parse_error: detail.parse_error || undefined,
      };
    }

    return result;
  });

  return changed ? { ...response, results } : response;
}

export function timeoutResumeUploadProgress(
  response: ResumeUploadResponse,
  startedAt: number,
): ResumeUploadResponse {
  if (Date.now() - startedAt < RESUME_PARSE_TIMEOUT_MS) return response;

  let changed = false;
  const results = response.results.map((result) => {
    if (result.status !== 'processing') return result;
    changed = true;
    return {
      ...result,
      status: 'needs_confirmation' as const,
      reason: '解析超时，请稍后查看候选人详情或手动补录',
      parse_error: '解析超时',
    };
  });

  return changed ? { ...response, results } : response;
}
