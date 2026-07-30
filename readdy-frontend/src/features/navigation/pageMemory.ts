export interface PageMemoryEntry {
  href: string;
  scrollTop: number;
}

const rememberedModulePaths = [
  '/jobs',
  '/candidates',
  '/interviews',
  '/offers',
  '/kanban',
  '/interviewer/jobs',
  '/interviewer/screening',
  '/interviewer/interviews',
] as const;

type RememberedModulePath = (typeof rememberedModulePaths)[number];

const transientSearchParams: Partial<Record<RememberedModulePath, readonly string[]>> = {
  '/jobs': ['demand'],
  '/candidates': ['candidate'],
  '/interviews': ['candidate', 'assignment', 'schedule', 'quickSchedule', 'from'],
  '/offers': ['offer'],
  '/kanban': ['detailCandidate', 'candidate', 'target'],
  '/interviewer/jobs': ['demand'],
  '/interviewer/screening': ['task'],
  '/interviewer/interviews': ['candidate', 'assignment', 'demand'],
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
