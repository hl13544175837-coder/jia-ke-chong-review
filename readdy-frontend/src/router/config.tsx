import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import MainLayout from '@/components/feature/MainLayout';
import {
  CompanyHomeRedirect,
  RequireCompanyAuth,
  RequireCompanyGuest,
} from '@/auth/companyGuards';
import { RequireCompanyRole, RoleHomeRedirect } from '@/auth/productRole';
import type { ProductRole } from '@/auth/productRoleModel';

const NotFound = lazy(() => import('@/pages/NotFound'));
const LoginPage = lazy(() => import('@/pages/login/page'));
const DashboardPage = lazy(() => import('@/pages/dashboard/page'));
const RecruiterInterviewsPage = lazy(() => import('@/pages/interviews/page'));
const HiredPage = lazy(() => import('@/pages/dashboard/hired/page'));
const CyclePage = lazy(() => import('@/pages/dashboard/cycle/page'));
const OffersPage = lazy(() => import('@/pages/offers/page'));
const JobsPage = lazy(() => import('@/pages/jobs/page'));
const OnlineResumesPage = lazy(() => import('@/pages/online-resumes/page'));
const CandidatesPage = lazy(() => import('@/pages/candidates/page'));
const KanbanPage = lazy(() => import('@/pages/kanban/page'));
const SettingsPage = lazy(() => import('@/pages/settings/page'));
const TalentMapPage = lazy(() => import('@/pages/talent-map/page'));
const AnalyticsPage = lazy(() => import('@/pages/analytics/page'));
const InterviewerDashboardPage = lazy(() => import('@/pages/interviewer/dashboard/page'));
const InterviewerInterviewsPage = lazy(() => import('@/pages/interviewer/interviews/page'));
const InterviewerJobsPage = lazy(() => import('@/pages/interviewer/jobs/page'));
const InterviewerScreeningPage = lazy(() => import('@/pages/interviewer/screening/page'));
const DirectorCockpitPage = lazy(() => import('@/pages/director/cockpit/page'));
const DirectorProgressPage = lazy(() => import('@/pages/director/progress/page'));
const DirectorInsightsPage = lazy(() => import('@/pages/director/insights/page'));
const DirectorApprovalsPage = lazy(() => import('@/pages/director/approvals/page'));

const dashboardRoles: ProductRole[] = ['admin', 'manager', 'recruiter'];
const hrRoles: ProductRole[] = ['recruiter', 'manager', 'admin'];
const managerRoles: ProductRole[] = ['manager', 'admin'];
const analyticsRoles: ProductRole[] = ['recruiter', 'manager', 'admin', 'interviewer', 'hr_director'];
const adminRoles: ProductRole[] = ['admin'];
const interviewerRoles: ProductRole[] = ['interviewer'];
const businessReviewerRoles: ProductRole[] = ['interviewer', 'manager', 'admin'];
const directorRoles: ProductRole[] = ['hr_director'];

const routes: RouteObject[] = [
  {
    path: '/',
    element: <CompanyHomeRedirect />,
  },
  {
    path: '/login',
    element: <RequireCompanyGuest><LoginPage /></RequireCompanyGuest>,
  },
  {
    element: <RequireCompanyAuth><MainLayout /></RequireCompanyAuth>,
    children: [
      {
        path: '/dashboard',
        element: <RequireCompanyRole allow={dashboardRoles}><DashboardPage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/interviews',
        element: <RequireCompanyRole allow={hrRoles}><Navigate to="/interviews" replace /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/hired',
        element: <RequireCompanyRole allow={hrRoles}><HiredPage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/cycle',
        element: <RequireCompanyRole allow={managerRoles}><CyclePage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/offers',
        element: <RequireCompanyRole allow={hrRoles}><Navigate to="/offers" replace /></RequireCompanyRole>,
      },
      {
        path: '/jobs',
        element: <RequireCompanyRole allow={hrRoles}><JobsPage /></RequireCompanyRole>,
      },
      {
        path: '/online-resumes',
        element: <RequireCompanyRole allow={hrRoles}><OnlineResumesPage /></RequireCompanyRole>,
      },
      {
        path: '/candidates',
        element: <RequireCompanyRole allow={hrRoles}><CandidatesPage /></RequireCompanyRole>,
      },
      {
        path: '/talent-map',
        element: <RequireCompanyRole allow={hrRoles}><TalentMapPage /></RequireCompanyRole>,
      },
      {
        path: '/kanban',
        element: <RequireCompanyRole allow={hrRoles}><KanbanPage /></RequireCompanyRole>,
      },
      {
        path: '/interviews',
        element: <RequireCompanyRole allow={hrRoles}><RecruiterInterviewsPage /></RequireCompanyRole>,
      },
      {
        path: '/offers',
        element: <RequireCompanyRole allow={hrRoles}><OffersPage /></RequireCompanyRole>,
      },
      {
        path: '/kpi-standards',
        element: <RoleHomeRedirect />,
      },
      {
        path: '/analytics',
        element: <RequireCompanyRole allow={analyticsRoles}><AnalyticsPage /></RequireCompanyRole>,
      },
      {
        path: '/ai-assistant',
        element: <RoleHomeRedirect />,
      },
      {
        path: '/settings',
        element: <RequireCompanyRole allow={adminRoles}><SettingsPage /></RequireCompanyRole>,
      },
      {
        path: '/interviewer/dashboard',
        element: <RequireCompanyRole allow={interviewerRoles}><InterviewerDashboardPage /></RequireCompanyRole>,
      },
      {
        path: '/interviewer/interviews',
        element: <RequireCompanyRole allow={interviewerRoles}><InterviewerInterviewsPage /></RequireCompanyRole>,
      },
      {
        path: '/interviewer/jobs',
        element: <RequireCompanyRole allow={interviewerRoles}><InterviewerJobsPage /></RequireCompanyRole>,
      },
      {
        path: '/interviewer/screening',
        element: <RequireCompanyRole allow={businessReviewerRoles}><InterviewerScreeningPage /></RequireCompanyRole>,
      },
      {
        path: '/director/cockpit',
        element: <RequireCompanyRole allow={directorRoles}><DirectorCockpitPage /></RequireCompanyRole>,
      },
      {
        path: '/director/progress',
        element: <RequireCompanyRole allow={directorRoles}><DirectorProgressPage /></RequireCompanyRole>,
      },
      {
        path: '/director/insights',
        element: <RequireCompanyRole allow={directorRoles}><DirectorInsightsPage /></RequireCompanyRole>,
      },
      {
        path: '/director/approvals',
        element: <RequireCompanyRole allow={directorRoles}><DirectorApprovalsPage /></RequireCompanyRole>,
      },
      {
        path: '*',
        element: <RoleHomeRedirect />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
