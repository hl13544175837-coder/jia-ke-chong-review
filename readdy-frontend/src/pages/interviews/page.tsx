import { CalendarDays, CheckCircle2, Clock3, MapPin, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { interviewsApi } from '@/features/interviews/api';
import type {
  InterviewAssignmentInput,
  InterviewAssignmentUpdateInput,
  InterviewManagementRow,
  InterviewerOption,
} from '@/features/interviews/types';
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

export default function RecruiterInterviewsPage() {
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
  const [selectedRow, setSelectedRow] = useState<InterviewManagementRow | null>(null);
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
    if (rowStatus(row) === 'unassigned') setScheduleRow(row);
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
        setSuccessMessage('面试安排已更新，面试官会收到通知');
      } else {
        await interviewsApi.createAssignment(payload as InterviewAssignmentInput);
        setSuccessMessage('面试已安排，面试官已收到待办');
      }
      setScheduleRow(null);
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
                    {status === 'unassigned' && <button type="button" onClick={() => setScheduleRow(row)} className="rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white">安排面试</button>}
                    {status === 'scheduled' && <><button type="button" onClick={() => setScheduleRow(row)} className="rounded-lg border border-background-300 bg-white px-3 py-2 text-sm text-foreground-700">调整安排</button><button type="button" onClick={() => void runAssignmentAction(row, 'conducted')} disabled={busy} className="rounded-lg bg-foreground-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">确认已面试</button></>}
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
          </aside>
        </div>
      )}

      {scheduleRow && <ScheduleInterviewModal row={scheduleRow} interviewers={interviewers} saving={saving} error={actionError} onClose={() => { if (!saving) { setScheduleRow(null); setActionError(''); } }} onSave={(payload) => void saveSchedule(payload)} onCancelAssignment={(reason) => void cancelSchedule(reason)} />}
    </div>
  );
}

