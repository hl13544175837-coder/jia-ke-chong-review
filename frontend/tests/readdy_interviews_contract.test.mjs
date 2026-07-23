import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/ReaddyInterviewsPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const tableHeader = page.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? '';

// Readdy 面试工作台的真实数据底座
assert.match(page, /data-ui="readdy-interviews"/);

// 必须调用真实 API 方法
assert.match(page, /api\.listInterviewAssignments/);
assert.match(page, /api\.listInterviews\(/);
assert.match(page, /api\.listDemands\(/);
assert.match(page, /api\.listInterviewers\(/);
assert.match(page, /api\.createInterviewAssignment/);
assert.match(page, /api\.cancelInterviewAssignment/);
assert.match(page, /api\.getDemandPipelineBoard/);

// 禁止引入 mock 数据 / 本地存储角色 hack
assert.doesNotMatch(page, /mocks\/interviews|zhipin-current-role|sessionStorage|initialInterviews/);

// Figma/Readdy 工具栏：只有即时搜索、当前条数和同页列表/日历切换。
// 不能回退成 H1 说明、全局“安排面试”按钮、KPI 卡片或一整行全局筛选器。
assert.match(page, /placeholder="搜索候选人、岗位、面试官\.\.\."/);
assert.match(page, /onChange=\{\(event\) => \{?[\s\S]{0,160}setSearch\(event\.target\.value/);
assert.match(page, /共\s*<strong[\s\S]*?\{filtered\.length\}[\s\S]*?<\/strong>\s*条/);
assert.match(page, /列表视图/);
assert.match(page, /日历视图/);
assert.doesNotMatch(page, /<h1[\s\S]*?>[\s\S]*?面试管理[\s\S]*?<\/h1>/);
assert.doesNotMatch(page, /所有数据来自真实面试协同记录/);
assert.doesNotMatch(page, /\/\* 统计卡片 \*\//);
assert.doesNotMatch(page, /aria-label="按招聘需求筛选"/);
assert.doesNotMatch(page, /aria-label="按状态筛选"/);
assert.doesNotMatch(page, /aria-label="按面试官筛选"/);

// 七列必须逐列呈现，不能合并成“候选人 / 岗位”等旧列；每个表头只能展开当前页筛选。
[
  '候选人',
  '应聘岗位',
  '城市',
  '部门',
  '面试轮次',
  '面试安排',
  '操作',
].forEach((label) => {
  assert.match(tableHeader, new RegExp(`<th[^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/th>`), `缺少七列表头：${label}`);
});
assert.match(page, /const \[headerFilter, setHeaderFilter\] = useState/);
assert.match(page, /toggleHeaderFilter/);
assert.match(page, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*toggleHeaderFilter/);
assert.doesNotMatch(page, /setSearchParams\([^\n]*header/);
assert.doesNotMatch(tableHeader, /onClick=[\s\S]{0,240}(?:sort|setSearchParams)/i);

// 候选人信息以头像承载身份；列表和日历仍是同一页中的两个视图。
assert.match(page, /候选人头像/);

// 行级状态动作矩阵。安排和跟进必须从对应行发起，不能再依赖页面级主按钮。
[
  ['尚未安排', '安排面试'],
  ['已排期', '查看\/调整'],
  ['已排期', '确认已完成'],
  ['已排期', '未进行'],
  ['通过', '查看结果'],
  ['反馈已完成，等待处理', '处理结果'],
  ['等待.*反馈', '催反馈'],
  ['等待.*反馈', '查看反馈'],
].forEach(([status, action]) => {
  assert.match(page, new RegExp(`${status}[\\s\\S]{0,1200}${action}`), `状态“${status}”缺少动作“${action}”`);
});
assert.match(page, /aria-label="更多操作"/);
assert.match(page, /event\.stopPropagation\(\)/);
assert.doesNotMatch(page, /sm:justify-between[\s\S]{0,700}<Button onClick=\{\(\) => setScheduleOpen\(true\)\}/);

// 空态 / 错误态 / 加载态
assert.match(page, /暂无面试任务/);
assert.match(page, /暂无符合条件的面试/);
assert.match(page, /加载失败/);
assert.match(page, /加载面试任务/);
assert.match(page, /ErrorState/);
assert.match(page, /EmptyState/);
assert.match(page, /Spinner/);

// 安排面试仍走真实 API，且从行级动作触发。
assert.match(page, /安排面试/);
assert.match(page, /interviewer_schedule_conflict/);
assert.match(page, /默认面试官/);
assert.match(page, /pending \/ active/);

// 取消面试关键交互（必填原因）
assert.match(page, /取消面试/);
assert.match(page, /取消原因（必填）/);

// 待反馈标记 + 查看/填写反馈入口
assert.match(page, /待反馈/);
assert.match(page, /填写反馈/);
assert.match(page, /查看反馈/);

// 无权限提示
assert.match(page, /无权限/);

// 反馈提交不得自动推进主流程：只允许调用反馈接口，禁止 pipeline move
assert.doesNotMatch(page, /movePipeline|api\.transferPipeline/);

// api.ts 中确实存在这些方法
assert.match(api, /listInterviewAssignments\(/);
assert.match(api, /createInterviewAssignment\(/);
assert.match(api, /cancelInterviewAssignment\(/);
assert.match(api, /listInterviewers\(/);

console.log('readdy_interviews_contract: OK');
