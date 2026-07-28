import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { settingsApi } from '@/features/settings/api';
import type { AdminRole, AdminUser, OrganizationSettings, OrganizationSettingsConfig } from '@/features/settings/types';
import { useToast } from '@/hooks/useToast';

const roles: Array<{ id: AdminRole; name: string; description: string }> = [
  { id: 'recruiter', name: '招聘专员', description: '维护需求、候选人、面试和 Offer 日常工作。' },
  { id: 'interviewer', name: '面试官', description: '只查看分配给自己的业务筛选和面试任务。' },
  { id: 'manager', name: '招聘主管', description: '审核需求、确认或退回 Offer，并查看团队进展。' },
  { id: 'admin', name: '管理员', description: '管理账号与组织设置，拥有系统范围管理权限。' },
];

const emptyConfig: OrganizationSettingsConfig = { company_name: '', system_name: '智聘', default_recruitment_cycle_days: 30, offer_validity_days: 14, departments: [] };
const emptyUser = { name: '', email: '', password: '', role: 'recruiter' as AdminRole, department: '' };

function UserEditor({ user, departments, onClose, onSaved }: { user: AdminUser | null; departments: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(user ? { name: user.name, email: user.email, password: '', role: user.role, department: user.department } : emptyUser);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (user) await settingsApi.updateUser(user.id, { name: draft.name, role: draft.role, department: draft.department });
      else await settingsApi.createUser(draft);
      await onSaved(); onClose(); showToast(user ? '账号信息已保存' : '账号已创建');
    } catch (cause) { showToast(cause instanceof Error ? cause.message : '保存失败'); } finally { setSaving(false); }
  };
  return <><div className="fixed inset-0 z-[100] bg-foreground-900/40" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={user ? '编辑用户' : '添加用户'} className="fixed left-1/2 top-1/2 z-[110] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">{user ? '编辑用户' : '添加用户'}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm">姓名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">邮箱<input disabled={Boolean(user)} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-background-100" /></label>{!user && <label className="text-sm">初始密码<input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>}<label className="text-sm">部门<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">未设置</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm">角色<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })} className="mt-1 w-full rounded-lg border px-3 py-2">{roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">取消</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中' : '保存用户'}</button></div></section></>;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [config, setConfig] = useState<OrganizationSettingsConfig>(emptyConfig);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<AdminUser | null | undefined>(undefined);
  const [newDepartment, setNewDepartment] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const [nextSettings, nextUsers] = await Promise.all([settingsApi.getSettings(), settingsApi.listUsers()]); setSettings(nextSettings); setConfig(nextSettings.config); setUsers(nextUsers); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '设置加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const saveConfig = async () => {
    if (!settings) return;
    setSaving(true);
    try { const saved = await settingsApi.saveSettings(settings.version, config); setSettings(saved); setConfig(saved.config); showToast('组织设置已保存，刷新后仍会保留'); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 409) await load(); showToast(cause instanceof Error ? cause.message : '保存失败'); }
    finally { setSaving(false); }
  };
  const roleUsers = useMemo(() => users.filter((user) => user.is_active), [users]);
  const tabs = [['general', '通用设置'], ['users', '用户管理'], ['roles', '角色权限'], ['departments', '部门配置'], ['pipeline', '流程配置']];
  const addDepartment = () => { const value = newDepartment.trim(); if (!value || config.departments.includes(value)) return; setConfig({ ...config, departments: [...config.departments, value] }); setNewDepartment(''); };
  return <div className="max-w-5xl space-y-5 p-6"><div><h1 className="text-2xl font-bold text-foreground-900">系统设置</h1><p className="mt-1 text-sm text-foreground-500">组织基础参数、账号和后端安全规则</p></div>{error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重新加载</button></div>}<div className="flex gap-1 overflow-x-auto border-b border-background-200">{tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${activeTab === id ? 'border-primary-500 text-primary-600' : 'border-transparent text-foreground-500'}`}>{label}</button>)}</div>{loading ? <div className="rounded-xl border bg-white px-5 py-12 text-center text-sm text-foreground-500">正在读取真实组织设置...</div> : settings && <>
    {activeTab === 'general' && <section className="space-y-5 rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">企业信息</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">企业名称<input value={config.company_name} onChange={(event) => setConfig({ ...config, company_name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">系统名称<input value={config.system_name} onChange={(event) => setConfig({ ...config, system_name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">默认招聘周期（天）<input type="number" min="1" value={config.default_recruitment_cycle_days} onChange={(event) => setConfig({ ...config, default_recruitment_cycle_days: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Offer 有效期（天）<input type="number" min="1" value={config.offer_validity_days} onChange={(event) => setConfig({ ...config, offer_validity_days: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><p className="text-xs text-foreground-400">版本 {settings.version} · 最近由 {settings.updated_by_name || '尚未保存'} 更新</p><div className="flex justify-end"><button type="button" onClick={() => void saveConfig()} disabled={saving} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中' : '保存设置'}</button></div></section>}
    {activeTab === 'users' && <section className="overflow-hidden rounded-xl border border-background-200 bg-white"><header className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-semibold">成员列表</h2><button type="button" onClick={() => setEditor(null)} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white">添加用户</button></header><table className="w-full text-left text-sm"><thead className="bg-background-50 text-xs text-foreground-500"><tr><th className="px-5 py-3">姓名</th><th>部门</th><th>角色</th><th>状态</th><th className="px-5 text-right">操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t"><td className="px-5 py-3"><p>{user.name}</p><p className="text-xs text-foreground-400">{user.email}</p></td><td>{user.department || '未设置'}</td><td>{roles.find((item) => item.id === user.role)?.name || user.role}</td><td>{user.is_active ? '启用' : '已停用'}</td><td className="px-5 text-right"><button type="button" onClick={() => setEditor(user)} className="text-primary-700">编辑</button></td></tr>)}</tbody></table></section>}
    {activeTab === 'roles' && <section className="space-y-3">{roles.map((role) => <article key={role.id} className="rounded-xl border border-background-200 bg-white p-5"><h2 className="font-semibold">{role.name}</h2><p className="mt-1 text-sm text-foreground-500">{role.description}</p><p className="mt-3 text-xs text-primary-700">后端角色规则负责实际权限控制；此页不提供会失效的临时勾选开关。</p></article>)}</section>}
    {activeTab === 'departments' && <section className="rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">部门列表</h2><div className="mt-4 flex gap-2"><input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="输入部门名称" className="w-full rounded-lg border px-3 py-2 text-sm" /><button type="button" onClick={addDepartment} className="rounded-lg border border-primary-300 px-3 text-sm text-primary-700">添加</button></div><div className="mt-4 divide-y">{config.departments.map((department) => <div key={department} className="flex items-center justify-between py-3 text-sm"><span>{department}</span><button type="button" onClick={() => setConfig({ ...config, departments: config.departments.filter((item) => item !== department) })} className="text-red-600">移除</button></div>)}</div><div className="mt-5 flex justify-end"><button type="button" onClick={() => void saveConfig()} disabled={saving} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white">保存部门</button></div></section>}
    {activeTab === 'pipeline' && <section className="rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">招聘流程阶段</h2><p className="mt-2 text-sm text-foreground-500">核心招聘流程由后端状态机保护，不能在这里临时重排，以免候选人、面试、Offer 和 HC 数据失去一致性。</p><div className="mt-5 flex flex-wrap gap-2">{['待筛选', 'AI 初筛', '业务筛选', '面试', 'Offer', '已入职 / 淘汰'].map((item) => <span key={item} className="rounded-lg bg-background-100 px-3 py-2 text-sm">{item}</span>)}</div></section>}
  </>}{editor !== undefined && <UserEditor user={editor} departments={config.departments} onClose={() => setEditor(undefined)} onSaved={load} />}</div>;
}
