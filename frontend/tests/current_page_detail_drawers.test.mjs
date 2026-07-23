import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const interviews = readFileSync(new URL('../src/pages/ReaddyInterviewsPage.tsx', import.meta.url), 'utf8');
const offers = readFileSync(new URL('../src/pages/OffersPage.tsx', import.meta.url), 'utf8');
const hired = readFileSync(new URL('../src/pages/HiredPage.tsx', import.meta.url), 'utf8');

// 面试：列表/日历留在当前页，点击整行在当前页查看，行内写操作不得误开详情。
assert.match(interviews, /import \{ DrawerShell \} from '\.\.\/components\/ui\/DrawerShell'/);
assert.match(interviews, /const \[detailTarget, setDetailTarget\] = useState<InterviewAssignment \| null>\(null\)/);
assert.match(interviews, /列表视图/);
assert.match(interviews, /日历视图/);
assert.match(interviews, /onClick=\{\(\) => setDetailTarget\(item\)\}/);
assert.match(interviews, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*handleViewFeedback\(item\)/);
assert.match(interviews, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setCancelTarget\(item\)/);
assert.match(interviews, /<DrawerShell[\s\S]*title="面试详情"/);
assert.match(interviews, />面试信息</);
assert.match(interviews, />面试反馈</);
assert.match(interviews, />流程记录</);

// Offer：整行和姓名都在当前页打开右侧详情，行内状态机按钮不触发行点击。
assert.match(offers, /import \{ DrawerShell \} from '\.\.\/components\/ui\/DrawerShell'/);
assert.match(offers, /function OfferDetailDrawer\(/);
assert.match(offers, /<DrawerShell[\s\S]*title="Offer 详情"/);
assert.match(offers, />基本信息</);
assert.match(offers, />薪资与入职</);
assert.match(offers, />操作历史</);
assert.match(offers, /<tr[\s\S]*onClick=\{\(\) => void openDetail\(offer\)\}/);
assert.match(offers, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*void openDetail\(offer\)/);
assert.match(offers, /onClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*<OfferActions/);
assert.match(offers, /onClick=\{\(\) => setActiveTab\('pending'\)\}/);
assert.match(offers, /onClick=\{\(\) => setActiveTab\('reply'\)\}/);
assert.match(offers, /onClick=\{\(\) => setActiveTab\('onboard'\)\}/);

// 已入职：不离开列表即可看入职详情，完整候选人档案只是抽屉内次级入口。
assert.match(hired, /import \{ DrawerShell \} from '\.\.\/components\/ui\/DrawerShell'/);
assert.match(hired, /const \[selected, setSelected\] = useState<OfferRecord \| null>\(null\)/);
assert.match(hired, /<tr[\s\S]*onClick=\{\(\) => setSelected\(offer\)\}/);
assert.match(hired, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setSelected\(offer\)/);
assert.match(hired, /<DrawerShell[\s\S]*title="入职详情"/);
assert.match(hired, /查看完整候选人档案/);

console.log('current_page_detail_drawers: OK');
