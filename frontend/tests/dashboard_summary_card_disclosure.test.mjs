import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(
  path.join(root, 'readdy-frontend/src/pages/dashboard/page.tsx'),
  'utf8',
);
const monthlyPanel = fs.readFileSync(
  path.join(root, 'readdy-frontend/src/pages/dashboard/components/MonthlyPerformancePanel.tsx'),
  'utf8',
);
const visibleDashboardSource = `${page}\n${monthlyPanel}`;

for (const label of [
  '需要关注',
  '待处理事项',
  '今日面试',
  '我的岗位进展',
  '阶段概况',
  '等待他人',
  '数据看板',
]) {
  assert.match(visibleDashboardSource, new RegExp(label), `平衡型工作台缺少“${label}”`);
}

for (const action of ['新建需求', '导入简历', '安排面试']) {
  assert.match(page, new RegExp(action), `工作台缺少快捷操作“${action}”`);
}

assert.match(page, /summary\.todayInterviews\.slice\(0, 3\)/, '今日面试最多展示三条真实日程');
assert.match(page, /taskItems\.slice\(0, 4\)/, '待处理事项首屏最多展示四条');
assert.match(page, /summary\.demandProgress\.slice\(0, 5\)/, '岗位进展首屏最多展示五个重点岗位');
assert.match(page, /interviewsApi\.remindFeedback/, '面试催反馈必须调用真实提醒接口');
assert.match(page, /<FunnelChart/, '工作台应展示可点击的招聘漏斗');
assert.match(page, /MonthlyPerformancePanel/, '工作台应展示按自然月统计的数据看板');
assert.doesNotMatch(page, /data-ui="dashboard-data-overview"/, '旧数据概览应从工作台移除');
assert.doesNotMatch(page, /data-ui="dashboard-performance-overview"/, '旧招聘业绩统计应从工作台移除');
assert.match(page, /2xl:flex-row/, '顶部快捷操作只能在主内容宽度充足时与问候语并排');
assert.doesNotMatch(page, /\{item\}\s*\{item\}/, '关注提醒不得重复显示同一段文字');
assert.doesNotMatch(page, /type DashboardPanel|const cards =|cards\.map/, '不得保留四张大卡片工作台');

console.log('dashboard_summary_card_disclosure: OK');
