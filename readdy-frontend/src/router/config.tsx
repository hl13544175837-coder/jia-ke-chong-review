import type { RouteObject } from 'react-router-dom';
import NotFound from '@/pages/NotFound';
import LoginPage from '@/pages/login/page';
import MainLayout from '@/components/feature/MainLayout';
import DashboardPage from '@/pages/dashboard/page';
import DashboardInterviewsPage from '@/pages/dashboard/interviews/page';
import RecruiterInterviewsPage from '@/pages/interviews/page';
import HiredPage from '@/pages/dashboard/hired/page';
import CyclePage from '@/pages/dashboard/cycle/page';
import DashboardOffersPage from '@/pages/dashboard/offers/page';
import OffersPage from '@/pages/offers/page';
import JobsPage from '@/pages/jobs/page';
import CandidatesPage from '@/pages/candidates/page';
import KanbanPage from '@/pages/kanban/page';
import SettingsPage from '@/pages/settings/page';
import TalentMapPage from '@/pages/talent-map/page';
import AnalyticsPage from '@/pages/analytics/page';
import InterviewerDashboardPage from '@/pages/interviewer/dashboard/page';
import InterviewerInterviewsPage from '@/pages/interviewer/interviews/page';
import InterviewerJobsPage from '@/pages/interviewer/jobs/page';
import InterviewerScreeningPage from '@/pages/interviewer/screening/page';
import DirectorCockpitPage from '@/pages/director/cockpit/page';
import DirectorProgressPage from '@/pages/director/progress/page';
import DirectorInsightsPage from '@/pages/director/insights/page';
import DirectorApprovalsPage from '@/pages/director/approvals/page';
import {
  CompanyHomeRedirect,
  RequireCompanyAuth,
  RequireCompanyGuest,
} from '@/auth/companyGuards';
import { RequireCompanyRole, RoleHomeRedirect } from '@/auth/productRole';
import type { ProductRole } from '@/auth/productRoleModel';

const dashboardRoles: ProductRole[] = ['admin', 'manager', 'recruiter'];
const hrRoles: ProductRole[] = ['recruiter', 'manager', 'admin'];
const managerRoles: ProductRole[] = ['manager', 'admin'];
const adminRoles: ProductRole[] = ['admin'];
const interviewerRoles: ProductRole[] = ['interviewer'];
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
        element: <RequireCompanyRole allow={hrRoles}><DashboardInterviewsPage /></RequireCompanyRole>,
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
        element: <RequireCompanyRole allow={hrRoles}><DashboardOffersPage /></RequireCompanyRole>,
      },
      {
        path: '/jobs',
        element: <RequireCompanyRole allow={hrRoles}><JobsPage /></RequireCompanyRole>,
      },
      {
        path: '/candidates',
        element: <RequireCompanyRole allow={hrRoles}><CandidatesPage /></RequireCompanyRole>,
      },
      {
        path: '/talent-map',
        element: <RequireCompanyRole allow={managerRoles}><TalentMapPage /></RequireCompanyRole>,
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
        element: <RequireCompanyRole allow={directorRoles}><AnalyticsPage /></RequireCompanyRole>,
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
        element: <RequireCompanyRole allow={interviewerRoles}><InterviewerScreeningPage /></RequireCompanyRole>,
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
