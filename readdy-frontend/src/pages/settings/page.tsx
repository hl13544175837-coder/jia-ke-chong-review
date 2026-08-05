import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useCompanyAuth } from '@/auth/companyAuth';
import { settingsApi } from '@/features/settings/api';
import type { AdminRole, AdminUser, OrganizationSettings, OrganizationSettingsConfig } from '@/features/settings/types';
import { useToast } from '@/hooks/useToast';
import PageHeader from '@/components/ui/PageHeader';
import WorkspaceTabs from '@/components/ui/WorkspaceTabs';
import UserManagementSection from './components/UserManagementSection';

type SettingsTab = 'general' | 'users' | 'roles' | 'departments' | 'pipeline';

const roles: Array<{ id: AdminRole; name: string; description: string }> = [
  { id: 'recruiter', name: '招聘专员', description: '维护需求、候选人、面试和 Offer 日常工作。' },
  { id: 'interviewer', name: '面试官', description: '只查看分配给自己的业务筛选和面试任务。' },
  { id: 'manager', name: '招聘主管', description: '审核需求、确认或退回 Offer，并查看团队进展。' },
  { id: 'admin', name: '管理员', description: '管理账号与组织设置，拥有系统范围管理权限。' },
];

const emptyConfig: OrganizationSettingsConfig = { company_name: '', system_name: '智聘', default_recruitment_cycle_days: 30, offer_validity_days: 14, departments: [] };
const emptyUser = { name: '', email: '', password: '', role: 'recruiter' as AdminRole, department: '' };

function UserEditor({ user, mode, departments, onClose, onSaved }: { user: AdminUser | null; mode: 'create' | 'profile' | 'access'; departments: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState(user ? { name: user.name, email: user.email, password: '', role: user.role, department: user.department } : emptyUser);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (user && mode === 'profile') await settingsApi.updateUser(user.id, { name: draft.name });
      else if (user) await settingsApi.updateUser(user.id, { role: draft.role, department: draft.department });
      else await settingsApi.createUser(draft);
      await onSaved(); onClose(); showToast(user ? '账号信息已保存' : '账号已创建');
    } catch (cause) { showToast(cause instanceof Error ? cause.message : '保存失败'); } finally { setSaving(false); }
  };
  const title = mode === 'create' ? '添加用户' : mode === 'profile' ? '编辑成员资料' : '调整角色与部门';
  return <><div className="fixed inset-0 z-[250] bg-foreground-900/40" onClick={saving ? undefined : onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="fixed left-1/2 top-1/2 z-[260] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-foreground-500">{user?.email || '创建新的组织成员账号'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{mode !== 'access' && <label className="text-sm">姓名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>}{mode === 'create' && <><label className="text-sm">邮箱<input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">初始密码<input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></>}{mode !== 'profile' && <><label className="text-sm">部门<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">未设置</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm">角色<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })} className="mt-1 w-full rounded-lg border px-3 py-2">{roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}</div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">取消</button><button type="button" onClick={() => void save()} disabled={saving || (mode === 'create' && (!draft.name.trim() || !draft.email.trim() || draft.password.length < 6)) || (mode === 'profile' && !draft.name.trim())} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中' : '确认保存'}</button></div></section></>;
}

function UserDetailsDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const roleLabel = roles.find((item) => item.id === user.role)?.name || user.role;
  return <><div className="fixed inset-0 z-[250] bg-foreground-900/40" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label="成员详情" className="fixed left-1/2 top-1/2 z-[260] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">成员详情</h2><dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-background-50 p-4 text-sm"><div><dt className="text-xs text-foreground-400">姓名</dt><dd className="mt-1 font-medium">{user.name}</dd></div><div><dt className="text-xs text-foreground-400">状态</dt><dd className="mt-1">{user.is_active ? '启用' : '已停用'}</dd></div><div className="col-span-2"><dt className="text-xs text-foreground-400">邮箱</dt><dd className="mt-1">{user.email}</dd></div><div><dt className="text-xs text-foreground-400">角色</dt><dd className="mt-1">{roleLabel}</dd></div><div><dt className="text-xs text-foreground-400">部门</dt><dd className="mt-1">{user.department || '未设置'}</dd></div></dl><div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">关闭</button></div></section></>;
}

function ResetPasswordDialog({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const submit = async () => {
    if (password.length < 6) { setFormError('新密码至少 6 位'); return; }
    if (password !== confirmation) { setFormError('两次输入的密码不一致'); return; }
    setSaving(true); setFormError('');
    try { await settingsApi.resetUserPassword(user.id, password); showToast(`${user.name}的密码已重置`); onSaved(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : '重置密码失败'); }
    finally { setSaving(false); }
  };
  return <><div className="fixed inset-0 z-[250] bg-foreground-900/40" onClick={saving ? undefined : onClose} /><section role="dialog" aria-modal="true" aria-label="重置密码" className="fixed left-1/2 top-1/2 z-[260] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">重置密码</h2><p className="mt-1 text-xs text-foreground-500">{user.name} · {user.email}；保存后旧登录会立即失效。</p><div className="mt-5 space-y-3"><label className="block text-sm">新密码<input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setFormError(''); }} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="block text-sm">再次输入<input type="password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setFormError(''); }} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>{formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}</div><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">取消</button><button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '正在重置...' : '确认重置'}</button></div></section></>;
}

function AccountStatusDialog({ user, busy, error, onClose, onConfirm }: { user: AdminUser; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const nextLabel = user.is_active ? '停用' : '启用';
  return <><div className="fixed inset-0 z-[250] bg-foreground-900/40" onClick={busy ? undefined : onClose} /><section role="dialog" aria-modal="true" aria-label={`${nextLabel}账号`} className="fixed left-1/2 top-1/2 z-[260] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold">{nextLabel}账号</h2><p className="mt-3 text-sm leading-6 text-foreground-600">{user.is_active ? `停用后，${user.name}将无法继续登录，现有登录也会失效。` : `启用后，${user.name}可以恢复登录并按当前角色工作。`}</p>{error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">取消</button><button type="button" disabled={busy} onClick={onConfirm} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${user.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-500 hover:bg-primary-600'}`}>{busy ? '正在处理...' : `确认${nextLabel}`}</button></div></section></>;
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const { userId } = useCompanyAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [config, setConfig] = useState<OrganizationSettingsConfig>(emptyConfig);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<AdminUser | null | undefined>(undefined);
  const [editorMode, setEditorMode] = useState<'create' | 'profile' | 'access'>('create');
  const [detailsUser, setDetailsUser] = useState<AdminUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [statusUser, setStatusUser] = useState<AdminUser | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState('');
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
  const tabs: ReadonlyArray<{ key: SettingsTab; label: string }> = [{ key: 'general', label: '通用设置' }, { key: 'users', label: '用户管理' }, { key: 'roles', label: '角色权限' }, { key: 'departments', label: '部门配置' }, { key: 'pipeline', label: '流程配置' }];
  const addDepartment = () => { const value = newDepartment.trim(); if (!value || config.departments.includes(value)) return; setConfig({ ...config, departments: [...config.departments, value] }); setNewDepartment(''); };
  const toggleAccountStatus = async () => {
    if (!statusUser || busyUserId) return;
    setBusyUserId(statusUser.id); setStatusError('');
    try {
      await settingsApi.updateUser(statusUser.id, { is_active: !statusUser.is_active });
      showToast(statusUser.is_active ? '账号已停用' : '账号已启用');
      setStatusUser(null);
      await load();
    } catch (cause) { setStatusError(cause instanceof Error ? cause.message : '账号状态更新失败'); }
    finally { setBusyUserId(null); }
  };
  return <div className="max-w-5xl space-y-5 p-6"><PageHeader title="系统设置" visuallyHiddenTitle description="组织基础参数、账号和后端安全规则" />{error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重新加载</button></div>}<WorkspaceTabs<SettingsTab> items={tabs} value={activeTab} onChange={setActiveTab} ariaLabel="系统设置分类" />{loading ? <div className="rounded-xl border bg-white px-5 py-12 text-center text-sm text-foreground-500">正在读取真实组织设置...</div> : settings && <>
    {activeTab === 'general' && <section className="space-y-5 rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">企业信息</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">企业名称<input value={config.company_name} onChange={(event) => setConfig({ ...config, company_name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">系统名称<input value={config.system_name} onChange={(event) => setConfig({ ...config, system_name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">默认招聘周期（天）<input type="number" min="1" value={config.default_recruitment_cycle_days} onChange={(event) => setConfig({ ...config, default_recruitment_cycle_days: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Offer 有效期（天）<input type="number" min="1" value={config.offer_validity_days} onChange={(event) => setConfig({ ...config, offer_validity_days: Number(event.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><p className="text-xs text-foreground-400">版本 {settings.version} · 最近由 {settings.updated_by_name || '尚未保存'} 更新</p><div className="flex justify-end"><button type="button" onClick={() => void saveConfig()} disabled={saving} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? '保存中' : '保存设置'}</button></div></section>}
    {activeTab === 'users' && <UserManagementSection users={users} roles={roles} currentUserId={userId} busyUserId={busyUserId} onAdd={() => { setEditorMode('create'); setEditor(null); }} onEditProfile={(user) => { setEditorMode('profile'); setEditor(user); }} onEditAccess={(user) => { setEditorMode('access'); setEditor(user); }} onViewDetails={setDetailsUser} onResetPassword={setPasswordUser} onToggleActive={(user) => { setStatusError(''); setStatusUser(user); }} />}
    {activeTab === 'roles' && <section className="space-y-3">{roles.map((role) => <article key={role.id} className="rounded-xl border border-background-200 bg-white p-5"><h2 className="font-semibold">{role.name}</h2><p className="mt-1 text-sm text-foreground-500">{role.description}</p><p className="mt-3 text-xs text-primary-700">后端角色规则负责实际权限控制；此页不提供会失效的临时勾选开关。</p></article>)}</section>}
    {activeTab === 'departments' && <section className="rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">部门列表</h2><div className="mt-4 flex gap-2"><input value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} placeholder="输入部门名称" className="w-full rounded-lg border px-3 py-2 text-sm" /><button type="button" onClick={addDepartment} className="rounded-lg border border-primary-300 px-3 text-sm text-primary-700">添加</button></div><div className="mt-4 divide-y">{config.departments.map((department) => <div key={department} className="flex items-center justify-between py-3 text-sm"><span>{department}</span><button type="button" onClick={() => setConfig({ ...config, departments: config.departments.filter((item) => item !== department) })} className="text-red-600">移除</button></div>)}</div><div className="mt-5 flex justify-end"><button type="button" onClick={() => void saveConfig()} disabled={saving} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white">保存部门</button></div></section>}
    {activeTab === 'pipeline' && <section className="rounded-xl border border-background-200 bg-white p-6"><h2 className="font-semibold">招聘流程阶段</h2><p className="mt-2 text-sm text-foreground-500">核心招聘流程由后端状态机保护，不能在这里临时重排，以免候选人、面试、Offer 和 HC 数据失去一致性。</p><div className="mt-5 flex flex-wrap gap-2">{['待筛选', 'AI 初筛', '业务筛选', '面试', 'Offer', '已入职 / 淘汰'].map((item) => <span key={item} className="rounded-lg bg-background-100 px-3 py-2 text-sm">{item}</span>)}</div></section>}
  </>}{editor !== undefined && <UserEditor user={editor} mode={editorMode} departments={config.departments} onClose={() => setEditor(undefined)} onSaved={load} />}{detailsUser && <UserDetailsDialog user={detailsUser} onClose={() => setDetailsUser(null)} />}{passwordUser && <ResetPasswordDialog user={passwordUser} onClose={() => setPasswordUser(null)} onSaved={() => setPasswordUser(null)} />}{statusUser && <AccountStatusDialog user={statusUser} busy={busyUserId === statusUser.id} error={statusError} onClose={() => { if (!busyUserId) { setStatusUser(null); setStatusError(''); } }} onConfirm={() => void toggleAccountStatus()} />}</div>;
}
