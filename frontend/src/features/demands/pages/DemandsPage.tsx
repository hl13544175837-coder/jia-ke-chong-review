import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, PageHeader, Spinner } from '../../../components/ui';
import { RecruitmentManagementTabs } from '../../../components/recruitment/RecruitmentManagementTabs';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAsync } from '../../../lib/useAsync';
import type { CandidateOwnerOption, DemandListQuery, DemandListResponse, RecruitmentDemandInput } from '../../../types';
import { demandsApi } from '../api';
import { DemandFilters } from '../components/DemandFilters';
import { DemandForm } from '../components/DemandForm';
import { DemandTable } from '../components/DemandTable';

const EMPTY_RESPONSE: DemandListResponse = { items: [], total: 0, page: 1, page_size: 20, pages: 0 };

export function DemandsPage() {
  const navigate = useNavigate();
  const { role, userId, name } = useAuth();
  const [query, setQuery] = useState<DemandListQuery>({ status: 'all', page: 1, page_size: 20, sort: 'created_at_desc' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      navigate(`/demands/${created.id}`);
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

  const response = demands.data ?? EMPTY_RESPONSE;

  return (
    <div className="space-y-6">
      <PageHeader title="招聘需求" description="每一行是一项独立招聘责任单；先找到需求，再下钻候选人和当前卡点。" />
      <RecruitmentManagementTabs />

      <Card variant="elevated">
        <CardHeader className={showCreateForm ? undefined : 'border-b-0'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>创建招聘需求</CardTitle>
              <p className="mt-1 text-xs text-muted-soft">需要时展开填写，创建成功后直接进入需求详情。</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting}
              aria-expanded={showCreateForm}
              aria-controls="demand-create-panel"
              onClick={() => setShowCreateForm((current) => !current)}
            >
              {showCreateForm ? '收起' : '展开'}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showCreateForm ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        </CardHeader>
        <CardBody id="demand-create-panel" hidden={!showCreateForm}>
          {jobs.loading || owners.loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted"><Spinner size="sm" />加载职位与负责人…</div>
          ) : jobs.error || owners.error ? (
            <ErrorState message={(jobs.error || owners.error)?.message ?? '加载创建选项失败'} onRetry={() => { jobs.reload(); owners.reload(); }} />
          ) : (jobs.data ?? []).length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="暂无可复用职位 / JD"
              description="先补一份职位与 JD 模板，再回来创建具体部门、城市和 HC 的招聘需求。"
              action={<Link to="/jobs"><Button size="sm" variant="secondary">新建岗位（职位 / JD）</Button></Link>}
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
          {createMessage && <p className="mt-3 text-sm text-danger-600">{createMessage}</p>}
        </CardBody>
      </Card>

      <DemandFilters query={query} owners={owners.data ?? []} onChange={setQuery} />

      {demands.loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : demands.error ? (
        <ErrorState message={demands.error.message} onRetry={demands.reload} />
      ) : response.items.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="没有符合条件的招聘需求" description="可调整状态或筛选条件；如果尚未创建，请使用上方表单。" /></Card>
      ) : (
        <DemandTable response={response} onPageChange={(page) => setQuery((current) => ({ ...current, page }))} />
      )}
    </div>
  );
}
