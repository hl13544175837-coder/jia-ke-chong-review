import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const roots = [join(srcRoot, 'pages'), join(srcRoot, 'components'), join(srcRoot, 'features')];

const retiredReaddyBrandColors = [
  '#3d7b6b',
  '#2f5f52',
  '#285e51',
  '#379f70',
  '#26784f',
  '#1d6b42',
  '#2f6c5c',
  '#245f43',
  '#cce7da',
  '#e9f5f0',
  '#f2faf6',
  '#5d897c',
  '#5a9484',
  '#5b907f',
  '#6c8f82',
  '#24594d',
  '#2d6658',
  '#2f695c',
  '#1f4d43',
  '#326b5d',
];

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!['.ts', '.tsx'].includes(extname(entry.name))) return [];
    return [path];
  });
}

for (const path of roots.flatMap(sourceFiles)) {
  const source = readFileSync(path, 'utf8').toLowerCase();
  for (const color of retiredReaddyBrandColors) {
    assert.equal(
      source.includes(color),
      false,
      `${path.replace(`${srcRoot}/`, '')} 不应继续硬编码 Readdy 品牌色 ${color}，请复用旧公司 enterprise token`,
    );
  }
}
