import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import ActionButton from '@/components/ui/ActionButton';
import DetailActionBar from '@/components/ui/DetailActionBar';
import ReadOnlyDetailDrawer from '@/components/ui/ReadOnlyDetailDrawer';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import StructuredResumeView from '@/components/candidates/StructuredResumeView';
import { candidatesApi } from '@/features/candidates/api';
import CandidateDetailWorkspace from '@/features/candidates/components/CandidateDetailWorkspace';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import CandidateInterviewInfoPanel from '@/features/candidates/components/CandidateInterviewInfoPanel';
import CandidateFeedbackTimeline from '@/features/candidates/components/CandidateFeedbackTimeline';
import type { CandidateJourney, CandidateResumeDetail } from '@/features/candidates/types';
import { formatInterviewDateTime } from '@/features/interviews/dateTime';
import RescheduleHistory from '@/features/interviews/components/RescheduleHistory';
import type { InterviewManagementRow, InterviewRescheduleRequest } from '@/features/interviews/types';
import { rowStatus, statusLabelForRow } from '@/features/interviews/workbench';
import { interviewStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import RescheduleRequestPanel from './RescheduleRequestPanel';

interface RecruiterInterviewDetailDrawerProps {
  row: InterviewManagementRow;
  initialTab?: CandidateDetailTab;
  rescheduleHistory: InterviewRescheduleRequest[];
  rescheduleBusy: boolean;
  rescheduleError: string;
  decisionBusy: boolean;
  showReject: boolean;
  rejectReason: string;
  onClose: () => void;
  onOpenSchedule: () => void;
  onApproveReschedule: (suggestedTime: string | null) => void;
  onRejectReschedule: (reason: string) => void;
  onCancelAndWait: (reason: string) => void;
  onNextRound: () => void;
  onAddInterviewer: () => void;
  onMoveOffer: () => void;
  onShowReject: () => void;
  onCancelReject: () => void;
  onRejectReasonChange: (value: string) => void;
  onConfirmReject: () => void;
  onViewOffer: () => void;
  onFillFeedback: () => void;
}

export default function RecruiterInterviewDetailDrawer({
  row,
  initialTab = 'interview',
  rescheduleHistory,
  rescheduleBusy,
  rescheduleError,
  decisionBusy,
  showReject,
  rejectReason,
  onClose,
  onOpenSchedule,
  onApproveReschedule,
  onRejectReschedule,
  onCancelAndWait,
  onNextRound,
  onAddInterviewer,
  onMoveOffer,
  onShowReject,
  onCancelReject,
  onRejectReasonChange,
  onConfirmReject,
  onViewOffer,
  onFillFeedback,
}: RecruiterInterviewDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<CandidateDetailTab>('interview');
  const [resume, setResume] = useState<CandidateResumeDetail | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [resumeError, setResumeError] = useState('');
  const [journey, setJourney] = useState<CandidateJourney | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(true);
  const [journeyError, setJourneyError] = useState('');
  const [confirmOffer, setConfirmOffer] = useState(false);
  const status = rowStatus(row);
  const presentation = statusPresentation(interviewStatusPresentation, status, statusLabelForRow(row));

  useEffect(() => {
    let cancelled = false;
    setActiveTab(initialTab);
    setResume(null);
    setResumeError('');
    setResumeLoading(true);
    setJourney(null);
    setJourneyError('');
    setJourneyLoading(true);
    void candidatesApi.getResume(row.candidate_id)
      .then((value) => { if (!cancelled) setResume(value); })
      .catch((error) => { if (!cancelled) setResumeError(error instanceof Error ? error.message : '简历暂时无法读取'); })
      .finally(() => { if (!cancelled) setResumeLoading(false); });
    void candidatesApi.getJourney(row.candidate_id, row.demand_id)
      .then((value) => { if (!cancelled) setJourney(value); })
      .catch((error) => { if (!cancelled) setJourneyError(error instanceof Error ? error.message : '面试评价暂时无法读取'); })
      .finally(() => { if (!cancelled) setJourneyLoading(false); });
    return () => { cancelled = true; };
  }, [initialTab, row.candidate_id, row.demand_id]);

  const footer = (
    <DetailActionBar
      className="-mx-6 -my-4"
      status={<div><p className="text-xs text-foreground-400">当前状态</p><SemanticStatusBadge tone={presentation.tone} className="mt-1">{presentation.label}</SemanticStatusBadge></div>}
    >
      <ActionButton tone="secondary" onClick={onClose}>关闭</ActionButton>
      {row.reschedule_request?.status === 'waiting_reassignment' && <ActionButton tone="primary" onClick={onOpenSchedule}>重新安排面试</ActionButton>}
      {row.pipeline_stage === 'interview' && (
        <>
          {!row.feedback_submitted && <ActionButton tone="secondary" disabled={decisionBusy} onClick={onFillFeedback}>代填反馈</ActionButton>}
          <ActionButton tone="secondary" disabled={decisionBusy} onClick={onAddInterviewer}>增加面试官</ActionButton>
          <ActionButton tone="secondary" disabled={decisionBusy} onClick={() => row.feedback_submitted ? onMoveOffer() : setConfirmOffer(true)}>进入 Offer</ActionButton>
          <ActionButton tone="danger" disabled={decisionBusy} onClick={onShowReject}>淘汰候选人</ActionButton>
          <ActionButton tone="primary" disabled={decisionBusy} onClick={onNextRound}>安排下一轮</ActionButton>
        </>
      )}
    </DetailActionBar>
  );

  return (
    <ReadOnlyDetailDrawer
      title={row.name_masked}
      description={`${row.job_title} · 第 ${row.round_sequence || '-'} 轮`}
      onClose={onClose}
      widthClassName="max-w-5xl"
      footer={footer}
    >
      <div className="-mx-6 -mt-5">
        <CandidateDetailWorkspace value={activeTab} onChange={setActiveTab}>
        <div className="px-6 py-5">
          {activeTab === 'resume' ? (
            <div role="tabpanel" aria-label="候选人简历">
              {resumeLoading ? <p className="py-16 text-center text-sm text-foreground-500">正在加载简历...</p> : resumeError ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{resumeError}</p>
              ) : <StructuredResumeView resume={resume?.resume_json || {}} />}
            </div>
          ) : activeTab === 'feedback' ? (
            <div role="tabpanel" aria-label="面试评价">
              <CandidateFeedbackTimeline journey={journey} loading={journeyLoading} error={journeyError} />
            </div>
          ) : (
            <CandidateInterviewInfoPanel>
              <dl className="grid grid-cols-2 gap-4 rounded-lg border border-background-200 p-4 text-sm">
                <div><dt className="text-xs text-foreground-400">当前状态</dt><dd className="mt-1"><SemanticStatusBadge tone={presentation.tone}>{presentation.label}</SemanticStatusBadge></dd></div>
                <div><dt className="text-xs text-foreground-400">面试官</dt><dd className="mt-1 font-medium text-foreground-800">{row.interviewer_name || '待安排'}</dd></div>
                <div><dt className="text-xs text-foreground-400">面试时间</dt><dd className="mt-1 text-foreground-700">{formatInterviewDateTime(row.scheduled_at)}</dd></div>
                <div><dt className="text-xs text-foreground-400">地点 / 链接</dt><dd className="mt-1 inline-flex items-center gap-1 text-foreground-700"><MapPin size={13} />{row.location || '待确认'}</dd></div>
              </dl>

              {row.note && <section className="rounded-lg bg-background-50 px-4 py-3"><p className="text-xs text-foreground-400">安排备注</p><p className="mt-1 text-sm text-foreground-700">{row.note}</p></section>}
              {!row.feedback_submitted && row.pipeline_stage === 'interview' && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">面试官尚未提交反馈</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    可以先点「催反馈」或「代填反馈」；若直接进入 Offer / 淘汰 / 安排下一轮，将视为招聘专员自主决策。
                  </p>
                </section>
              )}
              {confirmOffer && row.pipeline_stage === 'interview' && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">面试官尚未反馈，确定直接进入 Offer 吗？</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">确认后系统将跳过该轮面试反馈，面试任务状态会同步收口。</p>
                  <div className="mt-3 flex justify-end gap-2">
                    <ActionButton size="sm" tone="secondary" onClick={() => setConfirmOffer(false)}>取消</ActionButton>
                    <ActionButton size="sm" tone="primary" onClick={() => { setConfirmOffer(false); onMoveOffer(); }} disabled={decisionBusy}>确认进入 Offer</ActionButton>
                  </div>
                </section>
              )}
              {row.reschedule_request?.status === 'pending' && (
                <RescheduleRequestPanel request={row.reschedule_request} busy={rescheduleBusy} error={rescheduleError} onApprove={onApproveReschedule} onReject={onRejectReschedule} onCancelAndWait={onCancelAndWait} />
              )}
              {row.reschedule_request?.status === 'waiting_reassignment' && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-semibold text-amber-900">因改约待重新安排</h3><p className="mt-1 text-xs leading-5 text-amber-800">原任务已保留为取消记录，候选人仍在面试流程中。</p></section>
              )}
              <RescheduleHistory items={rescheduleHistory} />
              {showReject && row.pipeline_stage === 'interview' && (
                <section className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <label className="block text-xs font-medium text-red-800">淘汰原因（必填）<textarea value={rejectReason} onChange={(event) => onRejectReasonChange(event.target.value)} rows={3} maxLength={500} placeholder="请写清与岗位不匹配的具体原因" className="mt-2 w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-foreground-800" /></label>
                  <div className="mt-3 flex justify-end gap-2"><ActionButton size="sm" tone="secondary" onClick={onCancelReject}>取消</ActionButton><ActionButton size="sm" tone="danger" onClick={onConfirmReject} disabled={decisionBusy || !rejectReason.trim()}>确认淘汰</ActionButton></div>
                </section>
              )}
              {row.feedback_submitted && row.pipeline_stage !== 'interview' && (
                <section className="rounded-lg border border-background-200 bg-background-50 px-4 py-3 text-sm text-foreground-600">
                  该候选人已进入“{row.pipeline_stage === 'offer' ? 'Offer' : row.pipeline_stage === 'rejected' ? '已淘汰' : row.pipeline_stage}”阶段。
                  {row.pipeline_stage === 'offer' && <button type="button" onClick={onViewOffer} className="ml-2 font-medium text-primary-700 hover:underline">查看 Offer</button>}
                  {row.pipeline_stage === 'rejected' && <p className="mt-2 text-xs text-foreground-500">淘汰原因：{row.disposition_reason || '未填写'} · {row.enter_talent_pool ? '已进入公司人才库' : '不进入公司人才库'}</p>}
                </section>
              )}
            </CandidateInterviewInfoPanel>
          )}
        </div>
        </CandidateDetailWorkspace>
      </div>
    </ReadOnlyDetailDrawer>
  );
}
