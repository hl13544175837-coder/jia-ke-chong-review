// App root: wires the router and auth-gated layout.
// Unauthenticated users always land on the login page; authenticated users
// get the AppShell with role-aware nested routes.

import { lazy, Suspense, type ReactElement } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { PermissionsProvider } from './lib/permissions';
import { AppShell } from './components/AppShell';
import { defaultRouteForRole } from './lib/nav';
import { featureRoutes } from './app/featureRegistry';
import { ToastProvider } from './components/ui';
import type { Role } from './types';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AgentPage = lazy(() => import('./pages/AgentPage').then((module) => ({ default: module.AgentPage })));
const NotificationCenterPage = lazy(() => import('./pages/NotificationCenterPage').then((module) => ({ default: module.NotificationCenterPage })));
const UploadPage = lazy(() => import('./pages/UploadPage').then((module) => ({ default: module.UploadPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then((module) => ({ default: module.JobsPage })));
const JobMatchPage = lazy(() => import('./pages/JobMatchPage').then((module) => ({ default: module.JobMatchPage })));
const InterviewListPage = lazy(() => import('./pages/InterviewListPage').then((module) => ({ default: module.InterviewListPage })));
const InterviewsPage = lazy(() => import('./pages/InterviewsPage').then((module) => ({ default: module.InterviewsPage })));
const OffersPage = lazy(() => import('./pages/OffersPage').then((module) => ({ default: module.OffersPage })));
const KpiStandardsPage = lazy(() => import('./pages/KpiStandardsPage').then((module) => ({ default: module.KpiStandardsPage })));
const InterviewerScopePage = lazy(() => import('./pages/InterviewerScopePage').then((module) => ({ default: module.InterviewerScopePage })));
const InterviewReportPage = lazy(() => import('./pages/InterviewReportPage').then((module) => ({ default: module.InterviewReportPage })));
const HiredPage = lazy(() => import('./pages/HiredPage').then((module) => ({ default: module.HiredPage })));
const KanbanPage = lazy(() => import('./pages/KanbanPage').then((module) => ({ default: module.KanbanPage })));
const ReaddyInterviewsPage = lazy(() => import('./pages/ReaddyInterviewsPage').then((module) => ({ default: module.ReaddyInterviewsPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const DirectorCockpitPage = lazy(() => import('./pages/director/DirectorCockpitPage').then((module) => ({ default: module.DirectorCockpitPage })));
const DirectorProgressPage = lazy(() => import('./pages/director/DirectorProgressPage').then((module) => ({ default: module.DirectorProgressPage })));
const DirectorInsightsPage = lazy(() => import('./pages/director/DirectorInsightsPage').then((module) => ({ default: module.DirectorInsightsPage })));
const DirectorApprovalsPage = lazy(() => import('./pages/director/DirectorApprovalsPage').then((module) => ({ default: module.DirectorApprovalsPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage').then((module) => ({ default: module.UsersPage })));
const SystemSettingsPage = lazy(() => import('./pages/admin/SystemSettingsPage').then((module) => ({ default: module.SystemSettingsPage })));
const AiArchitecturePage = lazy(() => import('./pages/admin/AiArchitecturePage').then((module) => ({ default: module.AiArchitecturePage })));
const AgentCallLogsPage = lazy(() => import('./pages/admin/AgentCallLogsPage').then((module) => ({ default: module.AgentCallLogsPage })));

// Gate for the authenticated app area.
function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <AppShell />;
}

// Restrict a route to specific roles; otherwise bounce to the role's home.
function RequireRole({ allow, element }: { allow: Role[]; element: ReactElement }) {
  const { role } = useAuth();
  if (role && !allow.includes(role)) {
    return <Navigate to={defaultRouteForRole()} replace />;
  }
  return element;
}

function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={role ? defaultRouteForRole() : '/login'} replace />;
}

function DashboardInterviewsRoute() {
  const { role } = useAuth();
  return role === 'interviewer' ? <InterviewListPage /> : <ReaddyInterviewsPage />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <PermissionsProvider authed={isAuthenticated}>
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <HomeRedirect /> : <LoginPage />}
      />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/dashboard/interviews"
          element={
            <RequireRole
              allow={['recruiter', 'interviewer', 'manager', 'admin']}
              element={<DashboardInterviewsRoute />}
            />
          }
        />
        <Route
          path="/dashboard/offers"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<OffersPage />}
            />
          }
        />
        <Route
          path="/dashboard/hired"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<HiredPage />}
            />
          }
        />
        <Route
          path="/dashboard/cycle"
          element={
            <RequireRole
              allow={['manager', 'admin']}
              element={<AnalyticsPage />}
            />
          }
        />
        <Route
          path="/interviewer/dashboard"
          element={
            <RequireRole allow={['interviewer']} element={<DashboardPage />} />
          }
        />
        <Route
          path="/interviewer/interviews"
          element={
            <RequireRole allow={['interviewer']} element={<InterviewListPage />} />
          }
        />
        <Route
          path="/interviewer/screening"
          element={
            <RequireRole allow={['interviewer']} element={<InterviewListPage />} />
          }
        />
        <Route
          path="/interviewer/candidates"
          element={
            <RequireRole
              allow={['interviewer']}
              element={<InterviewerScopePage view="candidates" />}
            />
          }
        />
        <Route
          path="/interviewer/jobs"
          element={
            <RequireRole
              allow={['interviewer']}
              element={<InterviewerScopePage view="jobs" />}
            />
          }
        />
        <Route
          path="/director/cockpit"
          element={
            <RequireRole allow={['manager', 'admin']} element={<DirectorCockpitPage />} />
          }
        />
        <Route
          path="/director/progress"
          element={
            <RequireRole allow={['manager', 'admin']} element={<DirectorProgressPage />} />
          }
        />
        <Route
          path="/director/insights"
          element={
            <RequireRole allow={['manager', 'admin']} element={<DirectorInsightsPage />} />
          }
        />
        <Route
          path="/director/approvals"
          element={
            <RequireRole allow={['manager', 'admin']} element={<DirectorApprovalsPage />} />
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireRole allow={['manager', 'admin']} element={<AnalyticsPage />} />
          }
        />
        <Route
          path="/agent"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<AgentPage />}
            />
          }
        />
        <Route
          path="/ai-assistant"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<AgentPage />}
            />
          }
        />
        <Route path="/notifications" element={<NotificationCenterPage />} />
        {featureRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              route.roles
                ? <RequireRole allow={route.roles} element={route.element} />
                : route.element
            }
          />
        ))}
        <Route
          path="/upload"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<UploadPage />}
            />
          }
        />
        <Route
          path="/job-templates"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<JobsPage />}
            />
          }
        />
        <Route
          path="/jobs/:id/match"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<JobMatchPage />}
            />
          }
        />
        <Route
          path="/pipeline"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<KanbanPage />}
            />
          }
        />
        <Route
          path="/kanban"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<KanbanPage />}
            />
          }
        />
        <Route
          path="/interviews"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<ReaddyInterviewsPage />}
            />
          }
        />
        <Route
          path="/interviews/new"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<InterviewsPage />}
            />
          }
        />
        <Route
          path="/interviews/:id"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin', 'interviewer']}
              element={<InterviewReportPage />}
            />
          }
        />
        <Route
          path="/offers"
          element={
            <RequireRole
              allow={['recruiter', 'manager', 'admin']}
              element={<OffersPage />}
            />
          }
        />
        <Route
          path="/bi"
          element={
            <RequireRole allow={['manager', 'admin']} element={<AnalyticsPage />} />
          }
        />
        <Route
          path="/kpi-standards"
          element={
            <RequireRole
              allow={['manager', 'admin']}
              element={<KpiStandardsPage />}
            />
          }
        />
        <Route
          path="/admin/users"
          element={<RequireRole allow={['admin']} element={<UsersPage />} />}
        />
        <Route
          path="/admin/settings"
          element={<RequireRole allow={['admin']} element={<SystemSettingsPage />} />}
        />
        <Route
          path="/settings"
          element={<RequireRole allow={['admin']} element={<SystemSettingsPage />} />}
        />
        <Route
          path="/admin/ai-architecture"
          element={<RequireRole allow={['admin']} element={<AiArchitecturePage />} />}
        />
        <Route
          path="/admin/agent-logs"
          element={<RequireRole allow={['admin']} element={<AgentCallLogsPage />} />}
        />
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
    </PermissionsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center text-sm text-muted">
                加载中…
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
