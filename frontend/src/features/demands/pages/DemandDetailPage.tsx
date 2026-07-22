import { useState } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ErrorState, PageHeader, Spinner } from '../../../components/ui';
import { RecruitmentManagementTabs } from '../../../components/recruitment/RecruitmentManagementTabs';
import { useAsync } from '../../../lib/useAsync';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { demandsApi } from '../api';
import { DemandActionDialog, type DemandActionMode, type DemandActionValues } from '../components/DemandActionDialog';

const RISK_LABELS: Record<string, string> = {
  overdue: '已超过期望完成日期',
  business_feedback_pending: '有候选人等待业务反馈',
  low_interview_conversion: '推荐较多但尚未进入面试',
  open_too_long: '需求开放时间较长',
  hr_no_recommendation: '需求接收后尚未推荐候选人',
  no_active_candidates: '当前没有仍在推进的候选人',
};

function riskLabel(code: string) {
  return RISK_LABELS[code] ?? '存在待核实的招聘卡点';
}

export function DemandDetailPage() {
  const { id } = useParams();
  const demandId = Number(id);
  const { role } = useAuth();
  const state = useAsync(() => demandsApi.getDemand(demandId), [demandId]);
  const owners = useAsync(() => (role === 'manager' || role === 'admin' ? api.listCandidateOwners() : Promise.resolve([])), [role]);
  const [mode, setMode] = useState<DemandActionMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [values, setValues] = useState<DemandActionValues>({ reason: '', priority: 'B', owner_hr_id: null, close_status: 'paused' });

  if (state.loading && !state.data) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (state.error && !state.data) return <ErrorState message={state.error.message} onRetry={state.reload} />;
  if (!state.data) return null;
  const demand = state.data;
  const completion_suggested = demand.completion_suggested;
  const canRestore = ['paused', 'filled', 'cancelled', 'closed'].includes(demand.status);
  const demandStateUncertain = state.loading || Boolean(state.error);
  const hasAlternativeOwner = (owners.data ?? []).some((owner) => owner.id !== demand.owner_hr_id);

  function open(nextMode: DemandActionMode) {
    setMode(nextMode);
    setMessage(null);
    setValues({ reason: '', priority: demand.priority, owner_hr_id: null, close_status: 'paused' });
  }

  async function confirmAction() {
    if (!mode || !values.reason.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'close') await demandsApi.closeDemand(demand.id, { status: values.close_status, close_reason: values.reason.trim() });
      if (mode === 'restore') await demandsApi.restoreDemand(demand.id, { note: values.reason.trim() });
      if (mode === 'priority') await demandsApi.downgradeDemand(demand.id, { priority: values.priority, downgrade_reason: values.reason.trim() });
      if (mode === 'owner' && values.owner_hr_id) await demandsApi.reassignDemandOwner(demand.id, { owner_hr_id: values.owner_hr_id, reason: values.reason.trim() });
      setMode(null);
      state.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/demands" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />返回需求列表
      </Link>
      <PageHeader title={demand.job_title} description={`${demand.request_no} · ${demand.job_department} · ${demand.job_city}`} />
      <RecruitmentManagementTabs />

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/jobs/${demand.job_id}/match?demand=${demand.id}`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90"
        >
          匹配候选人
        </Link>
        <Button type="button" variant="secondary" disabled={demandStateUncertain} onClick={() => open('priority')}>调整优先级</Button>
        {(role === 'manager' || role === 'admin') && (
          <Button
            type="button"
            variant="secondary"
            disabled={demandStateUncertain || owners.loading || Boolean(owners.error) || !hasAlternativeOwner}
            onClick={() => open('owner')}
          >
            {owners.loading ? '负责人加载中…' : owners.error ? '转派暂不可用' : !hasAlternativeOwner ? '暂无可转派负责人' : '转派负责人'}
          </Button>
        )}
        {canRestore
          ? <Button type="button" disabled={demandStateUncertain} onClick={() => open('restore')}>恢复需求</Button>
          : <Button type="button" variant="danger" disabled={demandStateUncertain} onClick={() => open('close')}>暂停 / 关闭</Button>}
      </div>
      {message && <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">{message}</p>}
      {state.loading && state.data && (
        <p aria-live="polite" className="rounded-md bg-surface-soft px-3 py-2 text-sm text-body">
          操作已提交，正在同步最新需求状态…
        </p>
      )}
      {state.error && state.data && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
          <span>操作已提交，但最新状态加载失败；当前页面可能仍是操作前状态，请勿重复操作。</span>
          <Button type="button" size="sm" variant="secondary" onClick={state.reload}>重新加载最新状态</Button>
        </div>
      )}
      {(role === 'manager' || role === 'admin') && owners.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
          <span>招聘负责人列表加载失败，暂时不能转派；需求其他信息仍可查看。</span>
          <Button type="button" size="sm" variant="secondary" onClick={owners.reload}>重新加载负责人</Button>
        </div>
      )}
      {(role === 'manager' || role === 'admin') && !owners.loading && !owners.error && !hasAlternativeOwner && (
        <p className="rounded-md bg-surface-soft px-3 py-2 text-sm text-body">
          暂无其他可转派招聘负责人；请管理员先创建或启用其他招聘专员账号。
        </p>
      )}

      {completion_suggested && (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-800">
          实际入职已达到 HC，请负责人核对后手工确认需求完成；系统不会自动关闭。
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>需求事实</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm text-body">
            <p>职位：{demand.job_title}</p>
            <p>部门：{demand.job_department}</p>
            <p>城市：{demand.job_city}</p>
            <p>HC：{demand.headcount}</p>
            <p>提需求日期：{demand.requested_at || '未记录'}</p>
            <p>期望完成：{demand.target_date || '未记录'}</p>
            <details className="pt-2"><summary className="cursor-pointer font-medium text-ink">查看创建时 JD</summary><p className="mt-2 whitespace-pre-wrap leading-6">{demand.jd_text || '未记录 JD'}</p></details>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>招聘进度</CardTitle></CardHeader>
          <CardBody className="grid grid-cols-2 gap-3">
            {[
              ['全部候选人', demand.metrics.recommended_count, 'all'],
              ['业务待反馈', demand.metrics.business_review_count, 'business_review'],
              ['面试中', demand.metrics.interview_count, 'interview'],
              ['Offer 中', demand.metrics.offer_count, 'offer'],
              ['已入职', demand.metrics.onboarded_count, 'onboarded'],
              ['已转出', demand.metrics.transferred_count, 'transferred'],
            ].map(([label, value, stage]) => (
              <Link key={String(label)} to={`/kanban?demand=${demand.id}&stage=${stage}`} className="rounded-md bg-surface-soft p-3 hover:ring-1 hover:ring-hairline">
                <p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>责任与卡点</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm text-body">
            <p>招聘负责人：{demand.owner_hr_name || `专员 #${demand.owner_hr_id}`}</p>
            <p>用人负责人：{demand.hiring_manager_name}</p>
            <p>默认面试官：{demand.default_interviewer_name || '未设置'}</p>
            <p>当前状态：<Badge>{demand.status}</Badge></p>
            {demand.risk_flags.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md bg-warning-50 p-3 text-warning-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{demand.risk_flags.map(riskLabel).join('、')}</span>
              </div>
            ) : <p className="text-muted">当前没有系统识别出的卡点。</p>}
          </CardBody>
        </Card>
      </div>
      <DemandActionDialog demand={demand} mode={mode} values={values} owners={owners.data ?? []} busy={busy} onChange={setValues} onCancel={() => setMode(null)} onConfirm={confirmAction} />
    </div>
  );
}
