import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { useProductRole } from '@/auth/productRole';
import { candidatesApi } from '@/features/candidates/api';
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
import PushToReviewerModal, {
  type BusinessReviewerOption,
  type PushFormValue,
  type PushResultItem,
  type PushTarget,
} from '@/pages/candidates/components/PushToReviewerModal';

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

export default function JobsPage() {
  const { showToast } = useToast();
  const { userId } = useCompanyAuth();
  const { role } = useProductRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDemandId = Number(searchParams.get('demand')) || null;
  const navState = location.state as { fromDashboard?: boolean; openTitle?: string; tab?: string } | null;
  const [activeTab, setActiveTab] = useState(navState?.tab || 'all');
  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [demands, setDemands] = useState<RecruitmentDemand[]>([]);
  const [owners, setOwners] = useState<DemandOwnerOption[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [candidateDemand, setCandidateDemand] = useState<RecruitmentDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [filters, setFilters] = useState({ department: '', owner: '', city: '', status: '', stage: '' });
  const [sortField, setSortField] = useState('newest');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [pushDemand, setPushDemand] = useState<RecruitmentDemand | null>(null);
  const [pushTargets, setPushTargets] = useState<PushTarget[] | null>(null);
  const [pushSubmitting, setPushSubmitting] = useState(false);
  const [pushResults, setPushResults] = useState<PushResultItem[]>([]);
  const [reviewers, setReviewers] = useState<BusinessReviewerOption[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);

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

  const requisitions = useMemo(() => demands.map(toRequisitionRow), [demands]);

  useEffect(() => {
    if (!navState?.openTitle || demands.length === 0) return;
    const match = demands.find((demand) => demand.job_title === navState.openTitle || demand.request_no === navState.openTitle);
    if (match) setSelectedDemand(match);
    navigate(location.pathname, { replace: true, state: null });
  }, [demands, location.pathname, navState?.openTitle, navigate]);

  useEffect(() => {
    if (!requestedDemandId || demands.length === 0) return;
    const match = demands.find((demand) => demand.id === requestedDemandId);
    if (match) setSelectedDemand(match);
    const next = new URLSearchParams(searchParams);
    next.delete('demand');
    setSearchParams(next, { replace: true });
  }, [demands, requestedDemandId, searchParams, setSearchParams]);

  const filteredData = useMemo(() => {
    let data = [...requisitions];
    if (activeTab !== 'all') data = data.filter((item) => item.statusCode === activeTab);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter((item) => [item.id, item.name, item.title, item.owner, item.source.request_no]
        .some((value) => value.toLowerCase().includes(query)));
    }
    if (filters.department) data = data.filter((item) => item.department === filters.department);
    if (filters.owner) data = data.filter((item) => item.owner === filters.owner);
    if (filters.city) data = data.filter((item) => item.city === filters.city);
    if (filters.status) data = data.filter((item) => item.statusCode === filters.status);
    if (filters.stage === 'hasAny') data = data.filter((item) => item.stageAll > 0);
    if (filters.stage === 'none') data = data.filter((item) => item.stageAll === 0);
    if (filters.stage === 'feedback') data = data.filter((item) => item.stageFeedback > 0);
    if (filters.stage === 'interview') data = data.filter((item) => item.stageInterview > 0);
    if (filters.stage === 'offer') data = data.filter((item) => item.stageOffer > 0);

    data.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'deadline') {
        return ((a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity)) * direction;
      }
      if (sortField === 'priority') {
        const rank: Record<string, number> = { '紧急': 3, '高': 2, '普通': 1 };
        return ((rank[b.priority] || 0) - (rank[a.priority] || 0)) * direction;
      }
      if (sortField === 'name') return a.name.localeCompare(b.name, 'zh-CN') * direction;
      return (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * direction;
    });
    return data;
  }, [activeTab, filters, requisitions, searchQuery, sortDirection, sortField]);

  const handleCreate = async (payload: RecruitmentDemandInput) => {
    if (submitting) return;
    setSubmitting(true);
    setCreateErrors({});
    try {
      const key = `readdy-demand:${userId ?? 'unknown'}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const created = await demandsApi.createDemand(payload, key);
      setFormOpen(false);
      setSelectedDemand(created);
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
    try {
      setSelectedDemand(await demandsApi.getDemand(Number(row.id)));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载完整需求详情失败');
    }
  };

  const openCandidates = (req: RequisitionRow, stage: string) => {
    navigate('/candidates', { state: { fromJobs: true, demandId: Number(req.id), jobTitle: req.title, targetStage: stage } });
  };

  const prepareBusinessPush = (demand: RecruitmentDemand, targets: PushTarget[]) => {
    if (targets.length === 0) return;
    setCandidateDemand(null);
    setPushDemand(demand);
    setPushTargets(targets);
    setPushResults([]);
    if (reviewers.length === 0 && !reviewersLoading) void loadReviewers();
  };

  const handlePushToBusiness = async (value: PushFormValue) => {
    if (!pushTargets || !pushDemand || pushSubmitting) return;
    setPushSubmitting(true);
    setPushResults([]);
    const selectedReviewer = reviewers.find((reviewer) => reviewer.id === value.reviewerId);
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

      <div className="flex items-center justify-between gap-4">
        <RequisitionTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <button onClick={() => { setCreateErrors({}); setFormOpen(true); }} className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-600">
          <i className="ri-add-line text-base"></i>招聘需求
        </button>
      </div>

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
          onRowClick={(req) => { void openDemand(req); }}
          onStatusChange={handleStatusChange}
          statusTransitions={statusTransitions}
          statusExtraActions={statusExtraActions}
          onSelectCandidates={(req) => setCandidateDemand(req.source)}
          onViewCandidates={(req) => openCandidates(req, 'all')}
          onStageCountClick={(req, stage) => openCandidates(req, stage)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={(field) => {
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

      {pushDemand && pushTargets ? (
        <PushToReviewerModal
          targets={pushTargets}
          demands={[{
            id: pushDemand.id,
            jobTitle: pushDemand.job_title,
            requestNo: pushDemand.request_no,
            department: pushDemand.requester_department || pushDemand.job_department,
          }]}
          reviewers={reviewers}
          initialDemandId={pushDemand.id}
          initialReviewerId={pushDemand.default_interviewer_id}
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
          }}
          onPush={(value) => void handlePushToBusiness(value)}
        />
      ) : null}

      <DemandDetailPanel
        demand={selectedDemand}
        saving={detailSaving}
        error={detailError}
        canReview={role === 'recruiter' || role === 'manager' || role === 'admin'}
        onClose={() => setSelectedDemand(null)}
        onSave={handleUpdate}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
