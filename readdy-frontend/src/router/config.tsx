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

const routes: RouteObject[] = [
  {
    path: '/',
    element: <LoginPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <MainLayout />,
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/dashboard/interviews',
        element: <DashboardInterviewsPage />,
      },
      {
        path: '/dashboard/hired',
        element: <HiredPage />,
      },
      {
        path: '/dashboard/cycle',
        element: <CyclePage />,
      },
      {
        path: '/dashboard/offers',
        element: <DashboardOffersPage />,
      },
      {
        path: '/jobs',
        element: <JobsPage />,
      },
      {
        path: '/candidates',
        element: <CandidatesPage />,
      },
      {
        path: '/talent-map',
        element: <TalentMapPage />,
      },
      {
        path: '/kanban',
        element: <KanbanPage />,
      },
      {
        path: '/interviews',
        element: <DashboardInterviewsPage />,
      },
      {
        path: '/offers',
        element: <OffersPage />,
      },
      {
        path: '/kpi-standards',
        element: <KpiStandardsPage />,
      },
      {
        path: '/analytics',
        element: <AnalyticsPage />,
      },
      {
        path: '/ai-assistant',
        element: <AIAssistantPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
      {
        path: '/interviewer/dashboard',
        element: <InterviewerDashboardPage />,
      },
      {
        path: '/interviewer/interviews',
        element: <InterviewerInterviewsPage />,
      },
      {
        path: '/interviewer/candidates',
        element: <InterviewerCandidatesPage />,
      },
      {
        path: '/interviewer/jobs',
        element: <InterviewerJobsPage />,
      },
      {
        path: '/interviewer/screening',
        element: <InterviewerScreeningPage />,
      },
      {
        path: '/director/cockpit',
        element: <DirectorCockpitPage />,
      },
      {
        path: '/director/progress',
        element: <DirectorProgressPage />,
      },
      {
        path: '/director/insights',
        element: <DirectorInsightsPage />,
      },
      {
        path: '/director/approvals',
        element: <DirectorApprovalsPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
];

export default routes;