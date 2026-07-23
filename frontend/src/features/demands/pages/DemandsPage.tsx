import { useRef, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Spinner } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAsync } from '../../../lib/useAsync';
import type { CandidateOwnerOption, DemandListQuery, RecruitmentDemand, RecruitmentDemandInput } from '../../../types';
import { demandsApi } from '../api';
import { CandidateSelectionModal } from '../components/CandidateSelectionModal';
import { DemandCreateModal } from '../components/DemandCreateModal';
import { DemandTable } from '../components/DemandTable';

const STATUS_TABS: Array<{ value: DemandListQuery['status']; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '需求待确认' },
  { value: 'active', label: '招聘中' },
  { value: 'filled', label: '已完成' },
  { value: 'closed', label: '已关闭' },
];

export function DemandsPage() {
  const { role, userId, name } = useAuth();
  const [query, setQuery] = useState<DemandListQuery>({ status: 'all', page: 1, page_size: 20, sort: 'created_at_desc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<RecruitmentDemand | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const submitGuardRef = useRef(false);

  const demands = useAsync(
    () => demandsApi.listDemands(query),
    [query.status, query.q, query.department, query.city, query.owner_hr_id, query.stage_focus, query.page, query.page_size, query.sort],
  );
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
      await demandsApi.createDemand(payload, key);
      setCreateOpen(false);
      demands.reload();
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

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3" aria-label="招聘需求状态">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setQuery((current) => ({ ...current, status: tab.value, page: 1 }))}
              className={`h-11 rounded-lg px-5 text-sm font-bold transition ${
                (query.status ?? 'all') === tab.value
                  ? 'bg-[#33a474] text-white shadow-sm'
                  : 'border border-[#eef0f2] bg-white text-[#555b64] hover:border-[#cfd6dc] hover:bg-[#fbfcfc]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button type="button" className="h-12 rounded-xl px-6" onClick={() => setCreateOpen(true)}>
          <Plus className="h-5 w-5" />
          招聘需求
        </Button>
      </div>

      {demands.loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : demands.error ? (
        <ErrorState message={demands.error.message} onRetry={demands.reload} />
      ) : !demands.data || demands.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="没有符合条件的招聘需求"
            description="可调整状态或筛选条件；如果尚未创建，请点击右上角新增招聘需求。"
            action={<Button type="button" size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> 招聘需求</Button>}
          />
        </Card>
      ) : (
        <DemandTable
          response={demands.data}
          query={query}
          owners={owners.data ?? []}
          onQueryChange={setQuery}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          onSelectCandidates={setSelectedDemand}
        />
      )}

      <DemandCreateModal
        open={createOpen}
        owners={owners.data ?? []}
        role={role}
        currentUserId={userId}
        currentUserName={name}
        interviewers={interviewers.data ?? []}
        loadingOptions={owners.loading || interviewers.loading}
        optionError={(owners.error || interviewers.error)?.message ?? null}
        onReloadOptions={() => {
          owners.reload();
          interviewers.reload();
        }}
        busy={submitting}
        serverErrors={createErrors}
        message={createMessage}
        onFieldChange={clearCreateError}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <CandidateSelectionModal
        open={Boolean(selectedDemand)}
        demand={selectedDemand}
        onClose={() => setSelectedDemand(null)}
        onChanged={demands.reload}
      />
    </div>
  );
}
