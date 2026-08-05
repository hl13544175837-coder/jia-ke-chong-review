import { Download, Eye, LoaderCircle, X } from 'lucide-react';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import DetailDrawerShell from '@/components/ui/DetailDrawerShell';
import DetailActionBar from '@/components/ui/DetailActionBar';
import ActionButton from '@/components/ui/ActionButton';
import CandidateDetailWorkspace from '@/features/candidates/components/CandidateDetailWorkspace';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import CandidateFeedbackTimeline from '@/features/candidates/components/CandidateFeedbackTimeline';
import ResumeRecoveryPanel from '@/features/candidates/components/ResumeRecoveryPanel';
import type {
  CandidateJourney,
  CandidateListItem,
  CandidateMatchResult,
  CandidateResumeDetail,
} from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';

interface DemandCandidateResumeDetailProps {
  candidate: CandidateListItem;
  demand: RecruitmentDemand;
  match?: CandidateMatchResult;
  tab: CandidateDetailTab;
  onTabChange: (tab: CandidateDetailTab) => void;
  detail: CandidateResumeDetail | null;
  journey: CandidateJourney | null;
  loading: boolean;
  error: string;
  journeyLoading: boolean;
  journeyError: string;
  fileAction: 'preview' | 'download' | null;
  fileError: string;
  onDetailUpdated: (detail: CandidateResumeDetail) => void;
  onPreview: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export default function DemandCandidateResumeDetail({
  candidate,
  demand,
  match,
  tab,
  onTabChange,
  detail,
  journey,
  loading,
  error,
  journeyLoading,
  journeyError,
  fileAction,
  fileError,
  onDetailUpdated,
  onPreview,
  onDownload,
  onClose,
}: DemandCandidateResumeDetailProps) {
  return (
    <DetailDrawerShell
      ariaLabel={`${candidate.name_masked}候选人详情`}
      closeLabel="关闭候选人详情"
      onClose={onClose}
      modal
      backdropClassName="absolute inset-0 z-20 cursor-default bg-foreground-900/30"
      panelClassName="absolute inset-y-0 right-0 z-30 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-background-200 px-6 py-4">
        <div>
          <h3 className="text-lg font-bold text-foreground-900">{candidate.name_masked}</h3>
          <p className="mt-1 text-sm text-foreground-500">
            {demand.job_title} · {demand.request_no || `需求 #${demand.id}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-foreground-500 hover:bg-background-100"
          aria-label="关闭候选人详情"
        >
          <X size={18} />
        </button>
      </div>

      <CandidateDetailWorkspace
        value={tab}
        onChange={onTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'interview' && (
            <div className="space-y-4" role="tabpanel" aria-label="面试信息">
              <dl className="grid grid-cols-2 gap-4 rounded-lg border border-background-200 p-4 text-sm">
                <div>
                  <dt className="text-xs text-foreground-400">招聘需求</dt>
                  <dd className="mt-1 font-medium text-foreground-800">{demand.job_title}</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground-400">当前阶段</dt>
                  <dd className="mt-1 text-foreground-700">
                    {candidate.current_stage || match?.latest_stage || '尚未进入流程'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground-400">部门</dt>
                  <dd className="mt-1 text-foreground-700">
                    {demand.requester_department || demand.job_department || '未填写'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground-400">城市</dt>
                  <dd className="mt-1 text-foreground-700">{demand.job_city || '未填写'}</dd>
                </div>
              </dl>
              <p className="rounded-lg bg-background-50 px-4 py-3 text-sm text-foreground-600">
                面试轮次、时间、面试官和地点会在安排面试后显示在这里。
              </p>
            </div>
          )}

          {tab === 'resume' && (
            <div role="tabpanel" aria-label="候选人简历">
              {loading ? (
                <div className="py-20 text-center text-sm text-foreground-500">
                  <LoaderCircle className="mx-auto mb-2 animate-spin" size={20} />
                  加载完整简历中...
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : detail ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-background-200 bg-background-50 px-4 py-3 text-sm text-foreground-600">
                    <span>
                      {detail.original_resume.available
                        ? `原版文件：${detail.original_resume.filename || '未命名文件'}`
                        : '当前没有原版文件，以下为系统解析信息'}
                    </span>
                    {detail.original_resume.available && (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={onPreview}
                          disabled={fileAction !== null}
                          className="inline-flex items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground-700 disabled:opacity-50"
                        >
                          <Eye size={13} />
                          {fileAction === 'preview' ? '打开中' : '预览原版'}
                        </button>
                        <button
                          type="button"
                          onClick={onDownload}
                          disabled={fileAction !== null}
                          className="inline-flex items-center gap-1 rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground-700 disabled:opacity-50"
                        >
                          <Download size={13} />
                          {fileAction === 'download' ? '下载中' : '下载原版'}
                        </button>
                      </span>
                    )}
                  </div>
                  {fileError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {fileError}
                    </p>
                  )}
                  <ResumeRecoveryPanel detail={detail} onUpdated={onDetailUpdated} />
                  <StructuredResumeView resume={detail.resume_json} />
                </div>
              ) : null}
            </div>
          )}

          {tab === 'feedback' && (
            <div role="tabpanel" aria-label="面试评价">
              <CandidateFeedbackTimeline
                journey={journey}
                loading={journeyLoading}
                error={journeyError}
              />
            </div>
          )}
        </div>
      </CandidateDetailWorkspace>

      <DetailActionBar>
        <ActionButton tone="secondary" onClick={onClose}>关闭</ActionButton>
      </DetailActionBar>
    </DetailDrawerShell>
  );
}
