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
assert.match(page, /role === 'manager' \|\| role === 'admin'/);
assert.doesNotMatch(page, /mocks\/offers|sessionStorage|zhipin-current-role|initialOffers/);

assert.match(api, /listOffers\(/);
assert.match(api, /runOfferAction\(/);
assert.match(app, /path="\/offers"/);
assert.match(nav, /to: '\/offers'/);

console.log('readdy_offer_contract: OK');
