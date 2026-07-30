import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const kanbanSource = read('src/pages/kanban/page.tsx');
const directorSource = read('src/pages/director/progress/page.tsx');
const analyticsSource = read('src/pages/analytics/page.tsx');

test('招聘进度把查看详情和修改阶段使用不同地址参数', () => {
  assert.match(kanbanSource, /searchParams\.get\('detailCandidate'\)/);
  assert.match(kanbanSource, /searchParams\.get\('target'\)/);
  assert.match(kanbanSource, /requestedCandidateId && requestedTarget/);
  assert.match(kanbanSource, /next\.set\('detailCandidate'/);
  assert.match(kanbanSource, /next\.set\('demand', String\(demandId\)\)/);
  assert.match(kanbanSource, /next\.delete\('detailCandidate'\)/);
  assert.match(kanbanSource, /data-ui="pipeline-history-drawer"/);
});

test('招聘进度详情加载失败保留错误并可以原地重试', () => {
  assert.match(kanbanSource, /historyError/);
  assert.match(kanbanSource, />重新加载</);
  assert.match(kanbanSource, /openHistory\(selectedCandidate/);
});

test('管理层高风险卡片和岗位整行都能打开只读详情', () => {
  assert.match(directorSource, /data-ui="director-risk-position"/);
  assert.match(directorSource, /data-ui="director-position-row"/);
  assert.match(directorSource, /data-ui="director-position-detail"/);
  assert.match(directorSource, /只读详情/);
  assert.match(directorSource, /selectedPosition\.blockReasons/);
});

test('管理层岗位详情支持键盘并用地址恢复打开状态', () => {
  assert.match(directorSource, /searchParams\.get\('position'\)/);
  assert.match(directorSource, /next\.set\('position'/);
  assert.match(directorSource, /next\.delete\('position'\)/);
  assert.match(directorSource, /event\.key === 'Enter'/);
  assert.match(directorSource, /event\.key === ' '/);
  assert.match(directorSource, /tabIndex=\{0\}/);
});

test('真实分析的指标、漏斗和部门都能下钻到需求组成', () => {
  assert.match(analyticsSource, /data-ui="analytics-kpi-drilldown"/);
  assert.match(analyticsSource, /data-ui="analytics-funnel-drilldown"/);
  assert.match(analyticsSource, /data-ui="analytics-department-drilldown"/);
  assert.match(analyticsSource, /data-ui="analytics-insight-detail"/);
  assert.match(analyticsSource, /data\.demands/);
  assert.match(analyticsSource, /当前条件下暂无组成明细/);
});

test('分析下钻可以刷新恢复且没有成本明细时不伪装成按钮', () => {
  assert.match(analyticsSource, /searchParams\.get\('insight'\)/);
  assert.match(analyticsSource, /next\.set\('insight'/);
  assert.match(analyticsSource, /next\.delete\('insight'\)/);
  assert.match(analyticsSource, /data-ui="analytics-cost-unavailable"/);
  assert.doesNotMatch(analyticsSource, /data-ui="analytics-cost-unavailable"[^>]*onClick=/);
});
