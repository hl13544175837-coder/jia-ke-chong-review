import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/features/demands/pages/DemandsPage.tsx', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../src/features/demands/components/DemandWorkspaceDrawer.tsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/features/demands/components/DemandActionDialog.tsx', import.meta.url), 'utf8');

for (const label of ['调整优先级', '转派负责人', '暂停 / 关闭', '恢复需求']) {
  assert.match(drawer, new RegExp(label.replace('/', '\\/')), `Demand 同页抽屉应保留“${label}”真实业务动作`);
}
assert.match(drawer, /onRequestAction/, '抽屉内的动作应交给列表页统一执行');
assert.match(drawer, /role === 'manager' \|\| role === 'admin'/, '转派负责人应保留公司角色限制');
assert.match(drawer, /仅招聘经理或管理员可转派/, '无转派权限时应有直接说明');
assert.match(drawer, /负责人列表加载失败/, '负责人加载失败时应说明转派不可用');
assert.match(drawer, /onReloadOwners/, '负责人加载失败应能同页重试');
assert.match(
  drawer,
  /to=\{`\/jobs\/\$\{demand\.job_id\}\/match\?demand=\$\{demand\.id\}`\}[\s\S]*匹配候选人/,
  '旧完整需求页的“匹配候选人”真实入口应保留为抽屉次级动作',
);

assert.match(page, /<DemandActionDialog/, '列表页应复用现有 DemandActionDialog');
assert.match(page, /demandsApi\.closeDemand/, '暂停或关闭应调用真实 Demand API');
assert.match(page, /demandsApi\.restoreDemand/, '恢复需求应调用真实 Demand API');
assert.match(page, /demandsApi\.downgradeDemand/, '调整优先级应调用真实 Demand API');
assert.match(page, /demandsApi\.reassignDemandOwner/, '转派负责人应调用真实 Demand API');
assert.match(page, /setWorkspace\(\(current\)[\s\S]*demand: updated/, '动作成功后应立即替换抽屉中的真实需求');
assert.match(page, /demands\.reload\(\)/, '动作成功后应刷新列表');
assert.match(page, /demand=\{actionMode \? null : workspace\?\.demand \?\? null\}/, '动作对话框打开时应卸载业务抽屉，避免双 portal 抢焦点');
assert.doesNotMatch(page, /useNavigate/, '需求动作不应为此离开 /demands');
assert.match(dialog, /actionError/, '真实 API 失败应在当前动作对话框内反馈');

console.log('demand_drawer_actions: OK');
