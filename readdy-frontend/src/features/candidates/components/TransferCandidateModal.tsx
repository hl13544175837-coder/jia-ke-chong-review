import { useEffect, useMemo, useRef, useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import type { CandidateListItem } from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';

interface TransferCandidateModalProps {
  candidate: CandidateListItem;
  demands: RecruitmentDemand[];
  saving: boolean;
  error: string;
  invalidated: boolean;
  onClose: () => void;
  onTransfer: (targetDemandId: number, reason: string) => void;
}

export default function TransferCandidateModal({
  candidate,
  demands,
  saving,
  error,
  invalidated,
  onClose,
  onTransfer,
}: TransferCandidateModalProps) {
  const availableDemands = useMemo(
    () => demands.filter((demand) => demand.id !== candidate.current_demand_id && demand.metrics.remaining_headcount > 0),
    [candidate.current_demand_id, demands],
  );
  const [targetDemandId, setTargetDemandId] = useState(0);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');
  const panelRef = useRef<HTMLElement>(null);

  useOverlayLifecycle({ canClose: !saving, onClose, initialFocusRef: panelRef });

  useEffect(() => {
    setTargetDemandId(0);
    setReason('');
    setLocalError('');
  }, [candidate.id]);

  useEffect(() => {
    setTargetDemandId((current) => availableDemands.some((demand) => demand.id === current)
      ? current
      : availableDemands[0]?.id ?? 0);
  }, [availableDemands]);

  const submit = () => {
    if (!targetDemandId) { setLocalError('请选择目标招聘需求'); return; }
    if (!reason.trim()) { setLocalError('请填写转需求原因'); return; }
    setLocalError('');
    onTransfer(targetDemandId, reason.trim());
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-foreground-900/40 p-4" onMouseDown={() => { if (!saving) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transfer-candidate-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl outline-none">
        <header className="border-b border-background-200 px-6 py-5">
          <h2 id="transfer-candidate-title" className="text-lg font-bold text-foreground-900">转到其他需求</h2>
          <p className="mt-1 text-sm text-foreground-500">{candidate.name_masked} · 当前需求 {candidate.current_demand?.job_title || `#${candidate.current_demand_id}`}</p>
        </header>
        <div className="space-y-4 px-6 py-5">
          <label className="block text-sm font-medium text-foreground-700">目标招聘需求
            <select value={targetDemandId || ''} onChange={(event) => { setTargetDemandId(Number(event.target.value)); setLocalError(''); }} disabled={saving} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm">
              {availableDemands.length === 0 && <option value="">暂无其他在招需求</option>}
              {availableDemands.map((demand) => <option key={demand.id} value={demand.id}>{demand.request_no} · {demand.job_title} · {demand.job_department}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground-700">转需求原因
            <textarea value={reason} onChange={(event) => { setReason(event.target.value); setLocalError(''); }} disabled={saving} rows={3} maxLength={240} placeholder="说明调整岗位或招聘需求的原因" className="mt-2 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm" />
          </label>
          {(localError || error) && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{localError || error}</p>}
        </div>
        <footer className="flex justify-end gap-3 border-t border-background-200 px-6 py-4"><ActionButton tone="secondary" disabled={saving} onClick={onClose}>取消</ActionButton><ActionButton tone="primary" disabled={saving || invalidated || availableDemands.length === 0} onClick={submit}>{saving ? '正在转移...' : '确认转移'}</ActionButton></footer>
      </section>
    </div>
  );
}
