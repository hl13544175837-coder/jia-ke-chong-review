import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const roleModel = read('readdy-frontend/src/auth/productRoleModel.ts');
assert.match(roleModel, /业务负责人 \/ 面试官/, '试点角色名称必须覆盖业务负责人职责');

const layout = read('readdy-frontend/src/components/feature/MainLayout.tsx');
assert.match(layout, /label: '待业务筛选'/, '业务角色必须有明确的待业务筛选入口');
assert.match(layout, /label: '招聘需求'/, '业务角色必须能找到自己填写和参与的招聘需求');
assert.doesNotMatch(layout, /label: 'AI 助手'/, '试点导航必须隐藏 AI 助手');
assert.doesNotMatch(layout, /to="\/ai-assistant"/, '试点主壳必须隐藏 AI 浮动入口');
assert.doesNotMatch(layout, /label: 'KPI 标准'/, '试点导航必须隐藏 KPI 标准');
assert.doesNotMatch(layout, /label: 'BOSS/, '试点导航必须隐藏 BOSS 自动化');

const screening = read('readdy-frontend/src/pages/interviewer/screening/page.tsx');
assert.match(screening, /待业务筛选/, '业务筛选页面必须使用用户确认后的名称');
assert.match(screening, /招聘专员推送的简历/, '业务筛选任务必须由 HR 推送产生');

const handoffPath = path.join(root, 'docs/13_试点业务流程与研发接口交接.md');
assert.ok(fs.existsSync(handoffPath), '必须提供研发可直接使用的试点流程与接口交接文档');
const handoff = read('docs/13_试点业务流程与研发接口交接.md');
for (const phrase of [
  '业务填写招聘需求',
  'HR 筛选',
  '业务筛选',
  '一面',
  '二面',
  'Offer',
  '原版简历',
  '满意',
  '待定',
  '不满意',
  '需要 HR 补充信息',
  '不自动推进',
  '研发负责提供',
]) {
  assert.ok(handoff.includes(phrase), `研发交接文档缺少：${phrase}`);
}

console.log('readdy_pilot_handoff_contract: OK');
