import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const uiIndex = readSource('components/ui/index.ts');
const toastProvider = readSource('components/ui/Toast.tsx');
assert.doesNotMatch(
  toastProvider,
  /export function useToast/,
  'Toast component file should only export components for React fast refresh',
);
assert.match(uiIndex, /useToast/, 'UI barrel should still export useToast for existing callers');

const demandsPage = readSource('features/demands/pages/DemandsPage.tsx');
const demandForm = readSource('features/demands/components/DemandForm.tsx');
assert.match(
  demandsPage,
  /useAsync\([\s\S]*demandsApi\.listDemands\(query\)[\s\S]*query\.status/,
  'Demand page should refetch from explicit primitive query dependencies',
);
assert.match(
  demandForm,
  /const ownerOptions = useMemo/,
  'Demand form should memoize its role-derived owner options',
);
