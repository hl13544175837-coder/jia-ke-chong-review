import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/OffersPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/lib/nav.ts', import.meta.url), 'utf8');

assert.match(page, /data-ui="readdy-offers"/);
assert.match(page, /api\.listOffers/);
assert.match(page, /api\.saveDemandOfferRecord/);
assert.match(page, /api\.runOfferAction/);
assert.match(page, /disabled=\{!canCreateOffer\}/, 'Demand 加载失败或没有可用 Demand 时不得打开空 Offer 表单');
assert.match(page, /重试加载需求/, 'Demand 次级接口失败时应提供重试');
assert.match(page, /重新加载候选人/, '候选人次级接口失败时应提供重试');
assert.match(page, /boardAsync\.loading \|\| !!boardAsync\.error \|\| !candidateId/, '候选人未就绪时不得保存空 Offer 草稿');
assert.match(page, /role === 'manager' \|\| role === 'admin'/);
assert.match(page, /action === 'onboard' && !onboardDate/, '确认入职必须要求实际入职日期');
assert.match(page, /status === 'accepted'/, '只有已接受 Offer 显示确认入职动作');
assert.doesNotMatch(page, /mocks\/offers|sessionStorage|zhipin-current-role|initialOffers/);

assert.match(api, /listOffers\(/);
assert.match(api, /runOfferAction\(/);
assert.match(app, /path="\/offers"/);
assert.match(nav, /to: '\/offers'/);

console.log('readdy_offer_contract: OK');
