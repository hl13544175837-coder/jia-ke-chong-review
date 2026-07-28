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

test('左侧导航记住四个招聘模块的最后网址和滚动位置', () => {
  const helperPath = path.join(root, 'readdy-frontend/src/features/navigation/pageMemory.ts');
  assert.ok(fs.existsSync(helperPath), '缺少共享页面记忆模块');

  const helper = read('readdy-frontend/src/features/navigation/pageMemory.ts');
  const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');

  for (const routePath of ['/jobs', '/candidates', '/interviews', '/offers']) {
    assert.match(helper, new RegExp(routePath.replace('/', '\\/')), `未记住 ${routePath}`);
  }
  assert.match(helper, /memoryKeyForPath/);
  assert.match(helper, /safeRememberedHref/);
  assert.match(layout, /pageMemoriesRef/);
  assert.match(layout, /mainScrollRef/);
  assert.match(layout, /rememberedNavTarget/);
  assert.match(layout, /onScroll=\{rememberMainScroll\}/);
  assert.doesNotMatch(`${helper}\n${layout}`, /localStorage|sessionStorage/);
});

test('招聘需求把筛选、排序和当前详情写入网址', () => {
  const page = read('readdy-frontend/src/pages/jobs/page.tsx');

  for (const key of [
    'tab', 'q', 'department', 'city', 'owner', 'stage',
    'headcount', 'deadline', 'sort', 'order', 'demand',
  ]) {
    assert.match(page, new RegExp(`['\"]${key}['\"]`), `招聘需求缺少 ${key} 网址状态`);
  }
  assert.match(page, /syncDemandWorkspaceUrl/);
  assert.match(page, /openDemandInUrl/);
  assert.match(page, /closeDemandDetail/);
  assert.match(page, /setSearchParams\(next,\s*\{\s*replace:\s*true\s*\}\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('简历库把范围、筛选、页码和当前简历写入网址', () => {
  const page = read('readdy-frontend/src/pages/candidates/page.tsx');

  for (const key of [
    'scope', 'q', 'demand', 'city', 'education', 'skill', 'source',
    'parse', 'stage', 'score', 'sort', 'order', 'page', 'candidate',
  ]) {
    assert.match(page, new RegExp(`['\"]${key}['\"]`), `简历库缺少 ${key} 网址状态`);
  }
  assert.match(page, /syncCandidateWorkspaceUrl/);
  assert.match(page, /openCandidateInUrl/);
  assert.match(page, /closeCandidateDetail/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('面试管理把列表视图、筛选和当前面试写入网址', () => {
  const page = read('readdy-frontend/src/pages/interviews/page.tsx');

  for (const key of [
    'status', 'q', 'view', 'job', 'interviewer', 'schedule',
    'dateFrom', 'dateTo', 'round', 'city', 'department',
    'demand', 'candidate', 'assignment',
  ]) {
    assert.match(page, new RegExp(`['\"]${key}['\"]`), `面试管理缺少 ${key} 网址状态`);
  }
  assert.match(page, /syncInterviewWorkspaceUrl/);
  assert.match(page, /openInterviewInUrl/);
  assert.match(page, /closeInterviewDetail/);
});

test('Offer 把标签、筛选、排序和当前详情写入网址', () => {
  const page = read('readdy-frontend/src/pages/offers/page.tsx');

  for (const key of ['tab', 'q', 'demand', 'request', 'owner', 'risk', 'order', 'offer']) {
    assert.match(page, new RegExp(`['\"]${key}['\"]`), `Offer 缺少 ${key} 网址状态`);
  }
  assert.match(page, /syncOfferWorkspaceUrl/);
  assert.match(page, /openOfferInUrl/);
  assert.match(page, /closeOfferDetail/);
});
