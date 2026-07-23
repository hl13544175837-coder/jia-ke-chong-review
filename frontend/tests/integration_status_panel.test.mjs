import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(root, path), 'utf8');

for (const path of [
  'features/integrations/index.ts',
  'features/integrations/types.ts',
  'features/integrations/api.ts',
  'features/integrations/status.ts',
  'features/integrations/components/IntegrationStatusPanel.tsx',
]) {
  assert.ok(existsSync(join(root, path)), `${path} should exist inside the integrations feature`);
}

const types = read('features/integrations/types.ts');
const api = read('features/integrations/api.ts');
const status = read('features/integrations/status.ts');
const panel = read('features/integrations/components/IntegrationStatusPanel.tsx');
const feature = read('features/integrations/index.ts');
const settings = read('pages/admin/SystemSettingsPage.tsx');

assert.match(types, /code:\s*string/, 'Capability items should use the backend capability code');
assert.match(types, /required_inputs:\s*string\[\]/, 'Capability items should show missing integration inputs');
assert.match(types, /manual_bridge/, 'Capability mode should include the manual bridge stage');
assert.match(types, /unconfigured/, 'Capability health should include an unconfigured state');

assert.match(api, /\/integrations\/capabilities/, 'The feature should load the canonical capability endpoint');
assert.match(api, /API_BASE/, 'The feature API should reuse the shared API base');
assert.match(api, /authHeaders\(\)/, 'The feature API should reuse the existing authenticated headers');
assert.match(api, /INTEGRATION_MODES/, 'The API boundary should validate capability migration modes at runtime');
assert.match(api, /INTEGRATION_HEALTH_STATES/, 'The API boundary should validate capability health at runtime');
assert.match(api, /requiredInputs\.every/, 'The API boundary should validate each required input');
assert.match(api, /new Set\(codes\)/, 'Duplicate capability codes should fail closed');
assert.doesNotMatch(
  api,
  /recruitment_demand_oa|wecom_calendar|offer_oa|hris_onboarding/,
  'The frontend API must not invent a fallback capability list when the backend fails',
);

for (const copy of [
  '暂时人工处理',
  '还没接接口',
  '正在对照数据',
  '新旧流程并行',
  '已正式接管',
  '暂时不可用',
]) {
  assert.match(status, new RegExp(copy), `Status mapping should explain ${copy} in plain language`);
}

assert.match(panel, /useAsync/, 'The status panel should use the shared loading lifecycle');
assert.match(panel, /integrationsApi\.listCapabilities/, 'The status panel should load real backend capabilities');
assert.match(panel, /ErrorState/, 'Failed capability loading should render a real error state');
assert.match(panel, /onRetry=\{reload\}/, 'Failed capability loading should provide a retry action');
assert.match(panel, /还没有接口清单/, 'A successful empty response should have a distinct empty state');
assert.match(panel, /当前阶段/, 'Each capability should clearly show its current migration stage');
assert.match(panel, /接入前还需要/, 'Missing interface inputs should be visible to the administrator');
assert.doesNotMatch(
  panel,
  /const\s+(?:CAPABILITIES|DEFAULT_CAPABILITIES|MOCK_CAPABILITIES)\s*=/,
  'The panel must not fill failures or empty responses with fake capability cards',
);

assert.match(feature, /IntegrationStatusPanel/, 'The integrations feature should expose its reusable status panel');
assert.match(settings, /id:\s*'integrations'/, 'System settings should contain a dedicated external interfaces tab');
assert.match(settings, /title:\s*'外部接口'/, 'The tab should use plain product language');
assert.match(settings, /<IntegrationStatusPanel\s*\/>/, 'System settings should render the reusable status panel');

console.log('integration status panel contract tests passed');
