import type { CandidateDetail as SharedCandidateDetail } from '../../types';

export type {
  CandidateDetail,
  CandidateJourney,
  CandidateListItem,
  CandidateListResponse,
  CandidatePipelines,
  CandidateSourceInfo,
  CandidateTag,
  CandidateListQuery,
  MatchResultItem,
  ResumeJson,
  ParseStatus,
  RetryParseResponse,
} from '../../types';

export interface OriginalResumeInfo {
  available: boolean;
  filename: string | null;
  mime_type: string | null;
  preview_url: string;
  download_url: string;
}

export interface CandidateProfileDetail extends SharedCandidateDetail {
  original_resume: OriginalResumeInfo;
}

export interface OriginalResumeBlob {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export type CandidateResumeTab = 'original' | 'structured' | 'match';
