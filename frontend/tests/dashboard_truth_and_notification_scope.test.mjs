import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const summary = read('readdy-frontend/src/pages/dashboard/summary.ts');
const shell = read('readdy-frontend/src/components/feature/MainLayout.tsx');
const notificationApi = read('readdy-frontend/src/features/notifications/api.ts');

assert.match(summary, /const activeDemandIds = new Set\(activeDemands\.map\(\(item\) => item\.id\)\)/, '工作台只能基于招聘中的需求生成待办');
assert.match(summary, /recruiterOfferActions = new Set<OfferStatus>\(\['draft', 'rejected', 'approved', 'accepted'\]\)/, '经理退回的 Offer 必须回到招聘专员待办');
assert.match(summary, /const pendingApprovals = managerView \? facts\.demands\.filter/, '需求审核待办只能分给主管或管理员');
assert.match(summary, /activeDemandIds\.has\(item\.demand_id\)/, '面试、业务筛选和 Offer 待办必须排除已关闭需求');

assert.match(notificationApi, /activeOnly/, '通知 API 必须支持只取活跃需求通知');
assert.match(shell, /activeOnly: true/, '顶部提醒必须排除已关闭需求的旧通知');
assert.match(shell, /from=notification/, '通知跳转必须保留通知来源');

console.log('dashboard_truth_and_notification_scope: OK');
