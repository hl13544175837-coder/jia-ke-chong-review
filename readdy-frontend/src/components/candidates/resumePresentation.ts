export interface ResumeSection {
  key: string;
  title: string;
  value: unknown;
}

const FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  name_masked: '姓名',
  phone: '联系电话',
  phone_number: '联系电话',
  email: '邮箱',
  gender: '性别',
  age: '年龄',
  birthday: '出生日期',
  location: '所在地',
  city: '城市',
  intent_city: '意向城市',
  desired_city: '意向城市',
  target_position: '目标岗位',
  desired_position: '目标岗位',
  target_role: '目标岗位',
  job_intention: '求职意向',
  current_position: '当前岗位',
  current_company: '当前公司',
  years_of_experience: '工作年限',
  work_years: '工作年限',
  salary_expectation: '期望薪资',
  expected_salary: '期望薪资',
  availability: '到岗时间',
  summary: '个人概况',
  profile: '个人概况',
  self_evaluation: '自我评价',
  school: '学校',
  university: '学校',
  degree: '学历',
  education_level: '学历',
  major: '专业',
  year: '毕业年份',
  graduation_year: '毕业年份',
  start_date: '开始时间',
  end_date: '结束时间',
  duration: '时间',
  company: '公司',
  position: '岗位',
  title: '职位',
  role: '担任角色',
  years: '工作年限',
  responsibilities: '主要职责',
  responsibility: '主要职责',
  achievements: '主要成果',
  description: '经历说明',
  desc: '工作内容',
  project_name: '项目名称',
  project_role: '项目角色',
  technologies: '使用技术',
  technology: '使用技术',
  skill_name: '技能',
  category: '技能类别',
  level: '熟练程度',
  score: '评分',
  certificate_name: '证书名称',
  issuer: '颁发机构',
  language: '语言',
  proficiency: '熟练程度',
};

const HIDDEN_KEYS = new Set([
  'raw_file_path',
  'parser_metadata',
  'parse_metadata',
  'source_path',
  'candidate_id',
  'upload_batch_id',
  'id',
]);

const SECTION_DEFINITIONS: Array<{
  key: string;
  title: string;
  aliases: string[];
}> = [
  {
    key: 'target',
    title: '求职目标',
    aliases: ['job_intention', 'target_position', 'desired_position', 'target_role', 'intent_city', 'desired_city', 'salary_expectation', 'expected_salary', 'availability'],
  },
  {
    key: 'summary',
    title: '个人概况',
    aliases: ['summary', 'profile', 'self_evaluation', 'years_of_experience', 'work_years', 'current_company', 'current_position'],
  },
  {
    key: 'education',
    title: '教育经历',
    aliases: ['education', 'education_experience', 'education_history'],
  },
  {
    key: 'work',
    title: '工作经历',
    aliases: ['work_experience', 'experience', 'employment_history', 'work_history'],
  },
  {
    key: 'projects',
    title: '项目经历',
    aliases: ['project_experience', 'projects', 'project_history'],
  },
  {
    key: 'skills',
    title: '专业技能',
    aliases: ['skills', 'skill_tags', 'technical_skills', 'core_skills'],
  },
  {
    key: 'certificates',
    title: '证书与语言',
    aliases: ['certificates', 'certifications', 'languages'],
  },
  {
    key: 'basic',
    title: '基本信息',
    aliases: ['name', 'name_masked', 'phone', 'phone_number', 'email', 'gender', 'age', 'birthday', 'location', 'city'],
  },
];

export function isResumeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isResumeRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function normalizedResume(resume: unknown): Record<string, unknown> {
  if (!isResumeRecord(resume)) return {};
  const extracted = isResumeRecord(resume.extracted_info) ? resume.extracted_info : {};
  const direct = Object.fromEntries(
    Object.entries(resume).filter(([key]) => key !== 'extracted_info'),
  );
  return { ...direct, ...extracted };
}

function groupedAliasValue(
  source: Record<string, unknown>,
  aliases: string[],
  consumed: Set<string>,
) {
  const values = aliases
    .filter((alias) => hasDisplayValue(source[alias]))
    .map((alias) => {
      consumed.add(alias);
      return [alias, source[alias]] as const;
    });
  if (values.length === 0) return null;
  if (values.length === 1 && ['education', 'education_experience', 'education_history', 'work_experience', 'experience', 'employment_history', 'work_history', 'project_experience', 'projects', 'project_history', 'skills', 'skill_tags', 'technical_skills', 'core_skills', 'certificates', 'certifications', 'languages'].includes(values[0][0])) {
    return values[0][1];
  }
  return Object.fromEntries(values);
}

export function buildResumeSections(resume: unknown): ResumeSection[] {
  const source = normalizedResume(resume);
  const consumed = new Set<string>();
  const sections = SECTION_DEFINITIONS.flatMap((definition) => {
    const value = groupedAliasValue(source, definition.aliases, consumed);
    return value === null ? [] : [{ key: definition.key, title: definition.title, value }];
  });
  const remaining = Object.fromEntries(
    Object.entries(source).filter(([key, value]) => (
      !consumed.has(key)
      && !HIDDEN_KEYS.has(key)
      && hasDisplayValue(value)
    )),
  );
  if (Object.keys(remaining).length > 0) {
    sections.push({ key: 'other', title: '其他信息', value: remaining });
  }
  return sections;
}

export function resumeFieldLabel(key: string) {
  return FIELD_LABELS[key] || '补充信息';
}
