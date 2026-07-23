import { useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Spinner } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAsync } from '../../../lib/useAsync';
import type { CandidateOwnerOption, DemandListQuery, DemandListResponse, RecruitmentDemand, RecruitmentDemandInput } from '../../../types';
import { demandsApi } from '../api';
import { CandidateSelectionModal } from '../components/CandidateSelectionModal';
import { DemandCreateModal } from '../components/DemandCreateModal';
import { DemandTable } from '../components/DemandTable';

const EMPTY_RESPONSE: DemandListResponse = { items: [], total: 0, page: 1, page_size: 20, pages: 0 };

const STATUS_TABS: Array<{ value: DemandListQuery['status']; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '需求待确认' },
  { value: 'active', label: '招聘中' },
  { value: 'filled', label: '已完成' },
  { value: 'closed', label: '已关闭' },
];

function demandMetrics(
  business: number,
  interview: number,
  offer: number,
  onboarded: number,
): RecruitmentDemand['metrics'] {
  return {
    recommended_count: business + interview + offer + onboarded + 6,
    business_review_count: business,
    interview_count: interview,
    offer_count: offer,
    onboarded_count: onboarded,
    transferred_count: Math.max(1, business - 1),
    current_stage_counts: {
      business_review: business,
      interview,
      offer,
      onboarded,
    },
  };
}

const DEMO_DEMANDS: RecruitmentDemand[] = [
  { id: -101, job_id: 1, job_title: '资深后端开发工程师', job_city: '杭州', job_department: '技术研发部', job_code: 'DEMO-BE-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '刘思琪', request_no: 'REQ-20260718-BE01', requester_name: '周建国', requester_department: '技术研发部', hiring_manager_name: '周建国', requested_at: '2026-07-18', accepted_at: '2026-07-18', target_date: '2026-08-25', priority: 'A', headcount: 3, status: 'active', close_reason: '', downgrade_reason: '', note: '核心交易链路扩容', metrics: demandMetrics(4, 3, 1, 1), risk_flags: [], completion_suggested: false, created_at: '2026-07-18T09:30:00+08:00', updated_at: '2026-07-22T15:20:00+08:00' },
  { id: -102, job_id: 1, job_title: '高级前端工程师', job_city: '上海', job_department: '技术研发部', job_code: 'DEMO-FE-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '刘思琪', request_no: 'REQ-20260718-FE01', requester_name: '王浩然', requester_department: '技术研发部', hiring_manager_name: '王浩然', requested_at: '2026-07-18', accepted_at: '2026-07-18', target_date: '2026-08-20', priority: 'A', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: '招聘门户体验升级', metrics: demandMetrics(3, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-18T10:10:00+08:00', updated_at: '2026-07-22T12:00:00+08:00' },
  { id: -103, job_id: 1, job_title: '数据分析师', job_city: '深圳', job_department: '数据部', job_code: 'DEMO-DA-01', owner_hr_id: 2, owner_hr_name: '李华', default_interviewer_id: null, default_interviewer_name: '陈建国', request_no: 'REQ-20260717-DA01', requester_name: '陈建国', requester_department: '数据部', hiring_manager_name: '陈建国', requested_at: '2026-07-17', accepted_at: '2026-07-17', target_date: '2026-08-18', priority: 'B', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: '经营看板补强', metrics: demandMetrics(2, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-17T14:00:00+08:00', updated_at: '2026-07-22T10:30:00+08:00' },
  { id: -104, job_id: 1, job_title: '高级产品经理', job_city: '北京', job_department: '产品部', job_code: 'DEMO-PM-01', owner_hr_id: 2, owner_hr_name: '李华', default_interviewer_id: null, default_interviewer_name: '林小雅', request_no: 'REQ-20260716-PM01', requester_name: '林小雅', requester_department: '产品部', hiring_manager_name: '林小雅', requested_at: '2026-07-16', accepted_at: '2026-07-16', target_date: '2026-08-15', priority: 'A', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: 'B端产品线补位', metrics: demandMetrics(3, 1, 1, 1), risk_flags: [], completion_suggested: false, created_at: '2026-07-16T11:25:00+08:00', updated_at: '2026-07-22T09:00:00+08:00' },
  { id: -105, job_id: 1, job_title: '招聘运营专员', job_city: '广州', job_department: '人力资源部', job_code: 'DEMO-HR-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '李华', request_no: 'REQ-20260715-HR01', requester_name: '李华', requester_department: '人力资源部', hiring_manager_name: '李华', requested_at: '2026-07-15', accepted_at: '2026-07-15', target_date: '2026-08-12', priority: 'B', headcount: 1, status: 'active', close_reason: '', downgrade_reason: '', note: '校招项目支持', metrics: demandMetrics(2, 1, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-15T16:30:00+08:00', updated_at: '2026-07-21T18:00:00+08:00' },
  { id: -106, job_id: 1, job_title: '测试开发工程师', job_city: '上海', job_department: '技术研发部', job_code: 'DEMO-QA-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '甄诚', request_no: 'REQ-20260714-QA01', requester_name: '甄诚', requester_department: '技术研发部', hiring_manager_name: '甄诚', requested_at: '2026-07-14', accepted_at: '2026-07-14', target_date: '2026-08-08', priority: 'B', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: '自动化测试补强', metrics: demandMetrics(2, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-14T15:20:00+08:00', updated_at: '2026-07-21T16:30:00+08:00' },
  { id: -107, job_id: 1, job_title: 'UI/UX设计专家', job_city: '深圳', job_department: '设计部', job_code: 'DEMO-UX-01', owner_hr_id: 3, owner_hr_name: '王磊', default_interviewer_id: null, default_interviewer_name: '赵晓月', request_no: 'REQ-20260713-UX01', requester_name: '赵晓月', requester_department: '设计部', hiring_manager_name: '赵晓月', requested_at: '2026-07-13', accepted_at: '2026-07-13', target_date: '2026-08-10', priority: 'A', headcount: 1, status: 'active', close_reason: '', downgrade_reason: '', note: '统一工作台体验负责人', metrics: demandMetrics(2, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-13T13:45:00+08:00', updated_at: '2026-07-21T10:10:00+08:00' },
  { id: -108, job_id: 1, job_title: '架构师', job_city: '杭州', job_department: '技术研发部', job_code: 'DEMO-ARCH-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '周建国', request_no: 'REQ-20260712-ARCH01', requester_name: '周建国', requester_department: '技术研发部', hiring_manager_name: '周建国', requested_at: '2026-07-12', accepted_at: '2026-07-12', target_date: '2026-08-30', priority: 'A', headcount: 1, status: 'pending', close_reason: '', downgrade_reason: '', note: '技术中台方案评审中', metrics: demandMetrics(3, 1, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-12T09:40:00+08:00', updated_at: '2026-07-20T15:00:00+08:00' },
  { id: -109, job_id: 1, job_title: '市场增长经理', job_city: '广州', job_department: '市场部', job_code: 'DEMO-MKT-01', owner_hr_id: 3, owner_hr_name: '王磊', default_interviewer_id: null, default_interviewer_name: '周雨桐', request_no: 'REQ-20260711-MKT01', requester_name: '周雨桐', requester_department: '市场部', hiring_manager_name: '周雨桐', requested_at: '2026-07-11', accepted_at: '2026-07-11', target_date: '2026-08-16', priority: 'B', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: '区域获客增长', metrics: demandMetrics(2, 1, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-11T10:00:00+08:00', updated_at: '2026-07-20T14:25:00+08:00' },
  { id: -110, job_id: 1, job_title: 'HRBP', job_city: '北京', job_department: '人力资源部', job_code: 'DEMO-HRBP-01', owner_hr_id: 2, owner_hr_name: '李华', default_interviewer_id: null, default_interviewer_name: '李华', request_no: 'REQ-20260710-HRBP01', requester_name: '李华', requester_department: '人力资源部', hiring_manager_name: '李华', requested_at: '2026-07-10', accepted_at: '2026-07-10', target_date: '2026-08-05', priority: 'B', headcount: 1, status: 'filled', close_reason: '', downgrade_reason: '', note: '业务线组织支持', metrics: demandMetrics(1, 1, 1, 1), risk_flags: [], completion_suggested: true, created_at: '2026-07-10T10:10:00+08:00', updated_at: '2026-07-19T16:00:00+08:00' },
  { id: -111, job_id: 1, job_title: 'Java开发工程师', job_city: '上海', job_department: '技术研发部', job_code: 'DEMO-JAVA-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '王浩然', request_no: 'REQ-20260709-JAVA01', requester_name: '王浩然', requester_department: '技术研发部', hiring_manager_name: '王浩然', requested_at: '2026-07-09', accepted_at: '2026-07-09', target_date: '2026-08-22', priority: 'B', headcount: 4, status: 'active', close_reason: '', downgrade_reason: '', note: '支付结算团队扩招', metrics: demandMetrics(5, 4, 2, 1), risk_flags: [], completion_suggested: false, created_at: '2026-07-09T09:20:00+08:00', updated_at: '2026-07-19T12:40:00+08:00' },
  { id: -112, job_id: 1, job_title: '算法工程师', job_city: '杭州', job_department: '数据部', job_code: 'DEMO-ALG-01', owner_hr_id: 3, owner_hr_name: '王磊', default_interviewer_id: null, default_interviewer_name: '陈建国', request_no: 'REQ-20260708-ALG01', requester_name: '陈建国', requester_department: '数据部', hiring_manager_name: '陈建国', requested_at: '2026-07-08', accepted_at: '2026-07-08', target_date: '2026-09-01', priority: 'A', headcount: 2, status: 'pending', close_reason: '', downgrade_reason: '', note: '推荐匹配模型升级', metrics: demandMetrics(3, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-08T14:30:00+08:00', updated_at: '2026-07-18T18:20:00+08:00' },
  { id: -113, job_id: 1, job_title: '运维工程师', job_city: '深圳', job_department: '技术研发部', job_code: 'DEMO-SRE-01', owner_hr_id: 1, owner_hr_name: '张敏', default_interviewer_id: null, default_interviewer_name: '钱一鸣', request_no: 'REQ-20260707-SRE01', requester_name: '钱一鸣', requester_department: '技术研发部', hiring_manager_name: '钱一鸣', requested_at: '2026-07-07', accepted_at: '2026-07-07', target_date: '2026-08-18', priority: 'B', headcount: 2, status: 'active', close_reason: '', downgrade_reason: '', note: '云平台稳定性保障', metrics: demandMetrics(2, 2, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-07T17:00:00+08:00', updated_at: '2026-07-18T11:20:00+08:00' },
  { id: -114, job_id: 1, job_title: '产品运营专员', job_city: '北京', job_department: '产品部', job_code: 'DEMO-OPS-01', owner_hr_id: 2, owner_hr_name: '李华', default_interviewer_id: null, default_interviewer_name: '林小雅', request_no: 'REQ-20260706-OPS01', requester_name: '林小雅', requester_department: '产品部', hiring_manager_name: '林小雅', requested_at: '2026-07-06', accepted_at: '2026-07-06', target_date: '2026-08-03', priority: 'C', headcount: 1, status: 'filled', close_reason: '', downgrade_reason: '', note: '用户反馈闭环', metrics: demandMetrics(1, 1, 1, 1), risk_flags: [], completion_suggested: true, created_at: '2026-07-06T10:00:00+08:00', updated_at: '2026-07-17T10:00:00+08:00' },
  { id: -115, job_id: 1, job_title: '财务分析经理', job_city: '上海', job_department: '财务部', job_code: 'DEMO-FIN-01', owner_hr_id: 3, owner_hr_name: '王磊', default_interviewer_id: null, default_interviewer_name: '黄诗涵', request_no: 'REQ-20260705-FIN01', requester_name: '黄诗涵', requester_department: '财务部', hiring_manager_name: '黄诗涵', requested_at: '2026-07-05', accepted_at: '2026-07-05', target_date: '2026-08-28', priority: 'B', headcount: 1, status: 'closed', close_reason: '预算冻结，暂缓招聘', downgrade_reason: '', note: '预算场景演示', metrics: demandMetrics(1, 1, 1, 0), risk_flags: [], completion_suggested: false, created_at: '2026-07-05T09:10:00+08:00', updated_at: '2026-07-16T14:00:00+08:00' },
];

function filterDemoDemands(items: RecruitmentDemand[], query: DemandListQuery) {
  const keyword = query.q?.trim().toLowerCase();
  return items
    .filter((item) => {
      if (query.status && query.status !== 'all') {
        if (query.status === 'closed') {
          if (item.status !== 'closed' && item.status !== 'cancelled') return false;
        } else if (item.status !== query.status) {
          return false;
        }
      }
      if (query.department && item.job_department !== query.department) return false;
      if (query.city && item.job_city !== query.city) return false;
      if (query.owner_hr_id && item.owner_hr_id !== query.owner_hr_id) return false;
      if (keyword) {
        const haystack = [
          item.request_no,
          item.job_title,
          item.owner_hr_name,
          item.job_department,
          item.job_city,
        ].join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const left = new Date(a.created_at ?? a.requested_at ?? '').getTime();
      const right = new Date(b.created_at ?? b.requested_at ?? '').getTime();
      return query.sort === 'created_at_asc' ? left - right : right - left;
    });
}

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
    [query.status, query.q, query.department, query.city, query.owner_hr_id, query.page, query.page_size, query.sort],
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

  const response = useMemo(() => {
    const base = demands.data ?? EMPTY_RESPONSE;
    const demoItems = filterDemoDemands(DEMO_DEMANDS, query);
    const items = [...base.items, ...demoItems];
    const total = base.total + demoItems.length;
    const pageSize = Math.max(base.page_size || query.page_size || 20, items.length || 1);
    return {
      ...base,
      items,
      total,
      page: base.page || query.page || 1,
      page_size: pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }, [demands.data, query]);

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
      ) : response.items.length === 0 ? (
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
          response={response}
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
