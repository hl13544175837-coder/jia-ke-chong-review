import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dashboard = read('readdy-frontend/src/pages/dashboard/page.tsx');
const jobs = read('readdy-frontend/src/pages/jobs/page.tsx');
const candidates = read('readdy-frontend/src/pages/candidates/page.tsx');
const interviews = read('readdy-frontend/src/pages/interviews/page.tsx');

assert.match(dashboard, /navigate\('\/jobs', \{ state: \{ fromDashboard: true, openCreate: true \} \}\)/, '新建需求必须携带直接打开表单的意图');
assert.match(dashboard, /navigate\('\/candidates', \{ state: \{ openUpload: true \} \}\)/, '导入简历必须携带直接打开上传弹窗的意图');
assert.match(dashboard, /navigate\('\/interviews\?status=unassigned'\)/, '安排面试必须直达待安排面试');

assert.match(jobs, /openCreate\?: boolean/, '招聘需求页必须识别新建意图');
assert.match(jobs, /navState\?\.openCreate/, '招聘需求页收到意图后必须打开表单');
assert.match(candidates, /openUpload\?: boolean/, '候选人页必须识别上传意图');
assert.match(candidates, /navState\?\.openUpload/, '候选人页收到意图后必须打开上传弹窗');
assert.match(interviews, /searchParams\.get\('status'\)/, '面试管理页必须读取状态参数');
assert.match(interviews, /initialInterviewTab/, '面试管理页必须安全解析状态参数');

console.log('dashboard_quick_actions: OK');
