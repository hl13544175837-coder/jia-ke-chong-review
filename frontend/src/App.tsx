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
import { DashboardPage, NotificationCenterPage } from './features/workbench';
import { AgentPage } from './features/assistant';
import { UploadPage } from './features/candidates/pageEntries';
import { JobsPage, JobMatchPage } from './features/demands/pageEntries';
import { PipelinePage } from './features/pipeline';
import { InterviewListPage, InterviewsPage, InterviewReportPage } from './features/interviews';
import { BiPage } from './features/analytics';
import { UsersPage, SystemSettingsPage, AiArchitecturePage, AgentCallLogsPage } from './features/admin';
import { ToastProvider } from './components/ui';
import type { Role } from './types';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const PublicInterviewAccessPage = lazy(() => import('./pages/PublicInterviewAccessPage').then((module) => ({ default: module.PublicInterviewAccessPage })));

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

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <PermissionsProvider authed={isAuthenticated}>
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <HomeRedirect /> : <LoginPage />}
      />
      <Route path="/interview-access" element={<PublicInterviewAccessPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/agent"
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
          path="/jobs"
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
              element={<PipelinePage />}
            />
          }
        />
        <Route
          path="/interviews"
          element={
            <RequireRole
              allow={['recruiter', 'interviewer', 'manager', 'admin']}
              element={<InterviewListPage />}
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
          path="/bi"
          element={
            <RequireRole allow={['manager', 'admin']} element={<BiPage />} />
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
