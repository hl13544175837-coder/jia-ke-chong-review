import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileSearch,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type {
  BusinessReviewDecisionInput,
  BusinessReviewStatus,
  BusinessReviewTask,
} from '@/features/businessReviews/types';
import { useToast } from '@/hooks/useToast';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import FilterBar from '@/components/ui/FilterBar';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { businessReviewStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import { userFacingError } from '@/lib/userFacingError';
import ReviewActionModal from '@/features/businessReviews/components/ReviewActionModal';
import BusinessReviewDetail from './components/BusinessReviewDetail';

type Decision = BusinessReviewDecisionInput['decision'];

const statusMeta: Record<BusinessReviewStatus, { label: string; badge: string; icon: LucideIcon }> = {
  pending: { label: '待筛选', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: FileSearch },
  approved: { label: '已通过', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: '不合适', badge: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  needs_info: { label: '待 HR 补充', badge: 'bg-sky-50 text-sky-700 border-sky-200', icon: CircleHelp },
};

const tabs = (Object.keys(statusMeta) as BusinessReviewStatus[]).map((key) => ({
  key,
  ...statusMeta[key],
}));

const emptyLabels: Record<BusinessReviewStatus, string> = {
  pending: '暂无待筛选任务',
  approved: '暂无已通过任务',
  rejected: '暂无不合适任务',
  needs_info: '暂无待 HR 补充任务',
};

function formatDate(value: string | null) {
  if (!value) return '-';
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

function dueState(value: string | null) {
  if (!value) return { label: '未设置截止', className: 'text-foreground-500' };
  const date = new Date(value);
  const remaining = date.getTime() - Date.now();
  if (Number.isNaN(remaining)) return { label: value, className: 'text-foreground-500' };
  if (remaining < 0) return { label: `已逾期 · ${formatDate(value)}`, className: 'text-red-600' };
  if (remaining <= 24 * 60 * 60 * 1000) {
    return { label: `24 小时内 · ${formatDate(value)}`, className: 'text-amber-700' };
  }
  return { label: formatDate(value), className: 'text-foreground-600' };
}

function errorMessage(error: unknown, fallback = '业务筛选任务读取失败') {
  return userFacingError(error, fallback);
}

function reviewTabFromQuery(value: string | null): BusinessReviewStatus {
  return tabs.some((tab) => tab.key === value) ? value as BusinessReviewStatus : 'pending';
}

export default function InterviewerScreeningPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTaskId = Number(searchParams.get('task'));
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const handledTaskId = useRef<number | null>(null);
  const activeTab = reviewTabFromQuery(searchParams.get('tab'));
  const query = searchParams.get('q') || '';
  const jobFilter = searchParams.get('job') || '';
  const departmentFilter = searchParams.get('department') || '';
  const cityFilter = searchParams.get('city') || '';
  const [tasks, setTasks] = useState<BusinessReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<BusinessReviewTask | null>(null);
  const [reviewTask, setReviewTask] = useState<BusinessReviewTask | null>(null);
  const [reviewDecision, setReviewDecision] = useState<Decision>('approved');
  const [decisionError, setDecisionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await businessReviewsApi.listMine();
      setTasks(Array.isArray(response.items) ? response.items : []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    const refreshTasks = () => void loadTasks(false);
    window.addEventListener('focus', refreshTasks);
    return () => window.removeEventListener('focus', refreshTasks);
  }, [loadTasks]);

  const rememberTask = useCallback((taskId: number | null, tab: BusinessReviewStatus = activeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (taskId) next.set('task', String(taskId));
    else next.delete('task');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  const openTaskDetail = useCallback((task: BusinessReviewTask) => {
    handledTaskId.current = task.id;
    setSelectedTask(task);
    rememberTask(task.id, task.status);
  }, [rememberTask]);

  const closeTaskDetail = useCallback(() => {
    handledTaskId.current = null;
    setSelectedTask(null);
    rememberTask(null);
  }, [rememberTask]);

  const changeActiveTab = useCallback((tab: BusinessReviewStatus) => {
    handledTaskId.current = null;
    setSelectedTask(null);
    rememberTask(null, tab);
  }, [rememberTask]);

  useEffect(() => {
    if (!Number.isInteger(requestedTaskId) || requestedTaskId <= 0) return;
    if (handledTaskId.current === requestedTaskId) return;
    const requestedTask = tasks.find((task) => task.id === requestedTaskId);
    if (!requestedTask) return;
    openTaskDetail(requestedTask);
  }, [openTaskDetail, requestedTaskId, tasks]);

  const scopedTasks = useMemo(
    () => requestedDemandId ? tasks.filter((task) => task.demand_id === requestedDemandId) : tasks,
    [requestedDemandId, tasks],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<BusinessReviewStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      needs_info: 0,
    };
    scopedTasks.forEach((task) => {
      counts[task.status] += 1;
    });
    return counts;
  }, [scopedTasks]);

  const visibleTasks = useMemo(
    () => scopedTasks.filter((task) => (
      task.status === activeTab
      && (!query.trim() || [task.candidate.name_masked, task.demand.job_title, task.demand.department, task.demand.city]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN'))))
      && (!jobFilter || task.demand.job_title === jobFilter)
      && (!departmentFilter || task.demand.department === departmentFilter)
      && (!cityFilter || task.demand.city === cityFilter)
    )),
    [activeTab, cityFilter, departmentFilter, jobFilter, query, scopedTasks],
  );

  const filterOptions = useMemo(() => ({
    jobs: [...new Set(scopedTasks.map((task) => task.demand.job_title).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    departments: [...new Set(scopedTasks.map((task) => task.demand.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    cities: [...new Set(scopedTasks.map((task) => task.demand.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  }), [scopedTasks]);

  const setFilter = useCallback((key: 'q' | 'job' | 'department' | 'city', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('task');
    setSelectedTask(null);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    ['q', 'job', 'department', 'city', 'task'].forEach((key) => next.delete(key));
    setSelectedTask(null);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const scopedDemand = scopedTasks[0]?.demand ?? tasks.find((task) => task.demand_id === requestedDemandId)?.demand;

  const openReview = useCallback((task: BusinessReviewTask, decision: Decision) => {
    setDecisionError('');
    setReviewDecision(decision);
    setReviewTask(task);
  }, []);

  const handleReviewSubmit = useCallback(async (decision: Decision, note: string) => {
    if (!reviewTask) return;
    setSubmitting(true);
    setDecisionError('');
    try {
      await businessReviewsApi.decideTask(reviewTask.id, { decision, note });
      const label = statusMeta[decision].label;
      showToast(`已提交「${reviewTask.candidate.name_masked}」的筛选结果：${label}`);
      setReviewTask(null);
      closeTaskDetail();
      await loadTasks(false);
    } catch (submitError) {
      setDecisionError(errorMessage(submitError, '提交筛选结果失败'));
    } finally {
      setSubmitting(false);
    }
  }, [closeTaskDetail, loadTasks, reviewTask, showToast]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="候选人筛选"
        visuallyHiddenTitle
        description="招聘专员推送的简历，由业务负责人决定是否进入一面"
        actions={(
          <div>
          <p className="text-xs text-foreground-500">当前待处理</p>
          <p className="mt-0.5 text-2xl font-bold text-amber-600">{tabCounts.pending}</p>
          </div>
        )}
      />

      <WorkspaceTabs<BusinessReviewStatus>
        items={tabs.map(({ key, label }) => ({ key, label, count: tabCounts[key] }))}
        value={activeTab}
        onChange={changeActiveTab}
        ariaLabel="业务筛选状态"
      />

      <FilterBar ariaLabel="候选人筛选查询条件" className="rounded-xl border border-background-200 bg-white p-3">
        <input aria-label="搜索候选人" value={query} onChange={(event) => setFilter('q', event.target.value)} placeholder="搜索候选人或岗位" className="h-9 min-w-[220px] flex-1 rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400" />
        <select aria-label="按岗位筛选" value={jobFilter} onChange={(event) => setFilter('job', event.target.value)} className="h-9 min-w-[150px] rounded-lg border border-background-300 bg-white px-3 text-sm"><option value="">全部岗位</option>{filterOptions.jobs.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="按部门筛选" value={departmentFilter} onChange={(event) => setFilter('department', event.target.value)} className="h-9 min-w-[130px] rounded-lg border border-background-300 bg-white px-3 text-sm"><option value="">全部部门</option>{filterOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="按城市筛选" value={cityFilter} onChange={(event) => setFilter('city', event.target.value)} className="h-9 min-w-[120px] rounded-lg border border-background-300 bg-white px-3 text-sm"><option value="">全部城市</option>{filterOptions.cities.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <button type="button" onClick={resetFilters} disabled={!query && !jobFilter && !departmentFilter && !cityFilter} className="h-9 rounded-lg border border-background-300 bg-white px-3 text-sm font-medium text-foreground-600 disabled:opacity-40">重置</button>
      </FilterBar>

      {requestedDemandId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm">
          <span className="text-foreground-600">当前仅显示：{scopedDemand?.job_title || `需求 #${requestedDemandId}`}</span>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('demand');
              setSearchParams(next, { replace: true });
            }}
            className="font-medium text-primary-700 hover:text-primary-800"
          >查看全部任务</button>
        </div>
      )}

      <section aria-live="polite" aria-busy={loading}>
        {loading ? (
          <PageStateCard variant="loading" title="正在加载业务筛选任务" description="请稍候，正在读取最新筛选任务。" />
        ) : error ? (
          <PageStateCard
            variant="error"
            title="业务筛选任务加载失败"
            description={error}
            onAction={() => void loadTasks()}
          />
        ) : visibleTasks.length === 0 ? (
          <PageStateCard
            variant="empty"
            title={emptyLabels[activeTab]}
            description={activeTab === 'pending' ? '招聘专员推送新简历后，任务会出现在这里。' : '该状态暂时没有记录。'}
          />
        ) : (
          <div className="space-y-2">
            {visibleTasks.map((task) => {
              const meta = statusMeta[task.status];
              const StatusIcon = meta.icon;
              const due = dueState(task.due_at);
              return (
                <article key={task.id} className="rounded-lg border border-background-200 bg-white hover:border-background-300">
                  <button
                    type="button"
                    onClick={() => openTaskDetail(task)}
                    className="w-full px-4 py-4 text-left sm:px-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">
                        {task.candidate.name_masked.charAt(0) || '候'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground-900">{task.candidate.name_masked}</span>
                          <SemanticStatusBadge tone={statusPresentation(businessReviewStatusPresentation, task.status, meta.label).tone} className="gap-1 px-2 py-0.5">
                            <StatusIcon size={12} aria-hidden="true" />
                            {meta.label}
                          </SemanticStatusBadge>
                        </span>
                        <span className="mt-1 block text-xs text-foreground-500">
                          {task.demand.job_title} · {task.demand.department || '部门未填写'} · {task.demand.city || '城市未填写'}
                        </span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-2 text-xs font-medium text-primary-600">
                        查看详情 <ArrowRight size={15} aria-hidden="true" />
                      </span>
                    </div>

                    <span className="mt-3 grid gap-2 border-t border-background-100 pt-3 text-xs sm:grid-cols-3">
                      <span className="min-w-0">
                        <span className="block text-foreground-400">HR 备注</span>
                        <span className="mt-0.5 block truncate text-foreground-700">{task.hr_note || '未填写'}</span>
                      </span>
                      <span>
                        <span className="block text-foreground-400">推送人</span>
                        <span className="mt-0.5 block text-foreground-700">
                          {task.created_by_name || '招聘专员'} · {formatDate(task.created_at)}
                        </span>
                      </span>
                      <span>
                        <span className="block text-foreground-400">{task.status === 'pending' ? '处理截止' : '决定时间'}</span>
                        <span className={`mt-0.5 flex items-center gap-1 ${task.status === 'pending' ? due.className : 'text-foreground-700'}`}>
                          <Clock3 size={12} aria-hidden="true" />
                          {task.status === 'pending' ? due.label : formatDate(task.decided_at)}
                        </span>
                      </span>
                    </span>

                    {task.status !== 'pending' && (
                      <span className="mt-3 block rounded-md bg-background-50 px-3 py-2 text-xs text-foreground-600">
                        业务备注：{task.business_note || '未填写'}
                      </span>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedTask && (
        <div className="workspace-detail-backdrop fixed inset-0 z-40 flex justify-end bg-black/35 lg:left-[var(--workspace-sidebar-width)] lg:top-14" role="presentation">
          <button
            type="button"
            aria-label="关闭业务筛选详情"
            className="absolute inset-0 cursor-default"
            onClick={closeTaskDetail}
          />
          <aside
            role="dialog"
            aria-label={`${selectedTask.candidate.name_masked}的业务筛选详情`}
            className="workspace-detail-panel relative h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-background-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground-900">业务筛选详情</p>
                <p className="mt-0.5 text-xs text-foreground-500">任务 #{selectedTask.id}</p>
              </div>
              <button
                type="button"
                title="关闭详情"
                aria-label="关闭详情"
                onClick={closeTaskDetail}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100 hover:text-foreground-800"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <BusinessReviewDetail
              task={selectedTask}
              onReview={selectedTask.status === 'pending' ? (decision) => openReview(selectedTask, decision) : undefined}
            />
          </aside>
        </div>
      )}

      {reviewTask && (
        <ReviewActionModal
          task={reviewTask}
          initialDecision={reviewDecision}
          onClose={() => {
            if (!submitting) setReviewTask(null);
          }}
          onSubmit={handleReviewSubmit}
          isSubmitting={submitting}
          error={decisionError}
        />
      )}
    </div>
  );
}
