import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const analytics = readFileSync(new URL('../src/pages/AnalyticsPage.tsx', import.meta.url), 'utf8');
const cockpit = readFileSync(new URL('../src/pages/director/DirectorCockpitPage.tsx', import.meta.url), 'utf8');
const progress = readFileSync(new URL('../src/pages/director/DirectorProgressPage.tsx', import.meta.url), 'utf8');
const insights = readFileSync(new URL('../src/pages/director/DirectorInsightsPage.tsx', import.meta.url), 'utf8');
const approvals = readFileSync(new URL('../src/pages/director/DirectorApprovalsPage.tsx', import.meta.url), 'utf8');
const widgets = readFileSync(new URL('../src/pages/director/widgets.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

const pages = { analytics, cockpit, progress, insights, approvals };

// Every grafted page renders real API data, never mock/local fixtures, and
// never personal-performance ranking or bonus-style conclusions.
for (const [name, source] of Object.entries(pages)) {
  assert.doesNotMatch(
    source,
    /mocks\/|sessionStorage|localStorage|zhipin-current-role|readdy-export/,
    `${name} must not import Readdy mocks or local fixtures`,
  );
  assert.doesNotMatch(
    source,
    /绩效排名|个人排名|奖金|人均招聘成本|健康度打分|排行榜/,
    `${name} must not contain personal-performance ranking or bonus wording`,
  );
  assert.match(
    source,
    /role === 'manager' \|\| role === 'admin'/,
    `${name} must guard the view to manager/admin`,
  );
  assert.match(source, /暂无查看权限/, `${name} must explain missing permission`);
  assert.match(source, /接口失败/, `${name} must distinguish API failure from empty data`);
}

// Analytics page: team overview + single-demand drill-down.
assert.match(analytics, /data-ui="readdy-analytics"/);
assert.match(analytics, /api\.biOverview/);
assert.match(analytics, /数据分析/);
assert.match(analytics, /责任协同/);
assert.match(analytics, /DemandDrilldown/);

// Director cockpit: high-level summary with pending-offer and stagnation counts.
assert.match(cockpit, /data-ui="readdy-director-cockpit"/);
assert.match(cockpit, /api\.biOverview/);
assert.match(cockpit, /api\.listOffers\(\{ status: 'pending' \}\)/);
assert.match(cockpit, /总监驾驶舱/);
assert.match(cockpit, /Offer 待审批/);
assert.match(cockpit, /停滞预警/);

// Director progress: demand list + drill-down.
assert.match(progress, /data-ui="readdy-director-progress"/);
assert.match(progress, /api\.biOverview/);
assert.match(progress, /DemandDrilldown/);
assert.match(progress, /招聘进展/);
assert.match(progress, /需求清单/);

// Director insights: risk themes from real signals, not a retitled BI board.
assert.match(insights, /data-ui="readdy-director-insights"/);
assert.match(insights, /api\.biOverview/);
assert.match(insights, /洞察与风险/);
assert.match(insights, /停滞风险/);
assert.match(insights, /反馈积压/);
assert.match(insights, /HC 缺口与人才储备/);

// Director approvals: pending offers + approve/reject actions.
assert.match(approvals, /data-ui="readdy-director-approvals"/);
assert.match(approvals, /api\.listOffers/);
assert.match(approvals, /api\.runOfferAction/);
assert.match(approvals, /待审批队列/);
assert.match(approvals, /拒绝时必须填写原因/);

// The shared drill-down is the only place calling the demand-level BI API.
assert.match(widgets, /api\.biDemand\(demandId\)/);
assert.match(
  widgets,
  /`\/kanban\?demand=\$\{demandId\}&stage=\$\{selectedFunnelStage\.key\}`/,
  '单需求阶段抽屉必须保留到对应 Demand/阶段工作台的次级入口',
);
assert.match(
  widgets,
  /`\/kanban\?demand=\$\{demandId\}&stage=\$\{selectedDemandFact\.item\.stage\}&candidate=\$\{selectedDemandFact\.item\.candidate_id\}`/,
  '停滞候选人抽屉必须保留到对应 Demand 和候选人卡片的次级入口',
);
assert.match(
  widgets,
  /`\/interviews\?demand=\$\{demandId\}&candidate=\$\{selectedDemandFact\.item\.candidate_id\}&focus=pending`/,
  '待补反馈抽屉必须保留到对应面试任务的次级入口',
);

// API surface used by the graft must exist with the expected names.
assert.match(api, /biOverview\(/);
assert.match(api, /biDemand\(/);
assert.match(api, /listOffers\(/);
assert.match(api, /runOfferAction\(/);

console.log('readdy_analytics_director_contract: OK');
