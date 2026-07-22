import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui';
import type { CandidateOwnerOption, DemandPriority, RecruitmentDemand } from '../../../types';

const FOCUSABLE_SELECTOR = [
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export type DemandActionMode = 'close' | 'restore' | 'priority' | 'owner';

export interface DemandActionValues {
  reason: string;
  priority: DemandPriority;
  owner_hr_id: number | null;
  close_status: 'paused' | 'cancelled' | 'closed' | 'filled';
}

export function DemandActionDialog({
  demand,
  mode,
  values,
  owners,
  busy,
  actionError,
  onChange,
  onCancel,
  onConfirm,
}: {
  demand: RecruitmentDemand;
  mode: DemandActionMode | null;
  values: DemandActionValues;
  owners: CandidateOwnerOption[];
  busy: boolean;
  actionError?: string | null;
  onChange: (values: DemandActionValues) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  const isOpen = mode !== null;

  useLayoutEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const previousInert = appRoot?.inert ?? false;
    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.inert = true;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        onCancelRef.current();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !dialog.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      const firstControl = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstControl ?? dialogRef.current)?.focus();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      if (appRoot) appRoot.inert = previousInert;
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [isOpen]);

  if (!mode || typeof document === 'undefined') return null;
  const title = mode === 'close' ? '暂停或关闭需求' : mode === 'restore' ? '恢复需求' : mode === 'priority' ? '调整优先级' : '转派招聘负责人';
  const impact = mode === 'close'
    ? '候选人历史、面试、Offer 和审计记录会保留；职位 / JD 模板不会被关闭。'
    : mode === 'restore'
      ? '该需求会恢复为招聘中；不会改变同一职位模板下的其他需求。'
      : mode === 'owner'
        ? '该需求及其中进行中的候选人会交给新负责人，历史操作者不会重写。'
        : '优先级会影响协同排序，但不会自动改变候选人流程。';
  const valid = values.reason.trim().length > 0
    && (mode !== 'owner' || Boolean(values.owner_hr_id))
    && (mode !== 'priority' || values.priority !== demand.priority);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-ink/30 p-4">
      <div
        ref={dialogRef}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-lg border border-hairline bg-canvas shadow-card-lg"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning-700" />
            <div><h2 className="font-display text-lg text-ink">{title}</h2><p className="mt-1 text-sm text-muted">{demand.job_title} · {demand.request_no}</p></div>
          </div>
          {actionError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {actionError}
            </p>
          )}
          {mode === 'close' && (
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">处理方式</span>
              <select value={values.close_status} onChange={(event) => onChange({ ...values, close_status: event.target.value as DemandActionValues['close_status'] })} className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm">
                <option value="paused">暂停</option><option value="cancelled">业务取消</option><option value="closed">提前关闭</option><option value="filled">确认完成</option>
              </select>
            </label>
          )}
          {mode === 'priority' && (
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">新优先级</span>
              <select value={values.priority} onChange={(event) => onChange({ ...values, priority: event.target.value as DemandPriority })} className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm">
                <option value="A">A 级</option><option value="B">B 级</option><option value="C">C 级</option>
              </select>
            </label>
          )}
          {mode === 'owner' && (
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">新的招聘负责人</span>
              <select value={values.owner_hr_id ?? ''} onChange={(event) => onChange({ ...values, owner_hr_id: event.target.value ? Number(event.target.value) : null })} className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm">
                <option value="">请选择</option>{owners.filter((owner) => owner.id !== demand.owner_hr_id).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </label>
          )}
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">业务原因（必填）</span>
            <textarea rows={4} required value={values.reason} onChange={(event) => onChange({ ...values, reason: event.target.value })} className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm" placeholder="写清楚为什么操作，方便审计和后续接手" />
          </label>
          <div className="rounded-md bg-surface-soft p-3 text-sm text-body"><strong className="text-ink">这次操作会影响：</strong><p className="mt-1">{impact}</p></div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-hairline px-5 py-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>取消</Button>
          <Button type="button" loading={busy} disabled={!valid || busy} onClick={onConfirm}>确认</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
