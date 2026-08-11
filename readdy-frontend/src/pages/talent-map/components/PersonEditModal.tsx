import { useEffect, useMemo, useState } from 'react';
import type { TalentMapCompany, TalentMapContactLog, TalentMapPerson, TalentMapPersonInput } from '@/features/talentMaps/types';

const CONTACT_STATUS_OPTIONS = ['未接触', '待联系', '沟通中', '已确认', '不合适'] as const;

interface PersonEditModalProps {
  open: boolean;
  person: TalentMapPerson | null;
  companies: TalentMapCompany[];
  defaultCompanyId?: number | null;
  defaultDepartment?: string;
  defaultTitle?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: TalentMapPersonInput) => void | Promise<void>;
  onAddContactLog?: (personId: number, payload: { content: string }) => Promise<TalentMapPerson>;
}

interface FormState {
  company_id: string;
  name: string;
  department: string;
  title: string;
  level: string;
  module: string;
  phone: string;
  contact_status: string;
  note: string;
}

function emptyForm(defaults: {
  companyId?: number | null;
  department?: string;
  title?: string;
}): FormState {
  return {
    company_id: defaults.companyId != null ? String(defaults.companyId) : '',
    name: '',
    department: defaults.department ?? '',
    title: defaults.title ?? '',
    level: '',
    module: '',
    phone: '',
    contact_status: '待联系',
    note: '',
  };
}

function formFromPerson(person: TalentMapPerson): FormState {
  return {
    company_id: person.company_id != null ? String(person.company_id) : '',
    name: person.name,
    department: person.department || '',
    title: person.title || '',
    level: person.level || '',
    module: person.module || '',
    phone: person.phone || '',
    contact_status: person.contact_status || '待联系',
    note: person.note || '',
  };
}

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300';

const labelClass = 'block text-xs font-medium text-foreground-600 mb-1.5';

export default function PersonEditModal({
  open,
  person,
  companies,
  defaultCompanyId,
  defaultDepartment,
  defaultTitle,
  saving,
  onClose,
  onSave,
  onAddContactLog,
}: PersonEditModalProps) {
  const [form, setForm] = useState<FormState>(() => emptyForm({}));
  const [contactLogs, setContactLogs] = useState<TalentMapContactLog[]>(person?.contact_logs ?? []);
  const [logText, setLogText] = useState('');
  const [addingLog, setAddingLog] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      person
        ? formFromPerson(person)
        : emptyForm({ companyId: defaultCompanyId, department: defaultDepartment, title: defaultTitle }),
    );
    setContactLogs(person?.contact_logs ?? []);
    setLogText('');
  }, [open, person, defaultCompanyId, defaultDepartment, defaultTitle]);

  // 支持 Esc 关闭弹窗
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- 未启用 React Compiler，该规则为误报
  const departmentSuggestions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach(() => undefined);
    if (person?.department) set.add(person.department);
    if (defaultDepartment) set.add(defaultDepartment);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
  }, [companies, person?.department, defaultDepartment]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- 未启用 React Compiler，该规则为误报
  const titleSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (person?.title) set.add(person.title);
    if (defaultTitle) set.add(defaultTitle);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
  }, [person?.title, defaultTitle]);

  if (!open) return null;

  const isEdit = Boolean(person);
  const canSubmit = form.name.trim() !== '' && form.company_id !== '';

  const set = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleAddLog = async () => {
    if (!person || !logText.trim() || addingLog) return;
    setAddingLog(true);
    try {
      if (onAddContactLog) {
        const updated = await onAddContactLog(person.id, { content: logText.trim() });
        setContactLogs(updated.contact_logs ?? []);
      }
      setLogText('');
    } catch {
      // 保存失败保持输入内容，用户可重试
    } finally {
      setAddingLog(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit || saving) return;
    void onSave({
      company_id: form.company_id ? Number(form.company_id) : null,
      name: form.name.trim(),
      department: form.department.trim(),
      title: form.title.trim(),
      level: form.level.trim(),
      module: form.module.trim(),
      phone: form.phone.trim(),
      contact_status: form.contact_status,
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
              <h2 className="text-lg font-bold text-foreground-900">
                {isEdit ? '编辑人才信息' : '录入行业人才'}
              </h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                {isEdit ? '随时补充 / 修正信息，修改后立即保存' : '填写后自动出现在对应公司的组织架构中'}
              </p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="person-name" className={labelClass}>姓名 <span className="text-accent-500">*</span></label>
                <input
                  id="person-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="必填"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="person-company" className={labelClass}>目标公司 <span className="text-accent-500">*</span></label>
                <select
                  id="person-company"
                  value={form.company_id}
                  onChange={(e) => set('company_id', e.target.value)}
                  className={inputClass}
                >
                  <option value="">请选择公司</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.company_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="person-department" className={labelClass}>部门</label>
                <input
                  id="person-department"
                  type="text"
                  list="person-dept-options"
                  value={form.department}
                  onChange={(e) => set('department', e.target.value)}
                  placeholder="如：技术中心 · 后端部"
                  className={inputClass}
                />
                <datalist id="person-dept-options">
                  {departmentSuggestions.map((item) => <option key={item} value={item} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor="person-title" className={labelClass}>岗位</label>
                <input
                  id="person-title"
                  type="text"
                  list="person-title-options"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="如：资深后端工程师"
                  className={inputClass}
                />
                <datalist id="person-title-options">
                  {titleSuggestions.map((item) => <option key={item} value={item} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor="person-level" className={labelClass}>
                  职级
                  {!form.level && (
                    <span className="ml-1.5 text-[10px] text-secondary-600 bg-secondary-50 px-1.5 py-0.5 rounded">
                      简历无职级，请人工补充
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  id="person-level"
                  value={form.level}
                  onChange={(e) => set('level', e.target.value)}
                  placeholder="如：专家级 / 高级 / 总监级"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="person-module" className={labelClass}>负责模块</label>
                <input
                  id="person-module"
                  type="text"
                  value={form.module}
                  onChange={(e) => set('module', e.target.value)}
                  placeholder="如：平台架构组"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="person-phone" className={labelClass}>联系电话</label>
                <input
                  id="person-phone"
                  type="text"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="手机 / 座机"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="person-status" className={labelClass}>联系状态</label>
                <select
                  id="person-status"
                  value={form.contact_status}
                  onChange={(e) => set('contact_status', e.target.value)}
                  className={inputClass}
                >
                  {CONTACT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="person-note" className={labelClass}>备注 / 联系情况</label>
              <textarea
                id="person-note"
                value={form.note}
                onChange={(e) => set('note', e.target.value)}
                placeholder="记录沟通进展、意向度、薪资预期等，可随时补充"
                rows={3}
                maxLength={2000}
                className={`${inputClass} resize-none`}
              ></textarea>
            </div>

            {isEdit && (
              <div className="border-t border-background-100 pt-4 mt-2">
                <h4 className="text-sm font-semibold text-foreground-900 mb-3">联系记录</h4>
                {contactLogs.length === 0 ? (
                  <p className="text-xs text-foreground-400 py-1">暂无联系记录，添加第一条吧</p>
                ) : (
                  <ul className="space-y-3 max-h-44 overflow-y-auto pr-1">
                    {contactLogs.map((log, index) => (
                      <li key={log.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 flex-shrink-0"></span>
                          {index < contactLogs.length - 1 && <span className="w-px flex-1 bg-background-200"></span>}
                        </div>
                        <div className="flex-1 min-w-0 pb-3">
                          <p className="text-[11px] text-foreground-400">
                            {log.contact_at
                              ? new Date(log.contact_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
                              : ''}
                            {log.created_by_name ? ` · ${log.created_by_name}` : ''}
                          </p>
                          <p className="mt-0.5 text-sm text-foreground-700 whitespace-pre-wrap break-words">{log.content}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={logText}
                    onChange={(e) => setLogText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddLog(); }}
                    placeholder="记录这次沟通，如：电话沟通，意向度高…"
                    className={inputClass}
                  />
                  <button
                    onClick={() => void handleAddLog()}
                    disabled={!logText.trim() || addingLog}
                    className="flex-shrink-0 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    {addingLog ? '保存…' : '添加'}
                  </button>
                </div>
              </div>
            )}
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
              {saving ? '保存中…' : isEdit ? '保存修改' : '录入人才'}
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
