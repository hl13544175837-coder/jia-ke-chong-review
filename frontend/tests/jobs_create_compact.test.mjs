import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/pages/JobsPage.tsx'), 'utf8');
const recruitmentTabs = readFileSync(
  join(__dirname, '../src/components/recruitment/RecruitmentManagementTabs.tsx'),
  'utf8',
);

assert.match(
  source,
  /showCreateForm/,
  'JobsPage should keep the create-job drawer behind explicit state',
);

assert.match(
  source,
  /<EnterpriseHero[\s\S]*actions=\{/,
  'JobsPage should expose create-job as a header action instead of a full-width default form',
);

assert.match(
  source,
  /title="岗位画像"/,
  'JobsPage should be presented as the job portrait page inside recruitment management',
);

assert.match(
  source,
  /RecruitmentManagementTabs/,
  'JobsPage should reuse the shared recruitment tabs',
);

assert.match(
  recruitmentTabs,
  /用人需求/,
  'JobsPage should provide a tab back to demand management',
);

assert.match(
  source,
  /新增岗位/,
  'JobsPage should keep a visible compact 新增岗位 button',
);

assert.match(
  source,
  /<DrawerShell[\s\S]*open=\{showCreateForm\}[\s\S]*testId="job-create-drawer"[\s\S]*<CreateJobForm/,
  'CreateJobForm should render in the shared right drawer after the user clicks 新增岗位',
);

assert.doesNotMatch(
  source,
  /\{showCreateForm && \([\s\S]{0,400}<CreateJobForm/,
  'CreateJobForm should no longer insert a collapsible full-width block above the job list',
);

assert.match(
  source,
  /setShowCreateForm\(false\)/,
  'The create drawer should be dismissible and close after creation',
);

assert.match(
  source,
  /setPendingCreatedJobId\(result\.id\)/,
  'Create success should remember the real API id while the refreshed list is loading',
);

assert.match(
  source,
  /jobs\.find\(\(job\) => job\.id === pendingCreatedJobId\)/,
  'JobsPage should resolve the new selection from the refreshed real list instead of fabricating a row',
);

assert.match(
  source,
  /setSelectedJob\(createdJob\)/,
  'The newly created real list item should become the selected job after refresh',
);

assert.match(
  source,
  /setCityFilter\(''\)[\s\S]*setDepartmentFilter\(''\)/,
  'Create success should clear filters that could otherwise hide the newly created job',
);

assert.match(
  source,
  /城市/,
  'JobsPage should let HR set and filter job city',
);

assert.match(
  source,
  /部门/,
  'JobsPage should let HR set and filter job department',
);

assert.match(
  source,
  /岗位编号/,
  'JobsPage should show a business-facing job code separate from the system id',
);

assert.match(
  source,
  /filteredJobs/,
  'JobsPage should filter the job list by city and department before rendering',
);

assert.match(
  source,
  /COMMON_JOB_CITY_OPTIONS/,
  'JobsPage should include common city choices instead of only cities already saved on jobs',
);

assert.match(
  source,
  /深圳/,
  'JobsPage common city choices should include major hiring cities such as 深圳',
);

assert.match(
  source,
  /COMMON_JOB_DEPARTMENT_OPTIONS/,
  'JobsPage should include common department choices instead of only departments already saved on jobs',
);

assert.match(
  source,
  /技术研发部/,
  'JobsPage common department choices should include typical recruiting departments',
);

assert.match(
  source,
  /job-city-options/,
  'Create job form should offer city suggestions when HR adds a job',
);

assert.match(
  source,
  /job-department-options/,
  'Create job form should offer department suggestions when HR adds a job',
);

assert.match(
  source,
  /editingJobId/,
  'JobsPage should support a small inline edit state for job attribution cleanup',
);

assert.match(
  source,
  /编辑归属/,
  'Job rows should expose a business-facing edit attribution action',
);

assert.match(
  source,
  /保存归属/,
  'Inline job attribution edits should have an explicit save action',
);

assert.match(
  source,
  /api\.updateJob\(job\.id,\s*\{[\s\S]*city:[\s\S]*department:[\s\S]*job_code:/,
  'JobsPage should save city, department, and job code through the existing updateJob API',
);

const apiSource = readFileSync(join(__dirname, '../src/lib/api.ts'), 'utf8');
assert.match(
  apiSource,
  /updateJob\(\s*jobId: number,\s*payload: \{[\s\S]*city\?: string;[\s\S]*department\?: string;[\s\S]*job_code\?: string;/,
  'API updateJob type should include the existing backend location fields',
);
