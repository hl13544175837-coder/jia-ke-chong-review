// Director approvals page grafted from the Readdy director/approvals design.
// Focuses on pending Offer approvals from api.listOffers({status:'pending'}),
// with approve/reject actions via api.runOfferAction (idempotency is handled
// by the api layer). Interaction pattern follows OffersPage.

import { useMemo, useState } from 'react';
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
              className="mt-2 min-h-24 w-full rounded-lg border border-[#dadcd6] px-3 py-2 text-sm outline-none focus:border-[#3d7b6b]"
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

export function DirectorApprovalsPage() {
  const { role } = useAuth();
  const toast = useToast();
  const canView = role === 'manager' || role === 'admin';
  const [actionTarget, setActionTarget] = useState<{
    offer: OfferRecord;
    action: 'approve' | 'reject';
  } | null>(null);

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
        />
        <KpiCard
          icon={History}
          label="近期已处理"
          value={recentAsync.loading ? '…' : recentAsync.data?.total ?? 0}
          detail="已审批/发放/入职的 Offer"
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
                  <tr key={offer.id} className="hover:bg-[#fafbf8]">
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
                          onClick={() => setActionTarget({ offer, action: 'approve' })}
                        >
                          <Check className="h-4 w-4" />
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setActionTarget({ offer, action: 'reject' })}
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
                <div key={offer.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#292b2a]">
                      {offer.candidate_name} · {offer.position}
                    </p>
                    <p className="mt-0.5 text-xs text-[#858a86]">
                      {offer.request_no} · 更新于 {formatDateTime(offer.updated_at || offer.created_at)}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
