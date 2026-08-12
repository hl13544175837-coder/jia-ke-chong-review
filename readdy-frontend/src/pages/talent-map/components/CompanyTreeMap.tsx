import { useEffect, useMemo, useState } from 'react';
import type {
  TalentMapCompany,
  TalentMapOrganizationDepartmentDraft,
  TalentMapOrganizationRoleDraft,
  TalentMapPerson,
} from '@/features/talentMaps/types';
import { organizationDraft } from '@/pages/talent-map/organization';
import type { OrganizationDepartment } from '@/pages/talent-map/organization';

interface CompanyTreeMapProps {
  open: boolean;
  company: TalentMapCompany | null;
  departments: OrganizationDepartment[];
  saving: boolean;
  onClose: () => void;
  onSave: (departments: TalentMapOrganizationDepartmentDraft[]) => void | Promise<void>;
  onAddPerson: (department: string, title: string) => void;
  onEditPerson: (person: TalentMapPerson) => void;
}

const inputClass =
  'w-56 px-2 py-1.5 bg-white border border-primary-300 rounded-md text-sm text-foreground-900 focus:outline-none';

const iconBtnClass =
  'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-foreground-500 hover:bg-background-100 hover:text-foreground-700 transition-colors cursor-pointer';

const dangerBtnClass =
  'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-foreground-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer';

function statusDot(status: string) {
  if (status === '已确认') return 'bg-primary-400';
  if (status === '沟通中') return 'bg-secondary-400';
  if (status === '待联系' || status === '未接触') return 'bg-background-300';
  return 'bg-background-200';
}

function emptyRole(): TalentMapOrganizationRoleDraft {
  return { source_title: '', title: '' };
}

function emptyDepartment(): TalentMapOrganizationDepartmentDraft {
  return { source_name: '', name: '', roles: [] };
}

export default function CompanyTreeMap({
  open,
  company,
  departments,
  saving,
  onClose,
  onSave,
  onAddPerson,
  onEditPerson,
}: CompanyTreeMapProps) {
  const [draft, setDraft] = useState<TalentMapOrganizationDepartmentDraft[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ kind: 'dept' | 'role'; dept: number; role?: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(organizationDraft(departments));
    setCollapsed(new Set());
    setEditing(null);
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

  /** 人才按（原部门|原岗位）归位，改名保存前仍按原名统计/展示人才。 */
  const peopleByKey = useMemo(() => {
    const map = new Map<string, TalentMapPerson[]>();
    for (const department of departments) {
      for (const role of department.roles) {
        map.set(`${department.name}|${role.title}`, role.people);
      }
    }
    return map;
  }, [departments]);

  if (!open) return null;

  const rolePeople = (department: TalentMapOrganizationDepartmentDraft, role: TalentMapOrganizationRoleDraft) =>
    peopleByKey.get(`${department.source_name}|${role.source_title}`) ?? [];

  const departmentPeopleCount = (department: TalentMapOrganizationDepartmentDraft) =>
    department.roles.reduce(
      (sum, role) => sum + (peopleByKey.get(`${department.source_name}|${role.source_title}`)?.length ?? 0),
      0,
    );

  const totalDepartments = draft.filter((item) => item.name.trim()).length;
  const totalRoles = draft.reduce(
    (sum, item) => sum + item.roles.filter((role) => role.title.trim()).length,
    0,
  );
  const totalPeople = departments.reduce(
    (sum, department) => sum + department.roles.reduce((inner, role) => inner + role.people.length, 0),
    0,
  );

  const updateDepartment = (index: number, patch: Partial<TalentMapOrganizationDepartmentDraft>) => {
    setDraft((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const updateRole = (deptIndex: number, roleIndex: number, patch: Partial<TalentMapOrganizationRoleDraft>) => {
    setDraft((prev) => prev.map((item, i) => (
      i !== deptIndex
        ? item
        : { ...item, roles: item.roles.map((role, j) => (j === roleIndex ? { ...role, ...patch } : role)) }
    )));
  };

  const addDepartment = () => {
    const index = draft.length;
    setDraft((prev) => [...prev, emptyDepartment()]);
    setEditing({ kind: 'dept', dept: index });
  };

  const addRole = (deptIndex: number) => {
    setDraft((prev) => prev.map((item, i) => (
      i === deptIndex ? { ...item, roles: [...item.roles, emptyRole()] } : item
    )));
    const roleIndex = draft[deptIndex]?.roles.length ?? 0;
    setEditing({ kind: 'role', dept: deptIndex, role: roleIndex });
  };

  const removeDepartment = (index: number) => {
    const item = draft[index];
    if (!item) return;
    if (!window.confirm(`确定删除部门「${item.name.trim() || '未命名部门'}」吗？只会从地图中移除，已录入人才不会被删除。`)) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const removeRole = (deptIndex: number, roleIndex: number) => {
    const role = draft[deptIndex]?.roles[roleIndex];
    if (!role) return;
    if (!window.confirm(`确定删除岗位「${role.title.trim() || '未命名岗位'}」吗？只会从地图中移除，已录入人才不会被删除。`)) return;
    setDraft((prev) => prev.map((item, i) => (
      i === deptIndex ? { ...item, roles: item.roles.filter((_, j) => j !== roleIndex) } : item
    )));
  };

  const toggleCollapse = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSave = () => {
    if (saving) return;
    const cleaned = draft
      .map((department) => ({
        source_name: department.source_name,
        name: department.name.trim(),
        roles: department.roles
          .filter((role) => role.title.trim())
          .map((role) => ({ source_title: role.source_title, title: role.title.trim() })),
      }))
      .filter((department) => department.name);
    void onSave(cleaned);
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/35 z-[35]" onClick={() => { if (!saving) onClose(); }}></div>
      <div className="fixed inset-0 z-[45] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl pointer-events-auto flex flex-col animate-modal-in max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">地图视图</h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                公司 → 部门 → 岗位 → 候选人 · 点候选人查看编辑，点岗位直接录入人才
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
          <div className="flex-1 overflow-y-auto p-6">
            {/* 公司根节点 */}
            <div className="flex items-center gap-3 rounded-xl bg-primary-50 border border-primary-200 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                <i className="ri-building-4-line text-lg text-primary-600"></i>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground-900">{company?.company_name ?? '目标公司'}</p>
                <p className="text-xs text-foreground-500 mt-0.5">
                  {totalDepartments} 个部门 · {totalRoles} 个岗位 · {totalPeople} 位人才
                  {company?.industry ? ` · ${company.industry}` : ''}
                </p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded bg-primary-100 text-primary-700 flex-shrink-0">公司</span>
            </div>

            {/* 分支连接线 */}
            <div className="ml-5 border-l-2 border-primary-200 h-4"></div>

            {draft.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-foreground-500">还没有部门，点下方「新增部门」开始搭建地图。</p>
              </div>
            ) : (
              <div className="space-y-2">
                {draft.map((department, deptIndex) => {
                  const isCollapsed = collapsed.has(deptIndex);
                  return (
                    <div key={deptIndex}>
                      {/* 部门节点 */}
                      <div className="flex items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(deptIndex)}
                          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
                          aria-label={isCollapsed ? '展开部门' : '收起部门'}
                        >
                          <i className={`ri-arrow-down-s-line transition-transform ${isCollapsed ? '-rotate-90' : ''}`}></i>
                        </button>
                        {editing?.kind === 'dept' && editing.dept === deptIndex ? (
                          <input
                            autoFocus
                            type="text"
                            value={department.name}
                            onChange={(e) => updateDepartment(deptIndex, { name: e.target.value })}
                            onBlur={() => setEditing(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null); }}
                            placeholder="部门名称"
                            className={inputClass}
                          />
                        ) : (
                          <span className="text-sm font-bold text-foreground-900 min-w-0">
                            {department.name.trim() || '未命名部门'}
                          </span>
                        )}
                        <span className="text-xs text-foreground-400">
                          {department.roles.filter((role) => role.title.trim()).length} 个岗位 · {departmentPeopleCount(department)} 人
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: 'dept', dept: deptIndex })}
                            className={iconBtnClass}
                          >
                            <i className="ri-pencil-line"></i>改名
                          </button>
                          <button
                            type="button"
                            onClick={() => addRole(deptIndex)}
                            className={iconBtnClass}
                          >
                            <i className="ri-add-line"></i>新增岗位
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDepartment(deptIndex)}
                            className={dangerBtnClass}
                          >
                            <i className="ri-delete-bin-line"></i>删除部门
                          </button>
                        </span>
                      </div>

                      {/* 岗位 + 候选人 */}
                      {!isCollapsed && (
                        <div className="ml-5 border-l-2 border-background-200 pl-5 space-y-2 mt-1.5">
                          {department.roles.map((role, roleIndex) => {
                            const people = rolePeople(department, role);
                            return (
                              <div key={roleIndex}>
                                <div className="flex items-center gap-2 rounded-lg border border-background-100 bg-background-50 px-3 py-2">
                                  <span className="w-2 h-2 rounded-full bg-primary-300 flex-shrink-0"></span>
                                  {editing?.kind === 'role' && editing.dept === deptIndex && editing.role === roleIndex ? (
                                    <input
                                      autoFocus
                                      type="text"
                                      value={role.title}
                                      onChange={(e) => updateRole(deptIndex, roleIndex, { title: e.target.value })}
                                      onBlur={() => setEditing(null)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(null); }}
                                      placeholder="岗位名称"
                                      className={inputClass}
                                    />
                                  ) : (
                                    <span className="text-sm font-semibold text-foreground-900">
                                      {role.title.trim() || '未命名岗位'}
                                    </span>
                                  )}
                                  <span className="text-xs text-foreground-400">{people.length} 人</span>
                                  <span className="ml-auto flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditing({ kind: 'role', dept: deptIndex, role: roleIndex })}
                                      className={iconBtnClass}
                                    >
                                      <i className="ri-pencil-line"></i>改名
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onAddPerson(department.name.trim() || '未分部门', role.title.trim() || '待补充岗位')}
                                      className={iconBtnClass}
                                    >
                                      <i className="ri-user-add-line"></i>录入人才
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeRole(deptIndex, roleIndex)}
                                      className={dangerBtnClass}
                                    >
                                      <i className="ri-delete-bin-line"></i>删除岗位
                                    </button>
                                  </span>
                                </div>

                                {/* 候选人节点 */}
                                {people.length > 0 && (
                                  <div className="ml-5 border-l border-background-200 pl-5 mt-1.5 flex flex-wrap gap-2">
                                    {people.map((person) => (
                                      <button
                                        key={person.id}
                                        type="button"
                                        onClick={() => onEditPerson(person)}
                                        className="flex items-center gap-2 rounded-lg border border-background-200 bg-white px-3 py-1.5 text-left transition-colors cursor-pointer hover:border-primary-300"
                                      >
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(person.contact_status)}`}></span>
                                        <span className="text-xs font-medium text-foreground-800">{person.name}</span>
                                        <span className="text-[10px] text-foreground-400">
                                          {person.level || '职级待补充'}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={addDepartment}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <i className="ri-add-line"></i>
                新增部门
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-background-100">
            <p className="text-xs text-foreground-400">
              改名 / 新增 / 删除会在点「保存组织结构」后生效；已录入人才不会因改名或删除丢失。
            </p>
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
