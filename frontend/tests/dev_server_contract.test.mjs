import assert from 'node:assert/strict';
import config from '../vite.config.ts';

const resolved = typeof config === 'function'
  ? await config({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })
  : config;

assert.equal(resolved.server.port, 5173);
assert.equal(resolved.server.strictPort, true);
assert.equal(resolved.server.proxy['/api'].target, 'http://localhost:5001');
