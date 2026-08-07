const PAGE_MENU_RULES: ReadonlyArray<readonly [string, string]> = [
  ['/interviewer/dashboard', 'index'],
  ['/interviewer/interviews', 'interviews'],
  ['/interviewer/screening', 'interviews'],
  ['/interviewer/jobs', 'demands'],
  ['/director/approvals', 'pipeline'],
  ['/director/cockpit', 'bi'],
  ['/director/progress', 'bi'],
  ['/director/insights', 'bi'],
  ['/dashboard/interviews', 'interviews'],
  ['/dashboard/offers', 'pipeline'],
  ['/dashboard/hired', 'pipeline'],
  ['/dashboard/cycle', 'bi'],
  ['/dashboard', 'index'],
  ['/talent-map', 'candidates'],
  ['/online-resumes', 'candidates'],
  ['/candidates', 'candidates'],
  ['/interviews', 'interviews'],
  ['/analytics', 'bi'],
  ['/settings', 'settings'],
  ['/kanban', 'pipeline'],
  ['/offers', 'pipeline'],
  ['/jobs', 'demands'],
];

export function requiredMenuCodeForPath(pathname: string): string | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const match = PAGE_MENU_RULES.find(([prefix]) => (
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
  return match?.[1] ?? null;
}
