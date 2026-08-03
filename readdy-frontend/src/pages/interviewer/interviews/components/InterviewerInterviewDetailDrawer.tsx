import {
  CalendarDays,
  CalendarClock,
  Download,
  FileSearch,
  FileText,
  MapPin,
  MessageSquareText,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import CandidateJourneySummary from '@/components/candidates/CandidateJourneySummary';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import type { CandidateJourney, CandidateResumeDetail } from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import type {
  InterviewAssignment,
  InterviewFeedback,
  InterviewRescheduleRequest,
  Satisfaction,
} from '@/features/interviews/types';
import RescheduleHistory from '@/features/interviews/components/RescheduleHistory';

const tabs = [
  { key: 'interview', label: '面试信息' },
  { key: 'resume', label: '候选人简历' },
  { key: 'history', label: '历史评价' },
] as const;

type TabKey = typeof tabs[number]['key'];

export type DetailActionLabel =
  | '面试尚未开始'
  | '确认已面试并填写评价'
  | '填写评价'
  | '修改评价';

interface InterviewerInterviewDetailDrawerProps {
  assignment: InterviewAssignment;
  demand: RecruitmentDemand | null;
  resume: CandidateResumeDetail | null;
  journey: CandidateJourney | null;
  feedback: InterviewFeedback | null;
  detailLoading: boolean;
  detailError: string;
  journeyError: string;
  confirmationError: string;
  actionLabel: DetailActionLabel;
  canSubmit: boolean;
  canSelfConfirm: boolean;
  canRequestReschedule: boolean;
  rescheduleHistory: InterviewRescheduleRequest[];
  escapeDisabled: boolean;
  onClose: () => void;
  onRetry: () => void;
  onViewOriginal: () => void;
  onDownloadOriginal: () => void;
  onStartFeedback: () => void;
  onConfirmAndStartFeedback: () => void;
  onRequestReschedule: () => void;
}

const satisfactionLabels: Record<Satisfaction, string> = {
  satisfied: '满意',
  pending: '待定',
  unsatisfied: '不满意',
};

const jobMatchLabels: Record<string, string> = {
  high: '高匹配',
  medium: '基本匹配',
  low: '低匹配',
};

const recommendationLabels: Record<string, string> = {
  next_round: '进入下一轮',
  offer: '建议进入 Offer',
  hold: '暂缓，待补充确认',
  reject: '不建议继续',
};

const statusLabels: Record<string, string> = {
  scheduled: '已安排',
  awaiting_feedback: '待填写评价',
  feedback_submitted: '评价已提交',
  completed: '已完成',
  cancelled: '已取消',
};

function taskStatus(assignment: InterviewAssignment) {
  if (assignment.feedback_submitted) return '已完成';
  return statusLabels[assignment.status] || assignment.status || '状态未记录';
}

function evaluationText(feedback: InterviewFeedback, key: string) {
  const value = feedback.evaluation?.[key];
  return typeof value === 'string' ? value : '';
}

export default function InterviewerInterviewDetailDrawer({
  assignment,
  demand,
  resume,
  journey,
  feedback,
  detailLoading,
  detailError,
  journeyError,
  confirmationError,
  actionLabel,
  canSubmit,
  canSelfConfirm,
  canRequestReschedule,
  rescheduleHistory,
  escapeDisabled,
  onClose,
  onRetry,
  onViewOriginal,
  onDownloadOriginal,
  onStartFeedback,
  onConfirmAndStartFeedback,
  onRequestReschedule,
}: InterviewerInterviewDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('interview');

  useEffect(() => {
    setActiveTab('interview');
  }, [assignment.id]);

  useOverlayLifecycle({
    canClose: !escapeDisabled,
    onClose,
    initialFocusRef: drawerRef,
  });

  const actionDisabled = detailLoading || (!canSubmit && !canSelfConfirm);
  const jobMatch = feedback ? evaluationText(feedback, 'job_match') : '';
  const recommendation = feedback ? evaluationText(feedback, 'recommendation') : '';

  return (
    <>
      <button
        type="button"
        aria-label="关闭面试详情"
        onClick={onClose}
        className="workspace-detail-backdrop fixed inset-0 z-40 bg-foreground-900/40 lg:left-[var(--workspace-sidebar-width)] lg:top-14"
      />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-labelledby="interviewer-interview-detail-title"
        className="workspace-detail-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl outline-none lg:top-14"
      >
        <div className="flex items-start justify-between border-b border-background-200 px-6 py-5">
          <div className="min-w-0">
            <h2
              id="interviewer-interview-detail-title"
              className="truncate text-lg font-bold text-foreground-900"
            >
              {assignment.name_masked || `候选人 #${assignment.candidate_id}`}
            </h2>
            <p className="mt-1 truncate text-sm text-foreground-500">
              {assignment.job_title || `岗位 #${assignment.job_id}`} · 第 {assignment.round_sequence} 轮
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700"
            aria-label="关闭面试详情"
          >
            <X size={18} />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="面试详情"
          className="grid grid-cols-3 border-b border-background-200 bg-white px-6"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              id={`interview-detail-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`interview-detail-panel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-foreground-500 hover:text-foreground-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id={`interview-detail-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`interview-detail-tab-${activeTab}`}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          {detailLoading ? (
            <div className="py-16 text-center text-sm text-foreground-500">
              <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
              正在加载面试详情...
            </div>
          ) : detailError ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              <p>{detailError}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-md border border-red-200 bg-white px-3 py-2 font-medium text-red-700 hover:bg-red-50"
              >重新加载</button>
            </div>
          ) : activeTab === 'interview' ? (
            <div className="space-y-5">
              <section className="grid gap-3 rounded-lg border border-background-200 p-4 sm:grid-cols-2">
                <p className="flex items-start gap-2 text-sm text-foreground-600">
                  <CalendarDays size={16} className="mt-0.5 flex-shrink-0 text-foreground-400" />
                  <span><span className="block text-xs text-foreground-400">面试时间</span>{formatInterviewDateTime(assignment.scheduled_at)}</span>
                </p>
                <p className="flex items-start gap-2 text-sm text-foreground-600">
                  <MapPin size={16} className="mt-0.5 flex-shrink-0 text-foreground-400" />
                  <span><span className="block text-xs text-foreground-400">面试地点</span>{assignment.location || '地点待确认'}</span>
                </p>
                <p className="flex items-start gap-2 text-sm text-foreground-600">
                  <UserRound size={16} className="mt-0.5 flex-shrink-0 text-foreground-400" />
                  <span><span className="block text-xs text-foreground-400">面试官</span>{assignment.interviewer_name || '未记录'}</span>
                </p>
                <p className="flex items-start gap-2 text-sm text-foreground-600">
                  <MessageSquareText size={16} className="mt-0.5 flex-shrink-0 text-foreground-400" />
                  <span><span className="block text-xs text-foreground-400">任务说明</span>{assignment.note || '无补充说明'}</span>
                </p>
              </section>

              {assignment.pending_reschedule && (
                <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <CalendarClock size={16} /> 改约待招聘专员确认
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    当前安排仍然有效。招聘专员确认后，新时间才会生效。
                  </p>
                </section>
              )}

              <RescheduleHistory items={rescheduleHistory} title="排期变更记录" />

              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                  <FileText size={16} /> 岗位 JD
                </h3>
                <div className="mt-2 whitespace-pre-wrap rounded-md bg-background-50 p-4 text-sm leading-6 text-foreground-700">
                  {demand?.jd_text || assignment.jd_text || '未填写岗位 JD'}
                </div>
              </section>

              {assignment.focus_points && assignment.focus_points.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-foreground-900">本轮关注点</h3>
                  <ul className="mt-2 space-y-2 rounded-md border border-background-200 p-4 text-sm text-foreground-700">
                    {assignment.focus_points.map((point) => <li key={point}>· {point}</li>)}
                  </ul>
                </section>
              )}
            </div>
          ) : activeTab === 'resume' ? (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                  <FileSearch size={16} /> 候选人简历
                </h3>
                {resume?.original_resume.available && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onViewOriginal}
                      className="inline-flex items-center gap-1.5 rounded-md border border-background-200 px-3 py-1.5 text-xs font-medium text-foreground-600 hover:bg-background-50"
                    >
                      <FileText size={14} /> 查看原版
                    </button>
                    <button
                      type="button"
                      onClick={onDownloadOriginal}
                      className="inline-flex items-center gap-1.5 rounded-md border border-background-200 px-3 py-1.5 text-xs font-medium text-foreground-600 hover:bg-background-50"
                    >
                      <Download size={14} /> 下载
                    </button>
                  </div>
                )}
              </div>
              {!resume?.original_resume.available && (
                <p className="mt-3 rounded-md border border-background-200 bg-background-50 px-3 py-2 text-xs text-foreground-500">
                  当前没有原版文件，以下为系统解析信息
                </p>
              )}
              <div className="mt-4">
                <StructuredResumeView resume={resume?.resume_json || {}} compact />
              </div>
            </section>
          ) : (
            <div className="space-y-5">
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900">
                  <MessageSquareText size={16} /> 本轮评价
                </h3>
                <div className="mt-2 rounded-md border border-background-200 p-4">
                  {feedback ? (
                    <div className="space-y-3 text-sm text-foreground-700">
                      <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                        {feedback.satisfaction ? satisfactionLabels[feedback.satisfaction] : '已提交'}
                      </span>
                      {jobMatch && <p>岗位匹配：{jobMatchLabels[jobMatch] || jobMatch}</p>}
                      {recommendation && <p>建议结论：{recommendationLabels[recommendation] || recommendation}</p>}
                      {feedback.strengths && <p className="whitespace-pre-wrap">优势：{feedback.strengths}</p>}
                      {feedback.concerns && <p className="whitespace-pre-wrap">顾虑：{feedback.concerns}</p>}
                      <p className="whitespace-pre-wrap">补充备注：{feedback.note || '未填写'}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-500">尚未提交本轮评价</p>
                  )}
                </div>
              </section>

              {journeyError && (
                <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                  <p>{journeyError}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-1.5 font-medium text-amber-800"
                  >重新加载</button>
                </div>
              )}
              {journey
                ? <CandidateJourneySummary journey={journey} interviewOnly />
                : !journeyError && <p className="rounded-md bg-background-50 px-4 py-6 text-center text-sm text-foreground-500">暂无可查看的历史评价</p>}
            </div>
          )}
        </div>

        <div
          data-ui="interview-detail-sticky-actions"
          className="sticky bottom-0 z-10 border-t border-background-200 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]"
        >
          {confirmationError && (
            <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {confirmationError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-foreground-400">任务状态</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground-800">{taskStatus(assignment)}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onRequestReschedule}
                disabled={!canRequestReschedule}
                title={assignment.pending_reschedule ? '已有待确认的改约申请' : undefined}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:border-background-200 disabled:text-foreground-400"
              >
                <CalendarClock size={16} /> 申请改约
              </button>
              <button
                type="button"
                onClick={canSelfConfirm ? onConfirmAndStartFeedback : onStartFeedback}
                disabled={actionDisabled}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-foreground-900 px-4 py-2 text-sm font-medium text-white hover:bg-foreground-800 disabled:cursor-not-allowed disabled:bg-background-200 disabled:text-foreground-500"
              >
                <MessageSquareText size={16} />
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
