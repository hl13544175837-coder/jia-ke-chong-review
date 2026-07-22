import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const progress = readFileSync(new URL('../src/pages/director/DirectorProgressPage.tsx', import.meta.url), 'utf8');
const insights = readFileSync(new URL('../src/pages/director/DirectorInsightsPage.tsx', import.meta.url), 'utf8');
const approvals = readFileSync(new URL('../src/pages/director/DirectorApprovalsPage.tsx', import.meta.url), 'utf8');

function assertEveryKpiActivates(source, expectedCount, pageName) {
  const cards = source.match(/<KpiCard[\s\S]*?\/>/g) ?? [];
  assert.equal(cards.length, expectedCount, `${pageName} KPI 数量不应被改变`);
  for (const card of cards) {
    assert.match(card, /onActivate=\{\(\) => set[A-Za-z]+Kpi\(/, `${pageName} 每张 KPI 都应首击打开同页明细`);
  }
}

assert.match(progress, /const \[selectedProgressKpi, setSelectedProgressKpi\] = useState<[^>]+ \| null>\(null\)/);
assertEveryKpiActivates(progress, 4, '招聘进展');
assert.match(progress, /<DrawerShell[\s\S]*testId="director-progress-kpi-drawer"/);
assert.match(progress, /footer=\{\([\s\S]*<Link[\s\S]*进入完整工作台/);

assert.match(insights, /const \[selectedInsightsKpi, setSelectedInsightsKpi\] = useState<[^>]+ \| null>\(null\)/);
assertEveryKpiActivates(insights, 4, '洞察与风险');
assert.match(insights, /<DrawerShell[\s\S]*testId="director-insights-kpi-drawer"/);
assert.match(insights, /footer=\{\([\s\S]*<Link[\s\S]*进入完整工作台/);

assert.match(approvals, /const \[selectedApprovalsKpi, setSelectedApprovalsKpi\] = useState<[^>]+ \| null>\(null\)/);
assertEveryKpiActivates(approvals, 2, 'Offer 审批');
assert.match(approvals, /<DrawerShell[\s\S]*testId="director-approvals-kpi-drawer"/);
assert.match(approvals, /footer=\{\([\s\S]*<Link[\s\S]*进入完整工作台/);

// KPI 抽屉不得破坏原有 Offer 详情和审批状态机。
assert.match(approvals, /function OfferApprovalDetailDrawer/);
assert.match(approvals, /testId="director-approval-detail-drawer"/);
assert.match(approvals, /api\.runOfferAction/);
assert.match(approvals, /setActionTarget\(\{ offer, action: 'approve' \}\)/);
assert.match(approvals, /setActionTarget\(\{ offer, action: 'reject' \}\)/);

console.log('director_kpi_same_page_drawers: OK');
