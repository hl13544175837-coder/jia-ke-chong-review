import { useEffect, useState, type ReactNode } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import DetailActionBar from '@/components/ui/DetailActionBar';
import SemanticStatusBadge from '@/components/ui/SemanticStatusBadge';
import { demandStatusPresentation, statusPresentation } from '@/components/ui/recruitmentPresentation';
import type { DemandUpdateInput, RecruitmentDemand } from '@/features/demands/types';

interface DemandDetailPanelProps {
  demand: RecruitmentDemand | null;
  initialMode?: 'view' | 'edit';
  saving: boolean;
  error: string;
  canReview: boolean;
  onClose: () => void;
  onSave: (demandId: number, payload: DemandUpdateInput) => void;
  onApprove: (demandId: number) => Promise<boolean>;
  onReject: (demandId: number, reason: string) => Promise<boolean>;
}

export default function DemandDetailPanel({
  demand,
  initialMode = 'view',
  saving,
  error,
  canReview,
  onClose,
  onSave,
  onApprove,
  onReject,
}: DemandDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DemandUpdateInput | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  useEffect(() => {
    if (!demand) return;
    setEditing(initialMode === 'edit');
    setRejectOpen(false);
    setRejectReason('');
    setRejectError('');
    setDraft({
      request_no: demand.request_no,
      requester_department: demand.requester_department || demand.job_department,
      city: demand.job_city,
      hiring_manager_name: demand.hiring_manager_name,
      requested_at: demand.requested_at || '',
      target_date: demand.target_date || '',
      headcount: demand.headcount,
      note: demand.note,
    });
  }, [demand, initialMode]);

  if (!demand || !draft) return null;

  const patch = <K extends keyof DemandUpdateInput>(field: K, value: DemandUpdateInput[K]) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  };

  const reviewable = canReview
    && demand.approval_status === 'pending'
    && Boolean(demand.submitted_at);

  const submitRejection = async () => {
    if (!rejectReason.trim()) {
      setRejectError('驳回原因必填');
      return;
    }
    setRejectError('');
    const completed = await onReject(demand.id, rejectReason.trim());
    if (completed) {
      setRejectOpen(false);
      setRejectReason('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-foreground-900/35" onClick={saving ? undefined : onClose}></div>
      <aside className="fixed inset-y-0 right-0 z-[110] flex w-full max-w-4xl flex-col border-l border-background-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="招聘需求详情">
        <header className="flex items-start justify-between border-b border-background-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary-600">{demand.request_no || `需求 #${demand.id}`}</p>
            <h2 className="mt-1 truncate text-lg font-bold text-foreground-900">{demand.job_title}</h2>
            <p className="mt-1 text-xs text-foreground-500">招聘负责人：{demand.owner_hr_name || `#${demand.owner_hr_id}`}</p>
          </div>
          <button type="button" aria-label="关闭需求详情" disabled={saving} onClick={onClose} className="h-9 w-9 rounded-lg text-foreground-500 hover:bg-background-100 disabled:opacity-50">
            <i className="ri-close-line text-xl"></i>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!editing ? (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-4 rounded-lg border border-background-200 p-4 text-sm">
                <Info label="审核状态" value={(
                  <SemanticStatusBadge tone={statusPresentation(demandStatusPresentation, demand.approval_status, approvalLabel(demand.approval_status)).tone}>
                    {approvalLabel(demand.approval_status)}
                  </SemanticStatusBadge>
                )} />
                <Info label="当前状态" value={(
                  <SemanticStatusBadge tone={statusPresentation(demandStatusPresentation, demand.status).tone}>
                    {statusLabel(demand.status)}
                  </SemanticStatusBadge>
                )} />
                <Info label="提交时间" value={formatDateTime(demand.submitted_at)} />
                <Info label="审核时间" value={formatDateTime(demand.reviewed_at)} />
                <Info label="审核人" value={demand.reviewed_by ? `用户 #${demand.reviewed_by}` : '暂无'} />
                <Info label="需求创建人" value={demand.requester_name || (demand.created_by ? `用户 #${demand.created_by}` : '暂无')} />
              </section>
              {demand.approval_status === 'rejected' && demand.review_reason && (
                <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-red-700">驳回原因</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-700">{demand.review_reason}</p>
                </section>
              )}
              <section className="grid grid-cols-2 gap-4 rounded-lg border border-background-200 p-4 text-sm">
                <Info label="用人部门" value={demand.requester_department || demand.job_department} />
                <Info label="招聘城市" value={demand.job_city} />
                <Info label="用人负责人" value={demand.hiring_manager_name || '未填写'} />
                <Info label="已入职 HC" value={`${demand.metrics.onboarded_count} / ${demand.headcount}`} />
                <Info label="Offer 已接受锁定" value={`${demand.metrics.accepted_offer_count} 人`} />
                <Info label="剩余可锁定名额" value={`${demand.metrics.remaining_headcount} 人`} />
                <Info label="提需求日期" value={demand.requested_at || '未填写'} />
                <Info label="期望完成日期" value={demand.target_date || '未填写'} />
              </section>
              <section>
                <h3 className="text-sm font-semibold text-foreground-800">岗位 JD</h3>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-background-50 p-4 text-sm leading-6 text-foreground-600">{demand.jd_text || '未填写'}</p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-foreground-800">需求备注</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-600">{demand.note || '暂无备注'}</p>
              </section>
            </div>
          ) : (
            <form
              id="demand-edit-form"
              className="grid grid-cols-2 gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSave(demand.id, draft);
              }}
            >
              <Field label="需求编号"><input value={draft.request_no || ''} onChange={(event) => patch('request_no', event.target.value)} className="field" /></Field>
              <Field label="用人部门"><input required value={draft.requester_department} onChange={(event) => patch('requester_department', event.target.value)} className="field" /></Field>
              <Field label="招聘城市"><input required value={draft.city} onChange={(event) => patch('city', event.target.value)} className="field" /></Field>
              <Field label="用人负责人"><input required value={draft.hiring_manager_name} onChange={(event) => patch('hiring_manager_name', event.target.value)} className="field" /></Field>
              <Field label="提需求日期"><input type="date" required value={draft.requested_at} onChange={(event) => patch('requested_at', event.target.value)} className="field" /></Field>
              <Field label="期望完成日期"><input type="date" required min={draft.requested_at} value={draft.target_date} onChange={(event) => patch('target_date', event.target.value)} className="field" /></Field>
              <Field label="HC"><input type="number" min={1} max={10000} required value={draft.headcount} onChange={(event) => patch('headcount', Number(event.target.value) || 1)} className="field" /></Field>
              <label className="col-span-2 block text-sm font-medium text-foreground-700">备注<textarea value={draft.note || ''} onChange={(event) => patch('note', event.target.value)} rows={5} className="field mt-1 resize-none" /></label>
            </form>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</p>}
        </div>

        <DetailActionBar>
          {rejectOpen && reviewable && !editing && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground-700">
                驳回原因
                <textarea
                  autoFocus
                  rows={4}
                  maxLength={1000}
                  value={rejectReason}
                  onChange={(event) => {
                    setRejectReason(event.target.value);
                    if (event.target.value.trim()) setRejectError('');
                  }}
                  placeholder="请填写需要业务补充或修改的内容"
                  className="field mt-1 resize-none"
                />
              </label>
              {rejectError && <p className="mt-1 text-xs text-red-500" role="alert">{rejectError}</p>}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            {editing ? (
              <>
                <ActionButton type="button" tone="secondary" disabled={saving} onClick={() => setEditing(false)}>取消</ActionButton>
                <ActionButton
                  type="button"
                  tone="primary"
                  disabled={saving}
                  onClick={() => (document.getElementById('demand-edit-form') as HTMLFormElement | null)?.requestSubmit()}
                >
                  {saving ? '正在保存...' : '保存修改'}
                </ActionButton>
              </>
            ) : (
              <>
                <ActionButton type="button" tone="secondary" disabled={saving} onClick={() => setEditing(true)}>
                  <i className="ri-edit-line"></i>编辑需求
                </ActionButton>
                {reviewable && !rejectOpen && (
                  <>
                    <ActionButton type="button" tone="primary" disabled={saving} onClick={() => { void onApprove(demand.id); }}>
                      <i className="ri-check-line"></i>{saving ? '处理中...' : '通过'}
                    </ActionButton>
                    <ActionButton type="button" tone="danger" disabled={saving} onClick={() => setRejectOpen(true)}>
                      <i className="ri-close-line"></i>不通过
                    </ActionButton>
                  </>
                )}
                {reviewable && rejectOpen && (
                  <>
                    <ActionButton type="button" tone="secondary" disabled={saving} onClick={() => { setRejectOpen(false); setRejectReason(''); setRejectError(''); }}>取消驳回</ActionButton>
                    <ActionButton type="button" tone="danger" disabled={saving} onClick={() => { void submitRejection(); }}>
                      <i className="ri-close-circle-line"></i>{saving ? '正在提交...' : '确认不通过'}
                    </ActionButton>
                  </>
                )}
              </>
            )}
          </div>
        </DetailActionBar>
      </aside>
      <style>{`.field{margin-top:.25rem;width:100%;border:1px solid #e5e7eb;border-radius:.5rem;padding:.55rem .75rem;font-size:.875rem;outline:none}.field:focus{border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.12)}`}</style>
    </>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div><p className="text-xs text-foreground-400">{label}</p><div className="mt-1 font-medium text-foreground-800">{value}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-foreground-700">{label}{children}</label>;
}

function formatDateTime(value: string | null) {
  if (!value) return '暂无';
  return value.replace('T', ' ').slice(0, 16);
}

function approvalLabel(status: RecruitmentDemand['approval_status']) {
  return { pending: '待审核', approved: '已通过', rejected: '未通过' }[status] || status;
}

function statusLabel(status: RecruitmentDemand['status']) {
  return {
    pending: '待确认',
    active: '招聘中',
    paused: '已暂停',
    filled: '已完成',
    cancelled: '已取消',
    closed: '已关闭',
  }[status] || status;
}
