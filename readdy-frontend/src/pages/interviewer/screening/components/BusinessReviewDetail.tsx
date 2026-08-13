import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquareText,
  UserRound,
} from 'lucide-react';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewDecisionInput, BusinessReviewTask } from '@/features/businessReviews/types';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import CandidateJourneySummary from '@/components/candidates/CandidateJourneySummary';
import { candidateDisplayName } from '@/features/candidates/candidateDisplayName';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateJourney } from '@/features/candidates/types';
import ActionButton from '@/components/ui/ActionButton';
import DetailActionBar from '@/components/ui/DetailActionBar';
import CandidateDetailWorkspace from '@/features/candidates/components/CandidateDetailWorkspace';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';

interface BusinessReviewDetailProps {
  task: BusinessReviewTask;
  onReview?: (decision: BusinessReviewDecisionInput['decision']) => void;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function actionError(error: unknown) {
  return error instanceof Error ? error.message : '原版简历读取失败';
}

export default function BusinessReviewDetail({ task, onReview }: BusinessReviewDetailProps) {
  const candidateName = candidateDisplayName(task.candidate);
  const [activeTab, setActiveTab] = useState<CandidateDetailTab>('interview');
  const [resumeAction, setResumeAction] = useState<'preview' | 'download' | null>(null);
  const [resumeError, setResumeError] = useState('');
  const [journey, setJourney] = useState<CandidateJourney | null>(null);
  const [journeyError, setJourneyError] = useState('');
  const objectUrls = useRef(new Set<string>());
  const revokeTimers = useRef(new Set<number>());

  useEffect(() => () => {
    revokeTimers.current.forEach((timer) => window.clearTimeout(timer));
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    revokeTimers.current.clear();
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setJourney(null);
    setJourneyError('');
    void candidatesApi.getJourney(task.candidate_id, task.demand_id)
      .then((value) => { if (!cancelled) setJourney(value); })
      .catch((error) => { if (!cancelled) setJourneyError(error instanceof Error ? error.message : '完整招聘过程暂不可用'); });
    return () => { cancelled = true; };
  }, [task.candidate_id, task.demand_id]);

  const originalResume = task.candidate.original_resume;
  const focusPoints = task.demand.focus_points ?? [];

  const handleOriginalResume = async (mode: 'preview' | 'download') => {
    if (!originalResume.available || resumeAction) return;
    setResumeAction(mode);
    setResumeError('');
    let objectUrl: string | null = null;

    try {
      const blob = mode === 'preview'
        ? await businessReviewsApi.loadResume(task.candidate_id)
        : await businessReviewsApi.downloadResume(task.candidate_id);
      objectUrl = URL.createObjectURL(blob);
      objectUrls.current.add(objectUrl);

      if (mode === 'preview') {
        const previewWindow = window.open(objectUrl, '_blank');
        if (!previewWindow) {
          URL.revokeObjectURL(objectUrl);
          objectUrls.current.delete(objectUrl);
          objectUrl = null;
          throw new Error('浏览器阻止了新标签页，请允许弹出窗口后重试');
        }
        previewWindow.opener = null;
      } else {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = originalResume.filename || `candidate-${task.candidate_id}-resume`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }

      const delay = mode === 'preview' ? 60_000 : 1_000;
      const urlToRevoke = objectUrl;
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(urlToRevoke);
        objectUrls.current.delete(urlToRevoke);
        revokeTimers.current.delete(timer);
      }, delay);
      revokeTimers.current.add(timer);
      objectUrl = null;
    } catch (error) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrls.current.delete(objectUrl);
      }
      setResumeError(actionError(error));
    } finally {
      setResumeAction(null);
    }
  };

  return (
    <div className="pb-24">
      <section className="border-b border-background-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-lg font-bold text-primary-700">
              {candidateName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-foreground-900">{candidateName}</h2>
              <p className="mt-0.5 text-sm text-foreground-500">
                {task.demand.job_title} · {task.demand.request_no || `需求 #${task.demand_id}`}
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-background-100 pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-foreground-400"><UserRound size={13} /> 推送人</dt>
            <dd className="mt-1 text-foreground-700">{task.created_by_name || '招聘专员'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-foreground-400"><CalendarClock size={13} /> 推送时间</dt>
            <dd className="mt-1 text-foreground-700">{formatDate(task.created_at)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-foreground-400"><CalendarClock size={13} /> 处理截止</dt>
            <dd className="mt-1 text-foreground-700">{formatDate(task.due_at)}</dd>
          </div>
        </dl>
      </section>

      <CandidateDetailWorkspace value={activeTab} onChange={setActiveTab}>

      <div className={activeTab === 'feedback' ? 'block' : 'hidden'} role="tabpanel" aria-label="面试评价">
      <section className="border-b border-background-200 px-5 py-5 sm:px-6">
        {journey ? <CandidateJourneySummary journey={journey} interviewOnly /> : journeyError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{journeyError}</div>
        ) : (
          <div className="rounded-lg bg-background-50 px-3 py-3 text-xs text-foreground-500">正在加载完整招聘过程...</div>
        )}
      </section>
      </div>

      <div className={activeTab === 'interview' ? 'block' : 'hidden'} role="tabpanel" aria-label="面试信息">
      <section className="border-b border-background-200 px-5 py-5 sm:px-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
          <MessageSquareText size={16} aria-hidden="true" /> HR 备注
        </h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground-700">
          {task.hr_note || 'HR 未填写筛选备注'}
        </p>
        {task.status !== 'pending' && (
          <div className="mt-4 border-t border-background-100 pt-4">
            <p className="text-xs font-medium text-foreground-500">业务筛选备注 · {formatDate(task.decided_at)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground-700">
              {task.business_note || '未填写'}
            </p>
          </div>
        )}
      </section>

      <section className="border-b border-background-200 px-5 py-5 sm:px-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
          <BriefcaseBusiness size={16} aria-hidden="true" /> 岗位需求与完整 JD
        </h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-foreground-400">部门</dt>
            <dd className="mt-1 text-foreground-700">{task.demand.department || '未填写'}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-400">城市</dt>
            <dd className="mt-1 text-foreground-700">{task.demand.city || '未填写'}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-400">岗位</dt>
            <dd className="mt-1 text-foreground-700">{task.demand.job_title}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="text-xs font-medium text-foreground-500">考察重点</p>
          {focusPoints.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {focusPoints.map((point, index) => (
                <li key={`${point}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground-700">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-foreground-500">未配置考察重点</p>
          )}
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-foreground-500">完整 JD</p>
          <div className="mt-2 whitespace-pre-wrap border-l-2 border-primary-200 pl-4 text-sm leading-7 text-foreground-700">
            {task.demand.jd_text || '未填写岗位 JD'}
          </div>
        </div>
      </section>
      </div>

      <div className={activeTab === 'resume' ? 'block' : 'hidden'} role="tabpanel" aria-label="候选人简历">
      <section className="px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
              <FileText size={16} aria-hidden="true" /> 候选人结构化简历
            </h3>
            <p className="mt-1 text-xs text-foreground-500">解析状态：{task.candidate.parse_status || '未知'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              title="在当前浏览器的新标签页预览原版简历"
              disabled={!originalResume.available || resumeAction !== null}
              onClick={() => void handleOriginalResume('preview')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resumeAction === 'preview' ? <LoaderCircle className="animate-spin" size={14} /> : <ExternalLink size={14} />}
              预览原版
            </button>
            <button
              type="button"
              title="下载原版简历"
              disabled={!originalResume.available || resumeAction !== null}
              onClick={() => void handleOriginalResume('download')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-700 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resumeAction === 'download' ? <LoaderCircle className="animate-spin" size={14} /> : <Download size={14} />}
              下载原版
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-foreground-500">
          {originalResume.available
            ? `原版文件：${originalResume.filename || '未命名文件'}`
            : '当前没有原版文件，以下为系统解析信息'}
        </div>
        {resumeError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{resumeError}</span>
          </div>
        )}

        <div className="mt-4"><StructuredResumeView resume={task.candidate.resume_json} /></div>
      </section>
      </div>
      </CandidateDetailWorkspace>

      <DetailActionBar status={<span className="text-xs text-foreground-500">筛选状态：{task.status === 'pending' ? '待处理' : '已完成'}</span>}>
        {task.status === 'pending' && onReview ? (
          <>
            <ActionButton tone="danger" onClick={() => onReview('rejected')}>不同意面试</ActionButton>
            <ActionButton tone="primary" onClick={() => onReview('approved')}>同意面试</ActionButton>
          </>
        ) : <ActionButton tone="secondary" disabled>筛选已完成</ActionButton>}
      </DetailActionBar>
    </div>
  );
}
