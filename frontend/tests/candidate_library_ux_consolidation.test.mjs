import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const page = readSource('features/candidates/pages/CandidatesPage.tsx');

assert.match(page, /选择招聘需求/, 'Top-right action should return to the demand workspace');
assert.doesNotMatch(page, /按岗位找候选人/, 'Top-right action should not duplicate the job filter wording');

assert.match(page, /目标招聘需求/, 'Assignment filter should select the exact target demand');
assert.match(page, /先不加入需求/, 'Demand selection should remain optional while browsing the library');
assert.doesNotMatch(page, /按岗位查看/, 'Job filter should not sound like a second page entry');
assert.doesNotMatch(page, /不按岗位筛选/, 'Job filter placeholder should use plainer wording');

assert.match(page, /有技能标签/, 'Candidate summary should show a directly observable backend fact');
assert.doesNotMatch(page, /高匹配候选人/, 'A frontend score threshold must not be framed as matching truth');
assert.doesNotMatch(page, /当前页高分候选人/, 'High-score metric should not imply a confusing page-only KPI');

assert.match(page, /候选人列表/, 'Candidate table should be named by the object users are reviewing');
assert.doesNotMatch(page, /简历库列表/, 'Candidate table title should not repeat the page title');

assert.match(
  page,
  /调整搜索词、城市、来源、解析状态、入流程状态或技能条件后再查看/,
  'Empty state should mention the renamed filter',
);
