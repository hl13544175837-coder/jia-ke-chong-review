import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(root, path), 'utf8');

const drawerPath = join(root, 'components/ui/DrawerShell.tsx');
const workspacePath = join(root, 'features/demands/components/DemandWorkspaceDrawer.tsx');

assert.ok(existsSync(drawerPath), 'The shared company-style right drawer shell should exist');
assert.ok(existsSync(workspacePath), 'Demand list interactions should share one workspace drawer');

const drawer = read('components/ui/DrawerShell.tsx');
const uiIndex = read('components/ui/index.ts');
const table = read('features/demands/components/DemandTable.tsx');
const page = read('features/demands/pages/DemandsPage.tsx');
const workspace = read('features/demands/components/DemandWorkspaceDrawer.tsx');

for (const prop of ['open', 'onClose', 'title', 'eyebrow', 'description', 'children', 'footer', 'size', 'testId']) {
  assert.match(drawer, new RegExp(`\\b${prop}\\b`), `DrawerShell should expose the ${prop} contract`);
}
assert.match(drawer, /createPortal/, 'DrawerShell should portal outside animated page containers');
assert.match(drawer, /document\.body/, 'DrawerShell should portal to the browser body');
assert.match(drawer, /role="dialog"/, 'DrawerShell should expose dialog semantics');
assert.match(drawer, /aria-modal="true"/, 'DrawerShell should be modal to assistive technology');
assert.match(drawer, /event\.key === 'Escape'/, 'Escape should close the drawer');
assert.match(drawer, /event\.key [!=]== 'Tab'/, 'Keyboard focus should remain inside the drawer');
assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/, 'Open drawers should lock background scrolling');
assert.match(drawer, /appRoot\.inert = true/, 'The application behind an open drawer should be inert');
assert.match(drawer, /previousFocusRef\.current\?\.isConnected/, 'Closing should restore the original trigger focus');
assert.match(drawer, /w-full/, 'The drawer should become full width on narrow screens');
assert.match(drawer, /sm:max-w-/, 'Desktop drawers should preserve a right-side maximum width');
assert.match(uiIndex, /DrawerShell/, 'The shared UI barrel should export DrawerShell');

assert.doesNotMatch(table, /from 'react-router-dom'/, 'Demand table clicks should not navigate away');
assert.match(table, /onOpenDemand/, 'Demand table should delegate all high-value clicks to one drawer controller');
assert.match(table, /data-ui="demand-details-trigger"/, 'Demand detail should remain an explicit independent action');
assert.match(table, /onOpenDemand\(demand, \{ kind: 'overview' \}\)/, 'The explicit details action should open overview context');
assert.match(table, /onApplyFilter/, 'Information cells should apply list filters instead of opening the drawer');
assert.match(table, /event\.stopPropagation\(\)/, 'Filtering and detail actions should not bubble into another interaction');

assert.match(workspace, /<DrawerShell/, 'Demand detail should use the shared right drawer shell');
assert.match(workspace, /api\.getDemandPipelineBoard\(demand\.id\)/, 'Candidate context should load the real demand-scoped board');
assert.match(workspace, /候选人与进度/, 'The drawer should expose a candidate/progress workspace');
assert.match(workspace, /责任与状态/, 'The drawer should expose real responsibility and lifecycle facts');
assert.match(workspace, /to=\{`\/demands\/\$\{demand\.id\}`\}/, 'The full-page route should remain only as an explicit secondary action');

assert.doesNotMatch(page, /useNavigate/, 'Demand creation should stay on the list page');
assert.match(page, /<DrawerShell[\s\S]*open=\{createDrawerOpen\}/, 'Demand creation should open in the shared right drawer');
assert.match(page, /demands\.reload\(\)/, 'Successful creation should refresh the real demand list');
assert.match(page, /kind: 'overview'/, 'Successful creation should open the new real demand in overview context');
assert.match(page, /<DemandWorkspaceDrawer/, 'The list page should mount the shared demand workspace drawer');
assert.match(page, /onOpenDemand=\{openDemandWorkspace\}/, 'The table detail action should open the list-page drawer controller');
assert.match(page, /点击右上角“新建需求”/, 'The empty state should point to the new drawer trigger');
assert.doesNotMatch(page, /使用上方表单/, 'The empty state should not reference the removed inline form');

console.log('demand_drawer_interactions: OK');
