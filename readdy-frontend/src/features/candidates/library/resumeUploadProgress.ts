import type {
  CandidateListItem,
  ResumeUploadResponse,
} from '@/features/candidates/types';

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
