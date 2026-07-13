// 契约测试：401 后不直接跳转登录页，先弹确认框，确认后才登出跳转。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const auth = readFileSync(join(__dirname, '../src/lib/auth.tsx'), 'utf8');

// 使用确认框组件
assert.ok(auth.includes('ConfirmDialog'), '应使用 ConfirmDialog 弹确认框');
assert.ok(auth.includes('sessionExpired'), '应有 sessionExpired 状态控制弹框');

// 401 处理器不再直接把 logout 作为处理器（原实现 setUnauthorizedHandler(value.logout)）
assert.ok(
  !auth.includes('setUnauthorizedHandler(value.logout)'),
  '401 处理器不应再直接登出，应改为弹确认框',
);

// 401 处理器触发的是弹框，而非直接跳转
assert.ok(
  auth.includes('setSessionExpired(true)'),
  '401 时应置 sessionExpired 为 true 弹出确认框',
);

// 仅在已登录时弹框（未登录/登录页的偶发 401 不弹）
assert.ok(
  auth.includes('sessionRef.current'),
  '应仅在已登录时弹框（用 ref 读当前会话）',
);

// 确认后才登出（跳转登录页由路由守卫处理）
const onConfirmIdx = auth.indexOf('onConfirm');
assert.ok(onConfirmIdx !== -1, '应有 onConfirm 处理');
assert.ok(
  auth.slice(onConfirmIdx, onConfirmIdx + 120).includes('logout'),
  'onConfirm 中应调用 logout（确认后再登出跳转）',
);

console.log('session_expired_confirm: OK');
