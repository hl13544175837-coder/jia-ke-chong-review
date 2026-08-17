import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });

test('流程总览保留飞书基准的 11 步、5 组和 4 类接口状态', async () => {
  const { recruitmentFlowGroups, integrationStatusMeta } = await jiti.import(
    new URL('../src/features/recruitmentFlow/flow.ts', import.meta.url).href,
  );

  assert.equal(recruitmentFlowGroups.length, 5);
  assert.equal(recruitmentFlowGroups.flatMap((group) => group.steps).length, 11);
  assert.deepEqual(Object.keys(integrationStatusMeta).sort(), [
    'backend_ready', 'external_pending', 'frontend_connected', 'validated',
  ]);
  assert.match(
    recruitmentFlowGroups.flatMap((group) => group.steps).map((step) => step.title).join(' '),
    /创建并提交招聘需求.*确认实际入职/,
  );
  assert.match(
    recruitmentFlowGroups.flatMap((group) => group.steps).find((step) => step.order === 9).branch,
    /加面 → 回到第 6 步/,
  );
});

test('流程总览页展示基准声明、四列泳道和关键分支，不调用 API', async () => {
  const source = await readFile(new URL('../src/pages/recruitment-flow/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /以飞书基准为准/);
  assert.match(source, /当前页面不调用接口/);
  assert.match(source, /状态流转/);
  assert.match(source, /主责角色/);
  assert.match(source, /动作说明/);
  assert.match(source, /接口准备情况/);
  assert.match(source, /step\.branch/);
  assert.doesNotMatch(source, /apiRequest\(|fetch\(|axios\./);
});

test('所有主角色可从导航进入流程总览路由', async () => {
  const [routerSource, layoutSource] = await Promise.all([
    readFile(new URL('../src/router/config.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/feature/MainLayout.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(routerSource, /const RecruitmentFlowPage = lazy\(\(\) => import\('@\/pages\/recruitment-flow\/page'\)\)/);
  assert.match(routerSource, /path: '\/recruitment-flow'/);
  for (const role of ['recruiter', 'manager', 'admin', 'interviewer', 'hr_director']) {
    assert.match(layoutSource, new RegExp(`path: '/recruitment-flow'.*label: '招聘流程'.*roles: \\['${role}'\\]`));
  }
});
