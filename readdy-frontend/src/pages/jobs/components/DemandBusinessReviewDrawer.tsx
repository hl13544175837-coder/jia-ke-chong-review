import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, FileText, LoaderCircle, RefreshCw, Send, UserRoundCog, X } from 'lucide-react';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewStatus, BusinessReviewTask } from '@/features/businessReviews/types';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateListItem } from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import { useToast } from '@/hooks/useToast';

interface Props {
  demand: RecruitmentDemand;
  onClose: () => void;
  onOpenCandidate: (candidateId: number) => void;
  onPush: (candidate: CandidateListItem) => void;
  onReassign: (task: BusinessReviewTask) => void;
}

const statusMeta: Record<BusinessReviewStatus, { label: string; className: string; description: string }> = {
  pending: { label: '等待业务反馈', className: 'bg-amber-50 text-amber-700', description: '业务负责人还没有提交结论' },
  approved: { label: '业务已通过', className: 'bg-emerald-50 text-emerald-700', description: '等待招聘专员安排下一步' },
  rejected: { label: '业务不合适', className: 'bg-red-50 text-red-700', description: '等待招聘专员确认淘汰去向' },
  needs_info: { label: '需要补充信息', className: 'bg-sky-50 text-sky-700', description: '等待招聘专员补充材料后重新推送' },
};

function waitingLabel(value: string) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return '时间待确认';
  const hours = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 3_600_000));
  if (hours < 24) return hours === 0 ? '刚刚发起' : `已等待 ${hours} 小时`;
  return `已等待 ${Math.floor(hours / 24)} 天`;
}

function latestDemandTasks(items: BusinessReviewTask[], demandId: number) {
  const latestByCandidate = new Map<number, BusinessReviewTask>();
  items
    .filter((item) => item.demand_id === demandId && (
      item.status === 'pending' || item.candidate.current_stage === 'business_review'
    ))
    .forEach((item) => {
      if (!latestByCandidate.has(item.candidate_id)) latestByCandidate.set(item.candidate_id, item);
    });
  return [...latestByCandidate.values()];
}

export default function DemandBusinessReviewDrawer({ demand, onClose, onOpenCandidate, onPush, onReassign }: Props) {
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [tasks, setTasks] = useState<BusinessReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [remindingId, setRemindingId] = useState<number | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [candidateResponse, reviewResponse] = await Promise.all([
        candidatesApi.listCandidates({ demand_id: demand.id, stage: 'business_review', page: 1, per_page: 100 }),
        businessReviewsApi.listForHr(),
      ]);
      setCandidates(candidateResponse.candidates);
      setTasks(latestDemandTasks(reviewResponse.items, demand.id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '业务筛选进度加载失败');
    } finally {
      setLoading(false);
    }
  }, [demand.id]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const progressItems = useMemo(() => {
    const taskByCandidate = new Map(tasks.map((task) => [task.candidate_id, task]));
    const priority = (task: BusinessReviewTask | undefined) => task?.status === 'pending' ? 0 : task ? 2 : 1;
    return candidates
      .map((candidate) => ({ candidate, task: taskByCandidate.get(candidate.id) }))
      .sort((left, right) => priority(left.task) - priority(right.task));
  }, [candidates, tasks]);

  const remind = async (task: BusinessReviewTask) => {
    if (remindingId) return;
    setRemindingId(task.id);
    try {
      const result = await businessReviewsApi.remindTask(task.id);
      showToast(result.deduplicated ? '15 分钟内已经催办过，不再重复打扰' : `已提醒${task.reviewer_name || '业务负责人'}尽快反馈`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '催办失败，请稍后重试');
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-foreground-900/35" role="presentation" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`${demand.job_title}业务筛选进度`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-background-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold text-primary-600">业务筛选进度</p>
            <h2 className="mt-1 text-lg font-bold text-foreground-900">{demand.job_title}</h2>
            <p className="mt-1 text-xs text-foreground-500">{demand.request_no} · {demand.job_department} · 当前 {demand.metrics.business_review_count} 位候选人</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void loadTasks()} disabled={loading} aria-label="刷新业务筛选进度" className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            <button type="button" onClick={onClose} aria-label="关闭业务筛选进度" className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-500 hover:bg-background-100"><X size={18} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-background-50/50 p-5">
          {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"><p>{loadError}</p><button type="button" onClick={() => void loadTasks()} className="mt-2 font-medium underline">重新加载</button></div>}
          {!loadError && loading && candidates.length === 0 && <div className="py-20 text-center text-sm text-foreground-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={20} />正在加载业务筛选进度...</div>}
          {!loadError && !loading && progressItems.length === 0 && <div className="rounded-xl border border-dashed border-background-300 bg-white px-5 py-16 text-center"><UserRoundCog className="mx-auto text-foreground-300" size={28} /><p className="mt-3 text-sm font-medium text-foreground-700">当前没有业务筛选中的候选人</p><p className="mt-1 text-xs text-foreground-400">数据可能刚刚变化，请返回刷新招聘需求。</p></div>}

          <div className="space-y-3">
            {progressItems.map(({ candidate, task }) => {
              const meta = task ? statusMeta[task.status] : {
                label: '待推送业务筛选',
                className: 'bg-sky-50 text-sky-700',
                description: '候选人已进入业务筛选阶段，但还没有指定业务负责人',
              };
              return (
                <article key={candidate.id} className="rounded-xl border border-background-200 bg-white p-4 shadow-[0_8px_24px_rgba(44,62,52,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-foreground-900">{candidate.name_masked}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span></div>
                      <p className="mt-1 text-xs text-foreground-500">{task ? `业务负责人：${task.reviewer_name || '未显示'} · ${waitingLabel(task.created_at)}` : '业务负责人：尚未指定'}</p>
                      <p className="mt-2 text-xs text-foreground-400">{meta.description}{task?.due_at ? ` · 截止 ${new Date(task.due_at).toLocaleDateString('zh-CN')}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => onOpenCandidate(candidate.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-700 hover:border-primary-200 hover:text-primary-700"><FileText size={14} />查看简历</button>
                  </div>
                  {task && (task.hr_note || task.business_note) && <div className="mt-3 rounded-lg bg-background-50 px-3 py-2 text-xs leading-5 text-foreground-600">{task.business_note || task.hr_note}</div>}
                  {!task && (
                    <div className="mt-3 flex justify-end border-t border-background-100 pt-3"><button type="button" onClick={() => onPush(candidate)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-500 px-3 text-xs font-medium text-white hover:bg-primary-600"><Send size={14} />推送业务筛选</button></div>
                  )}
                  {task?.status === 'pending' && (
                    <div className="mt-3 flex justify-end gap-2 border-t border-background-100 pt-3">
                      <button type="button" onClick={() => void remind(task)} disabled={remindingId === task.id} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"><BellRing size={14} />{remindingId === task.id ? '催办中' : '催办'}</button>
                      <button type="button" onClick={() => onReassign(task)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-3 text-xs font-medium text-primary-700 hover:bg-primary-50"><UserRoundCog size={14} />改派</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
