import { useEffect, useState } from 'react';
import type { TalentMapCompany, TalentMapOrganizationDepartmentDraft } from '@/features/talentMaps/types';
import {
  draftNodeAt,
  emptyDepartmentDraft,
  emptyRoleDraft,
  insertDraftChild,
  organizationDraft,
  removeDraftAt,
  removeRoleDraftAt,
  updateDraftAt,
  cleanOrganizationDraft,
} from '@/pages/talent-map/organization';
import type { OrganizationDepartment } from '@/pages/talent-map/organization';

interface OrganizationEditorModalProps {
  open: boolean;
  company: TalentMapCompany | null;
  departments: OrganizationDepartment[];
  saving: boolean;
  onClose: () => void;
  onSave: (departments: TalentMapOrganizationDepartmentDraft[]) => void | Promise<void>;
}

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300';

const labelClass = 'block text-xs font-medium text-foreground-600 mb-1.5';

type DepartmentNode = TalentMapOrganizationDepartmentDraft;

export default function OrganizationEditorModal({
  open,
  company,
  departments,
  saving,
  onClose,
  onSave,
}: OrganizationEditorModalProps) {
  const [draft, setDraft] = useState<DepartmentNode[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(organizationDraft(departments));
  }, [open, departments]);

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

  const addDepartment = () => {
    setDraft((prev) => [...prev, emptyDepartmentDraft()]);
  };

  const addChildDepartment = (path: number[]) => {
    setDraft((prev) => insertDraftChild(prev, path, emptyDepartmentDraft()));
  };

  const removeDepartment = (path: number[]) => {
    const department = draftNodeAt(draft, path);
    if (!department) return;
    if (!window.confirm(`确定删除部门「${department.name || '未命名部门'}」吗？只会从组织架构中移除，已录入人才不会被删除。`)) return;
    setDraft((prev) => removeDraftAt(prev, path));
  };

  const handleSave = () => {
    if (saving) return;
    void onSave(cleanOrganizationDraft(draft));
  };

  const renderDepartmentCard = (department: DepartmentNode, path: number[], depth: number) => {
    const children = department.children ?? [];
    return (
      <div
        key={path.join('.')}
        className="rounded-xl border border-background-200 bg-white p-4"
        style={{ marginLeft: depth > 0 ? depth * 28 : 0 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <label className={labelClass}>
              {depth === 0 ? '部门名称' : `子部门名称（第 ${depth + 1} 层）`}
            </label>
            <input
              type="text"
              value={department.name}
              onChange={(e) => setDraft((prev) => updateDraftAt(prev, path, { name: e.target.value }))}
              placeholder={depth === 0 ? '如：技术中心 / 产品部' : '如：后端组 / 前端组'}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={() => removeDepartment(path)}
            disabled={saving}
            className="mt-5 flex-shrink-0 px-3 py-2.5 rounded-lg bg-background-100 hover:bg-red-50 hover:text-red-600 text-foreground-500 text-sm transition-colors cursor-pointer"
            aria-label="删除部门"
          >
            <i className="ri-delete-bin-line"></i>
          </button>
        </div>

        {/* 子部门（递归） */}
        {children.map((child, index) => renderDepartmentCard(child, [...path, index], depth + 1))}
        <button
          type="button"
          onClick={() => addChildDepartment(path)}
          disabled={saving}
          className="mb-3 px-3 py-1.5 rounded-lg bg-background-100 hover:bg-primary-50 hover:text-primary-700 text-foreground-600 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
        >
          <i className="ri-folder-add-line"></i>
          新增子部门
        </button>

        {/* 岗位 */}
        <div className="space-y-2">
          {department.roles.map((role, roleIndex) => (
            <div key={roleIndex} className="flex items-center gap-2">
              <input
                type="text"
                value={role.title}
                onChange={(e) => setDraft((prev) => updateDraftAt(prev, path, {
                  roles: (draftNodeAt(prev, path)?.roles ?? []).map((r, j) => (j === roleIndex ? { ...r, title: e.target.value } : r)),
                }))}
                placeholder="如：后端工程师"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setDraft((prev) => removeRoleDraftAt(prev, path, roleIndex))}
                disabled={saving}
                className="flex-shrink-0 w-9 h-10 rounded-lg bg-background-100 hover:bg-red-50 hover:text-red-600 text-foreground-500 transition-colors cursor-pointer"
                aria-label="删除岗位"
              >
                <i className="ri-close-line"></i>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDraft((prev) => updateDraftAt(prev, path, {
              roles: [...(draftNodeAt(prev, path)?.roles ?? []), emptyRoleDraft()],
            }))}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
          >
            <i className="ri-add-line"></i>
            新增岗位
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => { if (!saving) onClose(); }}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl pointer-events-auto flex flex-col animate-modal-in max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">编辑组织架构</h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                {company ? `目标公司：${company.company_name}` : ''} · 空部门/空岗位也会保存 · 支持多层子部门
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
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="rounded-xl bg-secondary-50 border border-secondary-200 px-4 py-3 text-xs text-secondary-800 leading-relaxed">
              修改部门或岗位名称会同步更新该部门/岗位下已录入人才；删除只会从组织架构中移除，不会删除人才。
              想做大部门 ➜ 小部门？先新增一个部门，再在里面点「新增子部门」层层往下套。
            </div>

            {draft.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm text-foreground-500">还没有部门，先新增一个部门，再往里面加岗位或子部门。</p>
              </div>
            )}

            {draft.map((department, departmentIndex) => renderDepartmentCard(department, [departmentIndex], 0))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-background-100">
            <button
              type="button"
              onClick={addDepartment}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-background-100 hover:bg-background-200 text-foreground-700 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <i className="ri-add-line"></i>
              新增部门
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {saving ? '保存中…' : '保存组织结构'}
              </button>
            </div>
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