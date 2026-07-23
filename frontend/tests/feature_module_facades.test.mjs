import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const facadeContracts = {
  'features/workbench/pages.tsx': ['DashboardPage', 'NotificationCenterPage'],
  'features/assistant/pages.tsx': ['AgentPage'],
  'features/candidates/pageEntries.tsx': ['UploadPage'],
  'features/demands/pageEntries.tsx': ['JobsPage', 'JobMatchPage'],
  'features/pipeline/pages.tsx': ['PipelinePage'],
  'features/interviews/pages.tsx': ['InterviewListPage', 'InterviewsPage', 'InterviewReportPage'],
  'features/analytics/pages.tsx': ['BiPage'],
  'features/admin/pages.tsx': ['UsersPage', 'SystemSettingsPage', 'AiArchitecturePage', 'AgentCallLogsPage'],
};

for (const [path, pageNames] of Object.entries(facadeContracts)) {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist as a page-loading facade`);
  const facade = readSource(path);
  assert.match(facade, /lazy\(/, `${path} should keep its pages lazy-loaded`);
  assert.doesNotMatch(
    facade,
    /(?:FeatureRoute|RequireRole|\bpath\s*:|\broles\s*:)/,
    `${path} must not own or move protected route/role configuration`,
  );
  for (const pageName of pageNames) {
    assert.match(facade, new RegExp(`export const ${pageName} = lazy`), `${path} should export ${pageName}`);
  }
}

const app = readSource('App.tsx');
assert.doesNotMatch(
  app,
  /const (?:DashboardPage|AgentPage|NotificationCenterPage|UploadPage|JobsPage|JobMatchPage|PipelinePage|InterviewListPage|InterviewsPage|InterviewReportPage|BiPage|UsersPage|SystemSettingsPage|AiArchitecturePage|AgentCallLogsPage) = lazy/,
  'Business page loading should be delegated to module facades',
);

const protectedRouteContracts = [
  /<Route path="\/" element=\{<DashboardPage \/>\} \/>/,
  /path="\/agent"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<AgentPage \/>\}/,
  /<Route path="\/notifications" element=\{<NotificationCenterPage \/>\} \/>/,
  /path="\/upload"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<UploadPage \/>\}/,
  /path="\/jobs"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<JobsPage \/>\}/,
  /path="\/jobs\/:id\/match"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<JobMatchPage \/>\}/,
  /path="\/pipeline"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<PipelinePage \/>\}/,
  /path="\/interviews"[\s\S]*?allow=\{\['recruiter', 'interviewer', 'manager', 'admin'\]\}[\s\S]*?element=\{<InterviewListPage \/>\}/,
  /path="\/interviews\/new"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin'\]\}[\s\S]*?element=\{<InterviewsPage \/>\}/,
  /path="\/interviews\/:id"[\s\S]*?allow=\{\['recruiter', 'manager', 'admin', 'interviewer'\]\}[\s\S]*?element=\{<InterviewReportPage \/>\}/,
  /path="\/bi"[\s\S]*?allow=\{\['manager', 'admin'\]\}[\s\S]*?element=\{<BiPage \/>\}/,
  /path="\/admin\/users"[\s\S]*?allow=\{\['admin'\]\}[\s\S]*?element=\{<UsersPage \/>\}/,
  /path="\/admin\/settings"[\s\S]*?allow=\{\['admin'\]\}[\s\S]*?element=\{<SystemSettingsPage \/>\}/,
  /path="\/admin\/ai-architecture"[\s\S]*?allow=\{\['admin'\]\}[\s\S]*?element=\{<AiArchitecturePage \/>\}/,
  /path="\/admin\/agent-logs"[\s\S]*?allow=\{\['admin'\]\}[\s\S]*?element=\{<AgentCallLogsPage \/>\}/,
];

for (const contract of protectedRouteContracts) {
  assert.match(app, contract, 'App route path, role order, and element must remain at the approved baseline');
}

const registry = readSource('app/featureRegistry.ts');
assert.doesNotMatch(
  registry,
  /(?:workbenchFeature|assistantFeature|pipelineFeature|interviewsFeature|analyticsFeature|adminFeature)/,
  'Page facades without route ownership must not be registered as route features',
);
