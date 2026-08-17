import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });

test('流程总览以当前真实状态绘制角色泳道和分支', async () => {
  const { recruitmentSwimlanes, recruitmentFlowNodes, recruitmentFlowConnections } = await jiti.import(
    new URL('../src/features/recruitmentFlow/flow.ts', import.meta.url).href,
  );

  assert.deepEqual(recruitmentSwimlanes.map((lane) => lane.id), [
    'requester', 'recruiter', 'business_reviewer', 'interviewer', 'candidate', 'manager', 'system',
  ]);
  assert.match(recruitmentFlowNodes.map((node) => node.status).join(' '), /pending.*ai_screen.*business_review.*interview.*onboarded.*rejected/);
  assert.ok(recruitmentFlowNodes.some((node) => node.id === 'offer_draft'));
  assert.match(recruitmentFlowNodes.map((node) => node.status).join(' '), /draft.*approved.*sent.*accepted.*declined.*expired/);
  assert.ok(recruitmentFlowConnections.some((connection) => connection.label === '加面'));
  assert.ok(recruitmentFlowConnections.some((connection) => connection.label === '淘汰'));
  assert.equal(Math.max(...recruitmentFlowNodes.map((node) => node.column)), 8);
  assert.equal(new Set(recruitmentFlowNodes.map((node) => `${node.lane}:${node.column}`)).size, recruitmentFlowNodes.length);
});

test('流程总览页是只读的状态流转泳道图，不调用 API', async () => {
  const source = await readFile(new URL('../src/pages/recruitment-flow/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /状态流转泳道图/);
  assert.match(source, /当前页面不调用接口/);
  assert.match(source, /<svg/);
  assert.match(source, /recruitmentFlowConnections/);
  assert.match(source, /recruitmentSwimlanes/);
  assert.doesNotMatch(source, /以飞书基准为准/);
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
