import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('公共行菜单负责视口定位、关闭行为和键盘语义', () => {
  const path = new URL('../src/components/ui/RowActionMenu.tsx', import.meta.url);
  assert.ok(existsSync(path), '应提供公共 RowActionMenu 组件');
  const source = read('src/components/ui/RowActionMenu.tsx');

  assert.match(source, /createPortal/);
  assert.match(source, /position: 'fixed'/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitem"/);
  assert.match(source, /Escape/);
  assert.match(source, /pointerdown/);
  assert.match(source, /danger/);
});
