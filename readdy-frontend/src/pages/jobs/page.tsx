import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { useProductRole } from '@/auth/productRole';
import PageHeader from '@/components/ui/PageHeader';
import { candidatesApi } from '@/features/candidates/api';
import { businessReviewsApi } from '@/features/businessReviews/api';
import type { BusinessReviewTask } from '@/features/businessReviews/types';
import { demandsApi } from '@/features/demands/api';
import { toRequisitionRow } from '@/features/demands/adapter';
import type {
  DemandOwnerOption,
  DemandStatus,
  DemandUpdateInput,
  RecruitmentDemand,
  RecruitmentDemandInput,
  RequisitionRow,
} from '@/features/demands/types';
import { ApiError, apiRequest } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import RequisitionTabs from './components/RequisitionTabs';
import RequisitionForm from './components/RequisitionForm';
import RequisitionTable from './components/RequisitionTable';
import DemandDetailPanel from './components/DemandDetailPanel';
import DemandCandidateDrawer from './components/DemandCandidateDrawer';
import DemandBusinessReviewDrawer from './components/DemandBusinessReviewDrawer';
import PushToReviewerModal, {
  type BusinessReviewerOption,
  type PushFormValue,
  type PushResultItem,
  type PushTarget,
} from '@/pages/candidates/components/PushToReviewerModal';
import {
  filterAndSortRequisitions,
  type DemandSortDirection,
  type DemandSortField,
  type DemandWorkspaceFilters,
  type DemandWorkspaceTab,
} from './workbench';
import { demandStageDrilldown, type DemandStageDrilldown } from './stageDrilldown';

const statusTransitions: Record<string, { advance: { to: string; label: string } | null; rollback: { to: string; label: string } | null }> = {
  pending: { advance: { to: 'closed', label: '关闭需求' }, rollback: null },
  active: { advance: { to: 'closed', label: '关闭需求' }, rollback: null },
  paused: { advance: { to: 'active', label: '恢复需求' }, rollback: null },
  filled: { advance: null, rollback: { to: 'active', label: '恢复需求' } },
  cancelled: { advance: null, rollback: { to: 'active', label: '恢复需求' } },
  closed: { advance: null, rollback: { to: 'active', label: '恢复需求' } },
};

const statusExtraActions: Record<string, { to: string; label: string; icon: string }[]> = {};

interface InterviewerApiItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

function isBusinessReviewer(
  item: InterviewerApiItem,
): item is InterviewerApiItem & { role: 'interviewer' | 'manager' } {
  return item.role === 'interviewer' || item.role === 'manager';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function initialWorkspaceTab(value: string | null | undefined): DemandWorkspaceTab {
  if (value === 'pending') return 'pendingApproval';
  if (['paused', 'closed', 'cancelled', 'ended'].includes(value ?? '')) return 'stopped';
  if (value === 'rejected') return 'all';
  if (['all', 'active', 'pendingApproval', 'filled', 'stopped'].includes(value ?? '')) {
    return value as DemandWorkspaceTab;
  }
  return 'all';
}

function initialDemandSortField(value: string | null): DemandSortField {
  return value === 'priority' || value === 'deadline' ? value : 'newest';
}

function initialDemandSortDirection(value: string | null): DemandSortDirection {
  return value === 'asc' ? 'asc' : 'desc';
}

function setOptionalSearchParam(
  params: URLSearchParams,
  key: string,
  value: string,
  defaultValue = '',
) {
  if (!value || value === defaultValue) params.delete(key);
  else params.set(key, value);
}

export default function JobsPage() {
  const { showToast } = useToast();
  const { userId } = useCompanyAuth();
  const { role } = useProductRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const navState = location.state as {
    fromDashboard?: boolean;
    openTitle?: string;
    openCreate?: boolean;
    tab?: string;
    filters?: Partial<DemandWorkspaceFilters>;
  } | null;
  const [activeTab, setActiveTab] = useState<DemandWorkspaceTab>(() => initialWorkspaceTab(navState?.tab ?? searchParams.get('tab')));
  const [formOpen, setFormOpen] = useState(Boolean(navState?.openCreate));
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [owners, setOwners] = useState<DemandOwnerOption[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [candidateDemand, setCandidateDemand] = useState<RecruitmentDemand | null>(null);
  const [businessReviewDemand, setBusinessReviewDemand] = useState<RecruitmentDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [filters, setFilters] = useState<DemandWorkspaceFilters>({
    department: searchParams.get('department') ?? '',
    owner: searchParams.get('owner') ?? '',
    city: searchParams.get('city') ?? '',
    stage: searchParams.get('stage') ?? '',
    headcount: searchParams.get('headcount') ?? '',
    deadline: searchParams.get('deadline') ?? '',
    ...navState?.filters,
  });
  const [sortField, setSortField] = useState<DemandSortField>(() => initialDemandSortField(searchParams.get('sort')));
  const [sortDirection, setSortDirection] = useState<DemandSortDirection>(() => initialDemandSortDirection(searchParams.get('order')));
  const [pushDemand, setPushDemand] = useState<RecruitmentDemand | null>(null);
  const [pushTargets, setPushTargets] = useState<PushTarget[] | null>(null);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushResults, setPushResults] = useState<PushResultItem[]>([]);
  const [pushReviewTask, setPushReviewTask] = useState<BusinessReviewTask | null>(null);
  const [reviewers, setReviewers] = useState<BusinessReviewerOption[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);

  const openDemandInUrl = useCallback((demandId: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (demandId) next.set('demand', String(demandId));
    else next.delete('demand');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const syncDemandWorkspaceUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    setOptionalSearchParam(next, 'tab', activeTab, 'all');
    setOptionalSearchParam(next, 'q', searchQuery);
    setOptionalSearchParam(next, 'department', filters.department);
    setOptionalSearchParam(next, 'city', filters.city);
    setOptionalSearchParam(next, 'owner', filters.owner);
    setOptionalSearchParam(next, 'stage', filters.stage);
    setOptionalSearchParam(next, 'headcount', filters.headcount);
    setOptionalSearchParam(next, 'deadline', filters.deadline);
    setOptionalSearchParam(next, 'sort', sortField, 'newest');
    setOptionalSearchParam(next, 'order', sortDirection, 'desc');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [activeTab, filters, searchParams, searchQuery, setSearchParams, sortDirection, sortField]);

  const loadDemands = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await demandsApi.listDemands();
      setDemands(response.items);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载招聘需求失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOwners = useCallback(async () => {
    if (!['recruiter', 'manager', 'admin'].includes(role ?? '')) {
      setOwners([]);
      return;
    }
    try {
      setOwners(await demandsApi.listRecruiterOwners());
    } catch (error) {
      setOwners([]);
      showToast(error instanceof Error ? error.message : '加载招聘负责人失败');
    }
  }, [role, showToast]);

  const loadReviewers = useCallback(async () => {
    setReviewersLoading(true);
    setReviewerError(null);
    try {
      const response = await apiRequest<InterviewerApiItem[]>('/interview/interviewers');
      setReviewers(response.filter(isBusinessReviewer).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
      })));
    } catch (error) {
      setReviewerError(errorMessage(error, '业务筛选人加载失败'));
    } finally {
      setReviewersLoading(false);
    }
  }, []);

  useEffect(() => { void loadDemands(); }, [loadDemands]);
  useEffect(() => { void loadOwners(); }, [loadOwners]);
  useEffect(() => { syncDemandWorkspaceUrl(); }, [syncDemandWorkspaceUrl]);

  useEffect(() => {
    if (!navState?.openCreate) return;
    setFormOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, navState?.openCreate, navigate]);

  const requisitions = useMemo(() => demands.map(toRequisitionRow), [demands]);

  useEffect(() => {
    if (!navState?.openTitle || demands.length === 0) return;
    const match = demands.find((demand) => demand.job_title === navState.openTitle || demand.request_no === navState.openTitle);
    if (match) {
      setSelectedDemand(match);
      openDemandInUrl(match.id);
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [demands, location.pathname, location.search, navState?.openTitle, navigate, openDemandInUrl]);

  useEffect(() => {
    if (!requestedDemandId || demands.length === 0) return;
    const match = demands.find((demand) => demand.id === requestedDemandId);
    if (match) setSelectedDemand(match);
    else {
      setSelectedDemand(null);
      openDemandInUrl(null);
    }
  }, [demands, openDemandInUrl, requestedDemandId]);

  const filteredData = useMemo(() => filterAndSortRequisitions(requisitions, {
    activeTab,
    searchQuery,
    filters,
    sortField,
    sortDirection,
  }), [activeTab, filters, requisitions, searchQuery, sortDirection, sortField]);

  const handleCreate = async (payload: RecruitmentDemandInput) => {
    if (submitting) return;
    setSubmitting(true);
    setCreateErrors({});
    try {
      const key = `readdy-demand:${userId ?? 'unknown'}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const created = await demandsApi.createDemand(payload, key);
      setFormOpen(false);
      setSelectedDemand(created);
      openDemandInUrl(created.id);
      showToast('招聘需求已创建并保存到本地数据库');
      await loadDemands();
    } catch (error) {
      if (error instanceof ApiError) setCreateErrors(error.fields ?? { form: error.message });
      else setCreateErrors({ form: error instanceof Error ? error.message : '创建招聘需求失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (demandId: number, payload: DemandUpdateInput) => {
    setDetailSaving(true);
    setDetailError('');
    try {
      const updated = await demandsApi.updateDemand(demandId, payload);
      setSelectedDemand(updated);
      showToast('招聘需求修改已保存');
      await loadDemands();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '保存修改失败');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleApprove = async (demandId: number): Promise<boolean> => {
    setDetailSaving(true);
    setDetailError('');
    try {
      const updated = await demandsApi.approveDemand(demandId, crypto.randomUUID());
      setSelectedDemand(updated);
      showToast('招聘需求已通过');
      await loadDemands();
      return true;
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setDetailError(conflict ? '状态已变化，请刷新' : error instanceof Error ? error.message : '通过需求失败');
      if (conflict) {
        await loadDemands();
        try {
          setSelectedDemand(await demandsApi.getDemand(demandId));
        } catch {
          setSelectedDemand(null);
        }
      }
      return false;
    } finally {
      setDetailSaving(false);
    }
  };

  const handleReject = async (demandId: number, reason: string): Promise<boolean> => {
    setDetailSaving(true);
    setDetailError('');
    try {
      const updated = await demandsApi.rejectDemand(demandId, reason, crypto.randomUUID());
      setSelectedDemand(updated);
      showToast('招聘需求已驳回');
      await loadDemands();
      return true;
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      setDetailError(conflict ? '状态已变化，请刷新' : error instanceof Error ? error.message : '驳回需求失败');
      if (conflict) {
        await loadDemands();
        try {
          setSelectedDemand(await demandsApi.getDemand(demandId));
        } catch {
          setSelectedDemand(null);
        }
      }
      return false;
    } finally {
      setDetailSaving(false);
    }
  };

  const handleStatusChange = async (id: string, nextStatus: string, reason: string) => {
    try {
      const demandId = Number(id);
      const updated = nextStatus === 'active'
        ? await demandsApi.restoreDemand(demandId, reason)
        : await demandsApi.closeDemand(demandId, nextStatus as Exclude<DemandStatus, 'active' | 'pending'>, reason);
      if (selectedDemand?.id === demandId) setSelectedDemand(updated);
      showToast(nextStatus === 'active' ? '招聘需求已恢复' : '招聘需求已关闭');
      await loadDemands();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '需求状态更新失败');
      throw error;
    }
  };

  const openDemand = async (row: RequisitionRow) => {
    setDetailError('');
    setSelectedDemand(row.source);
    openDemandInUrl(Number(row.id));
    try {
      setSelectedDemand(await demandsApi.getDemand(Number(row.id)));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载完整需求详情失败');
    }
  };

  const closeDemandDetail = () => {
    setSelectedDemand(null);
    setDetailError('');
    openDemandInUrl(null);
  };

  const openCandidates = (req: RequisitionRow, stage: string) => {
    navigate('/candidates', { state: { fromJobs: true, demandId: Number(req.id), jobTitle: req.title, targetStage: stage } });
  };

  const openStageProgress = (req: RequisitionRow, stage: DemandStageDrilldown) => {
    const target = demandStageDrilldown(stage, Number(req.id));
    if (target.kind === 'drawer') {
      setBusinessReviewDemand(req.source);
      return;
    }
    navigate(target.to);
  };

  const prepareBusinessPush = (demand: RecruitmentDemand, targets: PushTarget[], task?: BusinessReviewTask) => {
    if (targets.length === 0) return;
    setCandidateDemand(null);
    setPushDemand(demand);
    setPushTargets(targets);
    setPushResults([]);
    setPushReviewTask(task ?? null);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const handlePushToBusiness = async (value: PushFormValue) => {
    if (!pushTargets || !pushDemand || pushSubmitting) return;
    setPushSubmitting(true);
    setPushResults([]);
    const selectedReviewer = reviewers.find((reviewer) => reviewer.id === value.reviewerId);
    if (pushReviewTask) {
      const target = pushTargets[0];
      try {
        const task = await businessReviewsApi.reassignTask(pushReviewTask.id, value.reviewerId);
        setPushResults([{
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'created',
          message: task.unchanged ? '接收人没有变化' : `已改派给 ${task.reviewer_name || selectedReviewer?.name || '新业务筛选人'}`,
        }]);
        showToast(task.unchanged ? '业务筛选人没有变化' : `已改派给 ${task.reviewer_name || selectedReviewer?.name || '新业务筛选人'}`);
      } catch (error) {
        setPushResults([{
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '改派业务筛选人失败'),
        }]);
      } finally {
        setPushSubmitting(false);
      }
      return;
    }
    const results = await Promise.all(pushTargets.map(async (target): Promise<PushResultItem> => {
      try {
        const task = await candidatesApi.pushToBusinessReview({
          demand_id: value.demandId,
          candidate_id: target.candidateId,
          reviewer_id: value.reviewerId,
          hr_note: value.hrNote,
          due_at: value.dueAt,
        });
        const deduplicated = task.deduplicated === true;
        return {
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: deduplicated ? 'deduplicated' : 'created',
          message: deduplicated
            ? `已有待处理任务，请确认接收人为 ${task.reviewer_name || selectedReviewer?.name || '所选业务筛选人'}`
            : `已投递给 ${task.reviewer_name || selectedReviewer?.name || '所选业务筛选人'}`,
        };
      } catch (error) {
        return {
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          status: 'failed',
          message: errorMessage(error, '推送业务筛选失败'),
        };
      }
    }));

    setPushResults(results);
    setPushSubmitting(false);
    const createdCount = results.filter((result) => result.status === 'created').length;
    const deduplicatedCount = results.filter((result) => result.status === 'deduplicated').length;
    if (createdCount > 0) {
      showToast(`已向 ${selectedReviewer?.name || '业务筛选人'} 投递 ${createdCount} 份简历`);
      await loadDemands();
    } else if (deduplicatedCount > 0) {
      showToast('所选候选人已有待处理的业务筛选任务，请核对原接收人');
    }
  };

  return (
    <div className="space-y-5 p-6" data-ui="real-demand-page">
      {navState?.fromDashboard && (
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-foreground-500 hover:text-foreground-800">
          <i className="ri-arrow-left-line"></i>返回工作台
        </button>
      )}

      <PageHeader
        title="招聘需求"
        description="审核需求、寻找候选人并跟进每个岗位的招聘进度"
        actions={(
          <button type="button" onClick={() => { setCreateErrors({}); setFormOpen(true); }} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-600">
            <i className="ri-add-line text-base"></i>新建招聘需求
          </button>
        )}
      />

      <RequisitionTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {loading ? (
        <div className="rounded-lg border border-background-200 bg-white py-16 text-center text-sm text-foreground-500">
          <i className="ri-loader-4-line mr-2 animate-spin"></i>正在加载招聘需求...
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-6 text-center">
          <p className="text-sm text-red-600">{loadError}</p>
          <button onClick={() => void loadDemands()} className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-100">重新加载</button>
        </div>
      ) : (
        <RequisitionTable
          data={filteredData}
          optionSource={requisitions}
          onRowClick={(req) => { void openDemand(req); }}
          onStatusChange={handleStatusChange}
          statusTransitions={statusTransitions}
          statusExtraActions={statusExtraActions}
          onSelectCandidates={(req) => setCandidateDemand(req.source)}
          onViewCandidates={(req) => openCandidates(req, 'all')}
          onStageCountClick={openStageProgress}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onClearFilters={() => setFilters({ department: '', owner: '', city: '', stage: '', headcount: '', deadline: '' })}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={(field: DemandSortField) => {
            if (sortField === field) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
            else { setSortField(field); setSortDirection(field === 'deadline' ? 'asc' : 'desc'); }
          }}
        />
      )}

      {formOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-foreground-900/40" onClick={submitting ? undefined : () => setFormOpen(false)}></div>
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <section className="pointer-events-auto flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="创建招聘需求">
              <header className="flex items-center justify-between border-b border-background-100 px-6 py-4">
                <div><h2 className="text-lg font-bold text-foreground-900">创建招聘需求</h2><p className="mt-1 text-xs text-foreground-400">保存后会立即进入本地招聘需求列表</p></div>
                <button disabled={submitting} onClick={() => setFormOpen(false)} aria-label="关闭创建需求弹窗" className="h-9 w-9 rounded-lg hover:bg-background-100 disabled:opacity-50"><i className="ri-close-line text-xl"></i></button>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <RequisitionForm
                  expanded
                  owners={owners}
                  role={role}
                  submitting={submitting}
                  serverErrors={createErrors}
                  onSubmit={handleCreate}
                />
                {createErrors.form && <p className="mt-3 text-sm text-red-600" role="alert">{createErrors.form}</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {candidateDemand && (
        <DemandCandidateDrawer
          demand={candidateDemand}
          onClose={() => setCandidateDemand(null)}
          onChanged={() => void loadDemands()}
          onReadyToPush={prepareBusinessPush}
        />
      )}

      {businessReviewDemand && (
        <DemandBusinessReviewDrawer
          demand={businessReviewDemand}
          onClose={() => setBusinessReviewDemand(null)}
          onOpenCandidate={(candidateId) => {
            const demand = businessReviewDemand;
            setBusinessReviewDemand(null);
            navigate(`/candidates?demand=${demand.id}&candidate=${candidateId}`, {
              state: {
                fromJobs: true,
                demandId: demand.id,
                jobTitle: demand.job_title,
                targetStage: 'feedback',
              },
            });
          }}
          onPush={(candidate) => prepareBusinessPush(businessReviewDemand, [{
            candidateId: candidate.id,
            candidateName: candidate.name_masked,
            currentDemandId: businessReviewDemand.id,
            currentStage: '业务筛选',
            currentStageCode: 'business_review',
          }])}
          onReassign={(task) => prepareBusinessPush(businessReviewDemand, [{
            candidateId: task.candidate_id,
            candidateName: task.candidate.name_masked,
            currentDemandId: businessReviewDemand.id,
            currentStage: '业务筛选',
            currentStageCode: 'business_review',
          }], task)}
        />
      )}

      {pushDemand && pushTargets ? (
        <PushToReviewerModal
          mode={pushReviewTask ? 'reassign' : 'create'}
          currentReviewerName={pushReviewTask?.reviewer_name}
          targets={pushTargets}
          demands={[{
            id: pushDemand.id,
            jobTitle: pushDemand.job_title,
            requestNo: pushDemand.request_no,
            department: pushDemand.requester_department || pushDemand.job_department,
          }]}
          reviewers={reviewers}
          initialDemandId={pushDemand.id}
          initialReviewerId={pushReviewTask?.reviewer_id ?? pushDemand.default_interviewer_id}
          demandsLoading={false}
          demandError={null}
          reviewersLoading={reviewersLoading}
          reviewerError={reviewerError}
          isSubmitting={pushSubmitting}
          results={pushResults}
          onRetryDemands={() => void loadDemands()}
          onRetryReviewers={() => void loadReviewers()}
          onClose={() => {
            setPushDemand(null);
            setPushTargets(null);
            setPushResults([]);
            setPushReviewTask(null);
          }}
          onPush={(value) => void handlePushToBusiness(value)}
        />
      ) : null}

      <DemandDetailPanel
        demand={selectedDemand}
        saving={detailSaving}
        error={detailError}
        canReview={role === 'recruiter' || role === 'manager' || role === 'admin'}
        onClose={closeDemandDetail}
        onSave={handleUpdate}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
