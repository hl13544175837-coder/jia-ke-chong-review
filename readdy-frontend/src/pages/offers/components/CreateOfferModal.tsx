import { useEffect, useMemo, useState } from 'react';
import { candidatesApi } from '@/features/candidates/api';
import type { CandidateListItem } from '@/features/candidates/types';
import type { RecruitmentDemand } from '@/features/demands/types';
import { offersApi } from '@/features/offers/api';
import type { OfferRecord } from '@/features/offers/types';

interface Props {
  offer: OfferRecord | null;
  demands: RecruitmentDemand[];
  initialDemandId?: number | null;
  initialCandidateId?: number | null;
  onClose: () => void;
  onSaved: (offer: OfferRecord) => void;
}

export default function CreateOfferModal({ offer, demands, initialDemandId, initialCandidateId, onClose, onSaved }: Props) {
  const [demandId, setDemandId] = useState(offer ? String(offer.demand_id) : initialDemandId ? String(initialDemandId) : '');
  const [candidateId, setCandidateId] = useState(offer ? String(offer.candidate_id) : initialCandidateId ? String(initialCandidateId) : '');
  const [salaryRange, setSalaryRange] = useState(offer?.salary_range ?? '');
  const [onboardDate, setOnboardDate] = useState(offer?.onboard_date ?? '');
  const [note, setNote] = useState(offer?.note ?? '');
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState('');
  const [candidateReloadKey, setCandidateReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const approvedDemands = useMemo(
    () => demands.filter((demand) => demand.approval_status === 'approved' && demand.status === 'active'),
    [demands],
  );

  useEffect(() => {
    if (offer || !demandId) {
      setCandidates([]);
      setCandidatesError('');
      return;
    }

    let cancelled = false;
    setCandidatesLoading(true);
    setCandidatesError('');
    void candidatesApi.listCandidates({
      demand_id: Number(demandId),
      stage: 'offer',
      page: 1,
      per_page: 100,
    }).then((response) => {
      if (cancelled) return;
      const offerCandidates = response.candidates.filter((candidate) => candidate.current_stage === 'offer');
      setCandidates(offerCandidates);
      if (initialCandidateId && !offerCandidates.some((candidate) => candidate.id === initialCandidateId)) {
        setCandidateId('');
        setCandidatesError('对应候选人不在该需求的 Offer 阶段，请返回面试结果确认下一步');
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      setCandidates([]);
      setCandidatesError(error instanceof Error ? error.message : '加载候选人失败');
    }).finally(() => {
      if (!cancelled) setCandidatesLoading(false);
    });

    return () => { cancelled = true; };
  }, [candidateReloadKey, demandId, initialCandidateId, offer]);

  const saveDraft = async () => {
    const selectedDemandId = Number(demandId);
    const selectedCandidateId = Number(candidateId);
    if (!selectedDemandId || !selectedCandidateId || !salaryRange.trim()) {
      setFormError('请选择招聘需求、候选人并填写薪酬方案');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const saved = await offersApi.saveDraft(selectedDemandId, selectedCandidateId, {
        salary_range: salaryRange.trim(),
        onboard_date: onboardDate || null,
        note: note.trim(),
      });
      onSaved(saved);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '保存 Offer 草稿失败');
    } finally {
      setSaving(false);
    }
  };

  const selectedDemand = demands.find((demand) => demand.id === Number(demandId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground-900/40 p-4" role="presentation" onMouseDown={saving ? undefined : onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-form-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-background-200 px-5 py-4">
          <div>
            <h2 id="offer-form-title" className="text-base font-semibold text-foreground-900">{offer ? '编辑 Offer 草稿' : '新建 Offer 草稿'}</h2>
            <p className="mt-1 text-xs text-foreground-500">保存后仍需提交审批，不会直接发放。</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭" className="h-8 w-8 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50">
            <i className="ri-close-line text-lg" aria-hidden="true"></i>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <label className="block text-sm font-medium text-foreground-700">
            招聘需求
            <select
              value={demandId}
              disabled={Boolean(offer)}
              onChange={(event) => { setDemandId(event.target.value); setCandidateId(''); setFormError(''); }}
              className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400 disabled:bg-background-100"
            >
              <option value="">请选择已审核通过的需求</option>
              {offer && selectedDemand && !approvedDemands.some((demand) => demand.id === selectedDemand.id) && (
                <option value={selectedDemand.id}>{selectedDemand.job_title} · {selectedDemand.request_no}</option>
              )}
              {approvedDemands.map((demand) => (
                <option key={demand.id} value={demand.id}>
                  {demand.job_title} · {demand.request_no} · {demand.requester_department || '未填部门'}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-foreground-700">
            候选人
            <select
              value={candidateId}
              disabled={Boolean(offer) || !demandId || candidatesLoading || Boolean(candidatesError)}
              onChange={(event) => { setCandidateId(event.target.value); setFormError(''); }}
              className="mt-1.5 h-10 w-full rounded-lg border border-background-300 bg-white px-3 text-sm outline-none focus:border-primary-400 disabled:bg-background-100"
            >
              <option value="">{candidatesLoading ? '正在加载候选人...' : '请选择 Offer 阶段候选人'}</option>
              {offer && <option value={offer.candidate_id}>{offer.candidate_name}</option>}
              {!offer && candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name_masked}</option>
              ))}
            </select>
          </label>

          {candidatesError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{candidatesError}</p>
              <button type="button" onClick={() => setCandidateReloadKey((value) => value + 1)} className="mt-1 font-medium underline">重新加载候选人</button>
            </div>
          )}
          {!offer && demandId && !candidatesLoading && !candidatesError && candidates.length === 0 && (
            <p className="rounded-lg bg-background-50 px-3 py-2 text-xs text-foreground-500">该需求当前没有进入 Offer 阶段的候选人。</p>
          )}

          {(offer || candidateId) && (
            <div className="rounded-lg border border-background-200 bg-background-50 px-3 py-3">
              <p className="text-sm font-medium text-foreground-800">{offer?.candidate_name || candidates.find((candidate) => candidate.id === Number(candidateId))?.name_masked}</p>
              <p className="mt-1 text-xs text-foreground-500">{selectedDemand?.job_title || offer?.position} · {selectedDemand?.request_no || offer?.request_no}</p>
            </div>
          )}

          <label className="block text-sm font-medium text-foreground-700">
            薪酬方案
            <input
              value={salaryRange}
              onChange={(event) => { setSalaryRange(event.target.value); setFormError(''); }}
              maxLength={120}
              placeholder="例如：30-35K × 14薪"
              className="mt-1.5 h-10 w-full rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400"
            />
          </label>

          <label className="block text-sm font-medium text-foreground-700">
            预计入职日期
            <input
              type="date"
              value={onboardDate}
              onInput={(event) => setOnboardDate(event.currentTarget.value)}
              onChange={(event) => setOnboardDate(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-background-300 px-3 text-sm outline-none focus:border-primary-400"
            />
          </label>

          <label className="block text-sm font-medium text-foreground-700">
            备注
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="填写定薪依据、沟通情况等"
              className="mt-1.5 w-full resize-none rounded-lg border border-background-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
            <span className="mt-1 block text-right text-xs text-foreground-400">{note.length}/2000</span>
          </label>

          {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-background-200 px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-background-300 px-4 text-sm text-foreground-600 hover:bg-background-50 disabled:opacity-50">取消</button>
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || candidatesLoading || Boolean(candidatesError) || !demandId || !candidateId || !salaryRange.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <i className="ri-loader-4-line animate-spin" aria-hidden="true"></i>}
            保存草稿
          </button>
        </footer>
      </section>
    </div>
  );
}
