export type SuspiciousResumeField = 'target_position' | 'salary_expectation' | 'location' | 'summary';

const SALARY_PATTERNS = [
  /^面议$/,
  /^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*[kKwW万]/,
  /^\d+(\.\d+)?\s*[kKwW万]\s*[×x*]\s*\d+\s*薪$/,
];

function looksRepeated(value: string): boolean {
  return /([\u4e00-\u9fa5]{2,})\1/.test(value)
    || /([A-Za-z]{3,})\1/.test(value);
}

function invalidSalary(value: string): boolean {
  const stripped = value.trim();
  if (!stripped) return false;
  if (!SALARY_PATTERNS.some((pattern) => pattern.test(stripped))) return true;
  const match = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(stripped);
  if (match) {
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (high > low * 12 + 50) return true;
  }
  return false;
}

function invalidLocation(value: string): boolean {
  const stripped = value.trim();
  if (!stripped) return false;
  if (looksRepeated(stripped)) return true;
  return !/^[\u4e00-\u9fa5\-·（）()]{2,12}$/.test(stripped);
}

function invalidTargetPosition(value: string): boolean {
  const stripped = value.trim();
  if (!stripped) return false;
  if (looksRepeated(stripped)) return true;
  if (stripped.length > 40) return true;
  // 目标岗位里混入期望薪资（如 "上海Java行业不限23-27K"）——AI 抽取时字段拼接错误
  if (/\d+\s*[kKwW万]/.test(stripped)) return true;
  return false;
}

// 检测 AI 抽取导致的摘要乱码/错位：
// 特征为中文句子中插入大量 1-3 字符的英文碎片（如 "通练 常Sp用ri数ng据"）。
// 正常技术简历中的术语（MySQL、Spring 等）长度通常 >= 4，不会命中此规则。
function invalidSummary(value: string): boolean {
  const stripped = value.trim();
  if (!stripped) return false;
  if (looksRepeated(stripped)) return true;
  const interleavedChunks = stripped.match(/[\u4e00-\u9fa5][a-zA-Z]{1,3}[\u4e00-\u9fa5]/g);
  return (interleavedChunks?.length ?? 0) >= 3;
}

export function suspiciousResumeFields(
  profile: Record<string, unknown>,
): SuspiciousResumeField[] {
  const fields: SuspiciousResumeField[] = [];
  const target = profile.target_position;
  if (typeof target === 'string' && invalidTargetPosition(target)) {
    fields.push('target_position');
  }
  const salary = profile.salary_expectation ?? profile.expected_salary;
  if (typeof salary === 'string' && invalidSalary(salary)) {
    fields.push('salary_expectation');
  }
  const location = profile.location ?? profile.city;
  if (typeof location === 'string' && invalidLocation(location)) {
    fields.push('location');
  }
  const summary = profile.summary;
  if (typeof summary === 'string' && invalidSummary(summary)) {
    fields.push('summary');
  }
  return fields;
}
