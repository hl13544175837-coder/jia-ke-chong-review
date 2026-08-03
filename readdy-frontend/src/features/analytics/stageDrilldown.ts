export type DashboardStage =
  | 'hr_screening'
  | 'ai_screening'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarding';

type AnalyticsStageDestination =
  | { kind: 'candidate'; state: { fromDashboard: true; targetStage: string } }
  | { kind: 'route'; to: string };

const destinations: Record<DashboardStage, AnalyticsStageDestination> = {
  hr_screening: { kind: 'candidate', state: { fromDashboard: true, targetStage: 'pending' } },
  ai_screening: { kind: 'candidate', state: { fromDashboard: true, targetStage: 'ai_screen' } },
  business_review: { kind: 'candidate', state: { fromDashboard: true, targetStage: 'business_review' } },
  interview: { kind: 'route', to: '/interviews?from=dashboard' },
  offer: { kind: 'route', to: '/offers?from=dashboard' },
  onboarding: { kind: 'route', to: '/offers?tab=onboard&from=dashboard' },
};

export function dashboardStageDrilldown(stage: DashboardStage) {
  return destinations[stage];
}

export function canOpenDashboardStage(value: number) {
  return Number.isFinite(value) && value > 0;
}
