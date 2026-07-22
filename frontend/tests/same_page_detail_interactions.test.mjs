import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');

const dashboard = read('pages/DashboardPage.tsx');
const jobs = read('pages/JobsPage.tsx');

assert.match(
  dashboard,
  /function KpiCard\([\s\S]*onActivate/,
  '工作台 KPI 应提供当前页明细交互，而不是只有 hover 展示',
);
assert.match(
  dashboard,
  /<DrawerShell[\s\S]*dashboard-kpi-drawer/,
  '工作台 KPI 明细应在统一右侧抽屉中展示',
);
assert.match(
  dashboard,
  /setKpiDetail\(/,
  '点击 KPI 应更新当前页抽屉上下文',
);

assert.match(
  jobs,
  /const \[selectedJob, setSelectedJob\] = useState<JobListItem \| null>/,
  '岗位页应显式保存当前选中的岗位',
);
assert.match(
  jobs,
  /onClick=\{\(\) => setSelectedJob\(job\)\}/,
  '点击岗位行应在当前页选择岗位详情',
);
assert.match(
  jobs,
  /onKeyDown=\{\(event\) => handleJobRowKeyDown\(event, job\)\}/,
  '岗位行应支持键盘打开详情',
);
assert.match(
  jobs,
  /<JobDetailSummary job=\{selectedJob \?\? filteredJobs\[0\] \?\? null\}/,
  '右侧岗位详情必须由选中行或当前筛选结果驱动，筛选为空时不得展示被排除的岗位',
);
assert.match(
  jobs,
  /event\.stopPropagation\(\)/,
  '岗位行内编辑、关闭和跳转动作不应误触整行选择',
);

console.log('same_page_detail_interactions: OK');
