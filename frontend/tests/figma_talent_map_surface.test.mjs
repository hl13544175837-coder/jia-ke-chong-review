import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const page = readFileSync(join(srcRoot, 'pages/TalentMapPage.tsx'), 'utf8');
const css = readFileSync(join(srcRoot, 'index.css'), 'utf8');

assert.match(css, /--enterprise-brand:\s*#379f70/i, '主色应与 Figma 人才地图一致');
assert.match(css, /--enterprise-brand-soft:\s*#e9f5f0/i, '浅绿背景应与 Figma 一致');
assert.match(page, /data-ui="figma-talent-map"/, '人才地图应有可验收的 Figma 页面标识');
assert.match(page, /新增公司/, '页头应保留 Figma 的主操作');
assert.match(page, /地图范围/, '页面应有横向地图范围卡片');
assert.match(page, /目标公司视图/, '页面应有横向目标公司卡片');
assert.match(page, /来自真实人才地图/, '公司摘要应说明数据真源');
assert.match(page, /composer === 'company'/, '新增公司表单应按需展开');
assert.match(page, /composer === 'person'/, '新增人选表单应按需展开');
assert.match(page, /composer === 'map'/, '新建地图表单应按需展开');

