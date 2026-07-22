// Readdy 最终应用外壳：只负责真实用户、真实权限、真实通知和正式路由。

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  Briefcase,
  Check,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  PanelLeft,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { navItemsForRole, navLabelForRole, type NavItem } from '../lib/nav';
import { usePermissions } from '../lib/permissions';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/formatDate';
import { AccountSettings } from './AccountSettings';
import { AgentChatProvider } from '../lib/agentChat';
import type { NotificationItem, Role } from '../types';

const ROLE_LABELS: Record<Role, string> = {
  recruiter: '招聘专员',
  manager: '招聘主管',
  admin: '系统管理员',
  interviewer: '面试官',
};

function initials(name: string): string {
  const cleaned = name.trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : '?';
}

function isPathActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isNavItemActive(item: NavItem, pathname: string, defaultActive: boolean): boolean {
  return defaultActive || (item.activePaths ?? []).some((path) => isPathActive(pathname, path));
}

export function AppShell() {
  const { name, role, logout } = useAuth();
  const { hasMenu } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const items = (role ? navItemsForRole(role) : []).filter((item) => hasMenu(item.menuCode));
  const activeItem = items.find((item) => isNavItemActive(item, location.pathname, isPathActive(location.pathname, item.to)));
  const activeLabel = activeItem ? navLabelForRole(activeItem, role) : '工作台';
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const result = await api.getNotifications(1, 8);
      setNotifications(result.notifications);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : '通知加载失败');
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setAccountOpen(false);
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!accountOpen && !notificationOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
      if (!notificationRef.current?.contains(target)) setNotificationOpen(false);
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [accountOpen, notificationOpen]);

  async function markNotificationRead(notification: NotificationItem) {
    if (!notification.is_read) {
      await api.markNotificationsRead([notification.id]);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    }
    setNotificationOpen(false);
    if (notification.link) navigate(notification.link);
  }

  async function markAllNotificationsRead() {
    await api.markNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div data-ui="readdy-shell" className="flex min-h-screen bg-[#fbfaf7] text-[#292b2a]">
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-40 bg-black/35 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#ebeae5] bg-white transition-all duration-300 motion-reduce:transition-none lg:static',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed ? 'w-20' : 'w-56',
        )}
      >
        <div className={cn('flex h-16 items-center gap-3 border-b border-[#ebeae5] px-5', sidebarCollapsed && 'justify-center px-2')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#3d7b6b] text-white">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </span>
          {!sidebarCollapsed && <span className="text-base font-bold tracking-wide">智聘</span>}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="主导航">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={sidebarCollapsed ? navLabelForRole(item, role) : undefined}
              className={({ isActive }) => cn(
                'flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#b8d6cb]',
                sidebarCollapsed && 'justify-center px-0',
                isNavItemActive(item, location.pathname, isActive)
                  ? 'bg-[#edf6f2] font-medium text-[#24594d]'
                  : 'text-[#626763] hover:bg-[#f7f6f2] hover:text-[#292b2a]',
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
              {!sidebarCollapsed && <span>{navLabelForRole(item, role)}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[#ebeae5] p-2.5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={cn(
              'hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#777b78] transition-colors hover:bg-[#f7f6f2] hover:text-[#292b2a] lg:flex',
              sidebarCollapsed && 'justify-center px-0',
            )}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            {!sidebarCollapsed && <span>收起导航</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#ebeae5] bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-[#626763] hover:bg-[#f7f6f2] lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{activeLabel}</p>
              <p className="hidden truncate text-xs text-[#929590] sm:block">
                {role ? ROLE_LABELS[role] : '账号权限加载中'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div ref={notificationRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationOpen((current) => !current);
                  setAccountOpen(false);
                }}
                className="relative rounded-lg p-2 text-[#626763] transition-colors hover:bg-[#f7f6f2] hover:text-[#292b2a]"
                aria-label={`通知${unreadCount ? `，${unreadCount} 条未读` : ''}`}
                aria-expanded={notificationOpen}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d87751] px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#e4e3dd] bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">通知</p>
                      <p className="mt-0.5 text-xs text-[#8b8f8b]">{unreadCount} 条未读</p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="flex items-center gap-1 text-xs font-medium text-[#3d7b6b] hover:text-[#285e51]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        全部已读
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notificationsLoading && (
                      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-[#8b8f8b]">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        正在加载通知...
                      </div>
                    )}
                    {!notificationsLoading && notificationsError && (
                      <div className="px-4 py-8 text-center">
                        <AlertCircle className="mx-auto h-5 w-5 text-[#c96c4a]" />
                        <p className="mt-2 text-sm text-[#7b5141]">{notificationsError}</p>
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          className="mt-3 text-xs font-medium text-[#3d7b6b]"
                        >
                          重新加载
                        </button>
                      </div>
                    )}
                    {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                      <div className="px-4 py-10 text-center text-sm text-[#8b8f8b]">暂无通知</div>
                    )}
                    {!notificationsLoading && !notificationsError && notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void markNotificationRead(notification)}
                        className={cn(
                          'flex w-full gap-3 border-b border-[#f0efe9] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#faf9f6]',
                          !notification.is_read && 'bg-[#f5faf7]',
                        )}
                      >
                        <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', notification.is_read ? 'bg-[#d8d8d3]' : 'bg-[#3d7b6b]')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{notification.title}</span>
                          {notification.body && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#777b78]">{notification.body}</span>}
                          <span className="mt-1.5 block text-[11px] text-[#a0a39f]">
                            {notification.created_at ? formatDate(notification.created_at) : '刚刚'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <NavLink
                    to="/notifications"
                    className="block border-t border-[#eeede8] px-4 py-3 text-center text-xs font-medium text-[#3d7b6b] hover:bg-[#faf9f6]"
                  >
                    查看全部通知
                  </NavLink>
                </div>
              )}
            </div>

            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((current) => !current);
                  setNotificationOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[#f7f6f2]"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7f2ed] text-sm font-semibold text-[#2d6658]">
                  {initials(name ?? '')}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-32 truncate text-sm font-medium">{name}</span>
                  <span className="block text-[11px] text-[#929590]">{role ? ROLE_LABELS[role] : ''}</span>
                </span>
                <ChevronDown className={cn('hidden h-4 w-4 text-[#929590] transition-transform sm:block', accountOpen && 'rotate-180')} />
              </button>

              {accountOpen && (
                <div role="menu" className="absolute right-0 top-11 z-50 w-52 rounded-xl border border-[#e4e3dd] bg-white p-2 shadow-xl">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      setShowAccountSettings(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#626763] hover:bg-[#f7f6f2] hover:text-[#292b2a]"
                  >
                    <KeyRound className="h-4 w-4" />
                    修改密码
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#b6533b] hover:bg-[#fff4ef]"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {showAccountSettings && <AccountSettings onClose={() => setShowAccountSettings(false)} />}

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {role === 'interviewer' ? <Outlet /> : (
            <AgentChatProvider>
              <Outlet />
            </AgentChatProvider>
          )}
        </main>
      </div>

      {mobileMenuOpen && (
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed left-[13.5rem] top-3 z-[60] rounded-lg bg-white p-2 text-[#626763] shadow lg:hidden"
          aria-label="关闭菜单"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
