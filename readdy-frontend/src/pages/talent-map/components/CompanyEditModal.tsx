import { useEffect, useState } from 'react';
import type { TalentMapCompany } from '@/features/talentMaps/types';

interface CompanyEditModalProps {
  open: boolean;
  company: TalentMapCompany | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    company_name: string;
    industry: string;
    city: string;
    note: string;
  }) => void | Promise<void>;
}

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300';

const labelClass = 'block text-xs font-medium text-foreground-600 mb-1.5';

export default function CompanyEditModal({
  open,
  company,
  saving,
  onClose,
  onSave,
}: CompanyEditModalProps) {
  const [form, setForm] = useState({ company_name: '', industry: '', city: '', note: '' });

  useEffect(() => {
    if (!open || !company) return;
    setForm({
      company_name: company.company_name,
      industry: company.industry,
      city: company.city,
      note: company.note,
    });
  }, [open, company]);

  // 支持 Esc 关闭弹窗
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const canSubmit = form.company_name.trim() !== '';

  const handleSubmit = () => {
    if (!canSubmit || saving) return;
    void onSave({
      company_name: form.company_name.trim(),
      industry: form.industry.trim(),
      city: form.city.trim(),
      note: form.note.trim(),
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => { if (!saving) onClose(); }}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col animate-modal-in max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">编辑公司</h2>
              <p className="text-xs text-foreground-400 mt-0.5">修改公司名称等信息，保存后立即生效</p>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
              aria-label="关闭"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="company-name" className={labelClass}>公司名称 <span className="text-accent-500">*</span></label>
              <input
                id="company-name"
                type="text"
                value={form.company_name}
                onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                placeholder="如：云启科技"
                className={inputClass}
              />
              <p className="text-[10px] text-foreground-400 mt-1">改名后，该公司下已录入的人才仍然保留</p>
            </div>
            <div>
              <label htmlFor="company-industry" className={labelClass}>所属行业</label>
              <input
                id="company-industry"
                type="text"
                value={form.industry}
                onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
                placeholder="如：云计算"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="company-city" className={labelClass}>城市</label>
              <input
                id="company-city"
                type="text"
                value={form.city}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="如：深圳"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="company-note" className={labelClass}>备注</label>
              <textarea
                id="company-note"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="公司规模、业务特色等"
                rows={3}
                className={`${inputClass} resize-none`}
              ></textarea>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-100">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modalIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
