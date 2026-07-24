import { useState } from 'react';
import { useToast } from '@/hooks/useToast';

interface DemoUser {
  name: string;
  email: string;
  dept: string;
  role: string;
  status: 'active' | 'disabled';
}

const initialUsers: DemoUser[] = [
  { name: '张三', email: 'zhangsan@company.com', dept: '人力资源部', role: '招聘主管', status: 'active' },
  { name: '招聘专员01', email: 'recruiter01@company.com', dept: '人力资源部', role: '招聘专员', status: 'active' },
  { name: '招聘专员02', email: 'recruiter02@company.com', dept: '人力资源部', role: '招聘专员', status: 'active' },
  { name: '系统管理员', email: 'admin@company.com', dept: 'IT部', role: '管理员', status: 'active' },
  { name: '李明', email: 'liming@company.com', dept: '技术研发部', role: '面试官', status: 'active' },
];

const initialDepartments = ['技术研发部', '产品部', '设计部', '数据部', '市场部', '人力资源部', '财务部', '运营部'];
const roles = [
  { id: 'recruiter', name: '招聘专员', description: '发布岗位、筛选简历、安排面试' },
  { id: 'interviewer', name: '面试官', description: '查看面试任务、提交面试反馈' },
  { id: 'manager', name: '招聘主管', description: '审批需求、查看团队进度、数据看板' },
  { id: 'admin', name: '管理员', description: '系统配置、角色权限、全部数据可见' },
];
const permissionOptions = ['查看候选人', '编辑候选人', '管理招聘需求', '安排面试', '处理 Offer', '查看数据看板', '系统设置'];
const initialStages = [
  { name: '待筛选', color: 'bg-secondary-400' },
  { name: '初筛通过', color: 'bg-primary-400' },
  { name: '面试中', color: 'bg-accent-400' },
  { name: '终面', color: 'bg-accent-500' },
  { name: '已发Offer', color: 'bg-primary-500' },
  { name: '已入职', color: 'bg-primary-600' },
  { name: '已淘汰', color: 'bg-background-400' },
];

const emptyUser: DemoUser = { name: '', email: '', dept: '人力资源部', role: '招聘专员', status: 'active' };

export default function SettingsPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [companyName, setCompanyName] = useState('智聘科技有限公司');
  const [systemName, setSystemName] = useState('智聘');
  const [defaultCycle, setDefaultCycle] = useState(30);
  const [offerValidity, setOfferValidity] = useState(7);
  const [savedSummary, setSavedSummary] = useState('');
  const [users, setUsers] = useState(initialUsers);
  const [userEditor, setUserEditor] = useState<{ index: number | null; draft: DemoUser } | null>(null);
  const [userMenuIndex, setUserMenuIndex] = useState<number | null>(null);
  const [departments, setDepartments] = useState(initialDepartments);
  const [departmentEditor, setDepartmentEditor] = useState<{ index: number | null; name: string } | null>(null);
  const [permissionRole, setPermissionRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({
    recruiter: ['查看候选人', '编辑候选人', '管理招聘需求', '安排面试', '处理 Offer'],
    interviewer: ['查看候选人', '安排面试'],
    manager: permissionOptions.filter((permission) => permission !== '系统设置'),
    admin: [...permissionOptions],
  });
  const [stages, setStages] = useState(initialStages);

  const tabs = [
    { id: 'general', label: '通用设置' },
    { id: 'users', label: '用户管理' },
    { id: 'roles', label: '角色权限' },
    { id: 'departments', label: '部门配置' },
    { id: 'pipeline', label: '流程配置' },
  ];

  const saveGeneral = () => {
    const summary = `${companyName} · ${systemName} · 招聘周期 ${defaultCycle} 天 · Offer ${offerValidity} 天`;
    setSavedSummary(summary);
    showToast('设置已保存到当前演示状态');
  };

  const saveUser = () => {
    if (!userEditor) return;
    if (!userEditor.draft.name.trim() || !userEditor.draft.email.trim()) {
      showToast('请填写姓名和邮箱');
      return;
    }
    setUsers((previous) => {
      if (userEditor.index === null) return [...previous, userEditor.draft];
      return previous.map((user, index) => index === userEditor.index ? userEditor.draft : user);
    });
    showToast(userEditor.index === null ? '用户已添加' : '用户信息已更新');
    setUserEditor(null);
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages((previous) => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    showToast('流程顺序已更新');
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground-900">系统设置</h1>
        <p className="text-sm text-foreground-500 mt-1">配置招聘系统的基本参数、用户权限和工作流程</p>
      </div>

      <div className="flex items-center gap-1 border-b border-background-200">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id ? 'text-primary-600 border-primary-500' : 'text-foreground-500 border-transparent hover:text-foreground-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="bg-white rounded-xl border border-background-200 p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground-900">企业信息</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-medium text-foreground-700">企业名称<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-1 w-full px-3 py-2 bg-background-100 border border-background-200 rounded-lg text-sm" /></label>
              <label className="text-sm font-medium text-foreground-700">系统名称<input value={systemName} onChange={(event) => setSystemName(event.target.value)} className="mt-1 w-full px-3 py-2 bg-background-100 border border-background-200 rounded-lg text-sm" /></label>
            </div>
          </div>
          <div className="pt-4 border-t border-background-100 space-y-4">
            <h3 className="text-base font-semibold text-foreground-900">招聘设置</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-medium text-foreground-700">默认招聘周期（天）<input type="number" min={1} value={defaultCycle} onChange={(event) => setDefaultCycle(Number(event.target.value))} className="mt-1 w-full px-3 py-2 bg-background-100 border border-background-200 rounded-lg text-sm" /></label>
              <label className="text-sm font-medium text-foreground-700">Offer 有效期（天）<input type="number" min={1} value={offerValidity} onChange={(event) => setOfferValidity(Number(event.target.value))} className="mt-1 w-full px-3 py-2 bg-background-100 border border-background-200 rounded-lg text-sm" /></label>
            </div>
          </div>
          {savedSummary && <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">当前演示配置：{savedSummary}</p>}
          <div className="flex justify-end"><button onClick={saveGeneral} className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg cursor-pointer">保存设置</button></div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-background-200 overflow-visible">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground-900">用户列表</h3>
            <button onClick={() => setUserEditor({ index: null, draft: { ...emptyUser } })} className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"><i className="ri-add-line"></i> 添加用户</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-background-200">{['姓名', '邮箱', '部门', '角色', '状态', '操作'].map((heading) => <th key={heading} className="text-left px-5 py-3 text-xs font-medium text-foreground-500">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-background-100">
                {users.map((user, index) => (
                  <tr key={`${user.email}-${index}`} className="hover:bg-background-50/50">
                    <td className="px-5 py-3.5 text-sm font-medium text-foreground-900">{user.name}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{user.email}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-600">{user.dept}</td>
                    <td className="px-5 py-3.5 text-sm text-foreground-700">{user.role}</td>
                    <td className="px-5 py-3.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.status === 'active' ? 'bg-primary-50 text-primary-700' : 'bg-background-200 text-foreground-500'}`}>{user.status === 'active' ? '正常' : '停用'}</span></td>
                    <td className="relative px-5 py-3.5">
                      <button aria-label={`用户操作：${user.name}`} onClick={() => setUserMenuIndex(userMenuIndex === index ? null : index)} className="h-8 w-8 rounded-lg text-foreground-400 hover:bg-background-100 hover:text-foreground-700 cursor-pointer"><i className="ri-more-2-line"></i></button>
                      {userMenuIndex === index && (
                        <div className="absolute right-5 top-11 z-20 w-32 rounded-lg border border-background-200 bg-white p-1 shadow-lg">
                          <button onClick={() => { setUserEditor({ index, draft: { ...user } }); setUserMenuIndex(null); }} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-background-50 cursor-pointer">编辑用户</button>
                          <button onClick={() => { setUsers((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, status: item.status === 'active' ? 'disabled' : 'active' } : item)); setUserMenuIndex(null); showToast(user.status === 'active' ? '用户已停用' : '用户已启用'); }} className="w-full rounded px-3 py-2 text-left text-sm hover:bg-background-50 cursor-pointer">{user.status === 'active' ? '停用用户' : '启用用户'}</button>
                          <button onClick={() => { setUsers((previous) => previous.filter((_, itemIndex) => itemIndex !== index)); setUserMenuIndex(null); showToast('用户已从演示列表删除'); }} className="w-full rounded px-3 py-2 text-left text-sm text-accent-600 hover:bg-accent-50 cursor-pointer">删除用户</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-4">{roles.map((role) => <div key={role.id} className="bg-white rounded-xl border border-background-200 p-5"><div className="flex items-center justify-between"><div><h3 className="text-base font-semibold text-foreground-900">{role.name}</h3><p className="text-sm text-foreground-500 mt-0.5">{role.description}</p><p className="mt-2 text-xs text-primary-600">已配置 {permissions[role.id].length} 项权限</p></div><button onClick={() => setPermissionRole(role.id)} className="px-3 py-1.5 bg-background-100 hover:bg-background-200 text-sm text-foreground-600 rounded-lg cursor-pointer">配置权限</button></div></div>)}</div>
      )}

      {activeTab === 'departments' && (
        <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between"><h3 className="text-base font-semibold text-foreground-900">部门列表</h3><button onClick={() => setDepartmentEditor({ index: null, name: '' })} className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"><i className="ri-add-line"></i> 添加部门</button></div>
          <div className="divide-y divide-background-100">{departments.map((department, index) => <div key={`${department}-${index}`} className="px-5 py-3.5 flex items-center justify-between hover:bg-background-50/50"><span className="text-sm text-foreground-800">{department}</span><div className="flex items-center gap-2"><button aria-label={`编辑部门：${department}`} onClick={() => setDepartmentEditor({ index, name: department })} className="h-8 w-8 rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-600 cursor-pointer"><i className="ri-edit-line"></i></button><button aria-label={`删除部门：${department}`} onClick={() => { setDepartments((previous) => previous.filter((_, itemIndex) => itemIndex !== index)); showToast(`已删除部门：${department}`); }} className="h-8 w-8 rounded text-foreground-400 hover:bg-accent-50 hover:text-accent-600 cursor-pointer"><i className="ri-delete-bin-line"></i></button></div></div>)}</div>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="bg-white rounded-xl border border-background-200 p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground-900">招聘流程阶段</h3>
          <div className="space-y-3">{stages.map((stage, index) => <div key={stage.name} className="flex items-center gap-4"><div className={`w-3 h-3 rounded-full ${stage.color}`}></div><span className="text-sm font-medium text-foreground-800 w-24">{stage.name}</span><span className="text-xs text-foreground-400">第 {index + 1} 阶段</span><div className="flex-1"></div><div className="flex items-center gap-1"><button aria-label={`上移${stage.name}`} title={index === 0 ? '已经是第一阶段' : '上移阶段'} disabled={index === 0} onClick={() => moveStage(index, -1)} className="w-7 h-7 rounded text-foreground-400 hover:bg-background-100 disabled:opacity-30 cursor-pointer"><i className="ri-arrow-up-line text-xs"></i></button><button aria-label={`下移${stage.name}`} title={index === stages.length - 1 ? '已经是最后阶段' : '下移阶段'} disabled={index === stages.length - 1} onClick={() => moveStage(index, 1)} className="w-7 h-7 rounded text-foreground-400 hover:bg-background-100 disabled:opacity-30 cursor-pointer"><i className="ri-arrow-down-line text-xs"></i></button></div></div>)}</div>
        </div>
      )}

      {userEditor && <Modal title={userEditor.index === null ? '添加用户' : '编辑用户'} onClose={() => setUserEditor(null)}><div className="grid grid-cols-2 gap-3"><label className="text-sm">姓名<input value={userEditor.draft.name} onChange={(event) => setUserEditor({ ...userEditor, draft: { ...userEditor.draft, name: event.target.value } })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">邮箱<input value={userEditor.draft.email} onChange={(event) => setUserEditor({ ...userEditor, draft: { ...userEditor.draft, email: event.target.value } })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">部门<select value={userEditor.draft.dept} onChange={(event) => setUserEditor({ ...userEditor, draft: { ...userEditor.draft, dept: event.target.value } })} className="mt-1 w-full rounded-lg border px-3 py-2">{departments.map((department) => <option key={department}>{department}</option>)}</select></label><label className="text-sm">角色<select value={userEditor.draft.role} onChange={(event) => setUserEditor({ ...userEditor, draft: { ...userEditor.draft, role: event.target.value } })} className="mt-1 w-full rounded-lg border px-3 py-2">{roles.map((role) => <option key={role.id}>{role.name}</option>)}</select></label></div><ModalActions onClose={() => setUserEditor(null)} onConfirm={saveUser} confirmLabel="保存用户" /></Modal>}

      {departmentEditor && <Modal title={departmentEditor.index === null ? '添加部门' : '编辑部门'} onClose={() => setDepartmentEditor(null)}><label className="text-sm">部门名称<input value={departmentEditor.name} onChange={(event) => setDepartmentEditor({ ...departmentEditor, name: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><ModalActions onClose={() => setDepartmentEditor(null)} onConfirm={() => { const name = departmentEditor.name.trim(); if (!name) { showToast('请输入部门名称'); return; } setDepartments((previous) => departmentEditor.index === null ? [...previous, name] : previous.map((department, index) => index === departmentEditor.index ? name : department)); showToast(departmentEditor.index === null ? '部门已添加' : '部门已更新'); setDepartmentEditor(null); }} confirmLabel="保存部门" /></Modal>}

      {permissionRole && <Modal title={`配置权限 · ${roles.find((role) => role.id === permissionRole)?.name}`} onClose={() => setPermissionRole(null)}><div className="grid grid-cols-2 gap-2">{permissionOptions.map((permission) => <label key={permission} className="flex items-center gap-2 rounded-lg border border-background-200 px-3 py-2 text-sm"><input type="checkbox" checked={permissions[permissionRole].includes(permission)} onChange={() => setPermissions((previous) => ({ ...previous, [permissionRole]: previous[permissionRole].includes(permission) ? previous[permissionRole].filter((item) => item !== permission) : [...previous[permissionRole], permission] }))} />{permission}</label>)}</div><ModalActions onClose={() => setPermissionRole(null)} onConfirm={() => { showToast('角色权限已保存'); setPermissionRole(null); }} confirmLabel="保存权限" /></Modal>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <><div className="fixed inset-0 z-[100] bg-foreground-900/40" onClick={onClose}></div><section className="fixed left-1/2 top-1/2 z-[110] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label={title}><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-foreground-900">{title}</h3><button aria-label={`关闭${title}`} onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-background-100 cursor-pointer"><i className="ri-close-line text-xl"></i></button></div>{children}</section></>;
}

function ModalActions({ onClose, onConfirm, confirmLabel }: { onClose: () => void; onConfirm: () => void; confirmLabel: string }) {
  return <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-background-200 px-4 py-2 text-sm hover:bg-background-50 cursor-pointer">取消</button><button onClick={onConfirm} className="rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white hover:bg-primary-600 cursor-pointer">{confirmLabel}</button></div>;
}
