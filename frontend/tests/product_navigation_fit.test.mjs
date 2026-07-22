import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const nav = readSource('lib/nav.ts');
const candidatesNav = readSource('features/candidates/nav.ts');
const demandsNav = readSource('features/demands/nav.ts');
const recruitmentTabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
const demandsFeature = readSource('features/demands/index.ts');
const app = readSource('App.tsx');
const shell = readSource('components/AppShell.tsx');
const dashboard = readSource('pages/DashboardPage.tsx');
const interviews = readSource('pages/InterviewListPage.tsx');

assert.doesNotMatch(
  nav,
  /label:\s*'通知中心'/,
  'Notifications should be a top-bar utility, not a primary sidebar module',
);

assert.ok(
  /label:\s*'简历库'/.test(candidatesNav) &&
    /label:\s*'招聘管理'/.test(demandsNav) &&
    nav.indexOf('...featureNavItems') < nav.indexOf("label: '候选人流程'") &&
    nav.indexOf("label: '候选人流程'") < nav.indexOf("label: '进度看板'"),
  'Sidebar should follow the HR workflow without adding interview as a second workbench',
);
assert.match(
  nav,
  /to:\s*'\/kanban'[\s\S]*label:\s*'候选人流程'/,
  '候选人流程主导航必须进入 Readdy 新看板',
);
assert.doesNotMatch(
  nav,
  /to:\s*'\/pipeline'[\s\S]*label:\s*'候选人流程'/,
  '旧 Pipeline 页面不能继续作为正式主导航',
);

assert.doesNotMatch(
  nav,
  /label:\s*'面试工作台'/,
  'Interview tasks should not remain as a duplicate top-level workbench',
);

assert.match(
  nav,
  /label:\s*'我的面试'[\s\S]*roles:\s*\['interviewer'\]/,
  'Interviewers should keep a narrow My Interviews sidebar entry',
);

assert.doesNotMatch(
  nav,
  /label:\s*'岗位管理'/,
  'Job management should be nested under 招聘管理 instead of competing as another sidebar module',
);

assert.ok(
  nav.indexOf("label: '进度看板'") < nav.indexOf("label: 'AI 助手'"),
  'AI assistant should support the workflow instead of interrupting the main HR path',
);

assert.match(
  recruitmentTabs,
  /to:\s*'\/demands'[\s\S]*label:\s*'用人需求'/,
  'Recruitment workspace should lead with recruitment demands',
);
assert.match(
  recruitmentTabs,
  /to:\s*'\/talent-map'/,
  'The real talent map should be reachable from recruitment management',
);
assert.doesNotMatch(recruitmentTabs, /to:\s*'\/jobs'/, 'Job portraits should stay contextual');
assert.match(
  demandsFeature,
  /topLevelPaths:\s*\[[\s\S]*'\/talent-map'[\s\S]*\]/,
  'The connected talent map should be treated as a top-level recruitment workspace',
);
assert.match(
  app,
  /path="\/job-templates"/,
  'Job portrait maintenance should remain available as a contextual secondary route',
);

assert.match(
  shell,
  /Bell/,
  'App shell should expose notification center from the top bar',
);
assert.match(
  shell,
  /to="\/notifications"/,
  'Top bar notification button should link to the notification center',
);
assert.doesNotMatch(
  shell,
  /data-shell="identity"/,
  'Sidebar should not repeat the current user card when the account menu already owns account actions',
);
assert.match(
  shell,
  /aria-haspopup="menu"[\s\S]*修改密码[\s\S]*退出登录/,
  'Password change and logout should live in one compact account menu instead of separate persistent top-bar buttons',
);

assert.match(
  dashboard,
  /常用动作/,
  'Dashboard should present role-focused actions rather than a second full menu',
);
assert.match(
  dashboard,
  /WORKFLOW_ACTIONS/,
  'Dashboard should use explicit role workflow actions',
);
assert.match(
  dashboard,
  /to:\s*'\/demands'[\s\S]*label:\s*'管理招聘需求'/,
  'Recruiter dashboard should point to demand work instead of presenting job portraits as a main action',
);
assert.doesNotMatch(
  dashboard,
  /to:\s*'\/jobs'[\s\S]*label:\s*'匹配候选人'/,
  'Dashboard should not expose job portraits as a standalone primary entry',
);
assert.doesNotMatch(
  dashboard,
  /label:\s*'处理面试反馈'/,
  'Dashboard common actions should not recreate a generic interview-workbench shortcut',
);
assert.match(
  dashboard,
  /to="\/interviews\?status=pending_feedback"[\s\S]*label="待补反馈"/,
  'Dashboard should keep interview feedback reachable as a specific todo',
);
assert.doesNotMatch(
  dashboard,
  /navItemsForRole/,
  'Dashboard should not duplicate every sidebar navigation item',
);
assert.doesNotMatch(
  dashboard,
  /快速进入/,
  'Dashboard should avoid repeating the sidebar as a quick-entry grid',
);

assert.match(
  interviews,
  /待我处理/,
  'Interview task page should lead with pending work for HR and interviewers',
);
assert.match(
  interviews,
  /面试记录/,
  'Interview task page should expose records as a clear workspace section',
);
