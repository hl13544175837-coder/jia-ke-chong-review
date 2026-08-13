import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  DemandPriority,
  DemandUpdateInput,
  RecruitmentDemand,
} from '@/features/demands/types';
import { jobsApi } from '@/features/jobs/api';
import type { JobTemplateDetail, JobTemplateSummary } from '@/features/jobs/types';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/lib/api';
import { userFacingError } from '@/lib/userFacingError';
import InterviewerDemandDetailDrawer from './components/InterviewerDemandDetailDrawer';

type DemandFormMode = { kind: 'create' } | { kind: 'resubmit'; demand: RecruitmentDemand };

interface DemandDraft {
  jobId: string;
  customJobTitle: string;
  ownerHrId: string;
  requesterDepartment: string;
  city: string;
  headcount: number;
  requestedAt: string;
  targetDate: string;
  priority: DemandPriority;
  hiringManagerName: string;
  jdText: string;
  focusPoints: string;
  note: string;
}

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

const inputClass = 'mt-1 w-full rounded-lg border border-background-200 bg-white px-3 py-2 text-sm text-foreground-900 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50 disabled:bg-background-50 disabled:text-foreground-500';

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function blankDraft(managerName: string | null): DemandDraft {
  return {
    jobId: '',
    customJobTitle: '',
    ownerHrId: '',
    requesterDepartment: '',
    city: '',
    headcount: 1,
    requestedAt: localDateValue(),
    targetDate: '',
    priority: 'B',
    hiringManagerName: managerName || '',
    jdText: '',
    focusPoints: '',
    note: '',
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      const text = record.label ?? record.name ?? record.title ?? record.skill ?? record.requirement;
      return typeof text === 'string' ? text.trim() : '';
    })
    .filter(Boolean);
}

function extractFocusPoints(structured: Record<string, unknown>): string[] {
  for (const key of ['focus_points', 'interview_focus', 'key_requirements', 'must_have', 'required_skills']) {
    const points = stringList(structured[key]);
    if (points.length > 0) return points;
  }

  const rawTags = structured.skill_tags_raw;
  if (typeof rawTags === 'string' && rawTags.trim()) {
    return rawTags.split('|').map((tag) => tag.split(',')[0].trim()).filter(Boolean);
  }
  return [];
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
  const [draft, setDraft] = useState<DemandDraft>(() => blankDraft(name));
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplateDetail | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
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

  const loadTemplate = async (jobId: number, applyDefaults: boolean) => {
    setTemplateLoading(true);
    setFormErrors((current) => ({ ...current, job_id: '' }));
    try {
      const detail = await jobsApi.getTemplate(jobId);
      setSelectedTemplate(detail);
      setDraft((current) => ({
        ...current,
        jobId: String(detail.id),
        requesterDepartment: applyDefaults ? detail.department || current.requesterDepartment : current.requesterDepartment,
        city: applyDefaults ? detail.city || current.city : current.city,
        jdText: detail.jd_text,
        focusPoints: extractFocusPoints(detail.structured).join('\n'),
      }));
    } catch (error) {
      setSelectedTemplate(null);
      setFormErrors((current) => ({
        ...current,
        job_id: error instanceof Error ? error.message : '岗位模板加载失败',
      }));
    } finally {
      setTemplateLoading(false);
    }
  };

  const openCreate = () => {
    setFormMode({ kind: 'create' });
    setDraft(blankDraft(name));
    setSelectedTemplate(null);
    setFormErrors({});
    setFormOpen(true);
  };

  const openResubmit = (demand: RecruitmentDemand) => {
    setFormMode({ kind: 'resubmit', demand });
    setDraft({
      jobId: String(demand.job_id),
      customJobTitle: demand.job_title,
      ownerHrId: String(demand.owner_hr_id),
      requesterDepartment: demand.requester_department || demand.job_department,
      city: demand.job_city,
      headcount: demand.headcount,
      requestedAt: demand.requested_at || localDateValue(),
      targetDate: demand.target_date || '',
      priority: demand.priority,
      hiringManagerName: demand.hiring_manager_name,
      jdText: demand.jd_text || '',
      focusPoints: '',
      note: demand.note || '',
    });
    setSelectedTemplate(null);
    setFormErrors({});
    setFormOpen(true);
    void loadTemplate(demand.job_id, false);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const validateDraft = () => {
    const errors: Record<string, string> = {};
    if (!draft.jobId) errors.job_id = '请选择岗位模板或自定义新岗位';
    if (draft.jobId === 'custom' && !draft.customJobTitle.trim()) errors.job_title = '请填写岗位名称';
    if (formMode.kind === 'create' && !draft.ownerHrId) errors.owner_hr_id = '请选择招聘负责人';
    if (!draft.requesterDepartment.trim()) errors.requester_department = '请填写用人部门';
    if (!draft.city.trim()) errors.city = '请填写招聘城市';
    if (!draft.hiringManagerName.trim()) errors.hiring_manager_name = '请填写用人负责人';
    if (!draft.requestedAt) errors.requested_at = '请选择需求日期';
    if (!draft.targetDate) errors.target_date = '请选择期望到岗日期';
    else if (draft.requestedAt && draft.targetDate < draft.requestedAt) errors.target_date = '期望到岗日期不能早于需求日期';
    if (!Number.isInteger(draft.headcount) || draft.headcount < 1) errors.headcount = 'HC 必须大于 0';
    else if (draft.headcount > 10000) errors.headcount = '单条招聘需求的 HC 不能超过 10000';
    if (!draft.jdText.trim()) errors.jd_text = '所选模板缺少完整 JD';
    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || templateLoading) return;
    const errors = validateDraft();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setFormErrors({});
    try {
      const editable: DemandUpdateInput = {
        jd_text: draft.jdText.trim(),
        requester_department: draft.requesterDepartment.trim(),
        city: draft.city.trim(),
        hiring_manager_name: draft.hiringManagerName.trim(),
        requested_at: draft.requestedAt,
        target_date: draft.targetDate,
        headcount: draft.headcount,
        note: draft.note.trim(),
      };
      const idempotencyKey = crypto.randomUUID();

      if (formMode.kind === 'resubmit') {
        await demandsApi.resubmitDemand(formMode.demand.id, editable, idempotencyKey);
        showToast('需求已重新提交 HR 审核');
      } else {
        const focus_points = draft.focusPoints.split('\n').map((item) => item.trim()).filter(Boolean);
        const payload: BusinessDemandInput = {
          ...editable,
          ...(draft.jobId === 'custom'
            ? { job_title: draft.customJobTitle.trim() }
            : { job_id: Number(draft.jobId) }),
          jd_text: draft.jdText.trim(),
          owner_hr_id: Number(draft.ownerHrId),
          default_interviewer_id: userId ?? undefined,
          priority: draft.priority,
          status: 'pending',
          focus_points,
        };
        await demandsApi.createDemand(payload, idempotencyKey);
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
            disabled={loading}
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
          <div className="fixed inset-0 z-40 bg-foreground-900/40" onClick={closeForm}></div>
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <section className="pointer-events-auto flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={formMode.kind === 'create' ? '提交招聘需求' : '修改并重新提交招聘需求'}>
              <header className="flex items-center justify-between border-b border-background-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">{formMode.kind === 'create' ? '提交招聘需求' : '修改并重新提交'}</h2>
                  <span className="mt-1 inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">提交后状态：待审核</span>
                </div>
                <button type="button" aria-label="关闭需求表单" disabled={saving} onClick={closeForm} className="h-9 w-9 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50"><i className="ri-close-line text-xl"></i></button>
              </header>

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <FormField label="岗位来源" error={formErrors.job_id}>
                      <select
                        required
                        disabled={formMode.kind === 'resubmit' || templateLoading}
                        value={draft.jobId}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === 'custom') {
                            setSelectedTemplate(null);
                            setDraft((current) => ({
                              ...current,
                              jobId: value,
                              customJobTitle: '',
                              jdText: '',
                              focusPoints: '',
                            }));
                          } else {
                            setDraft((current) => ({ ...current, jobId: value, customJobTitle: '' }));
                            if (value) void loadTemplate(Number(value), true);
                            else setSelectedTemplate(null);
                          }
                        }}
                        className={inputClass}
                      >
                        <option value="">请选择岗位模板或自定义</option>
                        <option value="custom">自定义新岗位</option>
                        {templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
                      </select>
                    </FormField>
                    {draft.jobId === 'custom' && (
                      <FormField label="岗位名称" error={formErrors.job_title}>
                        <input required value={draft.customJobTitle} onChange={(event) => setDraft((current) => ({ ...current, customJobTitle: event.target.value }))} placeholder="例如：海外履约产品经理" className={inputClass} />
                      </FormField>
                    )}
                    <FormField label="招聘负责人" error={formErrors.owner_hr_id}>
                      <select required disabled={formMode.kind === 'resubmit'} value={draft.ownerHrId} onChange={(event) => setDraft((current) => ({ ...current, ownerHrId: event.target.value }))} className={inputClass}>
                        <option value="">请选择招聘负责人</option>
                        {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                      </select>
                    </FormField>
                    <FormField label="用人负责人" error={formErrors.hiring_manager_name}>
                      <input required value={draft.hiringManagerName} onChange={(event) => setDraft((current) => ({ ...current, hiringManagerName: event.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="用人部门" error={formErrors.requester_department}>
                      <input required value={draft.requesterDepartment} onChange={(event) => setDraft((current) => ({ ...current, requesterDepartment: event.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="招聘城市" error={formErrors.city}>
                      <input required value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="HC" error={formErrors.headcount}>
                      <input type="number" min={1} max={10000} required value={draft.headcount} onChange={(event) => setDraft((current) => ({ ...current, headcount: Number(event.target.value) || 1 }))} className={inputClass} />
                    </FormField>
                    <FormField label="需求日期" error={formErrors.requested_at}>
                      <input type="date" required value={draft.requestedAt} onChange={(event) => setDraft((current) => ({ ...current, requestedAt: event.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="期望到岗日期" error={formErrors.target_date}>
                      <input type="date" required min={draft.requestedAt} value={draft.targetDate} onChange={(event) => setDraft((current) => ({ ...current, targetDate: event.target.value }))} className={inputClass} />
                    </FormField>
                    <FormField label="优先级">
                      <select disabled={formMode.kind === 'resubmit'} value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as DemandPriority }))} className={inputClass}>
                        <option value="A">A 紧急</option><option value="B">B 高</option><option value="C">C 普通</option>
                      </select>
                    </FormField>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <FormField label="本次需求的 JD" error={formErrors.jd_text}>
                      <textarea rows={10} value={templateLoading ? '正在加载岗位模板...' : draft.jdText} onChange={(event) => setDraft((current) => ({ ...current, jdText: event.target.value }))} className={`${inputClass} resize-none leading-6`} />
                      <p className="mt-1 text-xs text-foreground-400">这里只修改本次招聘需求，不会改公司的公共岗位模板。</p>
                    </FormField>
                    <FormField label="面试关注点">
                      <textarea rows={10} value={draft.focusPoints} onChange={(event) => setDraft((current) => ({ ...current, focusPoints: event.target.value }))} placeholder="每行一项" className={`${inputClass} resize-none leading-6`} />
                    </FormField>
                  </div>

                  {selectedTemplate && (
                    <p className="mt-2 text-xs text-foreground-400">模板：{selectedTemplate.title} · {selectedTemplate.department || '未设置部门'} · {selectedTemplate.city || '未设置城市'}</p>
                  )}

                  <FormField label="补充备注" error={formErrors.note} className="mt-4">
                    <textarea rows={4} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} className={`${inputClass} resize-none`} />
                  </FormField>
                  {formErrors.form && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{formErrors.form}</p>}
                </div>

                <footer className="flex justify-end gap-3 border-t border-background-100 px-6 py-4">
                  <button type="button" disabled={saving} onClick={closeForm} className="rounded-lg border border-background-200 px-4 py-2 text-sm text-foreground-700 hover:bg-background-50 disabled:opacity-50">取消</button>
                  <button type="submit" disabled={saving || templateLoading} className="flex min-w-32 items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-send-plane-line"></i>}
                    {saving ? '正在提交...' : formMode.kind === 'create' ? '提交审核' : '重新提交'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function FormField({ label, error, className = '', children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm font-medium text-foreground-700 ${className}`}>
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  );
}
