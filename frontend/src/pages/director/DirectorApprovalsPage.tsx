// Director approvals page grafted from the Readdy director/approvals design.
// Focuses on pending Offer approvals from api.listOffers({status:'pending'}),
// with approve/reject actions via api.runOfferAction (idempotency is handled
// by the api layer). Interaction pattern follows OffersPage.

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  FileCheck2,
  History,
  ShieldAlert,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  useToast,
} from '../../components/ui';
import { DrawerShell } from '../../components/ui/DrawerShell';
import type { OfferAction, OfferRecord, OfferStatus } from '../../types';
import { KpiCard, PurposeBanner } from './widgets';
import { formatDateTime } from './utils';

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

type ApprovalsKpi = 'pending' | 'recent';

const ACTION_LABELS: Partial<Record<OfferAction, string>> = {
  submit: '提交审批',
  approve: '审批通过',
  reject: '审批拒绝',
  send: '发放 Offer',
  accept: '候选人接受',
  decline: '候选人拒绝',
  withdraw: '撤回 Offer',
  expire: 'Offer 过期',
  onboard: '确认入职',
  resend: '重新发送',
  follow_up: '跟进候选人',
};

function offerStatus(offer: OfferRecord): OfferStatus {
  return offer.status || offer.approval_status;
}

function ApprovalModal({
  action,
  offer,
  onClose,
  onDone,
}: {
  action: 'approve' | 'reject';
  offer: OfferRecord;
  onClose: () => void;
  onDone: (offer: OfferRecord) => void;
}) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReject = action === 'reject';

  async function confirm() {
    if (isReject && !comment.trim()) {
      setError('拒绝时必须填写原因，便于后续审计和复盘');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: { action: OfferAction; comment: string } = {
        action,
        comment: comment.trim(),
      };
      onDone(await api.runOfferAction(offer.id!, payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2925]/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isReject ? '审批拒绝' : '审批通过'}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#e5e6e1] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#ecece8] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[#292b2a]">
              {isReject ? '审批拒绝' : '审批通过'}
            </h2>
            <p className="mt-1 text-sm text-[#777b78]">
              {offer.candidate_name} · {offer.position} · {offer.salary_range || '薪酬未填'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#777b78] hover:bg-[#f3f4f1]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-6">
          <label className="block text-sm font-medium text-[#454946]">
            {isReject ? '拒绝原因（必填）' : '审批备注（可选）'}
            <textarea
              className="mt-2 min-h-24 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-brand)]"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              placeholder={isReject ? '请填写具体拒绝原因' : '补充说明'}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-[#ecece8] px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            onClick={confirm}
            loading={submitting}
          >
            {isReject ? '确认拒绝' : '确认通过'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OfferApprovalDetailDrawer({
  offer,
  loading,
  error,
  onRetry,
  onClose,
}: {
  offer: OfferRecord;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const status = STATUS_META[offerStatus(offer)];
  const candidateReply = offer.candidate_reply;

  return (
    <DrawerShell
      open
      title="Offer 审批详情"
      eyebrow={<Badge tone={status.tone}>{status.label}</Badge>}
      description={`${offer.candidate_name} · ${offer.request_no || '需求编号未填'}`}
      onClose={onClose}
      size="lg"
      testId="director-approval-detail-drawer"
      footer={(
        <Link
          to="/offers"
          className="inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-canvas px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
        >
          前往 Offer 管理
        </Link>
      )}
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#777b78]">
          <Spinner />
          正在读取 Offer 详情…
        </div>
      )}

      {!loading && error && (
        <ErrorState
          message={`Offer 详情接口失败：${error}`}
          onRetry={onRetry}
        />
      )}

      {!loading && !error && (
        <div className="space-y-5">
          <section className="rounded-xl border border-[#e8e7e1] p-4">
            <h3 className="text-sm font-semibold text-[#292b2a]">基本信息</h3>
            <dl className="mt-3 grid gap-4 rounded-xl bg-[#f6f7f3] p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#777b78]">候选人</dt>
                <dd className="mt-1 font-semibold text-[#292b2a]">{offer.candidate_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">岗位</dt>
                <dd className="mt-1 font-semibold text-[#292b2a]">{offer.position || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">部门</dt>
                <dd className="mt-1 text-sm text-[#454946]">{offer.department || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">需求编号</dt>
                <dd className="mt-1 text-sm text-[#454946]">{offer.request_no || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">提交人</dt>
                <dd className="mt-1 text-sm text-[#454946]">{offer.created_by_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">审批人</dt>
                <dd className="mt-1 text-sm text-[#454946]">{offer.approver_name || '待分配'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[#e8e7e1] p-4">
            <h3 className="text-sm font-semibold text-[#292b2a]">薪资与入职</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#777b78]">薪酬方案</dt>
                <dd className="mt-1 font-semibold text-[#292b2a]">{offer.salary_range || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">预计入职</dt>
                <dd className="mt-1 text-sm text-[#454946]">{offer.onboard_date || '待确定'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">有效期至</dt>
                <dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.expires_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#777b78]">候选人回复</dt>
                <dd className="mt-1 text-sm text-[#454946]">
                  {candidateReply?.answer === 'accepted'
                    ? '已接受'
                    : candidateReply?.answer === 'declined'
                      ? '已拒绝'
                      : '尚未回复'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[#e8e7e1] p-4">
            <h3 className="text-sm font-semibold text-[#292b2a]">状态与时间</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-[#777b78]">创建时间</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.created_at)}</dd></div>
              <div><dt className="text-xs text-[#777b78]">提交审批</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.submitted_at)}</dd></div>
              <div><dt className="text-xs text-[#777b78]">审批通过</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.approved_at)}</dd></div>
              <div><dt className="text-xs text-[#777b78]">Offer 发放</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.sent_at)}</dd></div>
              <div><dt className="text-xs text-[#777b78]">候选人回复</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.responded_at)}</dd></div>
              <div><dt className="text-xs text-[#777b78]">确认入职</dt><dd className="mt-1 text-sm text-[#454946]">{formatDateTime(offer.onboarded_at)}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-[#e8e7e1] p-4">
            <h3 className="text-sm font-semibold text-[#292b2a]">备注与处理记录</h3>
            <div className="mt-3 space-y-3 rounded-xl bg-[#f6f7f3] p-4 text-sm text-[#454946]">
              <div>
                <p className="text-xs text-[#777b78]">Offer 备注</p>
                <p className="mt-1 whitespace-pre-wrap">{offer.note || '暂无备注'}</p>
              </div>
              {offer.rejection_reason && (
                <div>
                  <p className="text-xs text-[#777b78]">拒绝 / 结束原因</p>
                  <p className="mt-1 whitespace-pre-wrap text-red-700">{offer.rejection_reason}</p>
                </div>
              )}
              {candidateReply?.note && (
                <div>
                  <p className="text-xs text-[#777b78]">候选人回复备注</p>
                  <p className="mt-1 whitespace-pre-wrap">{candidateReply.note}</p>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-0">
              {(offer.history ?? []).length === 0 && (
                <p className="text-sm text-[#777b78]">暂无处理记录</p>
              )}
              {(offer.history ?? []).map((item, index) => (
                <div key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < (offer.history?.length ?? 0) - 1 && (
                    <span className="absolute left-[7px] top-4 h-full w-px bg-[#dfe4de]" />
                  )}
                  <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-[var(--enterprise-brand-soft)] bg-[var(--enterprise-brand)]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#3f4541]">
                      {ACTION_LABELS[item.action as OfferAction] || item.action}
                    </p>
                    <p className="mt-0.5 text-xs text-[#858a86]">
                      {item.actor_name || '系统'} · {formatDateTime(item.created_at)}
                    </p>
                    {item.comment && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#5f6561]">{item.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </DrawerShell>
  );
}

export function DirectorApprovalsPage() {
  const { role } = useAuth();
  const toast = useToast();
  const canView = role === 'manager' || role === 'admin';
  const [actionTarget, setActionTarget] = useState<{
    offer: OfferRecord;
    action: 'approve' | 'reject';
  } | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<OfferRecord | null>(null);
  const [selectedApprovalsKpi, setSelectedApprovalsKpi] = useState<ApprovalsKpi | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const pendingAsync = useAsync(
    () => (canView ? api.listOffers({ status: 'pending' }) : Promise.resolve(null)),
    [canView],
  );
  const recentAsync = useAsync(
    () => (canView
      ? api.listOffers({ status: 'approved,sent,accepted,declined,onboarded' })
      : Promise.resolve(null)),
    [canView],
  );

  const pending = useMemo(() => pendingAsync.data?.items ?? [], [pendingAsync.data]);
  const recent = useMemo(
    () => (recentAsync.data?.items ?? []).slice(0, 8),
    [recentAsync.data],
  );

  function handleActionDone() {
    const action = actionTarget?.action;
    setActionTarget(null);
    pendingAsync.reload();
    recentAsync.reload();
    toast.success(action === 'approve' ? '审批已通过' : '已拒绝该 Offer');
  }

  async function openOfferDetails(offer: OfferRecord) {
    const requestId = ++detailRequestRef.current;
    setSelectedOffer(offer);
    setDetailError(null);
    if (!offer.id) {
      setDetailLoading(false);
      setDetailError('记录缺少 Offer ID，无法读取完整详情');
      return;
    }
    setDetailLoading(true);
    try {
      const detail = await api.getOffer(offer.id);
      if (requestId !== detailRequestRef.current) return;
      setSelectedOffer(detail);
    } catch (cause) {
      if (requestId !== detailRequestRef.current) return;
      setDetailError(cause instanceof Error ? cause.message : 'Offer 详情加载失败');
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }

  if (!canView) {
    return (
      <div data-ui="readdy-director-approvals" className="mx-auto max-w-[1440px] space-y-5">
        <PageHeader title="Offer 审批" description="待审批 Offer 与审批记录" />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="暂无查看权限"
            description="Offer 审批面向招聘经理和管理员。如需处理审批，请联系管理员开通权限。"
          />
        </Card>
      </div>
    );
  }

  return (
    <div data-ui="readdy-director-approvals" className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader
        title="Offer 审批"
        description="聚焦等待审批的 Offer，审批动作全程留痕且幂等"
        actions={(
          <Link
            to="/director/cockpit"
            className="inline-flex items-center gap-1 text-sm text-[#777b78] transition-colors hover:text-[#292b2a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回驾驶舱
          </Link>
        )}
      />

      <PurposeBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={FileCheck2}
          label="待审批 Offer"
          value={pendingAsync.loading ? '…' : pending.length}
          detail="等待你处理"
          tone={pending.length > 0 ? 'warning' : 'default'}
          onActivate={() => setSelectedApprovalsKpi('pending')}
        />
        <KpiCard
          icon={History}
          label="近期已处理"
          value={recentAsync.loading ? '…' : recentAsync.data?.total ?? 0}
          detail="已审批/发放/入职的 Offer"
          onActivate={() => setSelectedApprovalsKpi('recent')}
        />
      </div>

      <Card className="overflow-hidden border-[#e8e7e1]">
        <div className="border-b border-[#ecece8] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#292b2a]">待审批队列</h2>
          <p className="mt-1 text-xs text-[#858a86]">
            通过或拒绝都会要求留痕；拒绝必须填写原因
          </p>
        </div>

        {pendingAsync.loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#777b78]">
            <Spinner />
            正在加载待审批 Offer…
          </div>
        )}
        {!pendingAsync.loading && pendingAsync.error && (
          <div className="p-6">
            <ErrorState
              message={`待审批 Offer 加载失败：${pendingAsync.error.message}（这是接口失败，不是没有待审批事项）`}
              onRetry={pendingAsync.reload}
            />
          </div>
        )}
        {!pendingAsync.loading && !pendingAsync.error && pending.length === 0 && (
          <EmptyState
            icon={FileCheck2}
            title="当前没有待审批的 Offer"
            description="招聘专员提交 Offer 审批后，会出现在这个队列里。"
          />
        )}
        {!pendingAsync.loading && !pendingAsync.error && pending.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#fafaf8] text-xs text-[#777b78]">
                <tr>
                  <th className="px-5 py-3 font-medium">候选人 / 岗位</th>
                  <th className="px-5 py-3 font-medium">需求</th>
                  <th className="px-5 py-3 font-medium">薪酬 / 入职</th>
                  <th className="px-5 py-3 font-medium">提交时间</th>
                  <th className="px-5 py-3 text-right font-medium">审批操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefeb]">
                {pending.map((offer) => (
                  <tr
                    key={offer.id}
                    className="cursor-pointer hover:bg-[#fafbf8] focus-within:bg-[#fafbf8]"
                    tabIndex={0}
                    aria-label={`查看 ${offer.candidate_name} 的 Offer 审批详情`}
                    onClick={() => void openOfferDetails(offer)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openOfferDetails(offer);
                      }
                    }}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#292b2a]">{offer.candidate_name}</p>
                      <p className="mt-1 text-xs text-[#777b78]">
                        {offer.position} · {offer.department || '未填部门'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-[#5f6561]">{offer.request_no}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#3f4541]">{offer.salary_range || '—'}</p>
                      <p className="mt-1 text-xs text-[#858a86]">
                        {offer.onboard_date || '入职日期待定'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs text-[#777b78]">
                      {formatDateTime(offer.submitted_at || offer.updated_at || offer.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionTarget({ offer, action: 'approve' });
                          }}
                        >
                          <Check className="h-4 w-4" />
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionTarget({ offer, action: 'reject' });
                          }}
                        >
                          拒绝
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden border-[#e8e7e1]">
        <div className="border-b border-[#ecece8] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#292b2a]">近期审批与后续进展</h2>
          <p className="mt-1 text-xs text-[#858a86]">
            已通过的 Offer 后续发放、回复与入职状态
          </p>
        </div>
        {recentAsync.loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#777b78]">
            <Spinner />
            正在加载近期记录…
          </div>
        )}
        {!recentAsync.loading && recentAsync.error && (
          <div className="p-6">
            <ErrorState
              message={`近期记录加载失败：${recentAsync.error.message}`}
              onRetry={recentAsync.reload}
            />
          </div>
        )}
        {!recentAsync.loading && !recentAsync.error && recent.length === 0 && (
          <EmptyState
            icon={History}
            title="暂无已处理的 Offer"
            description="审批通过后，Offer 的发放和入职进展会在这里跟进。"
          />
        )}
        {!recentAsync.loading && !recentAsync.error && recent.length > 0 && (
          <div className="divide-y divide-[#efefeb]">
            {recent.map((offer) => {
              const status = STATUS_META[offerStatus(offer)];
              return (
                <button
                  key={offer.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[#fafbf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  aria-label={`查看 ${offer.candidate_name} 的 Offer 处理详情`}
                  onClick={() => void openOfferDetails(offer)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#292b2a]">
                      {offer.candidate_name} · {offer.position}
                    </p>
                    <p className="mt-0.5 text-xs text-[#858a86]">
                      {offer.request_no} · 更新于 {formatDateTime(offer.updated_at || offer.created_at)}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <DrawerShell
        open={selectedApprovalsKpi !== null}
        onClose={() => setSelectedApprovalsKpi(null)}
        title={selectedApprovalsKpi === 'pending' ? '待审批 Offer' : '近期已处理'}
        description="只展示当前页 Offer 真实接口已返回的汇总与列表事实"
        size="md"
        testId="director-approvals-kpi-drawer"
        footer={(
          <Link
            to="/offers"
            className="inline-flex h-10 items-center justify-center rounded-md border border-hairline bg-canvas px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
          >
            进入完整工作台
          </Link>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#e8e7e1] bg-[#f6f7f3] p-4">
            <p className="text-xs text-[#777b78]">
              {selectedApprovalsKpi === 'pending' ? '等待你处理' : '已审批/发放/入职的 Offer'}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-[#292b2a]">
              {selectedApprovalsKpi === 'pending'
                ? pending.length
                : recentAsync.data?.total ?? 0}
            </p>
          </div>

          {(selectedApprovalsKpi === 'pending' ? pending : recent).length === 0 ? (
            <p className="text-sm text-[#777b78]">
              {selectedApprovalsKpi === 'pending'
                ? '当前没有待审批 Offer。'
                : '当前没有近期已处理 Offer。'}
            </p>
          ) : (
            <div className="space-y-3">
              {(selectedApprovalsKpi === 'pending' ? pending : recent).slice(0, 8).map((offer) => {
                const status = STATUS_META[offerStatus(offer)];
                return (
                  <div key={offer.id} className="rounded-xl border border-[#e8e7e1] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#292b2a]">
                          {offer.candidate_name} · {offer.position}
                        </p>
                        <p className="mt-1 text-xs text-[#777b78]">
                          {offer.request_no || '需求编号未填'} · {offer.department || '部门未填'}
                        </p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-[#858a86]">
                      更新于 {formatDateTime(offer.updated_at || offer.submitted_at || offer.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DrawerShell>

      {selectedOffer && (
        <OfferApprovalDetailDrawer
          offer={selectedOffer}
          loading={detailLoading}
          error={detailError}
          onRetry={() => void openOfferDetails(selectedOffer)}
          onClose={() => {
            detailRequestRef.current += 1;
            setSelectedOffer(null);
            setDetailLoading(false);
            setDetailError(null);
          }}
        />
      )}

      {actionTarget && (
        <ApprovalModal
          action={actionTarget.action}
          offer={actionTarget.offer}
          onClose={() => setActionTarget(null)}
          onDone={handleActionDone}
        />
      )}
    </div>
  );
}

export default DirectorApprovalsPage;
