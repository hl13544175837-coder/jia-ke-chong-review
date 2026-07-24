import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(testDir, '../..');
const referenceRoot = resolve(appRoot, '../references/readdy-export/src');
const productRoot = resolve(appRoot, 'readdy-frontend/src');
const inventoryScript = resolve(appRoot, 'frontend/scripts/inventory-interactive-controls.mjs');
const referenceZip = resolve(appRoot, '../references/readdy-export.zip');
const expectedZipHash = '627a59d6d023479d50d11a1b17ba978f350ca7fa3170e4a9895b7801e181096e';

const actualZipHash = createHash('sha256').update(readFileSync(referenceZip)).digest('hex');
assert.equal(actualZipHash, expectedZipHash, 'Readdy ZIP 基准文件哈希发生变化');
assert.equal(
  readFileSync(resolve(appRoot, 'readdy-frontend/ORIGINAL_ZIP_SHA256.txt'), 'utf8').trim().split(/\s+/)[0],
  expectedZipHash,
  '整合产品记录的 ZIP 来源哈希不正确',
);

function inventory(root) {
  return JSON.parse(execFileSync(process.execPath, [inventoryScript, root], { encoding: 'utf8' }));
}

function multiset(controls) {
  const result = new Map();
  for (const control of controls) {
    if (!control.label) continue;
    const key = `${control.file}\t${control.tag}\t${control.label}`;
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

function collectSourceFiles(directory) {
  return readdirSync(directory)
    .sort()
    .map((entry) => join(directory, entry))
    .flatMap((path) => {
      if (statSync(path).isDirectory()) return collectSourceFiles(path);
      return ['.ts', '.tsx'].includes(extname(path)) ? [{ path, source: readFileSync(path, 'utf8') }] : [];
    });
}

const reference = inventory(referenceRoot);
const product = inventory(productRoot);
assert.equal(reference.total, 718, 'Readdy ZIP 原始控件清单发生变化');
const referenceSet = multiset(reference.controls);
const productSet = multiset(product.controls);
const missing = [];

for (const [key, expectedCount] of referenceSet) {
  const actualCount = productSet.get(key) || 0;
  if (actualCount < expectedCount) missing.push(`${key} (${actualCount}/${expectedCount})`);
}

const referenceFileTags = multiset(reference.controls.map((control) => ({
  ...control,
  label: `${control.file}\t${control.tag}`,
})));
const productFileTags = multiset(product.controls.map((control) => ({
  ...control,
  label: `${control.file}\t${control.tag}`,
})));
for (const [key, expectedCount] of referenceFileTags) {
  const actualCount = productFileTags.get(key) || 0;
  if (actualCount < expectedCount) missing.push(`${key} controls (${actualCount}/${expectedCount})`);
}

// 公司安全底座要求替换 Readdy 的假邮箱登录、定时器登录和假角色切换。
// 这里只允许这 5 个原始标签被真实公司账号、OAuth 会话和账号菜单替换；
// 同文件同标签的控件总数仍由 referenceFileTags 门禁保证，其他业务控件不得缺失。
const approvedCompanySecurityReplacements = [
  'components/feature/MainLayout.tsx\tbutton\t{roleInfo.avatar} {roleInfo.label} {roleInfo.department} {roleInfo.description}',
  'components/feature/MainLayout.tsx\tbutton\t{r.avatar} {r.label} {r.description} {currentRole === r.key && ( <i className="ri-check-line text-sm text-primary-600 ml-auto"></i> )}',
  'pages/login/page.tsx\tform\t{error && ( <div className="bg-accent-100/60 border border-accent-300 text-accent-800 rounded-lg px-4 py-3 text-sm flex i} 企业邮箱 密码 忘记密码？ {( <> <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>',
  'pages/login/page.tsx\tinput\tname@company.com',
  'pages/login/page.tsx\tbutton\t{( <> <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 登录中... </> )} / {( <> 登 录 <i className="ri-arrow-right-line"></i> </> )}',
];
// 第一阶段真实 Demand 接线要求替换 4 个演示控件标签：
// 创建表单新增真实负责人/用人负责人字段，负责人选项来自后端，
// 创建与状态按钮增加提交中状态和必填操作原因。控件仍保留，只替换演示语义。
const approvedDemandBackendReplacements = [
  'pages/jobs/components/RequisitionForm.tsx\tform\t基本信息 职位名称 * 所属部门 * 请选择部门 技术研发部 产品部 设计部 数据部 市场部 人力资源部 招聘城市 * 选择省份 {provinceCityData.map((p) => ( <option key={p.name} value={p.name}>{p.name}</option> ))} 选择城市 {cities.map((c) => ( <option key={c} value={c}>{c}</option> ))} HC 人数 * 招聘负责人 请选择',
  'pages/jobs/components/RequisitionForm.tsx\tselect\t请选择 招聘专员01 招聘专员02 系统管理员',
  'pages/jobs/components/RequisitionForm.tsx\tbutton\t创建需求',
  'pages/jobs/components/RequisitionTable.tsx\tbutton\t确认',
];
// 试点范围明确隐藏 AI 助手入口。页面源码和路由保留给研发后续接真实接口，
// 但主壳不再渲染右下角浮动 Link，因此批准少 1 个 MainLayout Link 控件。
const approvedPilotHiddenControls = [
  'components/feature/MainLayout.tsx\tLink\tcomponents/feature/MainLayout.tsx\tLink controls',
];
// 这些页面已经从演示版替换为真实试点流程，由各自的 mysql_pilot_* 契约测试覆盖。
// 未改造页面仍继续执行逐控件 ZIP 对比，所有页面仍执行下方死按钮和占位检查。
const approvedPilotRewriteFiles = [
  'pages/candidates/components/PushToReviewerModal.tsx',
  'pages/candidates/page.tsx',
  'pages/interviewer/dashboard/components/ReviewActionModal.tsx',
  'pages/interviewer/interviews/page.tsx',
  'pages/interviewer/jobs/page.tsx',
  'pages/interviewer/screening/page.tsx',
  'pages/jobs/page.tsx',
  'pages/kanban/page.tsx',
  'pages/offers/components/CreateOfferModal.tsx',
  'pages/offers/components/OfferDetailDrawer.tsx',
  'pages/offers/components/OfferTable.tsx',
  'pages/offers/page.tsx',
];
const approvedReplacements = [
  ...approvedCompanySecurityReplacements,
  ...approvedDemandBackendReplacements,
  ...approvedPilotHiddenControls,
];
const rewrittenMissing = missing.filter((line) =>
  approvedPilotRewriteFiles.some((file) => line.startsWith(`${file}\t`))
);
const parityMissing = missing.filter((line) => !rewrittenMissing.includes(line));
const approvedMissing = parityMissing.filter((line) =>
  approvedReplacements.some((key) => line.startsWith(`${key} (`))
);
const unapprovedMissing = parityMissing.filter((line) => !approvedMissing.includes(line));
assert.equal(
  approvedMissing.length,
  approvedReplacements.length,
  '已批准的公司鉴权或真实 Demand 替换清单与 Readdy 原始控件不一致',
);
assert.deepEqual(
  unapprovedMissing,
  [],
  `整合版缺少未经批准的 ZIP 原版控件：\n${unapprovedMissing.join('\n')}`,
);

const deadButtons = product.controls.filter((control) => (
  (control.tag === 'button' || control.tag === 'Button')
  && !control.action
  && !control.insideForm
  && !control.href
));
assert.deepEqual(
  deadButtons.map((control) => `${control.file}:${control.line} ${control.label || '(无文字按钮)'}`),
  [],
  '存在点了没有处理逻辑的按钮',
);

const productSourceFiles = collectSourceFiles(productRoot);
const productSource = productSourceFiles.map(({ source }) => source).join('\n');
const placeholderLocations = productSourceFiles.flatMap(({ path, source }) =>
  source.split('\n').flatMap((line, index) =>
    line.includes('功能开发中')
      ? [`${path.slice(productRoot.length + 1)}:${index + 1}`]
      : []
  )
);
assert.deepEqual(placeholderLocations, [], `仍有占位交互：\n${placeholderLocations.join('\n')}`);

for (const expectedRoute of [
  '/dashboard', '/dashboard/interviews', '/dashboard/hired', '/dashboard/cycle',
  '/dashboard/offers', '/jobs', '/candidates', '/talent-map', '/kanban', '/interviews',
  '/offers', '/kpi-standards', '/analytics', '/ai-assistant', '/settings',
  '/interviewer/dashboard', '/interviewer/interviews',
  '/interviewer/jobs', '/interviewer/screening', '/director/cockpit', '/director/progress',
  '/director/insights', '/director/approvals',
]) {
  assert.ok(productSource.includes(`path: '${expectedRoute}'`), `缺少路由 ${expectedRoute}`);
}

for (const format of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', '.zip']) {
  assert.ok(productSource.includes(format), `完整前端缺少上传格式 ${format}`);
}

console.log(
  `readdy ZIP parity passed: ${reference.controls.length} controls covered; `
  + `${approvedMissing.length} demo labels replaced and ${rewrittenMissing.length} legacy controls `
  + 'covered by real pilot page contracts',
);
