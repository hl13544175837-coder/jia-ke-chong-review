import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  suspiciousResumeFields,
} from '../src/features/onlineResumes/quality.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const readOptional = (file) => {
  const absolute = path.join(root, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};

test('正常字段不会被打上疑似异常标记', () => {
  const fields = suspiciousResumeFields({
    target_position: 'Java 开发工程师',
    salary_expectation: '20-30K',
    location: '上海',
  });

  assert.deepEqual(fields, []);
});

test('目标岗位出现重复拼接时标记 target_position', () => {
  const fields = suspiciousResumeFields({
    target_position: '上海上海JavaJava行业不行限业不限21-2251K-2',
  });

  assert.deepEqual(fields, ['target_position']);
});

test('薪资格式异常时标记 salary_expectation', () => {
  assert.deepEqual(
    suspiciousResumeFields({ salary_expectation: '30-4350K' }),
    ['salary_expectation'],
  );
  assert.deepEqual(
    suspiciousResumeFields({ salary_expectation: '21-2251K-2' }),
    ['salary_expectation'],
  );
});

test('所在地重复拼接时标记 location', () => {
  assert.deepEqual(
    suspiciousResumeFields({ location: '上海上海' }),
    ['location'],
  );
});

test('空字段不算异常', () => {
  assert.deepEqual(
    suspiciousResumeFields({ salary_expectation: '', location: '' }),
    [],
  );
});

test('列表和详情都展示疑似异常数据标记', () => {
  const list = readOptional('src/features/onlineResumes/components/OnlineResumeList.tsx');
  const detail = readOptional('src/features/onlineResumes/components/OnlineResumeDetailDrawer.tsx');

  assert.notEqual(list, '', '缺少在线简历列表组件');
  assert.notEqual(detail, '', '缺少在线简历详情组件');
  assert.match(list, /suspiciousResumeFields/);
  assert.match(list, /疑似异常数据/);
  assert.match(detail, /suspiciousResumeFields/);
  assert.match(detail, /疑似异常数据/);
});
