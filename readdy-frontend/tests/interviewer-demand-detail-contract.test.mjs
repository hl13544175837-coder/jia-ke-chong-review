import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const pageSource = readFileSync(path.join(root, 'src/pages/interviewer/jobs/page.tsx'), 'utf8');
const demandTypesSource = readFileSync(path.join(root, 'src/features/demands/types.ts'), 'utf8');
const screeningSource = readFileSync(path.join(root, 'src/pages/interviewer/screening/page.tsx'), 'utf8');
const drawerPath = path.join(root, 'src/pages/interviewer/jobs/components/InterviewerDemandDetailDrawer.tsx');
const drawerSource = existsSync(drawerPath) ? readFileSync(drawerPath, 'utf8') : '';
const formSource = readFileSync(path.join(root, 'src/features/demands/components/RequisitionForm.tsx'), 'utf8');

test('面试官需求整行可点击并通过地址恢复完整详情', () => {
  assert.match(pageSource, /data-ui="interviewer-demand-row"/);
  assert.match(pageSource, /查看详情/);
  assert.match(pageSource, /demandsApi\.getDemand/);
  assert.match(pageSource, /searchParams\.get\('demand'\)/);
  assert.match(pageSource, /setSearchParams/);
  assert.match(pageSource, /<InterviewerDemandDetailDrawer/);
});

test('面试官需求详情只展示允许的信息和按状态区分的下一步', () => {
  assert.notEqual(drawerSource, '', '面试官需求详情组件尚未创建');
  assert.match(drawerSource, /ReadOnlyDetailDrawer/);
  assert.match(drawerSource, /完整 JD/);
  assert.match(drawerSource, /驳回原因/);
  assert.match(drawerSource, /等待招聘专员审核/);
  assert.match(drawerSource, /修改并重新提交/);
  assert.match(drawerSource, /查看待筛选候选人/);
  assert.doesNotMatch(drawerSource, /approveDemand|rejectDemand|审核通过|发放 Offer|删除需求|关闭需求/);
});

test('从已通过需求进入筛选页时只显示该需求的任务', () => {
  assert.match(screeningSource, /searchParams\.get\('demand'\)/);
  assert.match(screeningSource, /task\.demand_id === requestedDemandId/);
  assert.match(screeningSource, /当前仅显示/);
});

test('面试官修改的是本次需求 JD 并随重提请求保存', () => {
  assert.match(demandTypesSource, /interface DemandUpdateInput[\s\S]*jd_text\?: string/);
  assert.match(pageSource, /jd_text: payload\.jd_text\?\.trim\(\)/);
  assert.doesNotMatch(pageSource, /<textarea readOnly rows=\{10\} value=\{templateLoading/);
  assert.match(formSource, /不影响公共岗位模板/);
});
