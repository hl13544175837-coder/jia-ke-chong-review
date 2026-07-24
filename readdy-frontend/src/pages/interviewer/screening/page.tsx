import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileSearch,
  LoaderCircle,
  RotateCw,
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
import ReviewActionModal from '@/pages/interviewer/dashboard/components/ReviewActionModal';
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '业务筛选任务读取失败';
}

export default function InterviewerScreeningPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<BusinessReviewStatus>('pending');
  const [tasks, setTasks] = useState<BusinessReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<BusinessReviewTask | null>(null);
  const [reviewTask, setReviewTask] = useState<BusinessReviewTask | null>(null);
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
  }, [loadTasks]);

  const tabCounts = useMemo(() => {
    const counts: Record<BusinessReviewStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      needs_info: 0,
    };
    tasks.forEach((task) => {
      counts[task.status] += 1;
    });
    return counts;
  }, [tasks]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.status === activeTab),
    [activeTab, tasks],
  );

  const openReview = useCallback((task: BusinessReviewTask) => {
    setDecisionError('');
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
      setSelectedTask(null);
      await loadTasks(false);
    } catch (submitError) {
      setDecisionError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }, [loadTasks, reviewTask, showToast]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-background-200 pb-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <BriefcaseBusiness size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-heading font-bold text-foreground-900">待业务筛选</h1>
            <p className="mt-0.5 text-sm text-foreground-500">
              招聘专员推送的简历，由业务负责人决定是否进入一面
            </p>
          </div>
        </div>
        <div className="sm:ml-auto">
          <p className="text-xs text-foreground-500">当前待处理</p>
          <p className="mt-0.5 text-2xl font-bold text-amber-600">{tabCounts.pending}</p>
        </div>
      </header>

      <section aria-label="业务筛选状态概览" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
              activeTab === key
                ? 'border-primary-300 bg-primary-50/50'
                : 'border-background-200 bg-white hover:border-background-300 hover:bg-background-50'
            }`}
          >
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${statusMeta[key].badge}`}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold text-foreground-900">{tabCounts[key]}</span>
              <span className="block text-xs font-medium text-foreground-600">{label}</span>
            </span>
          </button>
        ))}
      </section>

      <div className="overflow-x-auto border-b border-background-200" role="tablist" aria-label="业务筛选状态">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-foreground-500 hover:text-foreground-800'
              }`}
            >
              {label}
              <span className="ml-2 text-xs text-foreground-400">{tabCounts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <section aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-lg border border-background-200 bg-white text-sm text-foreground-500">
            <LoaderCircle className="mr-2 animate-spin" size={18} aria-hidden="true" />
            正在加载业务筛选任务...
          </div>
        ) : error ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50/40 px-6 text-center">
            <AlertCircle size={24} className="text-red-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-800">业务筛选任务加载失败</p>
            <p className="mt-1 max-w-xl text-xs text-foreground-500">{error}</p>
            <button
              type="button"
              onClick={() => void loadTasks()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-700 hover:bg-background-50"
            >
              <RotateCw size={15} aria-hidden="true" />
              重新加载
            </button>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-background-300 bg-background-50/50 px-6 text-center">
            <FileSearch size={26} className="text-foreground-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground-700">{emptyLabels[activeTab]}</p>
            <p className="mt-1 text-xs text-foreground-500">
              {activeTab === 'pending' ? '招聘专员推送新简历后，任务会出现在这里。' : '该状态暂时没有记录。'}
            </p>
          </div>
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
                    onClick={() => setSelectedTask(task)}
                    className="w-full px-4 py-4 text-left sm:px-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-700">
                        {task.candidate.name_masked.charAt(0) || '候'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground-900">{task.candidate.name_masked}</span>
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                            <StatusIcon size={12} aria-hidden="true" />
                            {meta.label}
                          </span>
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
        <div className="fixed inset-0 z-40 flex justify-end bg-black/35" role="presentation">
          <button
            type="button"
            aria-label="关闭业务筛选详情"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedTask(null)}
          />
          <aside
            aria-label={`${selectedTask.candidate.name_masked}的业务筛选详情`}
            className="relative h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl"
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
                onClick={() => setSelectedTask(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100 hover:text-foreground-800"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <BusinessReviewDetail
              task={selectedTask}
              onReview={selectedTask.status === 'pending' ? () => openReview(selectedTask) : undefined}
            />
          </aside>
        </div>
      )}

      {reviewTask && (
        <ReviewActionModal
          task={reviewTask}
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
