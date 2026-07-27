export type DemandStageDrilldown = 'feedback' | 'interview' | 'offer';

export function canOpenDemandStage(count: number) {
  return Number.isFinite(count) && count > 0;
}

export function demandStageDrilldown(stage: DemandStageDrilldown, demandId: number) {
  if (stage === 'feedback') return { kind: 'drawer' as const, demandId };
  const base = stage === 'interview' ? '/interviews' : '/offers';
  return {
    kind: 'route' as const,
    to: `${base}?demand=${demandId}&from=jobs`,
  };
}
