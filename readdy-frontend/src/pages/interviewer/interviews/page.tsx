import {
  Clock3,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import ActionButton from '@/components/ui/ActionButton';
import FilterBar from '@/components/ui/FilterBar';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { interviewStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import { businessReviewsApi } from '@/features/businessReviews/api';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateJourney, CandidateResumeDetail } from '@/features/candidates/types';
import { demandsApi } from '@/features/demands/api';
import type { RecruitmentDemand } from '@/features/demands/types';
import { interviewsApi } from '@/features/interviews/api';
import { formatInterviewDateTime, interviewHasStarted } from '@/features/interviews/dateTime';
import type {
  InterviewAssignment,
  InterviewFeedback,
  InterviewFeedbackMutationResult,
  InterviewRescheduleRequest,
  InterviewRescheduleRequestInput,
  StructuredInterviewFeedbackValues,
} from '@/features/interviews/types';
import { useToast } from '@/hooks/useToast';
import { userFacingError } from '@/lib/userFacingError';
import InterviewerInterviewDetailDrawer from './components/InterviewerInterviewDetailDrawer';
import type { DetailActionLabel } from './components/InterviewerInterviewDetailDrawer';
import RescheduleRequestModal from './components/RescheduleRequestModal';
import SimpleFeedbackModal from './components/SimpleFeedbackModal';
import { interviewLocalDateKey } from '@/features/interviews/workbench';

type TabKey = 'all' | 'upcoming' | 'feedback' | 'completed';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'upcoming', label: '待面试' },
  { key: 'feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

function assignmentBucket(item: InterviewAssignment): Exclude<TabKey, 'all'> {
  if (item.feedback_submitted || ['completed', 'feedback_submitted'].includes(item.status)) {
    return 'completed';
  }
  if (item.status === 'awaiting_feedback') return 'feedback';
  return 'upcoming';
}

function canSubmitFeedback(item: InterviewAssignment) {
  return Boolean(item.feedback_submitted) || (
    item.status === 'awaiting_feedback'
    && interviewHasStarted(item.scheduled_at)
  );
}

function canSelfConfirm(item: InterviewAssignment) {
  return !item.feedback_submitted
    && item.status === 'scheduled'
    && interviewHasStarted(item.scheduled_at);
}

function feedbackActionLabel(item: InterviewAssignment): DetailActionLabel {
  if (item.feedback_submitted) return '修改评价';
  if (!interviewHasStarted(item.scheduled_at)) return '面试尚未开始';
  if (canSelfConfirm(item)) return '确认已面试并填写评价';
  return '填写评价';
}

function interviewTabFromQuery(value: string | null): TabKey {
  return tabs.some((tab) => tab.key === value) ? value as TabKey : 'all';
}

function latestCandidateAssignment(
  assignments: InterviewAssignment[],
  candidateId: number,
  demandId: number | null,
  assignmentId: number | null,
) {
  const matches = assignments.filter((item) => (
    item.candidate_id === candidateId
    && (!demandId || item.demand_id === demandId)
  ));
  if (assignmentId) {
    const exact = matches.find((item) => item.id === assignmentId);
    if (exact) return exact;
  }
  return matches.sort((left, right) => (
    (right.round_sequence || 0) - (left.round_sequence || 0)
    || right.id - left.id
  ))[0] ?? null;
}

export default function InterviewerInterviewsPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const requestedAssignmentId = Number(searchParams.get('assignment')) || null;
  const handledDeepLink = useRef('');
  const [assignments, setAssignments] = useState<InterviewAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const activeTab = interviewTabFromQuery(searchParams.get('tab'));
  const searchQuery = searchParams.get('q') ?? '';
  const jobFilter = searchParams.get('job') ?? '';
  const departmentFilter = searchParams.get('department') ?? '';
  const dateFilter = searchParams.get('date') ?? '';
  const [selected, setSelected] = useState<InterviewAssignment | null>(null);
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [selectedResume, setSelectedResume] = useState<CandidateResumeDetail | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<CandidateJourney | null>(null);
  const [journeyError, setJourneyError] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<InterviewFeedback | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [feedbackAssignment, setFeedbackAssignment] = useState<InterviewAssignment | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [selectedRescheduleHistory, setSelectedRescheduleHistory] = useState<InterviewRescheduleRequest[]>([]);
  const [rescheduleAssignment, setRescheduleAssignment] = useState<InterviewAssignment | null>(null);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState('');

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await interviewsApi.listMyAssignments();
      setAssignments(rows);
      setSelected((current) => (
        current ? rows.find((item) => item.id === current.id) ?? current : null
      ));
    } catch (error) {
      setLoadError(userFacingError(error, '加载面试任务失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
    const refreshAssignments = () => void loadAssignments();
    window.addEventListener('focus', refreshAssignments);
    return () => window.removeEventListener('focus', refreshAssignments);
  }, [loadAssignments]);

  const changeListState = useCallback((tab: TabKey, query: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (query) next.set('q', query);
    else next.delete('q');
    next.delete('candidate');
    next.delete('assignment');
    next.delete('demand');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const changeListFilter = useCallback((key: 'job' | 'department' | 'date', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('candidate');
    next.delete('assignment');
    next.delete('demand');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const resetListFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    ['q', 'job', 'department', 'date', 'candidate', 'assignment', 'demand'].forEach((key) => next.delete(key));
    next.set('tab', 'all');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const rememberInterviewDetail = useCallback((assignment: InterviewAssignment | null) => {
    const next = new URLSearchParams(searchParams);
    if (assignment) {
      next.set('candidate', String(assignment.candidate_id));
      next.set('assignment', String(assignment.id));
      if (assignment.demand_id) next.set('demand', String(assignment.demand_id));
      else next.delete('demand');
    } else {
      next.delete('candidate');
      next.delete('assignment');
      next.delete('demand');
    }
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => assignments.filter((item) => {
    if (activeTab !== 'all' && assignmentBucket(item) !== activeTab) return false;
    if (jobFilter && item.job_title !== jobFilter) return false;
    if (departmentFilter && item.job_department !== departmentFilter) return false;
    if (dateFilter && interviewLocalDateKey(item.scheduled_at) !== dateFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [item.name_masked, item.job_title, item.job_department]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }), [activeTab, assignments, dateFilter, departmentFilter, jobFilter, searchQuery]);

  const filterOptions = useMemo(() => ({
    jobs: [...new Set(assignments.map((item) => item.job_title).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    departments: [...new Set(assignments.map((item) => item.job_department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  }), [assignments]);

  const counts = useMemo(() => ({
    all: assignments.length,
    upcoming: assignments.filter((item) => assignmentBucket(item) === 'upcoming').length,
    feedback: assignments.filter((item) => assignmentBucket(item) === 'feedback').length,
    completed: assignments.filter((item) => assignmentBucket(item) === 'completed').length,
  }), [assignments]);

  const openDetail = useCallback(async (assignment: InterviewAssignment, updateAddress = true) => {
    setSelected(assignment);
    setSelectedDemand(null);
    setSelectedResume(null);
    setSelectedJourney(null);
    setSelectedRescheduleHistory(assignment.reschedule_history || []);
    setJourneyError('');
    setSelectedFeedback(null);
    setDetailLoading(true);
    setDetailError('');
    if (updateAddress) {
      handledDeepLink.current = `${assignment.candidate_id}:${assignment.id}`;
      rememberInterviewDetail(assignment);
    }
    try {
      const journeyPromise = assignment.demand_id
        ? candidatesApi.getJourney(assignment.candidate_id, assignment.demand_id).catch((error) => {
          setJourneyError(error instanceof Error ? error.message : '完整招聘过程暂不可用');
          return null;
        })
        : Promise.resolve(null);
      const [resume, feedbackRows, demand, journey, rescheduleHistory] = await Promise.all([
        candidatesApi.getResume(assignment.candidate_id),
        interviewsApi.listFeedback({
          candidateId: assignment.candidate_id,
          demandId: assignment.demand_id ?? undefined,
        }),
        assignment.demand_id
          ? demandsApi.getDemand(assignment.demand_id)
          : Promise.resolve(null),
        journeyPromise,
        interviewsApi.listRescheduleHistory(assignment.id).catch(
          () => assignment.reschedule_history || [],
        ),
      ]);
      setSelectedResume(resume);
      setSelectedDemand(demand);
      setSelectedJourney(journey);
      setSelectedRescheduleHistory(rescheduleHistory);
      setSelectedFeedback(
        feedbackRows.find((item) => item.assignment_id === assignment.id)
          ?? feedbackRows.find((item) => item.round === assignment.round)
          ?? null,
      );
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载面试详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, [rememberInterviewDetail]);

  const closeDetail = useCallback(() => {
    handledDeepLink.current = '';
    setSelected(null);
    setSelectedDemand(null);
    setSelectedResume(null);
    setSelectedJourney(null);
    setSelectedRescheduleHistory([]);
    setSelectedFeedback(null);
    setDetailError('');
    setJourneyError('');
    setRescheduleAssignment(null);
    setRescheduleError('');
    rememberInterviewDetail(null);
  }, [rememberInterviewDetail]);

  useEffect(() => {
    const deepLinkKey = `${requestedCandidateId || ''}:${requestedAssignmentId || ''}`;
    if (loading || !requestedCandidateId || handledDeepLink.current === deepLinkKey) return;
    const assignment = latestCandidateAssignment(
      assignments,
      requestedCandidateId,
      requestedDemandId,
      requestedAssignmentId,
    );
    if (!assignment) return;
    handledDeepLink.current = deepLinkKey;
    void openDetail(assignment, false);
  }, [assignments, loading, openDetail, requestedAssignmentId, requestedCandidateId, requestedDemandId]);

  const openOriginalResume = async (download: boolean) => {
    if (!selected) return;
    setDetailError('');
    try {
      const blob = download
        ? await businessReviewsApi.downloadResume(selected.candidate_id)
        : await businessReviewsApi.loadResume(selected.candidate_id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = selectedResume?.original_resume.filename || `candidate-${selected.candidate_id}-resume`;
        anchor.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '读取原版简历失败');
    }
  };

  const startFeedback = async (assignment: InterviewAssignment) => {
    if (!canSubmitFeedback(assignment)) {
      setFeedbackError(
        interviewHasStarted(assignment.scheduled_at)
          ? '请等待招聘专员确认面试已经完成'
          : '面试尚未开始，暂时不能提交评价',
      );
      return;
    }
    if (selected?.id !== assignment.id) await openDetail(assignment);
    setFeedbackError('');
    setFeedbackAssignment(assignment);
  };

  const confirmAndStartFeedback = async (item: InterviewAssignment) => {
    setFeedbackError('');
    setConfirmationError('');
    try {
      const confirmed = await interviewsApi.markConducted(item.id);
      setAssignments((current) => current.map((assignment) => (
        assignment.id === confirmed.id ? confirmed : assignment
      )));
      if (selected?.id !== item.id) {
        await openDetail(confirmed);
      } else {
        setSelected(confirmed);
      }
      setFeedbackAssignment(confirmed);
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : '确认面试完成失败');
    }
  };

  const submitRescheduleRequest = async (payload: InterviewRescheduleRequestInput) => {
    if (!rescheduleAssignment) return;
    setRescheduleSaving(true);
    setRescheduleError('');
    setRescheduleSuccess('');
    try {
      await interviewsApi.requestReschedule(rescheduleAssignment.id, payload);
      const rows = await interviewsApi.listMyAssignments();
      const refreshed = rows.find((item) => item.id === rescheduleAssignment.id) ?? rescheduleAssignment;
      const history = await interviewsApi.listRescheduleHistory(rescheduleAssignment.id);
      setAssignments(rows);
      setSelected(refreshed);
      setSelectedRescheduleHistory(history);
      setRescheduleAssignment(null);
      setRescheduleSuccess('改约申请已提交，当前安排在招聘专员确认前仍然有效');
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : '提交改约申请失败');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const saveFeedback = async (payload: StructuredInterviewFeedbackValues) => {
    if (!feedbackAssignment) return;
    setFeedbackSaving(true);
    setFeedbackError('');
    try {
      let mutationResult: InterviewFeedbackMutationResult | null = null;
      if (selectedFeedback?.assignment_id === feedbackAssignment.id) {
        mutationResult = await interviewsApi.updateFeedback(selectedFeedback.id, payload);
      } else {
        mutationResult = await interviewsApi.saveFeedback({
          assignment_id: feedbackAssignment.id,
          ...payload,
        });
      }
      if (mutationResult?.next_round_created && mutationResult.next_round_sequence) {
        showToast(`已自动创建第 ${mutationResult.next_round_sequence} 轮面试，待安排面试官和时间`);
      }
      const completedAssignment: InterviewAssignment = {
        ...feedbackAssignment,
        status: feedbackAssignment.is_primary ? 'completed' : 'feedback_submitted',
        feedback_submitted: true,
      };
      setFeedbackAssignment(null);
      await Promise.all([loadAssignments(), openDetail(completedAssignment)]);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : '保存面试评价失败');
    } finally {
      setFeedbackSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-interviewer-assignments">
      <PageHeader
        title="我的面试"
        visuallyHiddenTitle
        description="查看已分配任务并提交每轮评价"
        actions={(
          <button
            type="button"
            onClick={() => void loadAssignments()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-background-200 bg-white px-3 text-sm text-foreground-600 hover:bg-background-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        )}
      />

      <div className="space-y-3">
        <WorkspaceTabs<TabKey>
          items={tabs.map((tab) => ({ ...tab, count: counts[tab.key] }))}
          value={activeTab}
          onChange={(tab) => changeListState(tab, searchQuery)}
          ariaLabel="我的面试状态"
        />
        <FilterBar ariaLabel="我的面试查询条件" className="rounded-xl border border-background-200 bg-white p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" />
            <input value={searchQuery} onChange={(event) => changeListState(activeTab, event.target.value)} placeholder="搜索候选人、岗位或部门" className="h-9 w-full rounded-md border border-background-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary-400" />
          </label>
          <select aria-label="按岗位筛选" value={jobFilter} onChange={(event) => changeListFilter('job', event.target.value)} className="h-9 min-w-[150px] rounded-lg border border-background-300 bg-white px-3 text-sm"><option value="">全部岗位</option>{filterOptions.jobs.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select aria-label="按部门筛选" value={departmentFilter} onChange={(event) => changeListFilter('department', event.target.value)} className="h-9 min-w-[130px] rounded-lg border border-background-300 bg-white px-3 text-sm"><option value="">全部部门</option>{filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <input type="date" aria-label="按面试日期筛选" value={dateFilter} onChange={(event) => changeListFilter('date', event.target.value)} className="h-9 rounded-lg border border-background-300 bg-white px-3 text-sm" />
          <button type="button" onClick={resetListFilters} disabled={!searchQuery && !jobFilter && !departmentFilter && !dateFilter && activeTab === 'all'} className="h-9 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-600 disabled:opacity-40">重置</button>
        </FilterBar>
      </div>

      {confirmationError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {confirmationError}
        </div>
      )}
      {rescheduleSuccess && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {rescheduleSuccess}
        </div>
      )}

      {loading ? (
        <PageStateCard variant="loading" title="正在加载面试任务" description="请稍候，正在读取最新面试安排。" />
      ) : loadError ? (
        <PageStateCard
          variant="error"
          title="面试任务加载失败"
          description={loadError}
          onAction={() => void loadAssignments()}
        />
      ) : filtered.length === 0 ? (
        <PageStateCard
          variant="empty"
          title="暂无符合条件的面试任务"
          description="可以切换状态或清除搜索条件后再查看。"
          actionLabel={searchQuery || jobFilter || departmentFilter || dateFilter || activeTab !== 'all' ? '清空筛选' : undefined}
          onAction={searchQuery || jobFilter || departmentFilter || dateFilter || activeTab !== 'all' ? resetListFilters : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-background-200 bg-white">
          <div className="divide-y divide-background-100">
            {filtered.map((item) => {
              const bucket = assignmentBucket(item);
              const actionLabel = feedbackActionLabel(item);
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-background-50/70">
                  <button
                    type="button"
                    onClick={() => void openDetail(item)}
                    className="flex min-w-[240px] flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 text-sm font-bold text-primary-700">
                      {(item.name_masked || '?').slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground-900">
                        {item.name_masked || `候选人 #${item.candidate_id}`}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-500">
                        {item.job_title || `岗位 #${item.job_id}`} · 第 {item.round_sequence} 轮
                      </span>
                    </span>
                  </button>
                  <span className="inline-flex min-w-[150px] items-center gap-2 text-xs text-foreground-500">
                    <Clock3 size={14} /> {formatInterviewDateTime(item.scheduled_at)}
                  </span>
                  <span className="inline-flex min-w-[120px] items-center gap-2 text-xs text-foreground-500">
                    <MapPin size={14} /> {item.location || '地点待确认'}
                  </span>
                  <SemanticStatusBadge tone={statusPresentation(interviewStatusPresentation, bucket === 'upcoming' ? 'scheduled' : bucket === 'feedback' ? 'awaiting_feedback' : 'completed').tone}>
                    {bucket === 'feedback' ? '待反馈' : bucket === 'completed' ? '已完成' : interviewHasStarted(item.scheduled_at) ? '等待确认' : '待面试'}
                  </SemanticStatusBadge>
                  <ActionButton
                    tone="primary"
                    onClick={() => void (
                      canSelfConfirm(item)
                        ? confirmAndStartFeedback(item)
                        : startFeedback(item)
                    )}
                    disabled={!canSubmitFeedback(item) && !canSelfConfirm(item)}
                    title={!canSubmitFeedback(item) && !canSelfConfirm(item) ? actionLabel : undefined}
                    className="h-9"
                    icon={<MessageSquareText size={15} />}
                  >
                    {actionLabel}
                  </ActionButton>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <InterviewerInterviewDetailDrawer
          assignment={selected}
          demand={selectedDemand}
          resume={selectedResume}
          journey={selectedJourney}
          feedback={selectedFeedback}
          detailLoading={detailLoading}
          detailError={detailError}
          journeyError={journeyError}
          confirmationError={confirmationError}
          actionLabel={selectedFeedback ? '修改评价' : feedbackActionLabel(selected)}
          canSubmit={canSubmitFeedback(selected)}
          canSelfConfirm={canSelfConfirm(selected)}
          canRequestReschedule={selected.status === 'scheduled' && !selected.feedback_submitted && !selected.pending_reschedule}
          rescheduleHistory={selectedRescheduleHistory}
          escapeDisabled={feedbackAssignment !== null || rescheduleAssignment !== null}
          onClose={closeDetail}
          onRetry={() => void openDetail(selected, false)}
          onViewOriginal={() => void openOriginalResume(false)}
          onDownloadOriginal={() => void openOriginalResume(true)}
          onStartFeedback={() => void startFeedback(selected)}
          onConfirmAndStartFeedback={() => void confirmAndStartFeedback(selected)}
          onRequestReschedule={() => {
            setRescheduleError('');
            setRescheduleAssignment(selected);
          }}
        />
      )}

      {feedbackAssignment && (
        <SimpleFeedbackModal
          assignment={feedbackAssignment}
          existingFeedback={
            selectedFeedback?.assignment_id === feedbackAssignment.id ? selectedFeedback : null
          }
          saving={feedbackSaving}
          error={feedbackError}
          onClose={() => !feedbackSaving && setFeedbackAssignment(null)}
          onSave={(payload) => void saveFeedback(payload)}
        />
      )}

      {rescheduleAssignment && (
        <RescheduleRequestModal
          assignment={rescheduleAssignment}
          saving={rescheduleSaving}
          error={rescheduleError}
          onClose={() => !rescheduleSaving && setRescheduleAssignment(null)}
          onSubmit={(payload) => void submitRescheduleRequest(payload)}
        />
      )}
    </div>
  );
}
