import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Clock3,
  FileCheck2,
  History,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
  useToast,
} from '../components/ui';
import { DrawerShell } from '../components/ui/DrawerShell';
import type {
  OfferAction,
  OfferActionInput,
  OfferRecord,
  OfferStatus,
  RecruitmentDemand,
} from '../types';

type TabKey = 'all' | 'draft' | 'pending' | 'delivery' | 'reply' | 'onboard' | 'closed';

const TAB_CONFIG: Array<{ key: TabKey; label: string; statuses: OfferStatus[] }> = [
  { key: 'all', label: '全部', statuses: [] },
  { key: 'draft', label: '待提交', statuses: ['draft'] },
  { key: 'pending', label: '审批中', statuses: ['pending'] },
  { key: 'delivery', label: '待发放', statuses: ['approved'] },
  { key: 'reply', label: '待回复', statuses: ['sent'] },
  { key: 'onboard', label: '待入职', statuses: ['accepted'] },
  { key: 'closed', label: '已结束', statuses: ['declined', 'withdrawn', 'expired', 'onboarded'] },
];

const STATUS_META: Record<OfferStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info' }> = {
  draft: { label: '草稿', tone: 'neutral' },
  pending: { label: '待审批', tone: 'warning' },
  approved: { label: '待发放', tone: 'info' },
  sent: { label: '等待回复', tone: 'info' },
  accepted: { label: '待入职', tone: 'success' },
  declined: { label: '已拒绝', tone: 'danger' },
  withdrawn: { label: '已撤回', tone: 'neutral' },
  expired: { label: '已过期', tone: 'neutral' },
  onboarded: { label: '已入职', tone: 'success' },
};
const OFFER_STATUS_OPTIONS: OfferStatus[] = [
  'draft',
  'pending',
  'approved',
  'sent',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
  'onboarded',
];

type OfferColumnFilter = 'identity' | 'demand' | 'compensation' | 'status' | 'updated';

function isOfferStatus(value: string): value is OfferStatus {
  return OFFER_STATUS_OPTIONS.some((status) => status === value);
}

const ACTION_LABELS: Record<OfferAction, string> = {
  submit: '提交审批',
  approve: '审批通过',
  reject: '审批拒绝',
  send: '发放 Offer',
  accept: '标记候选人接受',
  decline: '标记候选人拒绝',
  withdraw: '撤回 Offer',
  expire: '标记过期',
  onboard: '确认入职',
  resend: '重新发送',
  follow_up: '发送跟进提醒',
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function demandLabel(demand: RecruitmentDemand) {
  return `${demand.job_title} · ${demand.request_no} · ${demand.requester_department || '未填部门'}`;
}

function offerStatus(offer: OfferRecord): OfferStatus {
  return offer.status || offer.approval_status;
}

function offerUpdatedAt(offer: OfferRecord): number {
  const parsed = Date.parse(offer.updated_at || offer.created_at || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function OfferColumnFilterHeader({
  'data-ui': dataUi,
  label,
  open,
  onToggle,
  children,
}: {
  'data-ui': string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <th
      className="relative min-w-44 px-5 py-3 align-top font-medium"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <button
        type="button"
        data-ui={dataUi}
        aria-expanded={open}
        aria-controls={`${dataUi}-panel`}
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded text-left text-xs text-[#777b78] hover:text-[#454946] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--enterprise-brand)]"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${dataUi}-panel`}
          role="group"
          aria-label={`${label}筛选条件`}
          className="absolute left-5 top-full z-30 mt-1 w-60 space-y-2 rounded-md border border-[#dedfd9] bg-white p-3 shadow-lg"
        >
          {children}
        </div>
      )}
    </th>
  );
}

const OFFER_COLUMN_FIELD_CLASS = 'h-8 w-full rounded-md border border-[#dedfd9] bg-white px-2 text-xs text-[#454946] outline-none focus:border-[var(--enterprise-brand)]';

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2925]/35 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e5e6e1] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#ecece8] bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[#292b2a]">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#777b78]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#777b78] hover:bg-[#f3f4f1]" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OfferForm({
  offer,
  demands,
  onSaved,
  onClose,
}: {
  offer: OfferRecord | null;
  demands: RecruitmentDemand[];
  onSaved: (offer: OfferRecord) => void;
  onClose: () => void;
}) {
  const [demandId, setDemandId] = useState(offer ? String(offer.demand_id) : '');
  const [candidateId, setCandidateId] = useState(offer ? String(offer.candidate_id) : '');
  const [salary, setSalary] = useState(offer?.salary_range ?? '');
  const [onboardDate, setOnboardDate] = useState(offer?.onboard_date ?? '');
  const [note, setNote] = useState(offer?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedDemandId = Number(demandId);
  const boardAsync = useAsync(
    () => selectedDemandId > 0
      ? api.getDemandPipelineBoard(selectedDemandId)
      : Promise.resolve(null),
    [selectedDemandId],
  );
  const eligibleCandidates = (boardAsync.data?.candidates ?? []).filter(
    (candidate) => candidate.stage === 'offer',
  );

  async function save() {
    const did = Number(demandId);
    const cid = Number(candidateId);
    if (!did || !cid || !salary.trim()) {
      setError('请选择招聘需求、候选人并填写薪酬');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveDemandOfferRecord(did, cid, {
        salary_range: salary.trim(),
        onboard_date: onboardDate || null,
        note: note.trim(),
      });
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={offer ? '编辑 Offer 草稿' : '新建 Offer 草稿'}
      description="草稿保存后需要提交审批，不能绕过审批直接发放"
      onClose={onClose}
    >
      <div className="space-y-5 px-6 py-6">
        <label className="block text-sm font-medium text-[#454946]">
          招聘需求
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={demandId}
            disabled={!!offer}
            onChange={(event) => {
              setDemandId(event.target.value);
              setCandidateId('');
            }}
          >
            <option value="">请选择招聘需求</option>
            {demands.filter((item) => ['pending', 'active'].includes(item.status)).map((item) => (
              <option key={item.id} value={item.id}>{demandLabel(item)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-[#454946]">
          候选人
          <select
            className="mt-2 h-11 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={candidateId}
            disabled={!!offer || !demandId || boardAsync.loading}
            onChange={(event) => setCandidateId(event.target.value)}
          >
            <option value="">请选择已进入 Offer 阶段的候选人</option>
            {offer && <option value={offer.candidate_id}>{offer.candidate_name}</option>}
            {!offer && eligibleCandidates.map((item) => (
              <option key={item.candidate_id} value={item.candidate_id}>{item.name_masked}</option>
            ))}
          </select>
          {boardAsync.error && <span className="mt-1 block text-xs text-red-600">{boardAsync.error.message}</span>}
          {!offer && boardAsync.error && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[var(--enterprise-brand-dark)] hover:underline"
              onClick={boardAsync.reload}
            >
              重新加载候选人
            </button>
          )}
          {!offer && demandId && !boardAsync.loading && !boardAsync.error && eligibleCandidates.length === 0 && (
            <span className="mt-1 block text-xs text-[#777b78]">该需求暂时没有进入 Offer 阶段的候选人</span>
          )}
        </label>

        <Input label="薪酬方案" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="例如：30-35K × 14薪" />
        <Input label="预计入职日期" type="date" value={onboardDate} onChange={(event) => setOnboardDate(event.target.value)} />
        <label className="block text-sm font-medium text-[#454946]">
          备注
          <textarea
            className="mt-2 min-h-28 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder="填写定薪依据、沟通情况等"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
        <Button
          onClick={save}
          loading={saving}
          disabled={!offer && (boardAsync.loading || !!boardAsync.error || !candidateId)}
        >
          保存草稿
        </Button>
      </div>
    </ModalShell>
  );
}

function ActionModal({
  action,
  offer,
  onClose,
  onDone,
}: {
  action: OfferAction;
  offer: OfferRecord;
  onClose: () => void;
  onDone: (offer: OfferRecord) => void;
}) {
  const [comment, setComment] = useState('');
  const [onboardDate, setOnboardDate] = useState(offer.onboard_date ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReason = ['reject', 'decline', 'withdraw'].includes(action);

  async function confirm() {
    if (needsReason && !comment.trim()) {
      setError('请填写原因，便于后续审计和复盘');
      return;
    }
    if (action === 'onboard' && !onboardDate) {
      setError('请选择实际入职日期');
      return;
    }
    setLoading(true);
    setError(null);
    const payload: OfferActionInput = {
      action,
      comment: comment.trim(),
    };
    if (action === 'send') {
      payload.channel = 'email';
      if (expiresAt) payload.expires_at = `${expiresAt}T23:59:59`;
    }
    if (action === 'onboard') payload.onboard_date = onboardDate;
    try {
      onDone(await api.runOfferAction(offer.id!, payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={ACTION_LABELS[action]} description={`${offer.candidate_name} · ${offer.position}`} onClose={onClose}>
      <div className="space-y-4 px-6 py-6">
        {action === 'send' && (
          <Input label="Offer 有效期（可选，默认 14 天）" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        )}
        {action === 'onboard' && (
          <Input label="实际入职日期" type="date" value={onboardDate} onChange={(event) => setOnboardDate(event.target.value)} />
        )}
        <label className="block text-sm font-medium text-[#454946]">
          {needsReason ? '原因（必填）' : '备注（可选）'}
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-brand)]"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={needsReason ? '请填写具体原因' : '补充说明'}
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={loading}>取消</Button>
        <Button variant={needsReason ? 'danger' : 'primary'} onClick={confirm} loading={loading}>{ACTION_LABELS[action]}</Button>
      </div>
    </ModalShell>
  );
}

function OfferActions({
  offer,
  canApprove,
  onEdit,
  onAction,
}: {
  offer: OfferRecord;
  canApprove: boolean;
  onEdit: () => void;
  onAction: (action: OfferAction) => void;
}) {
  const status = offerStatus(offer);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === 'draft' && <Button size="sm" variant="secondary" onClick={onEdit}>编辑</Button>}
      {status === 'draft' && <Button size="sm" onClick={() => onAction('submit')}>提交审批</Button>}
      {status === 'pending' && canApprove && <Button size="sm" onClick={() => onAction('approve')}><Check className="h-4 w-4" />通过</Button>}
      {status === 'pending' && canApprove && <Button size="sm" variant="danger" onClick={() => onAction('reject')}>拒绝</Button>}
      {status === 'approved' && <Button size="sm" onClick={() => onAction('send')}><Send className="h-4 w-4" />发放</Button>}
      {status === 'sent' && <Button size="sm" onClick={() => onAction('accept')}>接受</Button>}
      {status === 'sent' && <Button size="sm" variant="secondary" onClick={() => onAction('decline')}>拒绝</Button>}
      {status === 'sent' && <Button size="sm" variant="ghost" onClick={() => onAction('resend')}>重发</Button>}
      {status === 'sent' && <Button size="sm" variant="ghost" onClick={() => onAction('follow_up')}>跟进</Button>}
      {status === 'accepted' && <Button size="sm" onClick={() => onAction('onboard')}><UserCheck className="h-4 w-4" />确认入职</Button>}
      {['pending', 'approved', 'sent', 'accepted'].includes(status) && (
        <Button size="sm" variant="ghost" onClick={() => onAction('withdraw')}>撤回</Button>
      )}
    </div>
  );
}

function OfferDetailDrawer({
  offer,
  loading,
  error,
  onClose,
}: {
  offer: OfferRecord;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const status = STATUS_META[offerStatus(offer)];
  return (
    <DrawerShell
      open
      title="Offer 详情"
      eyebrow={status.label}
      description={`${offer.candidate_name} · ${offer.request_no}`}
      onClose={onClose}
      size="lg"
      testId="offer-detail-drawer"
      footer={(
        <Button
          variant="secondary"
          disabled={loading || Boolean(error)}
          onClick={() => window.print()}
        >
          打印 / 导出 PDF
        </Button>
      )}
    >
      <div className="space-y-6 px-6 py-6">
        {loading && (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm text-muted">
            <Spinner size="sm" />正在读取最新 Offer 详情…
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}。当前展示的是列表概要，暂不可打印；关闭后可重新打开重试。
          </div>
        )}
        <section className="rounded-xl border border-[#e8e7e1] p-4">
          <h3 className="text-sm font-semibold text-[#292b2a]">基本信息</h3>
          <div className="mt-3 grid gap-4 rounded-xl bg-[#f6f7f3] p-4 sm:grid-cols-2">
            <div><p className="text-xs text-[#777b78]">当前状态</p><div className="mt-1"><Badge tone={status.tone}>{status.label}</Badge></div></div>
            <div><p className="text-xs text-[#777b78]">岗位</p><p className="mt-1 font-semibold text-[#292b2a]">{offer.position || '—'}</p></div>
            <div><p className="text-xs text-[#777b78]">部门</p><p className="mt-1 text-sm text-[#454946]">{offer.department || '—'}</p></div>
            <div><p className="text-xs text-[#777b78]">审批人</p><p className="mt-1 text-sm text-[#454946]">{offer.approver_name || '提交后自动分配'}</p></div>
          </div>
          <div className="mt-4">
            <p className="text-xs text-[#777b78]">备注</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5f6561]">{offer.note || '暂无备注'}</p>
          </div>
          {offer.rejection_reason && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-xs font-medium text-red-700">结束/拒绝原因</p>
              <p className="mt-1 text-sm text-red-800">{offer.rejection_reason}</p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#e8e7e1] p-4">
          <h3 className="text-sm font-semibold text-[#292b2a]">薪资与入职</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-[#777b78]">薪酬方案</dt><dd className="mt-1 font-semibold text-[#292b2a]">{offer.salary_range || '—'}</dd></div>
            <div><dt className="text-xs text-[#777b78]">预计入职</dt><dd className="mt-1 text-sm text-[#454946]">{offer.onboard_date || '—'}</dd></div>
            <div><dt className="text-xs text-[#777b78]">Offer 发放</dt><dd className="mt-1 text-sm text-[#454946]">{formatTime(offer.sent_at)}</dd></div>
            <div><dt className="text-xs text-[#777b78]">确认入职</dt><dd className="mt-1 text-sm text-[#454946]">{formatTime(offer.onboarded_at)}</dd></div>
          </dl>
        </section>

        <section className="rounded-xl border border-[#e8e7e1] p-4">
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-[var(--enterprise-brand)]" /><h3 className="text-sm font-semibold text-[#292b2a]">操作历史</h3></div>
          <div className="mt-4 space-y-0">
            {(offer.history ?? []).length === 0 && <p className="text-sm text-[#777b78]">暂无操作记录</p>}
            {(offer.history ?? []).map((item, index) => (
              <div key={item.id} className="relative flex gap-3 pb-5">
                {index < (offer.history?.length ?? 0) - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-[#dfe4de]" />}
                <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-[var(--enterprise-brand-soft)] bg-[var(--enterprise-brand)]" />
                <div>
                  <p className="text-sm font-medium text-[#3f4541]">{ACTION_LABELS[item.action as OfferAction] ?? item.action}</p>
                  <p className="mt-0.5 text-xs text-[#858a86]">{item.actor_name || '系统'} · {formatTime(item.created_at)}</p>
                  {item.comment && <p className="mt-1 text-sm text-[#5f6561]">{item.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

export function OffersPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [openColumnFilter, setOpenColumnFilter] = useState<OfferColumnFilter | null>(null);
  const [identityFilter, setIdentityFilter] = useState('');
  const [demandFilter, setDemandFilter] = useState('');
  const [compensationFilter, setCompensationFilter] = useState('');
  const [onboardDateFilter, setOnboardDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OfferStatus>('all');
  const [updatedOrder, setUpdatedOrder] = useState<'asc' | 'desc'>('desc');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OfferRecord | null>(null);
  const [selected, setSelected] = useState<OfferRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequestRef = useRef(0);
  const [actionTarget, setActionTarget] = useState<{ offer: OfferRecord; action: OfferAction } | null>(null);
  const offersAsync = useAsync(() => api.listOffers({ search }), [search]);
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );
  const offers = useMemo(() => offersAsync.data?.items ?? [], [offersAsync.data?.items]);
  const activeConfig = TAB_CONFIG.find((item) => item.key === activeTab) ?? TAB_CONFIG[0];
  const filtered = useMemo(() => {
    const identityTerm = identityFilter.trim().toLocaleLowerCase('zh-CN');
    const demandTerm = demandFilter.trim().toLocaleLowerCase('zh-CN');
    const compensationTerm = compensationFilter.trim().toLocaleLowerCase('zh-CN');
    return offers
      .filter((offer) => (
        activeConfig.statuses.length === 0
        || activeConfig.statuses.includes(offerStatus(offer))
      ))
      .filter((offer) => statusFilter === 'all' || offerStatus(offer) === statusFilter)
      .filter((offer) => !identityTerm || [offer.candidate_name, offer.position]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(identityTerm)))
      .filter((offer) => !demandTerm || [offer.request_no, offer.department]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(demandTerm)))
      .filter((offer) => !compensationTerm || (offer.salary_range || '')
        .toLocaleLowerCase('zh-CN').includes(compensationTerm))
      .filter((offer) => !onboardDateFilter || offer.onboard_date === onboardDateFilter)
      .sort((left, right) => updatedOrder === 'asc'
        ? offerUpdatedAt(left) - offerUpdatedAt(right)
        : offerUpdatedAt(right) - offerUpdatedAt(left));
  }, [
    activeConfig.statuses,
    compensationFilter,
    demandFilter,
    identityFilter,
    offers,
    onboardDateFilter,
    statusFilter,
    updatedOrder,
  ]);
  const counts = useMemo(() => Object.fromEntries(TAB_CONFIG.map((tab) => [
    tab.key,
    tab.statuses.length === 0
      ? offers.length
      : offers.filter((offer) => tab.statuses.includes(offerStatus(offer))).length,
  ])), [offers]);
  const canApprove = role === 'manager' || role === 'admin';
  const activeDemandCount = (demandsAsync.data?.items ?? []).filter(
    (item) => ['pending', 'active'].includes(item.status),
  ).length;
  const canCreateOffer = !demandsAsync.loading && !demandsAsync.error && activeDemandCount > 0;
  const hasColumnFilters =
    identityFilter.trim() !== ''
    || demandFilter.trim() !== ''
    || compensationFilter.trim() !== ''
    || onboardDateFilter !== ''
    || statusFilter !== 'all'
    || updatedOrder !== 'desc';

  function toggleColumnFilter(column: OfferColumnFilter) {
    setOpenColumnFilter((current) => current === column ? null : column);
  }

  function resetColumnFilters() {
    setIdentityFilter('');
    setDemandFilter('');
    setCompensationFilter('');
    setOnboardDateFilter('');
    setStatusFilter('all');
    setUpdatedOrder('desc');
    setOpenColumnFilter(null);
  }

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    setStatusFilter('all');
  }

  async function openDetail(offer: OfferRecord) {
    const requestId = ++detailRequestRef.current;
    setSelected(offer);
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await api.getOffer(offer.id!);
      if (requestId !== detailRequestRef.current) return;
      setSelected(detail);
    } catch (cause) {
      if (requestId !== detailRequestRef.current) return;
      const message = cause instanceof Error ? cause.message : 'Offer 详情加载失败';
      setDetailError(message);
      toast.error(message);
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }

  function invalidateOfferDetail() {
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setDetailError('');
    setSelected(null);
  }

  function closeDetail() {
    invalidateOfferDetail();
  }

  function openCreateForm() {
    invalidateOfferDetail();
    setEditing(null);
    setShowForm(true);
  }

  function openEditForm(offer: OfferRecord) {
    invalidateOfferDetail();
    setEditing(offer);
    setShowForm(true);
  }

  function openActionModal(offer: OfferRecord, action: OfferAction) {
    invalidateOfferDetail();
    setActionTarget({ offer, action });
  }

  function handleSaved(offer: OfferRecord) {
    setShowForm(false);
    setEditing(null);
    offersAsync.reload();
    toast.success('Offer 草稿已保存');
    void openDetail(offer);
  }

  function handleActionDone(offer: OfferRecord) {
    const action = actionTarget?.action;
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setDetailError('');
    setActionTarget(null);
    offersAsync.reload();
    setSelected(offer);
    toast.success(action ? `${ACTION_LABELS[action]}成功` : '操作成功');
  }

  return (
    <div data-ui="readdy-offers" className="mx-auto max-w-[1440px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#292b2a]">Offer 管理</h1>
          <p className="mt-1 text-sm text-[#777b78]">管理审批、发放、候选人回复与入职，所有操作都会留痕</p>
        </div>
        <Button
          disabled={!canCreateOffer}
          onClick={openCreateForm}
        >
          <Plus className="h-4 w-4" />
          {demandsAsync.loading ? '加载需求中…' : '新建 Offer'}
        </Button>
      </div>

      {!demandsAsync.loading && demandsAsync.error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">招聘需求加载失败，暂时不能新建 Offer。</p>
          <p className="mt-1 text-xs text-red-700">{demandsAsync.error.message}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={demandsAsync.reload}>重试加载需求</Button>
        </div>
      )}
      {!demandsAsync.loading && !demandsAsync.error && activeDemandCount === 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
          当前没有可用的招聘需求。请先到 <Link className="font-medium underline" to="/jobs">招聘管理</Link> 创建或恢复需求，再新建 Offer。
        </div>
      )}

      <Card className="overflow-hidden border-[#e8e7e1]">
        {(offersAsync.data?.unmapped_total ?? 0) > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            有 {offersAsync.data?.unmapped_total} 条历史 Offer 尚未完成 Demand 归属迁移，已安全隔离；请管理员按迁移手册处理。
          </div>
        )}
        <div className="flex overflow-x-auto border-b border-[#ecece8] px-4">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`relative shrink-0 px-4 py-4 text-sm font-medium ${activeTab === tab.key ? 'text-[var(--enterprise-brand-dark)]' : 'text-[#777b78] hover:text-[#454946]'}`}
            >
              {tab.label}<span className="ml-1.5 text-xs">{counts[tab.key] ?? 0}</span>
              {activeTab === tab.key && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[var(--enterprise-brand)]" />}
            </button>
          ))}
        </div>
        <form
          className="flex flex-col gap-3 border-b border-[#ecece8] bg-[#fafaf8] p-4 sm:flex-row"
          onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#929793]" />
            <input
              className="h-10 w-full rounded-lg border border-[#dedfd9] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索候选人、岗位、部门或需求编号"
            />
          </div>
          <Button type="submit" variant="secondary">搜索</Button>
          {hasColumnFilters && (
            <Button type="button" variant="ghost" onClick={resetColumnFilters}>
              <RotateCcw className="h-4 w-4" />
              重置列筛选
            </Button>
          )}
        </form>

        {offersAsync.loading && <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#777b78]"><Spinner />加载 Offer…</div>}
        {!offersAsync.loading && offersAsync.error && <div className="p-6"><ErrorState message={offersAsync.error.message} onRetry={offersAsync.reload} /></div>}
        {!offersAsync.loading && !offersAsync.error && filtered.length === 0 && (
          <EmptyState icon={FileCheck2} title="暂无符合条件的 Offer" description="候选人进入 Offer 阶段后，可以在这里建立真实草稿并推进审批。" />
        )}
        {!offersAsync.loading && !offersAsync.error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-[#fafaf8] text-xs text-[#777b78]">
                <tr>
                  <OfferColumnFilterHeader
                    data-ui="offer-column-filter-identity"
                    label="候选人 / 岗位"
                    open={openColumnFilter === 'identity'}
                    onToggle={() => toggleColumnFilter('identity')}
                  >
                    <input
                      aria-label="按候选人或岗位筛选 Offer"
                      value={identityFilter}
                      onChange={(event) => setIdentityFilter(event.target.value)}
                      placeholder="候选人或岗位"
                      className={OFFER_COLUMN_FIELD_CLASS}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setIdentityFilter('')}>清除</Button>
                  </OfferColumnFilterHeader>
                  <OfferColumnFilterHeader
                    data-ui="offer-column-filter-demand"
                    label="招聘需求"
                    open={openColumnFilter === 'demand'}
                    onToggle={() => toggleColumnFilter('demand')}
                  >
                    <input
                      aria-label="按需求编号或部门筛选 Offer"
                      value={demandFilter}
                      onChange={(event) => setDemandFilter(event.target.value)}
                      placeholder="需求编号或部门"
                      className={OFFER_COLUMN_FIELD_CLASS}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDemandFilter('')}>清除</Button>
                  </OfferColumnFilterHeader>
                  <OfferColumnFilterHeader
                    data-ui="offer-column-filter-compensation"
                    label="薪酬 / 入职"
                    open={openColumnFilter === 'compensation'}
                    onToggle={() => toggleColumnFilter('compensation')}
                  >
                    <input
                      aria-label="按薪酬方案筛选 Offer"
                      value={compensationFilter}
                      onChange={(event) => setCompensationFilter(event.target.value)}
                      placeholder="薪酬关键词"
                      className={OFFER_COLUMN_FIELD_CLASS}
                    />
                    <input
                      aria-label="按预计入职日期筛选 Offer"
                      type="date"
                      value={onboardDateFilter}
                      onChange={(event) => setOnboardDateFilter(event.target.value)}
                      className={OFFER_COLUMN_FIELD_CLASS}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      setCompensationFilter('');
                      setOnboardDateFilter('');
                    }}>清除</Button>
                  </OfferColumnFilterHeader>
                  <OfferColumnFilterHeader
                    data-ui="offer-column-filter-status"
                    label="状态"
                    open={openColumnFilter === 'status'}
                    onToggle={() => toggleColumnFilter('status')}
                  >
                    <select
                      aria-label="按 Offer 状态筛选"
                      value={statusFilter}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        if (nextStatus === 'all' || isOfferStatus(nextStatus)) {
                          setStatusFilter(nextStatus);
                          if (nextStatus !== 'all') setActiveTab('all');
                        }
                      }}
                      className={OFFER_COLUMN_FIELD_CLASS}
                    >
                      <option value="all">全部状态</option>
                      {OFFER_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{STATUS_META[status].label}</option>
                      ))}
                    </select>
                  </OfferColumnFilterHeader>
                  <OfferColumnFilterHeader
                    data-ui="offer-column-filter-updated"
                    label="最近更新"
                    open={openColumnFilter === 'updated'}
                    onToggle={() => toggleColumnFilter('updated')}
                  >
                    <select
                      aria-label="按 Offer 更新时间排序"
                      value={updatedOrder}
                      onChange={(event) => {
                        const nextOrder = event.target.value;
                        if (nextOrder === 'asc' || nextOrder === 'desc') setUpdatedOrder(nextOrder);
                      }}
                      className={OFFER_COLUMN_FIELD_CLASS}
                    >
                      <option value="desc">最近更新优先</option>
                      <option value="asc">最早更新优先</option>
                    </select>
                  </OfferColumnFilterHeader>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefeb]">
                {filtered.map((offer) => {
                  const status = STATUS_META[offerStatus(offer)];
                  return (
                    <tr
                      key={offer.id}
                      className="cursor-pointer hover:bg-[#fafbf8]"
                      tabIndex={0}
                      onClick={() => void openDetail(offer)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void openDetail(offer);
                        }
                      }}
                    >
                      <td className="px-5 py-4">
                        <button type="button" onClick={(event) => {
                          event.stopPropagation();
                          void openDetail(offer);
                        }} className="text-left">
                          <p className="font-semibold text-[var(--enterprise-brand-dark)] hover:underline">{offer.candidate_name}</p>
                          <p className="mt-1 text-xs text-[#777b78]">{offer.position} · {offer.department || '未填部门'}</p>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-[#5f6561]">{offer.request_no}</td>
                      <td className="px-5 py-4"><p className="font-medium text-[#3f4541]">{offer.salary_range || '—'}</p><p className="mt-1 text-xs text-[#858a86]">{offer.onboard_date || '入职日期待定'}</p></td>
                      <td className="px-5 py-4"><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="px-5 py-4 text-xs text-[#777b78]">{formatTime(offer.updated_at || offer.created_at)}</td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <OfferActions
                          offer={offer}
                          canApprove={canApprove}
                          onEdit={() => openEditForm(offer)}
                          onAction={(action) => openActionModal(offer, action)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <button type="button" onClick={() => selectTab('pending')} className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left transition-colors hover:border-[#c47b55]"><Clock3 className="h-5 w-5 text-[#c47b55]" /><p className="mt-3 text-xs text-[#777b78]">审批中</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.pending ?? 0}</p></button>
        <button type="button" onClick={() => selectTab('reply')} className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left transition-colors hover:border-[var(--enterprise-brand)]"><Mail className="h-5 w-5 text-[var(--enterprise-brand)]" /><p className="mt-3 text-xs text-[#777b78]">等待候选人回复</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.reply ?? 0}</p></button>
        <button type="button" onClick={() => selectTab('onboard')} className="rounded-xl border border-[#e8e7e1] bg-white p-4 text-left transition-colors hover:border-[var(--enterprise-brand)]"><UserCheck className="h-5 w-5 text-[var(--enterprise-brand)]" /><p className="mt-3 text-xs text-[#777b78]">待入职</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.onboard ?? 0}</p></button>
      </div>

      {showForm && (
        <OfferForm
          offer={editing}
          demands={demandsAsync.data?.items ?? []}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {selected && (
        <OfferDetailDrawer
          offer={selected}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
        />
      )}
      {actionTarget && (
        <ActionModal
          action={actionTarget.action}
          offer={actionTarget.offer}
          onClose={() => setActionTarget(null)}
          onDone={handleActionDone}
        />
      )}
    </div>
  );
}

export default OffersPage;
