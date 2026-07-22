import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Clock3,
  FileCheck2,
  History,
  Mail,
  Plus,
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
            className="mt-2 h-11 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[#3d7b6b]"
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
            className="mt-2 h-11 w-full rounded-lg border border-[#dadcd6] bg-white px-3 text-sm outline-none focus:border-[#3d7b6b]"
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
              className="mt-2 text-xs font-medium text-[#2f6c5c] hover:underline"
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
            className="mt-2 min-h-28 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[#3d7b6b]"
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
            className="mt-2 min-h-24 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[#3d7b6b]"
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

function OfferDetail({ offer, onClose }: { offer: OfferRecord; onClose: () => void }) {
  const status = STATUS_META[offerStatus(offer)];
  return (
    <ModalShell title="Offer 详情与历史" description={`${offer.candidate_name} · ${offer.request_no}`} onClose={onClose}>
      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 rounded-xl bg-[#f6f7f3] p-4 sm:grid-cols-2">
          <div><p className="text-xs text-[#777b78]">当前状态</p><div className="mt-1"><Badge tone={status.tone}>{status.label}</Badge></div></div>
          <div><p className="text-xs text-[#777b78]">薪酬方案</p><p className="mt-1 font-semibold text-[#292b2a]">{offer.salary_range || '—'}</p></div>
          <div><p className="text-xs text-[#777b78]">预计入职</p><p className="mt-1 text-sm text-[#454946]">{offer.onboard_date || '—'}</p></div>
          <div><p className="text-xs text-[#777b78]">审批人</p><p className="mt-1 text-sm text-[#454946]">{offer.approver_name || '提交后自动分配'}</p></div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#292b2a]">备注</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5f6561]">{offer.note || '暂无备注'}</p>
        </div>
        {offer.rejection_reason && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-medium text-red-700">结束/拒绝原因</p>
            <p className="mt-1 text-sm text-red-800">{offer.rejection_reason}</p>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-[#3d7b6b]" /><h3 className="text-sm font-semibold text-[#292b2a]">完整操作历史</h3></div>
          <div className="mt-4 space-y-0">
            {(offer.history ?? []).length === 0 && <p className="text-sm text-[#777b78]">暂无操作记录</p>}
            {(offer.history ?? []).map((item, index) => (
              <div key={item.id} className="relative flex gap-3 pb-5">
                {index < (offer.history?.length ?? 0) - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-[#dfe4de]" />}
                <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-[#dcebe5] bg-[#3d7b6b]" />
                <div>
                  <p className="text-sm font-medium text-[#3f4541]">{ACTION_LABELS[item.action as OfferAction] ?? item.action}</p>
                  <p className="mt-0.5 text-xs text-[#858a86]">{item.actor_name || '系统'} · {formatTime(item.created_at)}</p>
                  {item.comment && <p className="mt-1 text-sm text-[#5f6561]">{item.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end border-t border-[#ecece8] px-6 py-4">
        <Button variant="secondary" onClick={() => window.print()}>打印 / 导出 PDF</Button>
      </div>
    </ModalShell>
  );
}

export function OffersPage() {
  const { role } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OfferRecord | null>(null);
  const [selected, setSelected] = useState<OfferRecord | null>(null);
  const [actionTarget, setActionTarget] = useState<{ offer: OfferRecord; action: OfferAction } | null>(null);
  const offersAsync = useAsync(() => api.listOffers({ search }), [search]);
  const demandsAsync = useAsync(
    () => api.listDemands({ status: 'all', page: 1, page_size: 100, sort: 'created_at_desc' }),
    [],
  );
  const offers = useMemo(() => offersAsync.data?.items ?? [], [offersAsync.data?.items]);
  const activeConfig = TAB_CONFIG.find((item) => item.key === activeTab)!;
  const filtered = activeConfig.statuses.length === 0
    ? offers
    : offers.filter((offer) => activeConfig.statuses.includes(offerStatus(offer)));
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

  async function openDetail(offer: OfferRecord) {
    try {
      setSelected(await api.getOffer(offer.id!));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Offer 详情加载失败');
    }
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
          onClick={() => { setEditing(null); setShowForm(true); }}
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
              onClick={() => setActiveTab(tab.key)}
              className={`relative shrink-0 px-4 py-4 text-sm font-medium ${activeTab === tab.key ? 'text-[#2f6c5c]' : 'text-[#777b78] hover:text-[#454946]'}`}
            >
              {tab.label}<span className="ml-1.5 text-xs">{counts[tab.key] ?? 0}</span>
              {activeTab === tab.key && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-[#3d7b6b]" />}
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
              className="h-10 w-full rounded-lg border border-[#dedfd9] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#3d7b6b]"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索候选人、岗位、部门或需求编号"
            />
          </div>
          <Button type="submit" variant="secondary">搜索</Button>
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
                  <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
                  <th className="px-5 py-3 font-medium">需求</th>
                  <th className="px-5 py-3 font-medium">薪酬 / 入职</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">最近更新</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefeb]">
                {filtered.map((offer) => {
                  const status = STATUS_META[offerStatus(offer)];
                  return (
                    <tr key={offer.id} className="hover:bg-[#fafbf8]">
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => void openDetail(offer)} className="text-left">
                          <p className="font-semibold text-[#2f5f52] hover:underline">{offer.candidate_name}</p>
                          <p className="mt-1 text-xs text-[#777b78]">{offer.position} · {offer.department || '未填部门'}</p>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-[#5f6561]">{offer.request_no}</td>
                      <td className="px-5 py-4"><p className="font-medium text-[#3f4541]">{offer.salary_range || '—'}</p><p className="mt-1 text-xs text-[#858a86]">{offer.onboard_date || '入职日期待定'}</p></td>
                      <td className="px-5 py-4"><Badge tone={status.tone}>{status.label}</Badge></td>
                      <td className="px-5 py-4 text-xs text-[#777b78]">{formatTime(offer.updated_at || offer.created_at)}</td>
                      <td className="px-5 py-4">
                        <OfferActions
                          offer={offer}
                          canApprove={canApprove}
                          onEdit={() => { setEditing(offer); setShowForm(true); }}
                          onAction={(action) => setActionTarget({ offer, action })}
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
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4"><Clock3 className="h-5 w-5 text-[#c47b55]" /><p className="mt-3 text-xs text-[#777b78]">审批中</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.pending ?? 0}</p></div>
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4"><Mail className="h-5 w-5 text-[#3d7b6b]" /><p className="mt-3 text-xs text-[#777b78]">等待候选人回复</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.reply ?? 0}</p></div>
        <div className="rounded-xl border border-[#e8e7e1] bg-white p-4"><UserCheck className="h-5 w-5 text-[#3d7b6b]" /><p className="mt-3 text-xs text-[#777b78]">待入职</p><p className="mt-1 text-2xl font-bold text-[#292b2a]">{counts.onboard ?? 0}</p></div>
      </div>

      {showForm && (
        <OfferForm
          offer={editing}
          demands={demandsAsync.data?.items ?? []}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {selected && <OfferDetail offer={selected} onClose={() => setSelected(null)} />}
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
