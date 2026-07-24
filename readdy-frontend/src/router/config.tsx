import type { RouteObject } from 'react-router-dom';
import NotFound from '@/pages/NotFound';
import LoginPage from '@/pages/login/page';
import MainLayout from '@/components/feature/MainLayout';
import DashboardPage from '@/pages/dashboard/page';
import DashboardInterviewsPage from '@/pages/dashboard/interviews/page';
import HiredPage from '@/pages/dashboard/hired/page';
import CyclePage from '@/pages/dashboard/cycle/page';
import DashboardOffersPage from '@/pages/dashboard/offers/page';
import OffersPage from '@/pages/offers/page';
import JobsPage from '@/pages/jobs/page';
import CandidatesPage from '@/pages/candidates/page';
import KanbanPage from '@/pages/kanban/page';
import AIAssistantPage from '@/pages/ai-assistant/page';
import SettingsPage from '@/pages/settings/page';
import TalentMapPage from '@/pages/talent-map/page';
import KpiStandardsPage from '@/pages/kpi-standards/page';
import AnalyticsPage from '@/pages/analytics/page';
import InterviewerDashboardPage from '@/pages/interviewer/dashboard/page';
import InterviewerInterviewsPage from '@/pages/interviewer/interviews/page';
import InterviewerCandidatesPage from '@/pages/interviewer/candidates/page';
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
  RequireCompanyRole,
} from '@/auth/companyGuards';
import type { CompanyRole } from '@/auth/companyAuth';

const allRoles: CompanyRole[] = ['admin', 'manager', 'recruiter', 'interviewer'];
const recruitingRoles: CompanyRole[] = ['admin', 'manager', 'recruiter'];
const managementRoles: CompanyRole[] = ['admin', 'manager'];
const interviewerRoles: CompanyRole[] = ['interviewer'];

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
        element: <RequireCompanyRole allow={allRoles}><DashboardPage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/interviews',
        element: <RequireCompanyRole allow={allRoles}><DashboardInterviewsPage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/hired',
        element: <RequireCompanyRole allow={recruitingRoles}><HiredPage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/cycle',
        element: <RequireCompanyRole allow={managementRoles}><CyclePage /></RequireCompanyRole>,
      },
      {
        path: '/dashboard/offers',
        element: <RequireCompanyRole allow={recruitingRoles}><DashboardOffersPage /></RequireCompanyRole>,
      },
      {
        path: '/jobs',
        element: <RequireCompanyRole allow={recruitingRoles}><JobsPage /></RequireCompanyRole>,
      },
      {
        path: '/candidates',
        element: <RequireCompanyRole allow={recruitingRoles}><CandidatesPage /></RequireCompanyRole>,
      },
      {
        path: '/talent-map',
        element: <RequireCompanyRole allow={recruitingRoles}><TalentMapPage /></RequireCompanyRole>,
      },
      {
        path: '/kanban',
        element: <RequireCompanyRole allow={recruitingRoles}><KanbanPage /></RequireCompanyRole>,
      },
      {
        path: '/interviews',
        element: <RequireCompanyRole allow={recruitingRoles}><DashboardInterviewsPage /></RequireCompanyRole>,
      },
      {
        path: '/offers',
        element: <RequireCompanyRole allow={recruitingRoles}><OffersPage /></RequireCompanyRole>,
      },
      {
        path: '/kpi-standards',
        element: <RequireCompanyRole allow={managementRoles}><KpiStandardsPage /></RequireCompanyRole>,
      },
      {
        path: '/analytics',
        element: <RequireCompanyRole allow={managementRoles}><AnalyticsPage /></RequireCompanyRole>,
      },
      {
        path: '/ai-assistant',
        element: <RequireCompanyRole allow={recruitingRoles}><AIAssistantPage /></RequireCompanyRole>,
      },
      {
        path: '/settings',
        element: <RequireCompanyRole allow={['admin']}><SettingsPage /></RequireCompanyRole>,
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
        path: '/interviewer/candidates',
        element: <RequireCompanyRole allow={interviewerRoles}><InterviewerCandidatesPage /></RequireCompanyRole>,
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
        element: <RequireCompanyRole allow={managementRoles}><DirectorCockpitPage /></RequireCompanyRole>,
      },
      {
        path: '/director/progress',
        element: <RequireCompanyRole allow={managementRoles}><DirectorProgressPage /></RequireCompanyRole>,
      },
      {
        path: '/director/insights',
        element: <RequireCompanyRole allow={managementRoles}><DirectorInsightsPage /></RequireCompanyRole>,
      },
      {
        path: '/director/approvals',
        element: <RequireCompanyRole allow={managementRoles}><DirectorApprovalsPage /></RequireCompanyRole>,
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;
