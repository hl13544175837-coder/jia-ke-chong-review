import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useCompanyAuth } from '@/auth/companyAuth';
import { useCompanyPermissions } from '@/auth/companyPermissions';
import { requiredMenuCodeForPath } from '@/auth/companyPagePermissions';
import {
  useProductRole,
} from '@/auth/productRole';
import { homePathForRole, PRODUCT_ROLES, type ProductRole } from '@/auth/productRoleModel';
import { notificationsApi } from '@/features/notifications/api';
import type { NotificationItem } from '@/features/notifications/types';
import {
  memoryKeyForPath,
  safeRememberedHref,
  type PageMemoryEntry,
} from '@/features/navigation/pageMemory';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: ProductRole[];
  menuCode?: string;
}

const recruiterNavItems: NavItem[] = [
  { path: '/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['recruiter'], menuCode: 'index' },
  { path: '/jobs', icon: 'ri-briefcase-line', label: '招聘需求', roles: ['recruiter'], menuCode: 'demands' },
  { path: '/online-resumes', icon: 'ri-chat-history-line', label: '在线简历', roles: ['recruiter'], menuCode: 'candidates' },
  { path: '/candidates', icon: 'ri-file-list-3-line', label: '简历库', roles: ['recruiter'], menuCode: 'candidates' },
  { path: '/interviews', icon: 'ri-calendar-event-line', label: '面试管理', roles: ['recruiter'], menuCode: 'interviews' },
  { path: '/offers', icon: 'ri-mail-send-line', label: 'Offer', roles: ['recruiter'], menuCode: 'pipeline' },
  { path: '/talent-map', icon: 'ri-map-pin-user-line', label: '人才地图', roles: ['recruiter'], menuCode: 'candidates' },
  { path: '/analytics', icon: 'ri-bar-chart-box-line', label: '数据看板', roles: ['recruiter'], menuCode: 'bi' },
];

const managerNavItems: NavItem[] = [
  { path: '/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['manager'], menuCode: 'index' },
  { path: '/jobs', icon: 'ri-briefcase-line', label: '需求审批', roles: ['manager'], menuCode: 'demands' },
  { path: '/analytics', icon: 'ri-bar-chart-box-line', label: '团队进展', roles: ['manager'], menuCode: 'bi' },
  { path: '/candidates', icon: 'ri-file-list-3-line', label: '简历库', roles: ['manager'], menuCode: 'candidates' },
  { path: '/interviews', icon: 'ri-calendar-event-line', label: '面试管理', roles: ['manager'], menuCode: 'interviews' },
  { path: '/offers', icon: 'ri-mail-send-line', label: 'Offer', roles: ['manager'], menuCode: 'pipeline' },
  { path: '/talent-map', icon: 'ri-map-pin-user-line', label: '人才地图', roles: ['manager'], menuCode: 'candidates' },
  { path: '/kpi-standards', icon: 'ri-tune-line', label: '口径配置', roles: ['manager'] },
];

const adminNavItems: NavItem[] = [
  { path: '/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['admin'], menuCode: 'index' },
  { path: '/jobs', icon: 'ri-briefcase-line', label: '招聘需求', roles: ['admin'], menuCode: 'demands' },
  { path: '/candidates', icon: 'ri-file-list-3-line', label: '简历库', roles: ['admin'], menuCode: 'candidates' },
  { path: '/interviews', icon: 'ri-calendar-event-line', label: '面试管理', roles: ['admin'], menuCode: 'interviews' },
  { path: '/offers', icon: 'ri-mail-send-line', label: 'Offer', roles: ['admin'], menuCode: 'pipeline' },
  { path: '/talent-map', icon: 'ri-map-pin-user-line', label: '人才地图', roles: ['admin'], menuCode: 'candidates' },
  { path: '/analytics', icon: 'ri-bar-chart-box-line', label: '数据看板', roles: ['admin'], menuCode: 'bi' },
  { path: '/kpi-standards', icon: 'ri-tune-line', label: '口径配置', roles: ['admin'] },
];

const directorNavItems: NavItem[] = [
  { path: '/director/cockpit', icon: 'ri-dashboard-3-line', label: '管理驾驶舱', roles: ['hr_director'], menuCode: 'bi' },
  { path: '/director/progress', icon: 'ri-bar-chart-grouped-line', label: '招聘进展', roles: ['hr_director'], menuCode: 'bi' },
  { path: '/director/insights', icon: 'ri-organization-chart', label: '人才供需', roles: ['hr_director'], menuCode: 'bi' },
  { path: '/director/approvals', icon: 'ri-shield-check-line', label: '审批与风险', roles: ['hr_director'], menuCode: 'pipeline' },
  { path: '/analytics', icon: 'ri-bar-chart-box-line', label: '数据看板', roles: ['hr_director'], menuCode: 'bi' },
];

const interviewerNavItems: NavItem[] = [
  { path: '/interviewer/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['interviewer'], menuCode: 'index' },
  { path: '/interviewer/jobs', icon: 'ri-briefcase-line', label: '招聘需求', roles: ['interviewer'], menuCode: 'demands' },
  { path: '/interviewer/screening', icon: 'ri-file-search-line', label: '候选人筛选', roles: ['interviewer'], menuCode: 'interviews' },
  { path: '/interviewer/interviews', icon: 'ri-calendar-event-line', label: '我的面试', roles: ['interviewer'], menuCode: 'interviews' },
  { path: '/analytics', icon: 'ri-bar-chart-box-line', label: '数据看板', roles: ['interviewer'], menuCode: 'bi' },
];

const bottomNavItems: NavItem[] = [
  { path: '/settings', icon: 'ri-settings-3-line', label: '系统设置', roles: ['admin'], menuCode: 'settings' },
];

const notificationVisuals: Record<string, { icon: string; color: string }> = {
  business_review: { icon: 'ri-file-search-line', color: 'bg-amber-100 text-amber-700' },
  business_review_assigned: { icon: 'ri-file-search-line', color: 'bg-amber-100 text-amber-700' },
  business_review_decision: { icon: 'ri-checkbox-circle-line', color: 'bg-primary-100 text-primary-700' },
  business_review_decided: { icon: 'ri-checkbox-circle-line', color: 'bg-primary-100 text-primary-700' },
  interview_assignment: { icon: 'ri-calendar-event-line', color: 'bg-sky-100 text-sky-700' },
  interview_feedback: { icon: 'ri-survey-line', color: 'bg-violet-100 text-violet-700' },
};

function notificationVisual(type: string) {
  return notificationVisuals[type] ?? {
    icon: 'ri-notification-3-line',
    color: 'bg-background-100 text-foreground-600',
  };
}

function notificationTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { name, logout } = useCompanyAuth();
  const { role } = useProductRole();
  const { hasMenu, reload: reloadPermissions } = useCompanyPermissions();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const mainScrollRef = useRef<HTMLElement>(null);
  const pageMemoriesRef = useRef<Record<string, PageMemoryEntry>>({});
  const restoreFrameRef = useRef<number | null>(null);
  const currentRole: ProductRole = role ?? 'recruiter';
  const roleInfo = PRODUCT_ROLES.find((item) => item.key === currentRole) || PRODUCT_ROLES[0];
  const displayName = name || roleInfo.label;
  const avatar = name?.trim().charAt(0) || roleInfo.avatar;

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const loadNotifications = useCallback(async () => {
    try {
      const response = await notificationsApi.list(1, 20, { activeOnly: true });
      setNotifications(response.notifications);
    } catch {
      // 通知读取失败不应阻断用户的主流程。
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    window.addEventListener('focus', loadNotifications);
    return () => window.removeEventListener('focus', loadNotifications);
  }, [loadNotifications]);

  // Close menus when clicking outside
  useEffect(() => {
    if (!roleMenuOpen && !notifOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-role-menu]')) setRoleMenuOpen(false);
      if (!target.closest('[data-notif-menu]')) setNotifOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [roleMenuOpen, notifOpen]);

  const roleNavItems = currentRole === 'interviewer'
    ? interviewerNavItems
    : currentRole === 'hr_director'
    ? directorNavItems
    : currentRole === 'manager'
    ? managerNavItems
    : currentRole === 'admin'
    ? adminNavItems
    : recruiterNavItems;
  const navItems = roleNavItems.filter(
    (item) => item.roles.includes(currentRole) && hasMenu(item.menuCode),
  );
  const visibleBottomNavItems = bottomNavItems.filter(
    (item) => item.roles.includes(currentRole) && hasMenu(item.menuCode),
  );
  const requiredMenuCode = requiredMenuCodeForPath(location.pathname);
  const canOpenCurrentPage = !requiredMenuCode || hasMenu(requiredMenuCode);

  const isActive = (path: string) => {
    if (currentRole === 'interviewer' || currentRole === 'hr_director') {
      return location.pathname.startsWith(path);
    }
    if (path === '/interviews') {
      return location.pathname === '/interviews' || location.pathname === '/dashboard/interviews';
    }
    return location.pathname.startsWith(path);
  };

  const rememberCurrentPage = useCallback(() => {
    const memoryKey = memoryKeyForPath(location.pathname);
    if (!memoryKey) return;
    pageMemoriesRef.current[memoryKey] = {
      href: `${location.pathname}${location.search}${location.hash}`,
      scrollTop: mainScrollRef.current?.scrollTop ?? pageMemoriesRef.current[memoryKey]?.scrollTop ?? 0,
    };
  }, [location.hash, location.pathname, location.search]);

  const rememberMainScroll = useCallback(() => {
    rememberCurrentPage();
  }, [rememberCurrentPage]);

  const rememberedNavTarget = (basePath: string) => safeRememberedHref(
    basePath,
    pageMemoriesRef.current[basePath]?.href,
  );

  useEffect(() => {
    rememberCurrentPage();
  }, [rememberCurrentPage]);

  useLayoutEffect(() => {
    const memoryKey = memoryKeyForPath(location.pathname);
    if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current);
    const scrollTop = memoryKey ? pageMemoriesRef.current[memoryKey]?.scrollTop ?? 0 : 0;
    restoreFrameRef.current = requestAnimationFrame(() => {
      if (mainScrollRef.current) mainScrollRef.current.scrollTop = scrollTop;
      restoreFrameRef.current = null;
    });
    return () => {
      if (restoreFrameRef.current !== null) cancelAnimationFrame(restoreFrameRef.current);
    };
  }, [location.pathname]);

  const markRead = async (id: number) => {
    setNotifications((prev) => prev.map((item) => (
      item.id === id ? { ...item, is_read: true } : item
    )));
    try {
      await notificationsApi.markRead([id]);
    } catch {
      void loadNotifications();
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    try {
      await notificationsApi.markRead();
    } catch {
      void loadNotifications();
    }
  };

  const openNotification = (notification: NotificationItem) => {
    if (!notification.is_read) void markRead(notification.id);
    setNotifOpen(false);
    if (notification.link) {
      const sourceLink = `${notification.link}${notification.link.includes('?') ? '&' : '?'}from=notification`;
      navigate(sourceLink);
    }
  };

  return (
    <div
      className="min-h-screen flex bg-background-50"
      style={{ '--workspace-sidebar-width': sidebarCollapsed ? '5rem' : '14rem' } as CSSProperties}
    >
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-foreground-900/40 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          bg-white border-r border-background-200
          flex flex-col transition-all duration-300
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'w-20' : 'w-56'}
        `}
      >
        {/* Logo */}
        <div className={`
          flex items-center gap-3 px-5 h-16 border-b border-background-200 flex-shrink-0
          ${sidebarCollapsed ? 'justify-center px-2' : ''}
        `}>
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <i className="ri-briefcase-line text-white text-sm"></i>
          </div>
          {!sidebarCollapsed && (
            <span data-ui="app-brand-title" className="font-heading text-lg font-bold leading-none text-foreground-900 whitespace-nowrap">智聘</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={rememberedNavTarget(item.path)}
              onClick={() => { rememberCurrentPage(); setMobileMenuOpen(false); }}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all whitespace-nowrap
                ${sidebarCollapsed ? 'justify-center px-0' : ''}
                ${isActive(item.path)
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-foreground-600 hover:bg-background-100 hover:text-foreground-900'
                }
              `}
            >
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <i className={`${item.icon} text-lg`}></i>
              </div>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Bottom nav */}
        {visibleBottomNavItems.length > 0 && (
          <div className="px-2.5 py-3 border-t border-background-200 space-y-0.5">
            {visibleBottomNavItems.map((item) => (
              <Link
                key={item.path}
                to={rememberedNavTarget(item.path)}
                onClick={() => { rememberCurrentPage(); setMobileMenuOpen(false); }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all whitespace-nowrap
                  ${sidebarCollapsed ? 'justify-center px-0' : ''}
                  ${isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-foreground-600 hover:bg-background-100 hover:text-foreground-900'
                  }
                `}
              >
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className={`${item.icon} text-lg`}></i>
                </div>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        )}

        {/* Collapse toggle */}
        <div className="hidden lg:block px-2.5 py-2 border-t border-background-200">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center py-2 rounded-lg text-foreground-400 hover:text-foreground-600 hover:bg-background-100 transition-all cursor-pointer"
          >
            <i className={`text-lg ${sidebarCollapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'}`}></i>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-14 bg-white border-b border-background-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-foreground-600 hover:bg-background-100 transition-colors cursor-pointer"
            >
              <i className="ri-menu-line text-xl"></i>
            </button>


          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative" data-notif-menu>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative w-9 h-9 flex items-center justify-center rounded-lg text-foreground-500 hover:text-foreground-700 hover:bg-background-100 transition-colors cursor-pointer"
              >
                <i className="ri-notification-3-line text-xl"></i>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-accent-500 rounded-full text-[10px] text-white font-semibold flex items-center justify-center ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Panel */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl border border-background-200 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-background-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground-900">通知中心</p>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-accent-100 text-accent-600 text-[11px] font-medium rounded-full">
                          {unreadCount} 条未读
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => void markAllRead()}
                        className="text-xs text-foreground-500 hover:text-primary-600 transition-colors cursor-pointer"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {notifications.map((notification) => {
                      const visual = notificationVisual(notification.type);
                      return (
                      <button
                        type="button"
                        key={notification.id}
                        onClick={() => openNotification(notification)}
                        className={`flex w-full items-start gap-3 px-4 py-3 border-b border-background-50 cursor-pointer transition-colors ${
                          notification.is_read ? 'hover:bg-background-50' : 'bg-primary-50/30 hover:bg-primary-50/50'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${visual.color}`}>
                          <i className={`${visual.icon} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${notification.is_read ? 'text-foreground-700' : 'text-foreground-900'}`}>
                              {notification.title}
                            </p>
                            {!notification.is_read && (
                              <span className="w-2 h-2 bg-accent-500 rounded-full flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-xs text-foreground-500 mt-0.5 leading-relaxed">{notification.body}</p>
                          <p className="text-[11px] text-foreground-400 mt-1">{notificationTime(notification.created_at)}</p>
                        </div>
                      </button>
                    )})}
                    {notifications.length === 0 && (
                      <div className="px-4 py-10 text-center text-sm text-foreground-500">
                        暂无通知
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 border-t border-background-100">
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="w-full text-center text-xs text-foreground-500 hover:text-primary-600 transition-colors cursor-pointer"
                    >
                      收起通知
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Company account */}
            <div className="relative" data-role-menu>
              <button
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className="flex items-center gap-2 pl-3 border-l border-background-200 cursor-pointer group"
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary-600">{avatar}</span>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white"></span>
                </div>
                <div className="hidden sm:block text-right">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground-900 leading-tight">{displayName}</p>
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-600 rounded-full font-medium">
                      {roleInfo.department}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-500">{roleInfo.description}</p>
                </div>
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`ri-arrow-down-s-line text-sm text-foreground-400 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`}></i>
                </div>
              </button>

              {/* Company account dropdown */}
              {roleMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-background-200 shadow-xl z-50 overflow-hidden">
                  {/* Current user summary */}
                  <div className="px-4 py-4 border-b border-background-100 bg-background-50">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-base font-semibold text-primary-600">{avatar}</span>
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white"></span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground-900">{displayName}</p>
                        <p className="text-xs text-foreground-500">{roleInfo.label} · {roleInfo.status}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => {
                        reloadPermissions();
                        setRoleMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground-600 hover:bg-background-50"
                    >
                      <i className="ri-refresh-line text-base" />
                      重新加载公司权限
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        pageMemoriesRef.current = {};
                        logout();
                        setRoleMenuOpen(false);
                        navigate('/login', { replace: true });
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-accent-700 hover:bg-accent-50"
                    >
                      <i className="ri-logout-box-r-line text-base" />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main ref={mainScrollRef} onScroll={rememberMainScroll} className="flex-1 overflow-auto">
          {canOpenCurrentPage ? (
            <Outlet />
          ) : (
            <div className="flex min-h-full items-center justify-center p-6">
              <section className="w-full max-w-lg rounded-xl border border-background-200 bg-white p-8 text-center shadow-sm">
                <i className="ri-lock-line text-3xl text-foreground-400" aria-hidden="true" />
                <h1 className="mt-3 text-lg font-semibold text-foreground-900">当前账号没有这个页面权限</h1>
                <p className="mt-2 text-sm text-foreground-500">请返回已授权页面，或让管理员在 PGS 中补充对应菜单。</p>
                <button
                  type="button"
                  onClick={() => navigate(homePathForRole(currentRole), { replace: true })}
                  className="mt-5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                >
                  返回我的工作台
                </button>
              </section>
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
