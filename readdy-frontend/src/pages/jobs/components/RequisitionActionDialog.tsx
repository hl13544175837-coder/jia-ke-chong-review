import { useEffect, useState } from 'react';
import type { DemandOwnerOption, DemandPriority, DemandStatus, RequisitionRow } from '@/features/demands/types';

export type RequisitionPendingAction =
  | { kind: 'status'; row: RequisitionRow; status: DemandStatus; label: string }
  | { kind: 'priority'; row: RequisitionRow }
  | { kind: 'owner'; row: RequisitionRow };

interface RequisitionActionDialogProps {
  action: RequisitionPendingAction | null;
  owners: DemandOwnerOption[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (value: { reason: string; priority?: DemandPriority; ownerId?: number }) => Promise<void>;
}

const priorityLabels: Record<DemandPriority, string> = { A: '紧急', B: '高', C: '普通' };

export default function RequisitionActionDialog({
  action,
  owners,
  busy,
  error,
  onClose,
  onSubmit,
}: RequisitionActionDialogProps) {
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<DemandPriority>('B');
  const [ownerId, setOwnerId] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setReason('');
    setPriority(action?.row.source.priority ?? 'B');
    setOwnerId(action ? String(action.row.source.owner_hr_id) : '');
    setLocalError('');
  }, [action]);

  if (!action) return null;

  const title = action.kind === 'priority'
    ? '调整需求优先级'
    : action.kind === 'owner'
      ? '转派招聘负责人'
      : action.label;

  const submit = async () => {
    const note = reason.trim();
    if (!note) {
      setLocalError('请填写操作原因');
      return;
    }
    if (action.kind === 'owner' && (!ownerId || Number(ownerId) === action.row.source.owner_hr_id)) {
      setLocalError('请选择不同的招聘负责人');
      return;
    }
    setLocalError('');
    await onSubmit({
      reason: note,
      priority: action.kind === 'priority' ? priority : undefined,
      ownerId: action.kind === 'owner' ? Number(ownerId) : undefined,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[250] bg-foreground-900/30" onClick={() => { if (!busy) onClose(); }} />
      <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 pointer-events-none">
        <section role="dialog" aria-modal="true" aria-label={title} className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
          <header className="border-b border-background-200 px-5 py-4">
            <h3 className="text-base font-bold text-foreground-900">{title}</h3>
            <p className="mt-1 text-xs text-foreground-500">{action.row.name} · {action.row.source.request_no || `需求 #${action.row.id}`}</p>
          </header>
          <div className="space-y-4 px-5 py-4">
            {action.kind === 'status' && (
              <p className="text-sm leading-6 text-foreground-600">此操作会把当前需求变更为“{action.label.replace(/^标记/, '')}”，提交后会写入操作记录。</p>
            )}
            {action.kind === 'priority' && (
              <label className="block text-sm font-medium text-foreground-700">新优先级
                <select value={priority} onChange={(event) => setPriority(event.target.value as DemandPriority)} className="mt-2 h-10 w-full rounded-lg border border-background-200 bg-white px-3 text-sm">
                  {(Object.keys(priorityLabels) as DemandPriority[]).map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}
                </select>
              </label>
            )}
            {action.kind === 'owner' && (
              <label className="block text-sm font-medium text-foreground-700">新负责人
                <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-background-200 bg-white px-3 text-sm">
                  <option value="">请选择招聘负责人</option>
                  {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.email}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium text-foreground-700">操作原因
              <textarea value={reason} onChange={(event) => { setReason(event.target.value); setLocalError(''); }} rows={3} maxLength={1000} placeholder="请填写本次操作原因" className="mt-2 w-full resize-none rounded-lg border border-background-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none" />
            </label>
            {(localError || error) && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{localError || error}</p>}
          </div>
          <footer className="flex justify-end gap-3 border-t border-background-200 px-5 py-4">
            <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-foreground-600 hover:bg-background-100 disabled:opacity-50">取消</button>
            <button type="button" disabled={busy} onClick={() => void submit()} className="h-9 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">{busy ? '正在提交...' : '确认提交'}</button>
          </footer>
        </section>
      </div>
    </>
  );
}
