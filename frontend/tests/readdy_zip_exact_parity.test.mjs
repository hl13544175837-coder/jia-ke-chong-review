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
const approvedMissing = missing.filter((line) =>
  approvedCompanySecurityReplacements.some((key) => line.startsWith(`${key} (`))
);
const unapprovedMissing = missing.filter((line) => !approvedMissing.includes(line));
assert.equal(
  approvedMissing.length,
  approvedCompanySecurityReplacements.length,
  '公司鉴权替换清单与 Readdy 原始控件不一致',
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
  '/interviewer/dashboard', '/interviewer/interviews', '/interviewer/candidates',
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
  + `${approvedMissing.length} insecure demo labels replaced by company auth`,
);
