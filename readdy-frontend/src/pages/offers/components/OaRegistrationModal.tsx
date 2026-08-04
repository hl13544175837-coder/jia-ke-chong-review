import { useEffect, useRef, useState } from 'react';
import { useOverlayLifecycle } from '@/components/ui/useOverlayLifecycle';
import ActionButton from '@/components/ui/ActionButton';
import type { OfferOaRegistrationInput, OfferWorkbenchRecord } from '@/features/offers/types';

interface Props {
  offer: OfferWorkbenchRecord;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: OfferOaRegistrationInput) => void;
}

export default function OaRegistrationModal({ offer, saving, error, onClose, onSave }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [instanceNo, setInstanceNo] = useState(offer.oa_instance_no);
  const [status, setStatus] = useState<OfferOaRegistrationInput['oa_status']>(
    offer.oa_status === 'not_started' ? 'pending' : offer.oa_status,
  );
  const [note, setNote] = useState(offer.oa_note);

  useEffect(() => {
    setInstanceNo(offer.oa_instance_no);
    setStatus(offer.oa_status === 'not_started' ? 'pending' : offer.oa_status);
    setNote(offer.oa_note);
  }, [offer]);

  useOverlayLifecycle({ canClose: !saving, onClose, initialFocusRef: panelRef });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground-900/40 p-4" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="oa-registration-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between border-b border-background-200 px-6 py-4">
          <div><h2 id="oa-registration-title" className="text-lg font-bold text-foreground-900">登记 OA 结果</h2><p className="mt-1 text-sm text-foreground-500">{offer.candidate_name} · {offer.position}</p></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭 OA 登记" className="h-8 w-8 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50"><i className="ri-close-line" aria-hidden="true" /></button>
        </header>
        <div className="space-y-4 px-6 py-5">
          <label className="block text-sm font-medium text-foreground-700">OA 编号<span className="text-red-500"> *</span><input value={instanceNo} onChange={(event) => setInstanceNo(event.target.value)} maxLength={120} placeholder="如：OA-20260804-001" className="mt-2 h-10 w-full rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400" /></label>
          <label className="block text-sm font-medium text-foreground-700">OA 状态<span className="text-red-500"> *</span><select value={status} onChange={(event) => setStatus(event.target.value as OfferOaRegistrationInput['oa_status'])} className="mt-2 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400"><option value="pending">OA 审批中</option><option value="approved">OA 已通过</option><option value="rejected">OA 已退回</option><option value="completed">已完成</option></select></label>
          <label className="block text-sm font-medium text-foreground-700">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="填写审批结果或后续跟进说明" className="mt-2 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm outline-none focus:border-primary-400" /></label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">仅登记 OA 结果，不会自动发起或同步 OA。</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-background-200 px-6 py-4"><ActionButton tone="secondary" onClick={onClose} disabled={saving}>取消</ActionButton><ActionButton tone="primary" disabled={saving || !instanceNo.trim()} onClick={() => onSave({ oa_instance_no: instanceNo.trim(), oa_status: status, note: note.trim() })}>{saving ? '保存中...' : '确认登记'}</ActionButton></footer>
      </div>
    </div>
  );
}
