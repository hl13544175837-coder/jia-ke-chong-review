import { ArrowLeft, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import type { CandidateDetailTab } from '@/features/candidates/components/CandidateDetailTabs';
import { interviewsApi } from '@/features/interviews/api';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewRescheduleRequest,
} from '@/features/interviews/types';
import { pipelineApi } from '@/features/pipeline/api';
import InterviewManagementCalendar from './components/InterviewManagementCalendar';
import InterviewManagementTable from './components/InterviewManagementTable';
import InterviewWorkbenchToolbar from './components/InterviewWorkbenchToolbar';
import RecruiterInterviewDetailDrawer from './components/RecruiterInterviewDetailDrawer';
import RecruiterInterviewOverlays from '@/features/interviews/components/RecruiterInterviewOverlays';
import {
  followUpScheduleRow,
  initialInterviewFilters,
  initialInterviewTab,
  initialInterviewView,
  latestCandidateManagementRow,
  setInterviewSearchParam,
  useRecruiterInterviewWorkbench,
} from '@/features/interviews/useRecruiterInterviewWorkbench';
import {
  deriveInterviewFilterOptions,
  emptyInterviewFilters,
  filterInterviewRows,
  rowStatus,
  statusLabelForRow,
  type InterviewFilters,
  type InterviewStatusTab,
  type InterviewViewMode,
} from '@/features/interviews/workbench';

export default function RecruiterInterviewsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const requestedAssignmentId = Number(searchParams.get('assignment')) || null;
  const fromJobs = searchParams.get('from') === 'jobs';
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const dashboardScheduleHandledInUrl = searchParams.get('quickSchedule') === 'handled';
  const handledDeepLink = useRef('');
  const handledDashboardSchedule = useRef(false);
  const { rows, interviewers, selectedRow, setSelectedRow, loading, loadError, loadWorkbench } = useRecruiterInterviewWorkbench();
  const [activeTab, setActiveTab] = useState<InterviewStatusTab>(() => initialInterviewTab(searchParams.get('status')));
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [viewMode, setViewMode] = useState<InterviewViewMode>(() => initialInterviewView(searchParams.get('view')));
  const [appliedFilters, setAppliedFilters] = useState<InterviewFilters>(() => initialInterviewFilters(searchParams));
  const [scheduleRow, setScheduleRow] = useState<InterviewManagementRow | null>(null);
  const [scheduleIsPrimary, setScheduleIsPrimary] = useState(true);
  const [confirmConductedRow, setConfirmConductedRow] = useState<InterviewManagementRow | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionRowId, setActionRowId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedRescheduleHistory, setSelectedRescheduleHistory] = useState<InterviewRescheduleRequest[]>([]);
  const [detailInitialTab, setDetailInitialTab] = useState<CandidateDetailTab>('interview');
  const [rescheduleRequestId, setRescheduleRequestId] = useState<number | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');

  const syncInterviewWorkspaceUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    setInterviewSearchParam(next, 'status', activeTab, 'all');
    setInterviewSearchParam(next, 'q', search);
    setInterviewSearchParam(next, 'view', viewMode, 'list');
    setInterviewSearchParam(next, 'job', appliedFilters.jobTitle);
    setInterviewSearchParam(next, 'interviewer', appliedFilters.interviewerId);
    setInterviewSearchParam(next, 'schedule', appliedFilters.schedule);
    setInterviewSearchParam(next, 'dateFrom', appliedFilters.dateFrom);
    setInterviewSearchParam(next, 'dateTo', appliedFilters.dateTo);
    setInterviewSearchParam(next, 'round', appliedFilters.roundSequence);
    setInterviewSearchParam(next, 'city', appliedFilters.city);
    setInterviewSearchParam(next, 'department', appliedFilters.department);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, appliedFilters, search, searchParams, setSearchParams, viewMode]);

  useEffect(() => {
    syncInterviewWorkspaceUrl();
  }, [syncInterviewWorkspaceUrl]);

  const openInterviewInUrl = useCallback((row: InterviewManagementRow) => {
    const next = new URLSearchParams(searchParams);
    next.set('candidate', String(row.candidate_id));
    if (row.assignment_id) next.set('assignment', String(row.assignment_id));
    else next.delete('assignment');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openInterviewDetail = useCallback((row: InterviewManagementRow, initialTab: CandidateDetailTab = 'interview') => {
    setDetailInitialTab(initialTab);
    setSelectedRow(row);
    setSelectedRescheduleHistory(row.reschedule_request ? [row.reschedule_request] : []);
    setShowReject(false);
    setRejectReason('');
    setRescheduleError('');
    openInterviewInUrl(row);
    if (row.assignment_id) {
      void interviewsApi.listRescheduleHistory(row.assignment_id)
        .then(setSelectedRescheduleHistory)
        .catch(() => undefined);
    }
  }, [openInterviewInUrl, setSelectedRow]);

  const closeInterviewDetail = useCallback(() => {
    setSelectedRow(null);
    setDetailInitialTab('interview');
    setShowReject(false);
    setRejectReason('');
    setSelectedRescheduleHistory([]);
    setRescheduleError('');
    const next = new URLSearchParams(searchParams);
    next.delete('candidate');
    next.delete('assignment');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setSelectedRow]);

  useEffect(() => {
    const deepLinkKey = `${requestedCandidateId || ''}:${requestedAssignmentId || ''}`;
    if (!requestedCandidateId || loading || handledDeepLink.current === deepLinkKey) return;
    const row = latestCandidateManagementRow(
      rows,
      requestedCandidateId,
      requestedDemandId,
      requestedAssignmentId,
    );
    if (!row) return;
    handledDeepLink.current = deepLinkKey;
    if (rowStatus(row) === 'unassigned' && (fromJobs || fromDashboard)) {
      setScheduleIsPrimary(true);
      setScheduleRow(row);
    }
    else setSelectedRow(row);
  }, [fromDashboard, fromJobs, loading, requestedAssignmentId, requestedCandidateId, requestedDemandId, rows, setSelectedRow]);

  const scopedRows = useMemo(
    () => requestedDemandId
      ? rows.filter((row) => row.demand_id === requestedDemandId && (!(fromJobs || fromDashboard) || row.pipeline_stage === 'interview'))
      : rows,
    [fromDashboard, fromJobs, requestedDemandId, rows],
  );
  const demandContext = useMemo(
    () => requestedDemandId ? rows.find((row) => row.demand_id === requestedDemandId) ?? null : null,
    [requestedDemandId, rows],
  );
  const scopedCandidateCount = useMemo(
    () => new Set(scopedRows.map((row) => row.candidate_id)).size,
    [scopedRows],
  );
  const counts = useMemo<Record<InterviewStatusTab, number>>(() => ({
    all: scopedRows.length,
    unassigned: scopedRows.filter((row) => rowStatus(row) === 'unassigned').length,
    scheduled: scopedRows.filter((row) => rowStatus(row) === 'scheduled').length,
    awaiting_feedback: scopedRows.filter((row) => rowStatus(row) === 'awaiting_feedback').length,
    completed: scopedRows.filter((row) => rowStatus(row) === 'completed').length,
  }), [scopedRows]);
  const filterOptions = useMemo(() => deriveInterviewFilterOptions(scopedRows), [scopedRows]);
  const visibleRows = useMemo(
    () => filterInterviewRows(scopedRows, activeTab, search, appliedFilters),
    [activeTab, appliedFilters, scopedRows, search],
  );
  useEffect(() => {
    if (
      !fromDashboard
      || activeTab !== 'unassigned'
      || loading
      || loadError
      || dashboardScheduleHandledInUrl
      || handledDashboardSchedule.current
    ) return;

    handledDashboardSchedule.current = true;
    if (visibleRows.length !== 1) return;

    setScheduleIsPrimary(true);
    setActionError('');
    setScheduleRow(visibleRows[0]);

    const next = new URLSearchParams(searchParams);
    next.set('quickSchedule', 'handled');
    setSearchParams(next, { replace: true });
  }, [activeTab, dashboardScheduleHandledInUrl, fromDashboard, loadError, loading, searchParams, setSearchParams, visibleRows]);

  const saveSchedule = async (payload: InterviewAssignmentInput | InterviewAssignmentUpdateInput) => {
    if (!scheduleRow) return;
    setSaving(true);
    setActionError('');
    try {
      if (rescheduleRequestId && scheduleRow.assignment_id) {
        const update = payload as InterviewAssignmentUpdateInput;
        await interviewsApi.processRescheduleRequest(rescheduleRequestId, {
          action: 'approve',
          interviewer_id: update.interviewer_id,
          scheduled_at: update.scheduled_at || undefined,
          location: update.location,
          note: update.note,
          processor_note: update.change_reason,
        });
        setSuccessMessage('改约已确认，最终安排和变更记录已通知对应面试官');
      } else if (rescheduleRequestId) {
        const replacement = payload as InterviewAssignmentInput;
        await interviewsApi.createReplacementAssignment(rescheduleRequestId, {
          interviewer_id: replacement.interviewer_id,
          scheduled_at: replacement.scheduled_at || '',
          location: replacement.location,
          note: replacement.note,
        });
        setSuccessMessage('已重新激活面试流程，新任务已创建并通知面试官');
      } else if (scheduleRow.assignment_id) {
        await interviewsApi.updateAssignment(scheduleRow.assignment_id, payload as InterviewAssignmentUpdateInput);
        setSuccessMessage('面试安排已更新，变更记录和站内通知已生成');
      } else {
        await interviewsApi.createAssignment(payload as InterviewAssignmentInput);
        setSuccessMessage('本地站内日程和面试官待办已创建');
      }
      setScheduleRow(null);
      setRescheduleRequestId(null);
      closeInterviewDetail();
      await loadWorkbench();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存面试安排失败');
    } finally {
      setSaving(false);
    }
  };

  const cancelSchedule = async (reason: string) => {
    if (!scheduleRow?.assignment_id) return;
    setSaving(true);
    setActionError('');
    try {
      await interviewsApi.cancelAssignment(scheduleRow.assignment_id, reason);
      setSuccessMessage('面试已取消，可以重新安排');
      setScheduleRow(null);
      await loadWorkbench();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '取消面试失败');
    } finally {
      setSaving(false);
    }
  };

  const runAssignmentAction = async (row: InterviewManagementRow, action: 'conducted' | 'remind') => {
    if (!row.assignment_id || actionRowId) return;
    setActionRowId(row.assignment_id);
    setActionError('');
    try {
      if (action === 'conducted') {
        await interviewsApi.markConducted(row.assignment_id);
        setSuccessMessage('已确认面试完成，面试官会收到填写反馈的待办');
        setConfirmConductedRow(null);
      } else {
        const result = await interviewsApi.remindFeedback(row.assignment_id);
        setSuccessMessage(result.deduplicated ? '15 分钟内已提醒过，不再重复打扰' : '已提醒面试官提交反馈');
      }
      await loadWorkbench();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setActionRowId(null);
    }
  };

  const openSchedule = (row: InterviewManagementRow, isPrimary = true) => {
    setScheduleIsPrimary(isPrimary);
    setActionError('');
    setRescheduleRequestId(
      row.reschedule_request?.status === 'waiting_reassignment'
        ? row.reschedule_request.id
        : null,
    );
    setScheduleRow(row);
  };

  const openRescheduleApproval = (
    row: InterviewManagementRow,
    requestItem: InterviewRescheduleRequest,
    suggestedTime: string,
  ) => {
    setScheduleIsPrimary(Boolean(row.is_primary));
    setActionError('');
    setRescheduleRequestId(requestItem.id);
    setScheduleRow({ ...row, scheduled_at: suggestedTime });
  };

  const processRescheduleDecision = async (
    requestItem: InterviewRescheduleRequest,
    action: 'reject' | 'cancel_and_wait',
    reason: string,
  ) => {
    if (rescheduleBusy || !reason.trim()) return;
    setRescheduleBusy(true);
    setRescheduleError('');
    try {
      await interviewsApi.processRescheduleRequest(requestItem.id, {
        action,
        processor_note: reason.trim(),
      });
      await loadWorkbench();
      setSelectedRescheduleHistory((current) => current.map((item) => (
        item.id === requestItem.id
          ? { ...item, status: action === 'reject' ? 'rejected' : 'waiting_reassignment', processor_note: reason.trim() }
          : item
      )));
      setSuccessMessage(
        action === 'reject'
          ? '改约申请已拒绝，原安排继续有效并已通知面试官'
          : '原面试已取消，候选人仍在面试流程中，可随时重新安排',
      );
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : '处理改约申请失败');
    } finally {
      setRescheduleBusy(false);
    }
  };

  const openFollowUpSchedule = (
    row: InterviewManagementRow,
    mode: 'next_round' | 'add_interviewer',
  ) => {
    openSchedule(followUpScheduleRow(row, mode), mode === 'next_round');
  };

  const moveAfterInterview = async (
    row: InterviewManagementRow,
    stage: 'offer' | 'rejected',
    reason: string,
  ) => {
    if (decisionBusy) return;
    const note = reason.trim();
    if (stage === 'rejected' && !note) return;
    setDecisionBusy(true);
    setActionError('');
    try {
      await pipelineApi.moveCandidate(row.demand_id, {
        candidate_id: row.candidate_id,
        stage,
        note: note || '面试完成，招聘专员确认转入 Offer',
        ...(stage === 'rejected' ? {
          disposition: {
            reason: note,
            enter_talent_pool: true,
            note,
          },
        } : {}),
      });
      closeInterviewDetail();
      setShowReject(false);
      setRejectReason('');
      await loadWorkbench();
      if (stage === 'offer') {
        navigate(`/offers?demand=${row.demand_id}&candidate=${row.candidate_id}`);
      } else {
        setSuccessMessage('候选人已淘汰并保留在公司人才库，原因已写入流程记录');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存面试结果下一步失败');
    } finally {
      setDecisionBusy(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-recruiter-interview-workbench">
      <PageHeader
        title="面试管理"
        visuallyHiddenTitle
        description="从安排面试到收回反馈，都在这里处理"
        leading={fromDashboard && !requestedDemandId ? (
          <button type="button" onClick={() => navigate('/dashboard')} aria-label="返回工作台" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-background-200 bg-white text-foreground-600 hover:bg-background-50"><ArrowLeft size={17} /></button>
        ) : undefined}
        actions={(
          <button type="button" onClick={() => void loadWorkbench()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-600 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
        )}
      />

      {requestedDemandId && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3" aria-label="当前岗位面试">
          <div className="flex min-w-0 items-center gap-3">
            {(fromJobs || fromDashboard) && <button type="button" onClick={() => navigate(fromDashboard ? '/dashboard' : '/jobs')} aria-label={fromDashboard ? '返回工作台' : '返回招聘需求'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-white text-primary-700 hover:bg-primary-50"><ArrowLeft size={17} /></button>}
            <div className="min-w-0"><p className="text-xs font-semibold text-primary-700">当前岗位面试</p><p className="mt-0.5 truncate text-sm font-medium text-foreground-900">{demandContext?.job_title || `招聘需求 #${requestedDemandId}`}</p><p className="mt-0.5 text-xs text-foreground-500">只显示这个岗位：{scopedCandidateCount} 位候选人 · {scopedRows.length} 条面试任务</p></div>
          </div>
          <button type="button" onClick={() => navigate('/interviews')} className="text-xs font-medium text-primary-700 hover:underline">查看全部面试</button>
        </section>
      )}

      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} />{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage('')} aria-label="关闭提示"><X size={15} /></button>
        </div>
      )}
      {actionError && !scheduleRow && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <InterviewWorkbenchToolbar
        activeTab={activeTab}
        counts={counts}
        search={search}
        filters={appliedFilters}
        filterOptions={filterOptions}
        resultCount={visibleRows.length}
        viewMode={viewMode}
        onTabChange={setActiveTab}
        onSearchChange={setSearch}
        onFiltersChange={setAppliedFilters}
        onResetFilters={() => { setSearch(''); setAppliedFilters(emptyInterviewFilters); }}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <PageStateCard variant="loading" title="正在加载面试工作台" description="请稍候，正在读取最新面试安排。" />
      ) : loadError ? (
        <PageStateCard
          variant="error"
          title="面试工作台加载失败"
          description={loadError}
          onAction={() => void loadWorkbench()}
        />
      ) : visibleRows.length === 0 ? (
        <PageStateCard
          variant="empty"
          title={fromDashboard && activeTab === 'unassigned' ? '当前没有待安排面试' : '没有符合当前条件的面试任务'}
          description="可以切换状态或清除筛选条件后再查看。"
          actionLabel="重置筛选"
          onAction={() => { setSearch(''); setActiveTab('all'); setAppliedFilters(emptyInterviewFilters); }}
        />
      ) : viewMode === 'list' ? (
        <InterviewManagementTable
          rows={visibleRows}
          actionRowId={actionRowId}
          filters={appliedFilters}
          filterOptions={filterOptions}
          activeTab={activeTab}
          onFiltersChange={setAppliedFilters}
          onStatusChange={setActiveTab}
          onOpenDetails={openInterviewDetail}
          onOpenResume={(row) => openInterviewDetail(row, 'resume')}
          onOpenHistory={(row) => openInterviewDetail(row, 'feedback')}
          onSchedule={openSchedule}
          onConfirmConducted={setConfirmConductedRow}
          onRemind={(row) => void runAssignmentAction(row, 'remind')}
        />
      ) : (
        <InterviewManagementCalendar rows={visibleRows} onOpenDetails={openInterviewDetail} onSchedule={openSchedule} />
      )}

      {selectedRow && (
        <RecruiterInterviewDetailDrawer
          row={selectedRow}
          initialTab={detailInitialTab}
          rescheduleHistory={selectedRescheduleHistory}
          rescheduleBusy={rescheduleBusy}
          rescheduleError={rescheduleError}
          decisionBusy={decisionBusy}
          showReject={showReject}
          rejectReason={rejectReason}
          onClose={closeInterviewDetail}
          onOpenSchedule={() => openSchedule(selectedRow)}
          onApproveReschedule={(suggestedTime) => openRescheduleApproval(selectedRow, selectedRow.reschedule_request as InterviewRescheduleRequest, suggestedTime)}
          onRejectReschedule={(reason) => void processRescheduleDecision(selectedRow.reschedule_request as InterviewRescheduleRequest, 'reject', reason)}
          onCancelAndWait={(reason) => void processRescheduleDecision(selectedRow.reschedule_request as InterviewRescheduleRequest, 'cancel_and_wait', reason)}
          onNextRound={() => openFollowUpSchedule(selectedRow, 'next_round')}
          onAddInterviewer={() => openFollowUpSchedule(selectedRow, 'add_interviewer')}
          onMoveOffer={() => void moveAfterInterview(selectedRow, 'offer', '')}
          onShowReject={() => setShowReject(true)}
          onCancelReject={() => { setShowReject(false); setRejectReason(''); }}
          onRejectReasonChange={setRejectReason}
          onConfirmReject={() => void moveAfterInterview(selectedRow, 'rejected', rejectReason)}
          onViewOffer={() => navigate(`/offers?demand=${selectedRow.demand_id}&candidate=${selectedRow.candidate_id}`)}
        />
      )}

      <RecruiterInterviewOverlays
        confirmConductedRow={confirmConductedRow}
        actionRowId={actionRowId}
        onCloseConfirm={() => setConfirmConductedRow(null)}
        onConfirmConducted={(row) => void runAssignmentAction(row, 'conducted')}
        scheduleRow={scheduleRow}
        interviewers={interviewers}
        saving={saving}
        actionError={actionError}
        scheduleIsPrimary={scheduleIsPrimary}
        allowCancel={rescheduleRequestId === null}
        onCloseSchedule={() => { if (!saving) { setScheduleRow(null); setRescheduleRequestId(null); setActionError(''); } }}
        onSaveSchedule={(payload) => void saveSchedule(payload)}
        onCancelSchedule={(reason) => void cancelSchedule(reason)}
      />
    </div>
  );
}
