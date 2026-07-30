import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_RSC_ADVISORY,
  evaluateAuditReport,
} from '../../scripts/check-frontend-audit.mjs';

const reportWith = (...urls) => ({
  vulnerabilities: {
    'react-router': {
      via: urls.map((url) => ({ severity: 'high', url })),
    },
  },
});

test('前端审计只允许已核实不适用的 RSC 公告', () => {
  const result = evaluateAuditReport(
    reportWith(`https://github.com/advisories/${ALLOWED_RSC_ADVISORY}`),
  );

  assert.deepEqual(result.allowedAdvisories, [ALLOWED_RSC_ADVISORY]);
  assert.deepEqual(result.blockedAdvisories, []);
});

test('前端审计遇到任何新增高危公告都会失败', () => {
  const result = evaluateAuditReport(
    reportWith(
      `https://github.com/advisories/${ALLOWED_RSC_ADVISORY}`,
      'https://github.com/advisories/GHSA-new-risk-0001',
    ),
  );

  assert.deepEqual(result.blockedAdvisories, ['GHSA-new-risk-0001']);
});
