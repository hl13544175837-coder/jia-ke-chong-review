import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const app = readSource('App.tsx');

for (const path of [
  '/dashboard/interviews',
  '/dashboard/offers',
  '/dashboard/hired',
  '/dashboard/cycle',
  '/interviewer/dashboard',
  '/interviewer/interviews',
  '/interviewer/screening',
  '/interviewer/candidates',
  '/interviewer/jobs',
  '/director/cockpit',
  '/director/progress',
  '/director/insights',
  '/director/approvals',
]) {
  assert.ok(app.includes(`path="${path}"`), `正式路由应兼容 Readdy 路径 ${path}`);
}

assert.match(
  app,
  /path="\/interviewer\/candidates"[\s\S]*allow=\{\['interviewer'\]\}[\s\S]*view="candidates"/,
  '面试官候选人视图必须只允许 interviewer',
);
assert.match(
  app,
  /path="\/director\/approvals"[\s\S]*allow=\{\['manager', 'admin'\]\}[\s\S]*OffersPage/,
  '总监审批页必须复用真实 Offer 审批闭环',
);

assert.ok(
  existsSync(join(srcRoot, 'pages/InterviewerScopePage.tsx')),
  '应存在只展示已分配范围的面试官页面',
);
const page = readSource('pages/InterviewerScopePage.tsx');
assert.match(page, /api\.listInterviewAssignments\(\)/, '面试官范围应来自真实面试分配 API');
assert.match(page, /view === 'candidates'/, '页面应提供已分配候选人视图');
assert.match(page, /view === 'jobs'/, '页面应提供参与岗位视图');
assert.doesNotMatch(page, /localStorage|sessionStorage|mock/i, '面试官业务不得使用模拟或浏览器业务存储');
