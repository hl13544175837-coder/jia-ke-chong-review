import { ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, FileText, MapPin, UsersRound } from 'lucide-react';
import ReadOnlyDetailDrawer from '@/components/ui/ReadOnlyDetailDrawer';
import type { RecruitmentDemand } from '@/features/demands/types';

interface Props {
  demand: RecruitmentDemand;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onResubmit: () => void;
  onOpenScreening: () => void;
}

const approvalLabels = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
} as const;

const approvalTone = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
} as const;

function dateLabel(value: string | null) {
  if (!value) return '未记录';
  return value.replace('T', ' ').slice(0, 16);
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-foreground-400">{label}</p><p className="mt-1 text-sm font-medium text-foreground-800">{value}</p></div>;
}

export default function InterviewerDemandDetailDrawer({
  demand,
  loading,
  error,
  onClose,
  onRetry,
  onResubmit,
  onOpenScreening,
}: Props) {
  const status = demand.approval_status;
  const footer = status === 'rejected' ? (
    <div className="flex justify-end">
      <button type="button" onClick={onResubmit} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600">
        修改并重新提交 <ArrowRight size={15} />
      </button>
    </div>
  ) : status === 'approved' ? (
    <div className="flex justify-end">
      <button type="button" onClick={onOpenScreening} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600">
        查看待筛选候选人 <ArrowRight size={15} />
      </button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-amber-700"><Clock3 size={15} />等待招聘专员审核</span>
      <button type="button" onClick={onClose} className="rounded-lg border border-background-200 px-4 py-2 text-sm text-foreground-600 hover:bg-background-50">关闭</button>
    </div>
  );

  return (
    <ReadOnlyDetailDrawer
      title={demand.job_title}
      description={`${demand.request_no || `需求 #${demand.id}`} · 面试官只读详情`}
      loading={loading}
      error={error}
      onClose={onClose}
      onRetry={onRetry}
      footer={footer}
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-background-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><CheckCircle2 size={16} />审核进度</h3>
            <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${approvalTone[status]}`}>{approvalLabels[status]}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Info label="提交时间" value={dateLabel(demand.submitted_at)} />
            <Info label="审核时间" value={dateLabel(demand.reviewed_at)} />
            <Info label="招聘负责人" value={demand.owner_hr_name || `招聘专员 #${demand.owner_hr_id}`} />
            <Info label="用人负责人" value={demand.hiring_manager_name || '未填写'} />
          </div>
        </section>

        {status === 'rejected' && (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-red-700">驳回原因</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-700">{demand.review_reason || '招聘专员未填写原因，请联系确认后再修改'}</p>
          </section>
        )}

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><BriefcaseBusiness size={16} />需求概况</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 rounded-xl border border-background-200 p-4">
            <Info label="用人部门" value={demand.requester_department || demand.job_department || '未填写'} />
            <Info label="招聘城市" value={demand.job_city || '未填写'} />
            <Info label="HC" value={`${demand.headcount} 人`} />
            <Info label="优先级" value={demand.priority} />
            <Info label="需求日期" value={demand.requested_at || '未填写'} />
            <Info label="期望到岗日期" value={demand.target_date || '未填写'} />
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><FileText size={16} />完整 JD</h3>
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-background-50 p-4 text-sm leading-7 text-foreground-700">{demand.jd_text || '该需求暂未填写完整 JD'}</div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><CalendarDays size={16} />补充说明</h3>
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-background-200 p-4 text-sm leading-6 text-foreground-600">{demand.note || '暂无补充说明'}</p>
        </section>

        <section className="rounded-xl border border-primary-100 bg-primary-50/30 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground-900"><UsersRound size={16} />当前招聘进度</h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Info label="业务筛选" value={`${demand.metrics.business_review_count} 人`} />
            <Info label="面试中" value={`${demand.metrics.interview_count} 人`} />
            <Info label="已入职" value={`${demand.metrics.onboarded_count}/${demand.headcount} 人`} />
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs text-foreground-500"><MapPin size={13} />这里只展示人数汇总，不展示无关候选人或招聘专员内部信息。</p>
        </section>
      </div>
    </ReadOnlyDetailDrawer>
  );
}
