import RowActionMenu, { type RowActionItem } from '@/components/ui/RowActionMenu';
import type { AdminRole, AdminUser } from '@/features/settings/types';

interface UserManagementSectionProps {
  users: AdminUser[];
  roles: Array<{ id: AdminRole; name: string }>;
  currentUserId: number | null;
  busyUserId: number | null;
  onAdd: () => void;
  onEditProfile: (user: AdminUser) => void;
  onEditAccess: (user: AdminUser) => void;
  onViewDetails: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
}

export default function UserManagementSection({
  users,
  roles,
  currentUserId,
  busyUserId,
  onAdd,
  onEditProfile,
  onEditAccess,
  onViewDetails,
  onResetPassword,
  onToggleActive,
}: UserManagementSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-background-200 bg-white">
      <header className="flex items-center justify-between border-b border-background-200 px-5 py-4">
        <h2 className="font-semibold">成员列表</h2>
        <button type="button" onClick={onAdd} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600">添加用户</button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-background-50 text-xs text-foreground-500">
            <tr><th className="px-5 py-3">姓名</th><th>部门</th><th>角色</th><th>状态</th><th className="px-5 text-right">操作</th></tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const menuItems: RowActionItem[] = [
                { key: 'details', label: '查看成员详情', icon: <i className="ri-user-line" />, onSelect: () => onViewDetails(user) },
                { key: 'access', label: '调整角色与部门', icon: <i className="ri-user-settings-line" />, onSelect: () => onEditAccess(user) },
                { key: 'password', label: '重置密码', icon: <i className="ri-lock-password-line" />, dividerBefore: true, onSelect: () => onResetPassword(user) },
                ...(user.id === currentUserId ? [] : [{
                  key: 'active',
                  label: user.is_active ? '停用账号' : '启用账号',
                  icon: <i className={user.is_active ? 'ri-user-unfollow-line' : 'ri-user-follow-line'} />,
                  tone: user.is_active ? 'danger' : 'default',
                  disabled: busyUserId === user.id,
                  onSelect: () => onToggleActive(user),
                } satisfies RowActionItem]),
              ];
              return (
                <tr key={user.id} className="border-t border-background-100 hover:bg-background-50/60">
                  <td className="px-5 py-3"><p className="font-medium text-foreground-900">{user.name}</p><p className="mt-0.5 text-xs text-foreground-400">{user.email}</p></td>
                  <td>{user.department || '未设置'}</td>
                  <td>{roles.find((item) => item.id === user.role)?.name || user.role}</td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs font-medium ${user.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-background-200 bg-background-100 text-foreground-500'}`}>{user.is_active ? '启用' : '已停用'}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => onEditProfile(user)} className="inline-flex h-8 items-center rounded-lg border border-primary-200 bg-white px-3 text-xs font-medium text-primary-700 hover:bg-primary-50">编辑资料</button>
                      <RowActionMenu ariaLabel={`打开${user.name}的账号操作`} items={menuItems} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
