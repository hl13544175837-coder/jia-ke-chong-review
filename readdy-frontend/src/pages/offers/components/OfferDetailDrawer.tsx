import { useEffect, useMemo, useState } from 'react';
import type { ProductRole } from '@/auth/productRoleModel';
import type { OfferAction, OfferActionInput, OfferRecord, OfferStatus } from '@/features/offers/types';
import { ApiError } from '@/lib/api';
import { offerRisk, offerWaitingLabel } from '../workbench';

interface Props {
  offer: OfferRecord;
  initialAction: OfferAction | null;
  role: ProductRole | null;
  loading: boolean;
  loadError: string;
  onClose: () => void;
  onEdit: () => void;
  onRunAction: (offer: OfferRecord, payload: OfferActionInput) => Promise<OfferRecord>;
  onRefresh: () => Promise<void>;
}

const STATUS_META: Record<OfferStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-background-200 text-foreground-700' },
  pending: { label: '待确认', className: 'bg-amber-50 text-amber-700' },
  approved: { label: '待发放', className: 'bg-blue-50 text-blue-700' },
  rejected: { label: '已退回修改', className: 'bg-red-50 text-red-700' },
  sent: { label: '等待回复', className: 'bg-cyan-50 text-cyan-700' },
  accepted: { label: '待入职', className: 'bg-emerald-50 text-emerald-700' },
  declined: { label: '已拒绝', className: 'bg-red-50 text-red-700' },
  withdrawn: { label: '已撤回', className: 'bg-background-200 text-foreground-600' },
  expired: { label: '已过期', className: 'bg-amber-50 text-amber-700' },
  onboarded: { label: '已入职', className: 'bg-emerald-50 text-emerald-700' },
};

const ACTION_META: Record<OfferAction, { label: string; danger?: boolean }> = {
  submit: { label: '提交确认' },
  approve: { label: '确认无误' },
  reject: { label: '退回修改', danger: true },
  send: { label: '登记发放' },
  accept: { label: '记录候选人接受' },
  decline: { label: '记录候选人拒绝', danger: true },
  withdraw: { label: '撤回 Offer', danger: true },
  expire: { label: '记录为已过期' },
  onboard: { label: '确认入职' },
  resend: { label: '记录重新发放' },
  follow_up: { label: '记录跟进' },
};

const HISTORY_LABELS: Record<string, string> = {
  created: '创建草稿',
  saved: '保存草稿',
  submitted: '提交确认',
  approved: '确认无误',
  rejected: '退回修改',
  sent: '登记发放',
  accepted: '候选人接受',
  declined: '候选人拒绝',
  withdrawn: '撤回 Offer',
  expired: '记录为已过期',
  onboarded: '确认入职',
  resend: '记录重新发放',
  follow_up: '记录跟进',
};

function formatTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function availableActions(status: OfferStatus, role: ProductRole | null): OfferAction[] {
  const canMaintain = role === 'recruiter' || role === 'admin';
  if (status === 'draft') return canMaintain ? ['submit'] : [];
  if (status === 'rejected') return [];
  if (status === 'pending') {
    if (role === 'manager' || role === 'hr_director') return ['approve', 'reject'];
    if (role === 'admin') return ['approve', 'reject', 'withdraw'];
    return canMaintain ? ['withdraw'] : [];
  }
  if (status === 'approved') return canMaintain ? ['send', 'withdraw'] : [];
  if (status === 'sent') return canMaintain ? ['accept', 'decline', 'withdraw', 'expire', 'resend', 'follow_up'] : [];
  if (status === 'accepted') return canMaintain ? ['onboard', 'withdraw', 'follow_up'] : [];
  return [];
}

export default function OfferDetailDrawer({
  offer,
  initialAction,
  role,
  loading,
  loadError,
  onClose,
  onEdit,
  onRunAction,
  onRefresh,
}: Props) {
  const [action, setAction] = useState<OfferAction | null>(null);
  const [comment, setComment] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [sendChannel, setSendChannel] = useState('');
  const [actualOnboardDate, setActualOnboardDate] = useState(offer.onboard_date ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [conflict, setConflict] = useState(false);

  const actions = useMemo(() => availableActions(offer.status, role), [offer.status, role]);
  const status = STATUS_META[offer.status];
  const needsReason = action === 'reject' || action === 'decline' || action === 'withdraw';
  const risk = offerRisk(offer);
  const canMaintain = role === 'recruiter' || role === 'admin';

  useEffect(() => {
    setAction(initialAction);
    setComment('');
    setExpiresAt('');
    setSendChannel('');
    setActionError('');
    setConflict(false);
  }, [initialAction, offer.id]);

  const selectAction = (nextAction: OfferAction) => {
    setAction(nextAction);
    setComment('');
    setExpiresAt('');
    setSendChannel('');
    setActualOnboardDate(offer.onboard_date ?? '');
    setActionError('');
    setConflict(false);
  };

  const submitAction = async () => {
    if (!action) return;
    if (needsReason && !comment.trim()) {
      setActionError('请填写具体原因');
      return;
    }
    if (action === 'onboard' && !actualOnboardDate) {
      setActionError('请选择实际入职日期');
      return;
    }
    if (action === 'send' && !sendChannel) {
      setActionError('请选择实际发送渠道');
      return;
    }

    const payload: OfferActionInput = { action, comment: comment.trim() };
    if (action === 'send' && expiresAt) payload.expires_at = `${expiresAt}T23:59:59`;
    if (action === 'send') payload.channel = sendChannel;
    if (action === 'onboard') payload.onboard_date = actualOnboardDate;

    setSubmitting(true);
    setActionError('');
    setConflict(false);
    try {
      await onRunAction(offer, payload);
      setAction(null);
      setComment('');
      setExpiresAt('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        setActionError('候选人状态已变化，请刷新最新状态');
      } else {
        setActionError(error instanceof Error ? error.message : '操作失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const refreshLatest = async () => {
    setRefreshing(true);
    setActionError('');
    try {
      await onRefresh();
      setConflict(false);
      setAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '刷新最新状态失败');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground-900/35" onClick={submitting ? undefined : onClose} role="presentation"></div>
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-detail-title"
      >
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="offer-detail-title" className="truncate text-lg font-bold text-foreground-900">{offer.candidate_name}</h2>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
              <span className="rounded-md bg-background-100 px-2 py-1 text-xs text-foreground-500">版本 {offer.version}</span>
            </div>
            <p className="mt-1 truncate text-sm text-foreground-500">{offer.position} · {offer.request_no}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="关闭 Offer 详情" className="h-9 w-9 shrink-0 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50">
            <i className="ri-close-line text-xl" aria-hidden="true"></i>
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {loading && (
            <p className="rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-sm text-foreground-500">
              <i className="ri-loader-4-line mr-2 animate-spin" aria-hidden="true"></i>正在读取最新详情和操作历史...
            </p>
          )}
          {loadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              <p>{loadError}，当前显示的是列表概要。</p>
              <button type="button" onClick={() => void refreshLatest()} className="mt-2 font-medium underline">重新加载详情</button>
            </div>
          )}

          <section>
            <div className="mb-5 grid gap-3 rounded-xl border border-primary-100 bg-primary-50/50 p-4 sm:grid-cols-3">
              <div><p className="text-xs text-foreground-400">当前节点</p><p className="mt-1 text-sm font-semibold text-foreground-800">{status.label}</p></div>
              <div><p className="text-xs text-foreground-400">等待时长</p><p className="mt-1 text-sm font-semibold text-foreground-800">{offerWaitingLabel(offer)}</p></div>
              <div><p className="text-xs text-foreground-400">当前提醒</p><p className={`mt-1 text-sm font-semibold ${risk.level === 'high' ? 'text-red-700' : risk.level === 'medium' ? 'text-amber-700' : 'text-emerald-700'}`}>{risk.label}</p></div>
            </div>
            <h3 className="text-sm font-semibold text-foreground-900">基本信息</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-4 border-y border-background-200 py-4 sm:grid-cols-2">
              <div><dt className="text-xs text-foreground-400">岗位</dt><dd className="mt-1 text-sm font-medium text-foreground-800">{offer.position || '—'}</dd></div>
              <div><dt className="text-xs text-foreground-400">部门</dt><dd className="mt-1 text-sm text-foreground-700">{offer.department || '—'}</dd></div>
              <div><dt className="text-xs text-foreground-400">薪酬方案</dt><dd className="mt-1 text-sm font-medium text-foreground-800">{offer.salary_range || '—'}</dd></div>
              <div><dt className="text-xs text-foreground-400">预计 / 实际入职</dt><dd className="mt-1 text-sm text-foreground-700">{offer.onboard_date || '—'}</dd></div>
              <div><dt className="text-xs text-foreground-400">确认人</dt><dd className="mt-1 text-sm text-foreground-700">{offer.approver_name || '尚未确认'}</dd></div>
              <div><dt className="text-xs text-foreground-400">最近更新</dt><dd className="mt-1 text-sm text-foreground-700">{formatTime(offer.updated_at || offer.created_at)}</dd></div>
            </dl>
            <div className="mt-4">
              <p className="text-xs text-foreground-400">备注</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground-700">{offer.note || '暂无备注'}</p>
            </div>
            {offer.rejection_reason && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-xs font-medium text-red-700">{offer.status === 'rejected' ? '退回原因' : '结束 / 拒绝原因'}</p>
                <p className="mt-1 text-sm text-red-800">{offer.rejection_reason}</p>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground-900">当前可执行操作</h3>
              {canMaintain && (offer.status === 'draft' || offer.status === 'rejected') && (
                <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                  <i className="ri-edit-line" aria-hidden="true"></i>{offer.status === 'rejected' ? '修改后重提' : '编辑草稿'}
                </button>
              )}
            </div>
            {actions.length === 0 ? (
              <p className="mt-3 rounded-lg bg-background-50 px-3 py-3 text-sm text-foreground-500">
                {offer.status === 'rejected'
                  ? (canMaintain ? '请按退回意见修改方案后重新提交确认。' : '已退回招聘专员修改，修改后会重新提交确认。')
                  : '当前没有需要你执行的操作，可在下方查看完整记录。'}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectAction(item)}
                    disabled={loading || Boolean(loadError) || submitting}
                    className={`h-9 rounded-lg px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_META[item].danger ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'border border-primary-200 text-primary-700 hover:bg-primary-50'}`}
                  >
                    {ACTION_META[item].label}
                  </button>
                ))}
              </div>
            )}

            {action && (
              <div className="mt-4 rounded-lg border border-background-300 bg-background-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground-800">{ACTION_META[action].label}</p>
                  <button type="button" onClick={() => { setAction(null); setActionError(''); setConflict(false); }} disabled={submitting} aria-label="取消当前操作" className="h-7 w-7 rounded-md text-foreground-500 hover:bg-background-200">
                    <i className="ri-close-line" aria-hidden="true"></i>
                  </button>
                </div>

                {action === 'send' && (
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs font-medium text-foreground-600">实际发送渠道
                      <select value={sendChannel} onChange={(event) => { setSendChannel(event.target.value); setActionError(''); }} className="mt-1.5 h-9 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400">
                        <option value="">请选择发送渠道</option>
                        <option value="enterprise_wechat">企业微信</option>
                        <option value="email">邮件</option>
                        <option value="offline">线下</option>
                        <option value="other">其他</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-foreground-600">Offer 有效截止日期（可选，默认 14 天）
                      <input type="date" value={expiresAt} onInput={(event) => setExpiresAt(event.currentTarget.value)} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400" />
                    </label>
                    <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">仅登记发送结果和时间，当前未自动调用企业微信或邮件接口。</p>
                  </div>
                )}
                {action === 'onboard' && (
                  <label className="mt-3 block text-xs font-medium text-foreground-600">
                    实际入职日期
                    <input type="date" value={actualOnboardDate} onInput={(event) => setActualOnboardDate(event.currentTarget.value)} onChange={(event) => setActualOnboardDate(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400" />
                  </label>
                )}
                <label className="mt-3 block text-xs font-medium text-foreground-600">
                  {needsReason ? '原因（必填）' : '备注（可选）'}
                  <textarea
                    value={comment}
                    onChange={(event) => { setComment(event.target.value); setActionError(''); }}
                    maxLength={1000}
                    rows={3}
                    placeholder={needsReason ? '请填写具体原因' : '补充说明'}
                    className="mt-1.5 w-full resize-none rounded-lg border border-background-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
                  />
                </label>

                {actionError && (
                  <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <p>{actionError}</p>
                    {conflict && (
                      <button type="button" onClick={() => void refreshLatest()} disabled={refreshing} className="mt-2 font-medium underline disabled:opacity-50">
                        {refreshing ? '正在刷新...' : '刷新最新状态'}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setAction(null)} disabled={submitting} className="h-9 rounded-lg border border-background-300 bg-white px-4 text-sm text-foreground-600 hover:bg-background-100 disabled:opacity-50">取消</button>
                  <button
                    type="button"
                    onClick={() => void submitAction()}
                    disabled={submitting || (needsReason && !comment.trim()) || (action === 'onboard' && !actualOnboardDate) || (action === 'send' && !sendChannel)}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_META[action].danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-500 hover:bg-primary-600'}`}
                  >
                    {submitting && <i className="ri-loader-4-line animate-spin" aria-hidden="true"></i>}
                    确认保存
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2">
              <i className="ri-history-line text-primary-500" aria-hidden="true"></i>
              <h3 className="text-sm font-semibold text-foreground-900">操作历史</h3>
            </div>
            {offer.history.length === 0 ? (
              <p className="mt-3 text-sm text-foreground-500">暂无操作记录</p>
            ) : (
              <ol className="mt-4 space-y-0">
                {offer.history.map((item, index) => (
                  <li key={item.id} className="relative flex gap-3 pb-5">
                    {index < offer.history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-background-300"></span>}
                    <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-primary-100 bg-primary-500"></span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-800">{HISTORY_LABELS[item.action] || item.action}</p>
                      <p className="mt-0.5 text-xs text-foreground-400">{item.actor_name || '系统'} · {formatTime(item.created_at)}</p>
                      {item.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-600">{item.comment}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
