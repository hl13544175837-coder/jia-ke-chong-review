import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { Button, Card, DrawerShell, EmptyState, ErrorState, PageHeader, Spinner } from '../../../components/ui';
import { RecruitmentManagementTabs } from '../../../components/recruitment/RecruitmentManagementTabs';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAsync } from '../../../lib/useAsync';
import type { CandidateOwnerOption, DemandListQuery, DemandListResponse, RecruitmentDemand, RecruitmentDemandInput } from '../../../types';
import { demandsApi } from '../api';
import { DemandFilters } from '../components/DemandFilters';
import { DemandForm } from '../components/DemandForm';
import { DemandActionDialog, type DemandActionMode, type DemandActionValues } from '../components/DemandActionDialog';
import { DemandTable } from '../components/DemandTable';
import { DemandWorkspaceDrawer, type DemandDrawerContext } from '../components/DemandWorkspaceDrawer';

const EMPTY_RESPONSE: DemandListResponse = { items: [], total: 0, page: 1, page_size: 20, pages: 0 };

export function DemandsPage() {
  const { role, userId, name } = useAuth();
  const [query, setQuery] = useState<DemandListQuery>({ status: 'all', page: 1, page_size: 20, sort: 'created_at_desc' });
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [workspace, setWorkspace] = useState<{
    demand: RecruitmentDemand;
    context: DemandDrawerContext;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMode, setActionMode] = useState<DemandActionMode | null>(null);
  const [actionValues, setActionValues] = useState<DemandActionValues>({ reason: '', priority: 'B', owner_hr_id: null, close_status: 'paused' });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const submitGuardRef = useRef(false);

  const demands = useAsync(
    () => demandsApi.listDemands(query),
    [query.status, query.q, query.department, query.city, query.owner_hr_id, query.page, query.page_size, query.sort],
  );
  const jobs = useAsync(() => api.listJobs('active'), []);
  const owners = useAsync(
    () => (role === 'manager' || role === 'admin'
      ? api.listCandidateOwners()
      : Promise.resolve([] as CandidateOwnerOption[])),
    [role],
  );
  const interviewers = useAsync(() => api.listInterviewers(), []);

  async function handleCreate(payload: RecruitmentDemandInput) {
    if (submitGuardRef.current || submitting) return;
    submitGuardRef.current = true;
    setSubmitting(true);
    setCreateErrors({});
    setCreateMessage(null);
    const key = `demand-create:${userId ?? 'unknown'}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    try {
      const created = await demandsApi.createDemand(payload, key);
      demands.reload();
      setCreateDrawerOpen(false);
      setActionNotice(null);
      setWorkspace({ demand: created, context: { kind: 'overview' } });
    } catch (error) {
      if (error instanceof ApiError) {
        setCreateErrors(error.fields ?? {});
        setCreateMessage(error.message);
      } else {
        setCreateMessage(error instanceof Error ? error.message : '创建需求失败');
      }
    } finally {
      submitGuardRef.current = false;
      setSubmitting(false);
    }
  }

  function clearCreateError(field: string) {
    setCreateMessage(null);
    setCreateErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function closeCreateDrawer() {
    if (submitting) return;
    setCreateDrawerOpen(false);
    setCreateErrors({});
    setCreateMessage(null);
  }

  function openDemandWorkspace(demand: RecruitmentDemand, context: DemandDrawerContext) {
    setActionMode(null);
    setActionError(null);
    setActionNotice(null);
    setWorkspace({ demand, context });
  }

  function openDemandAction(mode: DemandActionMode) {
    const demand = workspace?.demand;
    if (!demand) return;
    if (mode === 'owner' && role !== 'manager' && role !== 'admin') {
      setActionNotice('仅招聘经理或管理员可转派负责人。');
      return;
    }
    setActionValues({ reason: '', priority: demand.priority, owner_hr_id: null, close_status: 'paused' });
    setActionError(null);
    setActionNotice(null);
    setActionMode(mode);
  }

  function closeDemandAction() {
    if (actionBusy) return;
    setActionMode(null);
    setActionError(null);
  }

  async function confirmDemandAction() {
    const demand = workspace?.demand;
    const mode = actionMode;
    const reason = actionValues.reason.trim();
    if (!demand || !mode || !reason || actionBusy) return;

    setActionBusy(true);
    setActionError(null);
    try {
      let updated: RecruitmentDemand;
      if (mode === 'close') {
        updated = await demandsApi.closeDemand(demand.id, { status: actionValues.close_status, close_reason: reason });
      } else if (mode === 'restore') {
        updated = await demandsApi.restoreDemand(demand.id, { note: reason });
      } else if (mode === 'priority') {
        updated = await demandsApi.downgradeDemand(demand.id, { priority: actionValues.priority, downgrade_reason: reason });
      } else {
        if ((role !== 'manager' && role !== 'admin') || !actionValues.owner_hr_id) {
          setActionError('请确认拥有转派权限并选择新的招聘负责人。');
          return;
        }
        updated = await demandsApi.reassignDemandOwner(demand.id, { owner_hr_id: actionValues.owner_hr_id, reason });
      }

      setWorkspace((current) => (
        current && current.demand.id === updated.id
          ? { ...current, demand: updated }
          : current
      ));
      demands.reload();
      setActionNotice('需求已更新，列表和右侧抽屉已同步最新结果。');
      setActionMode(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '需求操作失败，请稍后重试。');
    } finally {
      setActionBusy(false);
    }
  }

  const response = demands.data ?? EMPTY_RESPONSE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="招聘需求"
        description="每一行是一项独立招聘责任单；点击信息在右侧查看，列表位置不会丢失。"
        actions={(
          <Button type="button" onClick={() => setCreateDrawerOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建需求
          </Button>
        )}
      />
      <RecruitmentManagementTabs />

      <DemandFilters query={query} owners={owners.data ?? []} onChange={setQuery} />

      {demands.loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : demands.error ? (
        <ErrorState message={demands.error.message} onRetry={demands.reload} />
      ) : response.items.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="没有符合条件的招聘需求" description="可调整状态或筛选条件；如果尚未创建，请点击右上角“新建需求”。" /></Card>
      ) : (
        <DemandTable
          response={response}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          onOpenDemand={openDemandWorkspace}
        />
      )}

      <DrawerShell
        open={createDrawerOpen}
        onClose={closeCreateDrawer}
        title="创建招聘需求"
        eyebrow="招聘责任单"
        description="创建成功后会刷新当前列表，并在右侧打开新需求，不会跳走。"
        size="xl"
        testId="demand-create-drawer"
      >
        {jobs.loading || owners.loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted"><Spinner size="sm" />加载职位与负责人…</div>
        ) : jobs.error || owners.error ? (
          <ErrorState message={(jobs.error || owners.error)?.message ?? '加载创建选项失败'} onRetry={() => { jobs.reload(); owners.reload(); }} />
        ) : (jobs.data ?? []).length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="暂无可复用职位 / JD"
            description="先补一份职位与 JD 模板，再回来创建具体部门、城市和 HC 的招聘需求。"
            action={<Link to="/job-templates"><Button size="sm" variant="secondary">新建岗位（职位 / JD）</Button></Link>}
          />
        ) : (
          <DemandForm
            jobs={jobs.data ?? []}
            owners={owners.data ?? []}
            role={role}
            currentUserId={userId}
            currentUserName={name}
            interviewers={interviewers.data ?? []}
            interviewersLoading={interviewers.loading}
            interviewersError={interviewers.error?.message ?? null}
            onReloadInterviewers={interviewers.reload}
            onFieldChange={clearCreateError}
            busy={submitting}
            serverErrors={createErrors}
            onSubmit={handleCreate}
          />
        )}
        {createMessage && <p role="alert" className="mt-3 text-sm text-danger-600">{createMessage}</p>}
      </DrawerShell>

      <DemandWorkspaceDrawer
        demand={actionMode ? null : workspace?.demand ?? null}
        context={workspace?.context ?? { kind: 'overview' }}
        role={role}
        owners={owners.data ?? []}
        ownersLoading={owners.loading}
        ownersError={owners.error?.message ?? null}
        actionNotice={actionNotice}
        onReloadOwners={owners.reload}
        onRequestAction={openDemandAction}
        onClose={() => {
          setWorkspace(null);
          setActionNotice(null);
        }}
      />

      {workspace?.demand && (
        <DemandActionDialog
          demand={workspace.demand}
          mode={actionMode}
          values={actionValues}
          owners={owners.data ?? []}
          busy={actionBusy}
          actionError={actionError}
          onChange={setActionValues}
          onCancel={closeDemandAction}
          onConfirm={confirmDemandAction}
        />
      )}
    </div>
  );
}
