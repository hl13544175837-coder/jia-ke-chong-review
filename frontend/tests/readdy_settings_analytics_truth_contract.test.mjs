import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const analytics = read('readdy-frontend/src/pages/analytics/page.tsx');
const settings = read('readdy-frontend/src/pages/settings/page.tsx');
const analyticsApi = read('readdy-frontend/src/features/analytics/api.ts');
const settingsApi = read('readdy-frontend/src/features/settings/api.ts');

assert.match(analytics, /analyticsApi\.overview/, '分析看板必须读取真实统计接口');
assert.match(analytics, /analyticsApi\.exportCsv/, '分析导出必须下载真实文件');
assert.match(analytics, /数据更新于/, '分析页必须展示真实数据生成时间');
assert.doesNotMatch(analytics, /@\/mocks\/analytics|analyticsOverview|monthlyTrends/, '分析页不得再使用静态统计数据');
assert.match(analyticsApi, /\/analytics\/overview/);
assert.match(analyticsApi, /\/analytics\/export/);

for (const call of ['settingsApi.getSettings', 'settingsApi.saveSettings', 'settingsApi.listUsers', 'settingsApi.createUser', 'settingsApi.updateUser']) {
  assert.match(settings, new RegExp(call.replace('.', '\\.')), `系统设置缺少真实调用 ${call}`);
}
assert.match(settings, /后端角色规则/, '角色权限必须明确由后端实际控制');
assert.match(settings, /核心招聘流程由后端状态机保护/, '流程配置不得继续假装可本地重排');
assert.doesNotMatch(settings, /initialUsers|initialDepartments|设置已保存到当前演示状态/, '系统设置不得再使用页面内演示状态');
assert.match(settingsApi, /\/admin\/settings/);
assert.match(settingsApi, /\/admin\/users/);

console.log('readdy_settings_analytics_truth_contract: OK');
