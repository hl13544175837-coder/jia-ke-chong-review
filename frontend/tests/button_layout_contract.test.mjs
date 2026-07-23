import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '../src/components/ui/Button.tsx'), 'utf8');

assert.match(
  source,
  /whitespace-nowrap/,
  '通用按钮文字必须保持单行，避免紧凑表格把按钮文字裁成两行',
);

console.log('button layout contract passed');
