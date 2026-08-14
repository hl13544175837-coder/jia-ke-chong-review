import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });

test('工作经历字段归并成同一条可展示记录', async () => {
  const helperPath = new URL('../src/components/candidates/resumePresentation.ts', import.meta.url);
  const { normalizeWorkHistoryItem } = await jiti.import(helperPath.href);

  assert.deepEqual(normalizeWorkHistoryItem({
    company: '金木甄选好物（河北）科技发展有限公司杭州分公司',
    position: '产品',
    duration: '2024.12-2026.01',
    description: '主导供应链与履约系统对接',
  }), {
    company: '金木甄选好物（河北）科技发展有限公司杭州分公司',
    role: '产品',
    period: '2024.12-2026.01',
    details: [{ label: '经历说明', value: '主导供应链与履约系统对接' }],
    remaining: {},
  });
});

test('工作经历兼容起止时间、缺失字段和未识别补充信息', async () => {
  const helperPath = new URL('../src/components/candidates/resumePresentation.ts', import.meta.url);
  const { normalizeWorkHistoryItem } = await jiti.import(helperPath.href);

  assert.deepEqual(normalizeWorkHistoryItem({
    company: '上海微盟企业发展有限公司',
    title: '产品经理',
    start_date: '2021.08',
    end_date: '2024.08',
    achievements: ['完成业务中台建设'],
    team_size: '8 人',
  }), {
    company: '上海微盟企业发展有限公司',
    role: '产品经理',
    period: '2021.08 – 2024.08',
    details: [{ label: '主要成果', value: ['完成业务中台建设'] }],
    remaining: { team_size: '8 人' },
  });

  assert.deepEqual(normalizeWorkHistoryItem({ company: '仅有公司' }), {
    company: '仅有公司',
    role: '',
    period: '',
    details: [],
    remaining: {},
  });
});

test('工作经历段落使用专用整体卡片而不是通用字段宫格', async () => {
  const source = await readFile(new URL('../src/components/candidates/StructuredResumeView.tsx', import.meta.url), 'utf8');

  assert.match(source, /function WorkHistoryValue/);
  assert.match(source, /data-ui="work-history-card"/);
  assert.match(source, /section\.key === 'work'/);
  assert.match(source, /<WorkHistoryValue value=\{section\.value\}/);
});

test('结构化简历先展示顶部概览再让长内容使用整行宽度', async () => {
  const source = await readFile(new URL('../src/components/candidates/StructuredResumeView.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-ui="resume-overview-grid"/);
  assert.match(source, /data-ui="resume-main-sections"/);
  assert.doesNotMatch(source, /lg:grid-cols-3/);
  assert.doesNotMatch(source, /lg:col-span-2/);
  assert.doesNotMatch(source, /<aside/);
});

test('只有解析器元数据时不应伪装成结构化简历内容', async () => {
  const helperPath = new URL('../src/components/candidates/resumePresentation.ts', import.meta.url);
  const { buildResumeSections } = await jiti.import(helperPath.href);

  assert.deepEqual(buildResumeSections({
    extracted_info: {},
    skills: [],
    parse_method: 'vision',
    upload_date: '2026-08-13T15:58:37.305164',
  }), []);
});
