import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

async function importTsModule(path) {
  const source = readSource(path);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const tempDir = mkdtempSync(join(tmpdir(), 'talent-map-state-'));
  const tempFile = join(tempDir, 'module.mjs');
  writeFileSync(tempFile, output);
  return import(pathToFileURL(tempFile).href);
}

const candidatesNav = readSource('features/candidates/nav.ts');
const candidatesRoutes = readSource('features/candidates/routes.tsx');
const candidatesFeature = readSource('features/candidates/index.ts');
const api = readSource('lib/api.ts');
const types = readSource('types/index.ts');
assert.ok(
  existsSync(join(srcRoot, 'pages/TalentMapPage.tsx')),
  'Talent map implementation should exist',
);
const page = readSource('pages/TalentMapPage.tsx');

assert.match(
  candidatesRoutes,
  /path:\s*'\/talent-map'/,
  'Router should expose the talent map route',
);

assert.match(
  candidatesRoutes,
  /TalentMapPage/,
  'Candidate routes should register the talent map page lazily',
);

assert.match(
  candidatesNav,
  /to:\s*'\/talent-map'[\s\S]*label:\s*'人才地图'/,
  'Sidebar should expose the talent map entry',
);

assert.match(
  candidatesFeature,
  /topLevelPaths:\s*\[[\s\S]*'\/talent-map'[\s\S]*\]/,
  'Talent map should be treated as a top-level candidate workspace',
);

assert.match(types, /interface TalentMap\b/, 'Shared types should expose TalentMap');
assert.match(types, /interface TalentMapCompany\b/, 'Shared types should expose TalentMapCompany');
assert.match(types, /interface TalentMapPerson\b/, 'Shared types should expose TalentMapPerson');

for (const name of [
  'listTalentMaps',
  'createTalentMap',
  'getTalentMap',
  'updateTalentMap',
  'createTalentMapCompany',
  'createTalentMapPerson',
  'updateTalentMapPerson',
]) {
  assert.match(api, new RegExp(`${name}\\(`), `API client should expose ${name}`);
}

assert.match(page, /INITIAL_COMPANIES/, 'Talent map page should include demo-ready map data');
assert.match(page, /动态筛选/, 'Talent map page should let HR filter the map dynamically');
assert.match(page, /新增目标公司/, 'Talent map page should let HR add target companies');
assert.match(page, /新增岗位节点/, 'Talent map page should let HR add role nodes');
assert.match(
  page,
  /updateNodeStatus/,
  'Talent map cards should allow status changes',
);
assert.match(
  page,
  /人才地图不是简历列表/,
  'Talent map should explain the recruiting map concept in business language',
);

for (const column of ['中通快递', '总部·信息技术中心', '总部·运营管理部', '已确认', '推测中', '待填充']) {
  assert.match(page, new RegExp(column), `Talent map board should include the ${column} board area`);
}

const { parseTalentMapSelectValue, resolveActiveTalentMapId } =
  await importTsModule('pages/talentMapState.ts');

assert.equal(resolveActiveTalentMapId([], 12), null, 'Empty map list should not request details');
assert.equal(resolveActiveTalentMapId([{ id: 5 }], null), 5, 'First map should be selected by default');
assert.equal(
  resolveActiveTalentMapId([{ id: 5 }, { id: 9 }], 9),
  9,
  'Existing active map id should be kept',
);
assert.equal(
  resolveActiveTalentMapId([{ id: 5 }], 99),
  5,
  'Stale active map id should fall back to an existing map',
);
assert.equal(
  resolveActiveTalentMapId([], 'undefined'),
  null,
  'Stale hot-reload string ids should not produce detail requests',
);
assert.equal(parseTalentMapSelectValue(''), null, 'Blank select value should clear the active map');
assert.equal(
  parseTalentMapSelectValue('undefined'),
  null,
  'Invalid select value should not become a request id',
);
assert.equal(parseTalentMapSelectValue('12'), 12, 'Numeric select value should become a map id');
