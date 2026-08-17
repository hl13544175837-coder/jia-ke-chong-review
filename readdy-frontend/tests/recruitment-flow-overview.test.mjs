import assert from 'node:assert/strict';
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
