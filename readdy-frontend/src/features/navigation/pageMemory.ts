export interface PageMemoryEntry {
  href: string;
  scrollTop: number;
}

const rememberedModulePaths = [
  '/dashboard',
  '/jobs',
  '/candidates',
  '/interviews',
  '/offers',
  '/kanban',
  '/analytics',
  '/interviewer/jobs',
  '/interviewer/screening',
  '/interviewer/interviews',
  '/director/cockpit',
  '/director/progress',
  '/director/insights',
  '/director/approvals',
] as const;

type RememberedModulePath = (typeof rememberedModulePaths)[number];

const transientSearchParams: Partial<Record<RememberedModulePath, readonly string[]>> = {
  '/jobs': ['demand'],
  '/candidates': ['candidate'],
  '/interviews': ['candidate', 'assignment', 'schedule', 'quickSchedule', 'from'],
  '/offers': ['candidate', 'offer', 'from'],
  '/kanban': ['detailCandidate', 'candidate', 'target'],
  '/analytics': ['insight'],
  '/interviewer/jobs': ['demand'],
  '/interviewer/screening': ['task'],
  '/interviewer/interviews': ['candidate', 'assignment', 'demand'],
  '/director/progress': ['position'],
};

export function memoryKeyForPath(pathname: string): RememberedModulePath | null {
  return rememberedModulePaths.find((basePath) => (
    pathname === basePath || pathname.startsWith(`${basePath}/`)
  )) ?? null;
}

export function safeRememberedHref(basePath: string, href: string | undefined): string {
  if (!href || !href.startsWith('/')) return basePath;
  try {
    const parsed = new URL(href, 'https://page-memory.local');
    if (memoryKeyForPath(parsed.pathname) !== basePath) return basePath;
    const memoryKey = memoryKeyForPath(parsed.pathname);
    if (memoryKey) {
      transientSearchParams[memoryKey]?.forEach((key) => parsed.searchParams.delete(key));
    }
    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`;
  } catch {
    return basePath;
  }
}
