import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const modulePath = path.join(root, 'src/features/workbench/communicationTasks.ts');

test('待沟通由独立工作台模块按候选人和需求生成', () => {
  assert.equal(existsSync(modulePath), true, '缺少独立待沟通任务模块');
  const source = read('src/features/workbench/communicationTasks.ts');
  assert.match(source, /buildCommunicationTasks/);
  assert.match(source, /feedback_submitted/);
  assert.match(source, /pipeline_stage === 'interview'/);
  assert.match(source, /candidate_id[\s\S]*demand_id/);
  assert.match(source, /Map<string, InterviewManagementRow>/);
  assert.doesNotMatch(source, /pages\/offers/);
});

test('工作台显示待沟通并深链到对应候选人', () => {
  const summary = read('src/pages/dashboard/summary.ts');
  const dashboard = read('src/pages/dashboard/page.tsx');
  assert.match(summary, /buildCommunicationTasks/);
  assert.match(summary, /communicationTasks/);
  assert.match(dashboard, /待沟通/);
  assert.match(dashboard, /action=communicate/);
  assert.match(dashboard, /candidate=\$\{item\.candidateId\}/);
  assert.match(dashboard, /demand=\$\{item\.demandId\}/);
  assert.doesNotMatch(dashboard, /from ['"][^'"]*pages\/offers/);
});

test('待沟通不会被前四条任务藏住，查看全部在当前工作台展开', () => {
  const dashboard = read('src/pages/dashboard/page.tsx');

  assert.match(dashboard, /const \[showAllTasks, setShowAllTasks\]/);
  assert.match(dashboard, /const visibleTaskItems/);
  assert.match(dashboard, /firstCommunicationTask/);
  assert.match(dashboard, /item\.tag === '待沟通'/);
  assert.match(dashboard, /if \(showAllTasks \|\| taskItems\.length <= 4\) return taskItems/);
  assert.doesNotMatch(dashboard, /taskItems\.slice\(0, 4\)\.map/);
  assert.match(dashboard, /onClick=\{\(\) => setShowAllTasks/);
});
