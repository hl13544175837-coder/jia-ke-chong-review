import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import PageHeader from '@/components/ui/PageHeader';
import PageStateCard from '@/components/ui/PageStateCard';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import { demandsApi } from '@/features/demands/api';
import type {
  ApprovalStatus,
  BusinessDemandInput,
  DemandOwnerOption,
  DemandUpdateInput,
  RecruitmentDemand,
  RecruitmentDemandInput,
} from '@/features/demands/types';
import { jobsApi } from '@/features/jobs/api';
import type { JobTemplateSummary } from '@/features/jobs/types';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/lib/api';
import { userFacingError } from '@/lib/userFacingError';
import RequisitionForm, { type RequisitionFormValues } from '@/features/demands/components/RequisitionForm';
import InterviewerDemandDetailDrawer from './components/InterviewerDemandDetailDrawer';

type DemandFormMode = { kind: 'create' } | { kind: 'resubmit'; demand: RecruitmentDemand };

const approvalTabs: { key: ApprovalStatus; label: string }[] = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' },
];

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

const approvalStyles: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 被拒需求重提：用原需求字段预填统一需求表单 */
function resubmitInitialValues(demand: RecruitmentDemand): RequisitionFormValues {
  return {
    position: demand.job_title,
    jobId: String(demand.job_id),
    department: demand.requester_department || demand.job_department,
    city: demand.job_city,
    headcount: demand.headcount,
    owner: String(demand.owner_hr_id),
    hiringManagerName: demand.hiring_manager_name,
    startDate: demand.requested_at || localDateValue(),
    deadline: demand.target_date || '',
    priority: demand.priority,
    description: demand.jd_text || '',
    focusPoints: '',
    note: demand.note || '',
  };
}

function formatDateTime(value: string | null) {
  if (!value) return '暂无';
  return value.replace('T', ' ').slice(0, 16);
}

function approvalTabFromQuery(value: string | null): ApprovalStatus {
  return approvalTabs.some((tab) => tab.key === value) ? value as ApprovalStatus : 'pending';
}

export default function InterviewerJobsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const handledDemandId = useRef<number | null>(null);
  const { name, userId } = useCompanyAuth();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<JobTemplateSummary[]>([]);
  const [owners, setOwners] = useState<DemandOwnerOption[]>([]);
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const activeTab = approvalTabFromQuery(searchParams.get('tab'));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<DemandFormMode>({ kind: 'create' });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadPage = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [templateRows, demandResponse, ownerRows] = await Promise.all([
        jobsApi.listTemplates(),
        demandsApi.listDemands(),
        demandsApi.listRecruiterOwners(),
      ]);
      setTemplates(templateRows);
      setDemands(demandResponse.items);
      setOwners(ownerRows);
    } catch (error) {
      setLoadError(userFacingError(error, '加载招聘需求失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const counts = useMemo(() => {
    return demands.reduce<Record<ApprovalStatus, number>>(
      (result, demand) => {
        result[demand.approval_status] += 1;
        return result;
      },
      { pending: 0, approved: 0, rejected: 0 },
    );
  }, [demands]);

  const visibleDemands = useMemo(
    () => demands.filter((demand) => demand.approval_status === activeTab),
    [activeTab, demands],
  );

  const rememberDemand = useCallback((demandId: number | null, tab: ApprovalStatus = activeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (demandId) next.set('demand', String(demandId));
    else next.delete('demand');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  const changeActiveTab = useCallback((tab: ApprovalStatus) => {
    handledDemandId.current = null;
    setSelectedDemand(null);
    setDetailError('');
    rememberDemand(null, tab);
  }, [rememberDemand]);

  const openDemandDetail = useCallback(async (demand: RecruitmentDemand, updateUrl = true) => {
    handledDemandId.current = demand.id;
    setSelectedDemand(demand);
    setDetailLoading(true);
    setDetailError('');
    if (updateUrl) rememberDemand(demand.id, demand.approval_status);
    try {
      setSelectedDemand(await demandsApi.getDemand(demand.id));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '招聘需求详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }, [rememberDemand]);

  const closeDemandDetail = useCallback(() => {
    handledDemandId.current = null;
    setSelectedDemand(null);
    setDetailError('');
    rememberDemand(null);
  }, [rememberDemand]);

  useEffect(() => {
    if (loading || !requestedDemandId || handledDemandId.current === requestedDemandId) return;
    const demand = demands.find((item) => item.id === requestedDemandId);
    if (!demand) return;
    void openDemandDetail(demand);
  }, [demands, loading, openDemandDetail, requestedDemandId]);

  const openCreate = () => {
    setFormMode({ kind: 'create' });
    setFormErrors({});
    setFormOpen(true);
  };

  const openResubmit = (demand: RecruitmentDemand) => {
    setFormMode({ kind: 'resubmit', demand });
    setFormErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const handleSubmit = async (payload: RecruitmentDemandInput) => {
    if (saving) return;
    setSaving(true);
    setFormErrors({});
    try {
      const idempotencyKey = crypto.randomUUID();

      if (formMode.kind === 'resubmit') {
        // 重提仅允许修改可编辑字段（岗位模板 / 负责人 / 优先级保持原值）
        const editable: DemandUpdateInput = {
          jd_text: payload.jd_text?.trim() ?? '',
          requester_department: payload.requester_department.trim(),
          city: payload.city.trim(),
          hiring_manager_name: payload.hiring_manager_name.trim(),
          requested_at: payload.requested_at,
          target_date: payload.target_date,
          headcount: payload.headcount,
          note: payload.note?.trim() ?? '',
        };
        await demandsApi.resubmitDemand(formMode.demand.id, editable, idempotencyKey);
        showToast('需求已重新提交 HR 审核');
      } else {
        // 表单（interviewer 模式）已保证 job_id 与 focus_points 就绪
        const businessPayload = payload as BusinessDemandInput;
        await demandsApi.createDemand(
          { ...businessPayload, default_interviewer_id: userId ?? undefined },
          idempotencyKey,
        );
        showToast('需求已提交 HR 审核');
      }

      setFormOpen(false);
      rememberDemand(null, 'pending');
      await loadPage();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormErrors(error.fields ?? {
          form: error.status === 409 ? '状态已变化，请刷新后重试' : error.message,
        });
      } else {
        setFormErrors({ form: error instanceof Error ? error.message : '提交需求失败' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="business-demand-page">
      <PageHeader
        title="招聘需求"
        visuallyHiddenTitle
        description={name || '业务负责人'}
        actions={(
          <button
            type="button"
            onClick={openCreate}
            disabled={loading || templates.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="ri-add-line text-base"></i>
            提交需求
          </button>
        )}
      />

      <WorkspaceTabs<ApprovalStatus>
        items={approvalTabs.map((tab) => ({ ...tab, count: counts[tab.key] }))}
        value={activeTab}
        onChange={changeActiveTab}
        ariaLabel="需求审核状态"
      />

      {loading ? (
        <PageStateCard variant="loading" title="正在加载招聘需求" description="请稍候，正在读取最新需求。" />
      ) : loadError ? (
        <PageStateCard
          variant="error"
          title="招聘需求加载失败"
          description={loadError}
          onAction={() => void loadPage()}
        />
      ) : visibleDemands.length === 0 ? (
        <PageStateCard
          variant="empty"
          title={`暂无${approvalLabels[activeTab]}的招聘需求`}
          description={activeTab === 'pending' ? '提交新需求后会出现在这里。' : '可以切换状态查看其他招聘需求。'}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-background-200 bg-white">
          <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(160px,1fr)_110px_150px] gap-4 border-b border-background-200 bg-background-50 px-5 py-3 text-xs font-medium text-foreground-500 md:grid">
            <span>岗位与需求</span><span>负责人</span><span>HC / 优先级</span><span>审核状态</span>
          </div>
          <div className="divide-y divide-background-100">
            {visibleDemands.map((demand) => (
              <button
                key={demand.id}
                type="button"
                data-ui="interviewer-demand-row"
                onClick={() => void openDemandDetail(demand)}
                className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-200 md:grid-cols-[minmax(220px,2fr)_minmax(160px,1fr)_110px_150px] md:items-start"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-foreground-900">{demand.job_title}</h2>
                    <span className="text-xs text-foreground-400">{demand.request_no || `#${demand.id}`}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-500">{demand.requester_department || demand.job_department} · {demand.job_city}</p>
                  <p className="mt-1 text-xs text-foreground-400">提交于 {formatDateTime(demand.submitted_at)}</p>
                  {demand.approval_status === 'rejected' && demand.review_reason && (
                    <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">驳回原因：{demand.review_reason}</p>
                  )}
                </div>
                <div className="text-sm text-foreground-700">
                  <p>{demand.owner_hr_name || `招聘专员 #${demand.owner_hr_id}`}</p>
                  <p className="mt-1 text-xs text-foreground-400">用人负责人：{demand.hiring_manager_name || '未填写'}</p>
                </div>
                <div className="text-sm text-foreground-700">
                  <p>{demand.headcount} 人</p>
                  <p className="mt-1 text-xs text-foreground-400">优先级 {demand.priority}</p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <span className={`rounded-md border px-2 py-1 text-xs font-medium ${approvalStyles[demand.approval_status]}`}>{approvalLabels[demand.approval_status]}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-700">查看详情 <i className="ri-arrow-right-s-line text-base" /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDemand && (
        <InterviewerDemandDetailDrawer
          demand={selectedDemand}
          loading={detailLoading}
          error={detailError}
          onClose={closeDemandDetail}
          onRetry={() => void openDemandDetail(selectedDemand, false)}
          onResubmit={() => {
            const demand = selectedDemand;
            closeDemandDetail();
            openResubmit(demand);
          }}
          onOpenScreening={() => navigate(`/interviewer/screening?demand=${selectedDemand.id}`)}
        />
      )}

      {formOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-foreground-900/40" onClick={saving ? undefined : closeForm}></div>
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <section className="pointer-events-auto flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={formMode.kind === 'create' ? '提交招聘需求' : '修改并重新提交招聘需求'}>
              <header className="flex items-center justify-between border-b border-background-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">{formMode.kind === 'create' ? '提交招聘需求' : '修改并重新提交'}</h2>
                  <span className="mt-1 inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">提交后状态：待审核</span>
                </div>
                <button type="button" aria-label="关闭需求表单" disabled={saving} onClick={closeForm} className="h-9 w-9 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50"><i className="ri-close-line text-xl"></i></button>
              </header>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <RequisitionForm
                  key={formMode.kind === 'resubmit' ? `resubmit-${formMode.demand.id}` : 'create'}
                  expanded
                  mode="interviewer"
                  owners={owners}
                  submitting={saving}
                  serverErrors={formErrors}
                  initialValues={formMode.kind === 'resubmit' ? resubmitInitialValues(formMode.demand) : undefined}
                  isResubmit={formMode.kind === 'resubmit'}
                  templates={templates}
                  submitLabel={formMode.kind === 'create' ? '提交审核' : '重新提交'}
                  submittingLabel="正在提交..."
                  onSubmit={(payload) => { void handleSubmit(payload); }}
                />
                {formErrors.form && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{formErrors.form}</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
