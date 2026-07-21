import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const page = readFileSync(join(srcRoot, 'pages/HiredPage.tsx'), 'utf8');

// 真实数据：来自 Offer 生命周期的 onboarded 记录，不接 mock
assert.match(page, /api\.listOffers\(\{ status: 'onboarded' \}\)/, '已入职应调用真实 /offers 接口');
assert.ok(!page.includes('mocks/'), '不得引用 Readdy mock 数据');
assert.ok(!page.includes('localStorage'), '不得用浏览器存储业务数据');

// Readdy 视觉要素保留：摘要卡片 + 入职记录表
assert.match(page, /data-ui="readdy-hired"/, '应有可验收的页面标识');
assert.match(page, /累计入职人数/, '应有累计入职摘要');
assert.match(page, /本月入职人数/, '应有本月入职摘要');
assert.match(page, /平均招聘周期/, '应有平均周期摘要');
assert.match(page, /入职记录/, '应有入职记录表');

// 状态覆盖：错误重试 + 真实空态
assert.match(page, /ErrorState/, '接口失败应显示错误态');
assert.match(page, /onRetry=\{offersAsync\.reload\}/, '错误态应可重试');
assert.match(page, /暂无已入职记录/, '应有真实空态');
assert.match(page, /EmptyState/, '空态应使用统一组件');

// 数据行为：入职日期与周期来自真实字段
assert.match(page, /onboarded_at/, '入职日期应来自 onboarded_at');
assert.match(page, /daysBetween/, '招聘周期应由真实时间差计算');
assert.match(page, /\/candidates\//, '姓名应链接到候选人详情');

console.log('readdy_hired_contract: OK');
