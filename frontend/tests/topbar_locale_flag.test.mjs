import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appShell = readFileSync(resolve('src/components/AppShell.tsx'), 'utf8');
const css = readFileSync(resolve('src/index.css'), 'utf8');

const flagChipPattern =
  /<span className="enterprise-flag-cn" aria-hidden="true">\s*🇨🇳\s*<\/span>\s*中国/;

assert.match(
  appShell,
  flagChipPattern,
  'topbar China locale chip should show the China flag emoji before 中国',
);

const flagRuleMatch = css.match(/\.enterprise-flag-cn\s*\{[^}]+\}/);
assert.ok(flagRuleMatch, 'enterprise-flag-cn CSS rule should exist');

const flagRule = flagRuleMatch[0];
assert.match(flagRule, /display:\s*inline-flex;/, 'flag should be centered as inline content');
assert.doesNotMatch(flagRule, /border-top:\s*6px solid #e11d2f;/, 'flag should not be drawn as a red-white bicolor');
assert.doesNotMatch(flagRule, /border-bottom:\s*6px solid #fff;/, 'flag should not be drawn as a red-white bicolor');
