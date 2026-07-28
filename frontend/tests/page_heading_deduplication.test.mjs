import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('页面不再重复左侧导航的大标题，但保留说明文字', () => {
  const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');
  const jobs = read('readdy-frontend/src/pages/jobs/page.tsx');
  const candidates = read('readdy-frontend/src/pages/candidates/page.tsx');
  const interviews = read('readdy-frontend/src/pages/interviews/page.tsx');
  const offers = read('readdy-frontend/src/pages/offers/page.tsx');

  assert.doesNotMatch(dashboard, /<h1[^>]*>工作台<\/h1>/);
  assert.match(dashboard, /\{greeting\(\)\}/);

  assert.doesNotMatch(jobs, /<h1[^>]*>招聘需求<\/h1>/);
  assert.match(jobs, /审核需求、寻找候选人并跟进每个岗位的招聘进度/);

  assert.doesNotMatch(candidates, /:\s*'简历库'/);
  assert.match(candidates, /候选人与业务筛选/);
  assert.match(candidates, /当前需求候选人/);

  assert.doesNotMatch(interviews, /<h1[^>]*>面试管理<\/h1>/);
  assert.match(interviews, /从安排面试到收回反馈，都在这里处理/);

  assert.doesNotMatch(offers, /<h1[^>]*>Offer 工作台<\/h1>/);
  assert.match(offers, /确认方案、登记发放、跟进回复和确认入职/);
});
