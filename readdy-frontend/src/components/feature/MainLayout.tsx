import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { notificationList, typeIconMap, typeColorMap } from '@/mocks/notifications';

type UserRole = 'manager' | 'recruiter' | 'admin' | 'hr_director' | 'interviewer';

interface RoleInfo {
  key: UserRole;
  label: string;
  description: string;
  avatar: string;
  department: string;
  status: string;
}

const roles: RoleInfo[] = [
  { key: 'manager', label: '招聘主管', description: '全面管理权限', avatar: '张', department: '人力资源部', status: '在线' },
  { key: 'recruiter', label: '招聘专员', description: '日常执行权限', avatar: '李', department: '人力资源部', status: '在线' },
  { key: 'admin', label: '招聘系统管理员', description: '系统配置维护', avatar: '陈', department: 'IT 运维部', status: '在线' },
  { key: 'hr_director', label: '人力资源总监', description: '全局分析决策', avatar: '赵', department: '人力资源部', status: '在线' },
  { key: 'interviewer', label: '面试官', description: '面试执行与评分', avatar: '周', department: '技术研发部', status: '在线' },
];

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: UserRole[];
}

const allNavItems: NavItem[] = [
  { path: '/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['manager', 'recruiter', 'admin'] },
  { path: '/analytics', icon: 'ri-bar-chart-2-line', label: '分析看板', roles: [] },
  { path: '/jobs', icon: 'ri-briefcase-line', label: '招聘管理', roles: ['manager', 'recruiter'] },
  { path: '/candidates', icon: 'ri-file-list-3-line', label: '简历库', roles: ['manager', 'recruiter'] },
  { path: '/talent-map', icon: 'ri-organization-chart', label: '人才地图', roles: ['manager', 'recruiter'] },
  { path: '/interviews', icon: 'ri-calendar-event-line', label: '面试管理', roles: ['manager', 'recruiter'] },
  { path: '/offers', icon: 'ri-mail-send-line', label: 'Offer 管理', roles: ['manager', 'recruiter'] },
  { path: '/kanban', icon: 'ri-layout-masonry-line', label: '进度看板', roles: ['manager'] },
  { path: '/ai-assistant', icon: 'ri-robot-2-line', label: 'AI 助手', roles: ['manager', 'recruiter', 'admin'] },
];

const directorNavItems: NavItem[] = [
  { path: '/director/cockpit', icon: 'ri-dashboard-3-line', label: '管理驾驶舱', roles: ['hr_director'] },
  { path: '/director/progress', icon: 'ri-bar-chart-grouped-line', label: '招聘进展', roles: ['hr_director'] },
  { path: '/director/insights', icon: 'ri-organization-chart', label: '人才储备', roles: ['hr_director'] },
  { path: '/director/approvals', icon: 'ri-shield-check-line', label: '审批与风险', roles: ['hr_director'] },
];

const interviewerNavItems: NavItem[] = [
  { path: '/interviewer/dashboard', icon: 'ri-dashboard-line', label: '工作台', roles: ['interviewer'] },
  { path: '/interviewer/screening', icon: 'ri-file-search-line', label: '待筛选', roles: ['interviewer'] },
  { path: '/interviewer/interviews', icon: 'ri-calendar-event-line', label: '我的面试', roles: ['interviewer'] },
  { path: '/interviewer/candidates', icon: 'ri-user-star-line', label: '候选人进展', roles: ['interviewer'] },
  { path: '/interviewer/jobs', icon: 'ri-briefcase-line', label: '参与岗位', roles: ['interviewer'] },
];

const bottomNavItems: NavItem[] = [
  { path: '/settings', icon: 'ri-settings-3-line', label: '系统设置', roles: ['manager', 'admin'] },
];

const ROLE_KEY = 'zhipin-current-role';

function getStoredRole(): UserRole {
  const stored = localStorage.getItem(ROLE_KEY);
  if (stored === 'manager' || stored === 'recruiter' || stored === 'admin' || stored === 'hr_director' || stored === 'interviewer') return stored;
  return 'manager';
}

export default function MainLayout() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState(notificationList);
  const [currentRole, setCurrentRole] = useState<UserRole>(getStoredRole);
  const roleInfo = roles.find((r) => r.key === currentRole) || roles[0];

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    localStorage.setItem(ROLE_KEY, currentRole);
  }, [currentRole]);

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

  const navItems = currentRole === 'interviewer'
    ? interviewerNavItems.filter((item) => item.roles.includes(currentRole))
    : currentRole === 'hr_director'
    ? directorNavItems.filter((item) => item.roles.includes(currentRole))
    : allNavItems.filter((item) => item.roles.includes(currentRole));
  const visibleBottomNavItems = bottomNavItems.filter((item) => item.roles.includes(currentRole));

  const isActive = (path: string) => {
    if (currentRole === 'interviewer' || currentRole === 'hr_director') {
      return location.pathname.startsWith(path);
    }
    if (path === '/interviews') {
      return location.pathname === '/interviews' || location.pathname === '/dashboard/interviews';
    }
    return location.pathname.startsWith(path);
  };

  const markRead = (id: number) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <div className="min-h-screen flex bg-background-50">
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
            <span className="font-heading font-bold text-base text-foreground-900 whitespace-nowrap">智聘</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
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
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
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
                        onClick={markAllRead}
                        className="text-xs text-foreground-500 hover:text-primary-600 transition-colors cursor-pointer"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-background-50 cursor-pointer transition-colors ${
                          n.isRead ? 'hover:bg-background-50' : 'bg-primary-50/30 hover:bg-primary-50/50'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${typeColorMap[n.type]}`}>
                          <i className={`${typeIconMap[n.type]} text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${n.isRead ? 'text-foreground-700' : 'text-foreground-900'}`}>
                              {n.title}
                            </p>
                            {!n.isRead && (
                              <span className="w-2 h-2 bg-accent-500 rounded-full flex-shrink-0"></span>
                            )}
                          </div>
                          <p className="text-xs text-foreground-500 mt-0.5 leading-relaxed">{n.content}</p>
                          <p className="text-[11px] text-foreground-400 mt-1">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-background-100">
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="w-full text-center text-xs text-foreground-500 hover:text-primary-600 transition-colors cursor-pointer"
                    >
                      查看全部通知
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Role Switcher */}
            <div className="relative" data-role-menu>
              <button
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className="flex items-center gap-2 pl-3 border-l border-background-200 cursor-pointer group"
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary-600">{roleInfo.avatar}</span>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white"></span>
                </div>
                <div className="hidden sm:block text-right">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground-900 leading-tight">{roleInfo.label}</p>
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

              {/* Role Dropdown */}
              {roleMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-background-200 shadow-xl z-50 overflow-hidden">
                  {/* Current user summary */}
                  <div className="px-4 py-4 border-b border-background-100 bg-background-50">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-base font-semibold text-primary-600">{roleInfo.avatar}</span>
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white"></span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground-900">{roleInfo.label}</p>
                        <p className="text-xs text-foreground-500">{roleInfo.department} · {roleInfo.status}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 text-center">
                        <p className="text-lg font-bold text-foreground-900">12</p>
                        <p className="text-[11px] text-foreground-400">在招岗位</p>
                      </div>
                      <div className="w-px h-8 bg-background-200"></div>
                      <div className="flex-1 text-center">
                        <p className="text-lg font-bold text-foreground-900">47</p>
                        <p className="text-[11px] text-foreground-400">在途候选人</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 border-b border-background-100">
                    <p className="text-xs font-medium text-foreground-500">切换角色</p>
                  </div>
                  {roles.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => {
                        setCurrentRole(r.key);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                        currentRole === r.key
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-foreground-700 hover:bg-background-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        currentRole === r.key ? 'bg-primary-100' : 'bg-background-100'
                      }`}>
                        <span className={`text-sm font-semibold ${currentRole === r.key ? 'text-primary-600' : 'text-foreground-500'}`}>
                          {r.avatar}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.label}</p>
                        <p className="text-[11px] text-foreground-400">{r.description}</p>
                      </div>
                      {currentRole === r.key && (
                        <i className="ri-check-line text-sm text-primary-600 ml-auto"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant floating button - hidden for interviewer role */}
      {currentRole !== 'interviewer' && currentRole !== 'hr_director' && (
        <Link
          to="/ai-assistant"
          className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-accent-500 hover:bg-accent-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-105"
        >
          <i className="ri-robot-2-line text-xl"></i>
        </Link>
      )}
    </div>
  );
}