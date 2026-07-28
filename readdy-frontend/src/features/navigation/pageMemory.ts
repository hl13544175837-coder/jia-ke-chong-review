export interface PageMemoryEntry {
  href: string;
  scrollTop: number;
}

const rememberedModulePaths = ['/jobs', '/candidates', '/interviews', '/offers'] as const;

export function memoryKeyForPath(pathname: string): string | null {
  return rememberedModulePaths.find((basePath) => (
    pathname === basePath || pathname.startsWith(`${basePath}/`)
  )) ?? null;
}

export function safeRememberedHref(basePath: string, href: string | undefined): string {
  if (!href || !href.startsWith('/')) return basePath;
  try {
    const parsed = new URL(href, 'https://page-memory.local');
    if (memoryKeyForPath(parsed.pathname) !== basePath) return basePath;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return basePath;
  }
}
