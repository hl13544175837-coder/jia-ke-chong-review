import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');
const nav = readFileSync(join(__dirname, '../src/lib/nav.ts'), 'utf8');
const demandRoutes = readFileSync(join(__dirname, '../src/features/demands/routes.tsx'), 'utf8');
const demandsPage = readFileSync(join(__dirname, '../src/features/demands/pages/DemandsPage.tsx'), 'utf8');
const jobMatchPage = readFileSync(join(__dirname, '../src/pages/JobMatchPage.tsx'), 'utf8');

for (const path of ['/dashboard', '/kanban', '/analytics', '/ai-assistant', '/settings']) {
  assert.ok(app.includes(`path="${path}"`), `正式路由应兼容 Readdy 路径 ${path}`);
}
assert.equal(
  [...app.matchAll(/path="\/analytics"/g)].length,
  1,
  'Readdy 数据分析只能有一个正式路由真源，不能再被旧 BI 页重复注册',
);
assert.match(
  app,
  /path="\/analytics"[\s\S]*?element=\{<AnalyticsPage \/>\}/,
  'Readdy /analytics 必须稳定指向真实团队概览和 Demand 下钻页面',
);
assert.match(app, /path="\/kanban"[\s\S]*allow=\{\['recruiter', 'manager', 'admin'\]\}/, '进度看板别名必须保留 HR 角色守卫');
assert.match(app, /path="\/analytics"[\s\S]*allow=\{\['manager', 'admin'\]\}/, '分析看板别名必须只允许 manager/admin');
assert.match(
  app,
  /path="\/pipeline"[\s\S]*?element=\{<KanbanPage \/>\}/,
  '旧 /pipeline 只可作为兼容地址，必须渲染 Readdy 新看板',
);
assert.match(
  app,
  /path="\/bi"[\s\S]*?element=\{<AnalyticsPage \/>\}/,
  '旧 /bi 只可作为兼容地址，必须渲染 Readdy 新分析页',
);
assert.match(
  app,
  /path="\/dashboard\/cycle"[\s\S]*?element=\{<AnalyticsPage \/>\}/,
  'Readdy 招聘周期入口必须落在统一分析页',
);
assert.doesNotMatch(app, /element=\{<PipelinePage \/>\}/, '旧 PipelinePage 不得再挂到正式路由');
assert.match(
  app,
  /function DashboardInterviewsRoute\([\s\S]*role === 'interviewer'[\s\S]*<InterviewListPage \/>[\s\S]*<ReaddyInterviewsPage \/>/,
  'Readdy 面试入口对 HR 使用新页面，面试官继续使用本人任务页',
);
assert.match(
  app,
  /path="\/dashboard\/interviews"[\s\S]*?element=\{<DashboardInterviewsRoute \/>\}/,
  'Dashboard 面试兼容地址必须按角色选择唯一工作台',
);
assert.match(app, /path="\/settings"[\s\S]*allow=\{\['admin'\]\}/, '设置别名必须只允许 admin');
assert.match(nav, /return '\/dashboard'/, '真实登录后应落到 Readdy 工作台路径');
assert.match(
  demandRoutes,
  /path:\s*'\/jobs'[\s\S]*element:\s*<DemandsPage/,
  'Readdy /jobs 必须展示真实用人需求，不能误指向岗位模板',
);
assert.match(
  app,
  /path="\/job-templates"[\s\S]*element=\{<JobsPage \/>\}/,
  '旧岗位/JD 模板能力应保留在二级路由',
);
assert.doesNotMatch(
  app,
  /path="\/jobs"[\s\S]*element=\{<JobsPage \/>\}/,
  'Readdy /jobs 不能继续渲染旧岗位模板页',
);
assert.match(demandsPage, /to="\/job-templates"/, '创建用人需求时仍可进入岗位/JD 模板');
assert.match(jobMatchPage, /to="\/job-templates"/, '岗位匹配返回应回到岗位/JD 模板');

console.log('readdy_route_contract: OK');
