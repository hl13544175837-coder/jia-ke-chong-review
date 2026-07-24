import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = (relativePath) => path.join(root, relativePath);
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

const screeningPath = 'readdy-frontend/src/pages/interviewer/screening/page.tsx';
const modalPath = 'readdy-frontend/src/pages/interviewer/dashboard/components/ReviewActionModal.tsx';
const detailPath = 'readdy-frontend/src/pages/interviewer/screening/components/BusinessReviewDetail.tsx';

const screening = read(screeningPath);
assert.match(screening, /businessReviewsApi\.listMine\s*\(/, '业务筛选列表必须读取当前账号的真实任务');
assert.match(screening, /businessReviewsApi\.decideTask\s*\(/, '业务筛选决定必须提交到真实任务接口');
assert.match(screening, /await\s+loadTasks\s*\(/, '提交决定后必须重新读取服务端任务');
assert.match(screening, /BusinessReviewDetail/, '业务筛选页必须使用独立的真实详情组件');

for (const [state, label] of [
  ['pending', '待筛选'],
  ['approved', '已通过'],
  ['rejected', '不合适'],
  ['needs_info', '待 HR 补充'],
]) {
  assert.match(screening, new RegExp(`${state}:[^\\n]+${label}`), `页面必须把 ${state} 映射为“${label}”`);
}

for (const phrase of ['加载业务筛选任务', '重新加载', '暂无待筛选任务', '处理截止', 'HR 备注', '推送人', '决定时间']) {
  assert.ok(screening.includes(phrase), `业务筛选列表缺少“${phrase}”状态或信息`);
}

assert.ok(fs.existsSync(file(detailPath)), '必须提供业务筛选详情组件');
const detail = read(detailPath);
for (const field of ['resume_json', 'jd_text', 'focus_points', 'hr_note', 'original_resume']) {
  assert.match(detail, new RegExp(`task[\\s\\S]*${field}`), `详情必须展示任务字段 ${field}`);
}
assert.match(detail, /businessReviewsApi\.loadResume\s*\(/, '原版简历预览必须使用带鉴权的 Blob API');
assert.match(detail, /businessReviewsApi\.downloadResume\s*\(/, '原版简历下载必须使用带鉴权的 Blob API');
assert.match(detail, /URL\.createObjectURL\s*\(/, '原版简历必须从 Blob 创建浏览器 URL');
assert.match(detail, /URL\.revokeObjectURL\s*\(/, 'Blob URL 使用结束后必须释放');
assert.match(detail, /window\.open\s*\(/, '原版简历预览必须在当前浏览器的新标签打开');
assert.match(detail, /previewWindow\.opener\s*=\s*null/, '新标签打开后必须断开 opener，且不能把正常打开误判成拦截');
assert.match(detail, /\.download\s*=/, '下载必须沿用后端提供的原文件名');

const modal = read(modalPath);
assert.match(modal, /BusinessReviewTask/, '评审弹窗必须接收真实业务筛选任务类型');
for (const [decision, label] of [
  ['approved', '通过，进入一面'],
  ['rejected', '不合适'],
  ['needs_info', '需要 HR 补充信息'],
]) {
  assert.match(modal, new RegExp(`${decision}:[\\s\\S]*?${label}`), `评审弹窗缺少 ${decision} 固定结论`);
}
assert.doesNotMatch(modal, /\bneedMoreInfo\b/, '评审弹窗禁止继续使用旧的 needMoreInfo 状态名');
assert.match(modal, /action\s*!==\s*['"]approved['"]/, '不合适和待补充必须共用必填备注规则');
assert.match(modal, /comment\.trim\s*\(\)/, '必填备注必须拒绝纯空白内容');

const businessUi = `${screening}\n${modal}\n${detail}`;
for (const mockName of ['resumePush', 'candidates', 'interviews']) {
  assert.doesNotMatch(businessUi, new RegExp(`@/mocks/${mockName}`), `真实业务筛选界面禁止引用 ${mockName} mock`);
}
assert.doesNotMatch(businessUi, /candidateList|stageColorMap|interviews\.push|resumePushRecords/, '前端不得本地推进候选人或创建面试');
assert.match(screening, /待业务筛选/, '必须保留业务负责人角色页面名称');
assert.match(screening, /招聘专员推送的简历/, '必须保留业务负责人对任务来源的说明');

console.log('readdy_mysql_pilot_business_ui_contract: OK');
