import { CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { interviewsApi } from '@/features/interviews/api';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewerOption,
} from '@/features/interviews/types';
import { pipelineApi } from '@/features/pipeline/api';
import ScheduleInterviewModal from './components/ScheduleInterviewModal';

type StatusTab = 'all' | 'unassigned' | 'scheduled' | 'awaiting_feedback' | 'completed';

const tabs: Array<{ key: StatusTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unassigned', label: '待安排' },
  { key: 'scheduled', label: '已安排' },
  { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'completed', label: '已完成' },
];

function rowStatus(row: InterviewManagementRow): Exclude<StatusTab, 'all'> {
  if (row.feedback_submitted || ['completed', 'feedback_submitted'].includes(row.assignment_status)) return 'completed';
  if (row.assignment_status === 'awaiting_feedback') return 'awaiting_feedback';
  if (!row.assignment_id || row.assignment_status === 'unassigned') return 'unassigned';
  return 'scheduled';
}

function statusLabel(status: Exclude<StatusTab, 'all'>) {
  return {
    unassigned: '待安排',
    scheduled: '已安排',
    awaiting_feedback: '待反馈',
    completed: '已完成',
  }[status];
}

function formatDateTime(value: string | null) {
  if (!value) return '时间待安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function canMarkConducted(row: InterviewManagementRow) {
  if (!row.scheduled_at) return true;
  const scheduled = new Date(row.scheduled_at).getTime();
  return Number.isNaN(scheduled) || scheduled <= Date.now();
}

function followUpScheduleRow(
  row: InterviewManagementRow,
  mode: 'next_round' | 'add_interviewer',
): InterviewManagementRow {
  const currentSequence = row.round_sequence || 1;
  const nextSequence = mode === 'next_round' ? currentSequence + 1 : currentSequence;
  return {
    ...row,
    round: mode === 'next_round'
      ? nextSequence <= 3 ? `round_${nextSequence}` : 'additional'
      : row.round || 'additional',
    round_sequence: nextSequence,
    assignment_id: null,
    is_primary: mode === 'next_round',
    interviewer_id: null,
    interviewer_name: null,
    scheduled_at: null,
    location: '',
    note: '',
    assignment_status: 'unassigned',
    feedback_id: null,
    feedback_submitted: false,
    feedback_score: null,
    feedback_passed: null,
    feedback_result: null,
  };
}

export default function RecruiterInterviewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const requestedCandidateId = Number(searchParams.get('candidate')) || null;
  const handledCandidateId = useRef<number | null>(null);
  const [rows, setRows] = useState<InterviewManagementRow[]>([]);
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [scheduleRow, setScheduleRow] = useState<InterviewManagementRow | null>(null);
  const [scheduleIsPrimary, setScheduleIsPrimary] = useState(true);
  const [selectedRow, setSelectedRow] = useState<InterviewManagementRow | null>(null);
  const [confirmConductedRow, setConfirmConductedRow] = useState<InterviewManagementRow | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionRowId, setActionRowId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [managementRows, reviewerRows] = await Promise.all([
        interviewsApi.listManagementRows(),
        interviewsApi.listInterviewers(),
      ]);
      setRows(managementRows);
      setInterviewers(reviewerRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '面试管理加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkbench();
    const refresh = () => void loadWorkbench();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadWorkbench]);

  useEffect(() => {
    if (!requestedCandidateId || loading || handledCandidateId.current === requestedCandidateId) return;
    const row = rows.find((item) => (
      item.candidate_id === requestedCandidateId
      && (!requestedDemandId || item.demand_id === requestedDemandId)
    ));
    if (!row) return;
    handledCandidateId.current = requestedCandidateId;
    if (rowStatus(row) === 'unassigned') {
      setScheduleIsPrimary(true);
      setScheduleRow(row);
    }
    else setSelectedRow(row);
  }, [loading, requestedCandidateId, requestedDemandId, rows]);

  const counts = useMemo(() => tabs.reduce<Record<StatusTab, number>>((result, tab) => {
    result[tab.key] = tab.key === 'all' ? rows.length : rows.filter((row) => rowStatus(row) === tab.key).length;
    return result;
  }, { all: 0, unassigned: 0, scheduled: 0, awaiting_feedback: 0, completed: 0 }), [rows]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    if (activeTab !== 'all' && rowStatus(row) !== activeTab) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [row.name_masked, row.job_title, row.job_department, row.interviewer_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }), [activeTab, rows, search]);

  const saveSchedule = async (payload: InterviewAssignmentInput | InterviewAssignmentUpdateInput) => {
    if (!scheduleRow) return;
    setSaving(true);
    setActionError('');
    try {
      if (scheduleRow.assignment_id) {
        await interviewsApi.updateAssignment(scheduleRow.assignment_id, payload as InterviewAssignmentUpdateInput);
        setSuccessMessage('面试安排已更新，面试官会收到站内通知；企业微信待接入');
      } else {
        await interviewsApi.createAssignment(payload as InterviewAssignmentInput);
        setSuccessMessage('站内面试日程和待办已创建；企业微信日历待接入');
      }
      setScheduleRow(null);
      setSelectedRow(null);
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
    setScheduleRow(row);
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
      setSelectedRow(null);
      setShowReject(false);
      setRejectReason('');
      await loadWorkbench();
      if (stage === 'offer') {
        navigate(`/offers?demand=${row.demand_id}&candidate=${row.candidate_id}`);
      } else {
        setSuccessMessage('候选人已淘汰并保留在人才库，原因已写入流程记录');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存面试结果下一步失败');
    } finally {
      setDecisionBusy(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-recruiter-interview-workbench">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground-900">面试管理</h1>
          <p className="mt-1 text-sm text-foreground-500">从安排面试到收回反馈，都在这里处理</p>
        </div>
        <button type="button" onClick={() => void loadWorkbench()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-600 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </header>

      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} />{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage('')} aria-label="关闭提示"><X size={15} /></button>
        </div>
      )}
      {actionError && !scheduleRow && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      <div className="flex flex-wrap items-center gap-2 border-b border-background-200 pb-3">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-3 py-2 text-sm font-medium ${activeTab === tab.key ? 'bg-primary-500 text-white' : 'text-foreground-600 hover:bg-background-100'}`}>
            {tab.label} <span className="ml-1 text-xs opacity-80">{counts[tab.key]}</span>
          </button>
        ))}
        <label className="relative ml-auto min-w-[240px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-foreground-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索候选人、岗位或面试官" className="h-9 w-full rounded-lg border border-background-300 bg-white pl-9 pr-3 text-sm" />
        </label>
      </div>

      {loading ? (
        <div className="rounded-lg border border-background-200 bg-white py-20 text-center text-sm text-foreground-500"><RefreshCw className="mx-auto mb-2 animate-spin" size={18} />正在加载面试工作台...</div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-10 text-center"><p className="text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void loadWorkbench()} className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700">重新加载</button></div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-background-200 bg-white py-20 text-center"><CalendarDays className="mx-auto mb-3 text-foreground-300" size={30} /><p className="text-sm font-medium text-foreground-600">暂无符合条件的面试任务</p></div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-background-200 bg-white">
          <div className="divide-y divide-background-100">
            {visibleRows.map((row) => {
              const status = rowStatus(row);
              const busy = actionRowId === row.assignment_id;
              return (
                <article key={`${row.demand_id}-${row.candidate_id}-${row.assignment_id || 'new'}`} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-background-50/70">
                  <button type="button" onClick={() => setSelectedRow(row)} className="flex min-w-[250px] flex-1 items-center gap-3 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">{row.name_masked.slice(0, 1)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground-900">{row.name_masked}</span>
                      <span className="mt-0.5 block truncate text-xs text-foreground-500">{row.job_title} · {row.job_department || '部门未填写'}</span>
                    </span>
                  </button>
                  <span className="inline-flex min-w-[150px] items-center gap-2 text-xs text-foreground-500"><Clock3 size={14} />{formatDateTime(row.scheduled_at)}</span>
                  <span className="inline-flex min-w-[130px] items-center gap-2 text-xs text-foreground-500"><UserRound size={14} />{row.interviewer_name || '面试官待安排'}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'unassigned' ? 'bg-amber-100 text-amber-700' : status === 'awaiting_feedback' ? 'bg-violet-100 text-violet-700' : status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-100 text-primary-700'}`}>{statusLabel(status)}</span>
                  <div className="flex shrink-0 gap-2">
                    {status === 'unassigned' && <button type="button" onClick={() => openSchedule(row)} className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white">安排面试</button>}
                    {status === 'scheduled' && <><button type="button" onClick={() => openSchedule(row)} className="rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-700">调整安排</button><button type="button" onClick={() => setConfirmConductedRow(row)} disabled={busy || !canMarkConducted(row)} title={!canMarkConducted(row) ? '面试尚未开始，不能提前确认' : undefined} className="rounded-lg bg-foreground-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-background-200 disabled:text-foreground-500">{canMarkConducted(row) ? '确认已面试' : '面试未开始'}</button></>}
                    {status === 'awaiting_feedback' && <button type="button" onClick={() => void runAssignmentAction(row, 'remind')} disabled={busy} className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">催反馈</button>}
                    {status === 'completed' && <button type="button" onClick={() => setSelectedRow(row)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700">查看反馈</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground-900/40" role="presentation" onMouseDown={() => setSelectedRow(null)}>
          <aside className="h-full w-full max-w-[520px] overflow-y-auto bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-foreground-900">{selectedRow.name_masked}</h2><p className="mt-1 text-sm text-foreground-500">{selectedRow.job_title}</p></div><button type="button" onClick={() => setSelectedRow(null)} className="rounded-lg p-2 text-foreground-400 hover:bg-background-100"><X size={18} /></button></div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-foreground-400">当前状态</dt><dd className="mt-1 font-medium text-foreground-800">{statusLabel(rowStatus(selectedRow))}</dd></div>
              <div><dt className="text-xs text-foreground-400">面试官</dt><dd className="mt-1 font-medium text-foreground-800">{selectedRow.interviewer_name || '待安排'}</dd></div>
              <div><dt className="text-xs text-foreground-400">面试时间</dt><dd className="mt-1 text-foreground-700">{formatDateTime(selectedRow.scheduled_at)}</dd></div>
              <div><dt className="text-xs text-foreground-400">地点 / 链接</dt><dd className="mt-1 inline-flex items-center gap-1 text-foreground-700"><MapPin size={13} />{selectedRow.location || '待确认'}</dd></div>
            </dl>
            {selectedRow.note && <div className="mt-5 rounded-lg bg-background-50 px-4 py-3"><p className="text-xs text-foreground-400">安排备注</p><p className="mt-1 text-sm text-foreground-700">{selectedRow.note}</p></div>}
            {selectedRow.feedback_submitted && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"><p className="text-sm font-medium text-emerald-800">面试反馈已提交</p><p className="mt-1 text-sm text-emerald-700">结论：{selectedRow.feedback_result === 'passed' ? '通过' : selectedRow.feedback_result === 'not_passed' ? '不通过' : '待定'}{selectedRow.feedback_score !== null ? ` · ${selectedRow.feedback_score} 分` : ''}</p></div>}

            {selectedRow.feedback_submitted && selectedRow.pipeline_stage === 'interview' && (
              <section className="mt-5 rounded-lg border border-primary-200 bg-primary-50/40 p-4">
                <h3 className="text-sm font-semibold text-foreground-900">招聘专员确认下一步</h3>
                <p className="mt-1 text-xs leading-5 text-foreground-500">面试官只提交评价，候选人不会自动跳阶段。请根据结果明确选择下一步。</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openFollowUpSchedule(selectedRow, 'next_round')} disabled={decisionBusy} className="rounded-lg bg-primary-500 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">安排下一轮</button>
                  <button type="button" onClick={() => openFollowUpSchedule(selectedRow, 'add_interviewer')} disabled={decisionBusy} className="rounded-lg border border-primary-200 bg-white px-3 py-2.5 text-sm font-medium text-primary-700 disabled:opacity-50">增加面试官</button>
                  <button type="button" onClick={() => void moveAfterInterview(selectedRow, 'offer', '')} disabled={decisionBusy} className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium text-emerald-700 disabled:opacity-50">进入 Offer</button>
                  <button type="button" onClick={() => setShowReject(true)} disabled={decisionBusy} className="rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-medium text-red-700 disabled:opacity-50">淘汰候选人</button>
                </div>
                {showReject && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <label className="block text-xs font-medium text-red-800">淘汰原因（必填）
                      <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} maxLength={500} placeholder="请写清与岗位不匹配的具体原因" className="mt-2 w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-foreground-800" />
                    </label>
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => { setShowReject(false); setRejectReason(''); }} className="px-3 py-1.5 text-xs text-foreground-600">取消</button>
                      <button type="button" onClick={() => void moveAfterInterview(selectedRow, 'rejected', rejectReason)} disabled={decisionBusy || !rejectReason.trim()} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">确认淘汰</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedRow.feedback_submitted && selectedRow.pipeline_stage !== 'interview' && (
              <div className="mt-5 rounded-lg border border-background-200 bg-background-50 px-4 py-3 text-sm text-foreground-600">
                该候选人已进入“{selectedRow.pipeline_stage === 'offer' ? 'Offer' : selectedRow.pipeline_stage === 'rejected' ? '已淘汰' : selectedRow.pipeline_stage}”阶段，不再重复显示面试决策。
              </div>
            )}
          </aside>
        </div>
      )}

      {confirmConductedRow && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground-900/45 p-4" role="presentation" onMouseDown={() => setConfirmConductedRow(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-conducted-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="confirm-conducted-title" className="text-base font-semibold text-foreground-900">确认这场面试已经完成？</h2>
            <p className="mt-2 text-sm leading-6 text-foreground-500">确认后会把任务交给面试官填写评价。请先核对候选人、时间和面试官，避免提前确认。</p>
            <div className="mt-4 rounded-lg bg-background-50 px-3 py-2 text-sm text-foreground-700">{confirmConductedRow.name_masked} · {formatDateTime(confirmConductedRow.scheduled_at)} · {confirmConductedRow.interviewer_name || '面试官未填写'}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmConductedRow(null)} className="rounded-lg border border-background-300 bg-white px-4 py-2 text-sm text-foreground-700">返回核对</button>
              <button type="button" onClick={() => void runAssignmentAction(confirmConductedRow, 'conducted')} disabled={actionRowId !== null} className="rounded-lg bg-foreground-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">确认已面试</button>
            </div>
          </div>
        </div>
      )}

      {scheduleRow && <ScheduleInterviewModal row={scheduleRow} interviewers={interviewers} saving={saving} error={actionError} isPrimary={scheduleIsPrimary} onClose={() => { if (!saving) { setScheduleRow(null); setActionError(''); } }} onSave={(payload) => void saveSchedule(payload)} onCancelAssignment={(reason) => void cancelSchedule(reason)} />}
    </div>
  );
}
