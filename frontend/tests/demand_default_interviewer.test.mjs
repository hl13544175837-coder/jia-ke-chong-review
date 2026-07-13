import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (path) => readFileSync(join(srcRoot, path), 'utf8');
const searchableFieldPath = join(
  srcRoot,
  'components/interviewRecords/SearchableInterviewerField.tsx',
);

assert.ok(
  existsSync(searchableFieldPath),
  'A shared searchable interviewer field should exist for demand creation and interview scheduling',
);

const field = read('components/interviewRecords/SearchableInterviewerField.tsx');
const types = read('types/index.ts');
const demandsPage = read('features/demands/pages/DemandsPage.tsx');
const demandForm = read('features/demands/components/DemandForm.tsx');
const demandDetail = read('features/demands/pages/DemandDetailPage.tsx');
const assignment = read('components/interviewRecords/InterviewAssignmentPanel.tsx');

assert.match(
  field,
  /export function SearchableInterviewerField/,
  'The searchable interviewer field should be reusable rather than embedded in one page',
);
assert.match(
  field,
  /option\.name[\s\S]*option\.email|option\.email[\s\S]*option\.name/,
  'Search should consider both interviewer name and email',
);
assert.match(
  field,
  /role="combobox"[\s\S]*role="listbox"[\s\S]*role="option"/,
  'The searchable field should expose keyboard-friendly combobox semantics',
);
assert.match(
  field,
  /onChange\(null\)/,
  'The shared field should let the user explicitly clear a selected interviewer',
);
assert.match(
  field,
  /tabIndex=\{-1\}/,
  'Combobox options should not pull Tab focus away from the search input',
);
assert.match(
  field,
  /event\.key === 'ArrowUp'[\s\S]*setOpen\(true\)/,
  'ArrowUp should reopen the option list as well as navigate it',
);
assert.match(
  field,
  /aria-describedby=/,
  'The search input should be associated with its help or error message',
);
assert.match(
  field,
  /aria-live="polite"/,
  'Selection and empty-result changes should be announced to assistive technology',
);
assert.match(
  field,
  /placeholder\s*=\s*['"]搜索姓名或邮箱，例如：王杰['"]/,
  'The example name should appear only as search guidance',
);
assert.equal(
  (field.match(/王杰/g) ?? []).length,
  1,
  'The example name must not be reused as a default selection rule',
);
assert.doesNotMatch(
  field,
  /onChange\(\s*\d+\s*\)|value\s*=\s*\{\s*\d+\s*\}/,
  'The shared field must not contain a fixed interviewer ID',
);

assert.match(
  types,
  /interface RecruitmentDemand[\s\S]*default_interviewer_id:\s*number\s*\|\s*null;[\s\S]*default_interviewer_name:\s*string\s*\|\s*null;/,
  'Demand payloads should expose the optional default interviewer',
);
assert.match(
  types,
  /interface RecruitmentDemandInput[\s\S]*default_interviewer_id\?:\s*number\s*\|\s*null;/,
  'Demand creation should accept a selected interviewer ID or null',
);
assert.match(
  types,
  /interface InterviewerOption[\s\S]*email:\s*string;/,
  'Interviewer options should include email for search and same-name disambiguation',
);

assert.match(
  demandsPage,
  /api\.listInterviewers\(\)/,
  'The demand workspace should load eligible interviewer options',
);
assert.match(
  demandsPage,
  /interviewers=\{interviewers\.data\s*\?\?\s*\[\]\}/,
  'Loaded interviewer options should be passed into the existing create form',
);
assert.match(
  demandsPage,
  /onReloadInterviewers=\{interviewers\.reload\}/,
  'A failed interviewer list should expose a direct retry action',
);
assert.match(
  demandsPage,
  /const \[showCreateForm, setShowCreateForm\] = useState\(false\)/,
  'Adding interviewer search must preserve the existing collapsed create area',
);

assert.match(
  demandForm,
  /default_interviewer_id:\s*null/,
  'A new demand should start with no default interviewer selected',
);
assert.match(
  demandForm,
  /<SearchableInterviewerField[\s\S]*label="默认面试官（可选）"/,
  'Demand creation should use the shared searchable field as an optional input',
);
assert.match(
  demandForm,
  /default_interviewer_id:\s*form\.default_interviewer_id/,
  'Demand creation should submit only the selected internal account ID',
);
assert.match(
  demandForm,
  /interviewersError[\s\S]*onReloadInterviewers/,
  'Demand creation should distinguish a failed interviewer list and offer recovery',
);
assert.match(
  demandForm,
  /onFieldChange\?\.\(String\(field\)\)/,
  'Changing a field should clear a stale server-side validation message',
);
assert.match(
  demandForm,
  /useEffect\(\(\)\s*=>\s*\{\s*if \(interviewersLoading \|\| interviewersError \|\| form\.default_interviewer_id === null\) return;/,
  'Loading or failed interviewer options should preserve the selected default interviewer ID',
);
assert.match(
  demandForm,
  /const selectedIsAvailable = interviewers\.some\([\s\S]*interviewer\.id === form\.default_interviewer_id[\s\S]*if \(!selectedIsAvailable\) \{[\s\S]*default_interviewer_id: null/,
  'A completed successful options refresh should clear a selected interviewer who is no longer available',
);
assert.match(
  demandForm,
  /if \(!selectedIsAvailable\) \{[\s\S]*onFieldChange\?\.\('default_interviewer_id'\);[\s\S]*\}/,
  'Clearing a stale default interviewer should notify the page to dismiss matching server errors',
);
assert.doesNotMatch(
  demandForm,
  /default_interviewer_id:\s*\d+/,
  'Demand creation must never hard-code a default interviewer ID',
);

assert.match(
  demandDetail,
  /默认面试官：\{demand\.default_interviewer_name\s*\|\|\s*'未设置'\}/,
  'Demand detail should show the saved default or a clear unconfigured state',
);

assert.match(
  assignment,
  /selectedDemand\?\.default_interviewer_id\s*\?\?\s*null/,
  'Selecting a demand should read its saved default interviewer ID',
);
assert.match(
  assignment,
  /const \[pendingDefaultInterviewerId, setPendingDefaultInterviewerId\]\s*=\s*useState<number \| null>\(null\)/,
  'Scheduling should remember a default interviewer while interviewer options are still loading',
);
assert.match(
  assignment,
  /interviewers\.some\([\s\S]*interviewer\.id\s*===\s*defaultInterviewerId/,
  'A saved default should only be applied when the account is still selectable',
);
assert.match(
  assignment,
  /setInterviewerId\(defaultIsAvailable\s*\?\s*defaultInterviewerId\s*:\s*null\)/,
  'Demand selection should prefill a valid default and otherwise stay empty',
);
assert.match(
  assignment,
  /setPendingDefaultInterviewerId\(defaultIsAvailable\s*\?\s*null\s*:\s*defaultInterviewerId\)/,
  'Changing demands should replace any old pending default with the newly selected demand default',
);
assert.match(
  assignment,
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*pendingDefaultInterviewerId\s*===\s*null[\s\S]*interviewers\.some\([\s\S]*interviewer\.id\s*===\s*pendingDefaultInterviewerId[\s\S]*setInterviewerId\(pendingDefaultInterviewerId\)[\s\S]*setPendingDefaultInterviewerId\(null\)[\s\S]*\},\s*\[interviewers, pendingDefaultInterviewerId\]\)/,
  'A pending default should be filled exactly once when late interviewer options make it selectable',
);
assert.match(
  assignment,
  /function selectInterviewer\(nextInterviewerId:\s*number \| null\)\s*\{[\s\S]*setPendingDefaultInterviewerId\(null\)[\s\S]*setInterviewerId\(nextInterviewerId\)[\s\S]*\}/,
  'Manual clearing or replacement should cancel pending automatic default selection',
);
assert.match(
  assignment,
  /useEffect\(\(\)\s*=>\s*\{\s*if \(interviewersLoading \|\| interviewersError \|\| interviewerId === null\) return;/,
  'Refreshing or failed interviewer options should preserve the current selection until fresh options arrive',
);
assert.match(
  assignment,
  /const selectedIsAvailable = interviewers\.some\([\s\S]*interviewer\.id === interviewerId[\s\S]*if \(!selectedIsAvailable\) \{\s*setInterviewerId\(null\);\s*\}[\s\S]*\}, \[interviewers, interviewerId, interviewersLoading, interviewersError\]\)/,
  'A completed successful options refresh should clear an interviewer who is no longer selectable',
);
assert.match(
  assignment,
  /<SearchableInterviewerField[\s\S]*value=\{interviewerId\}[\s\S]*onChange=\{selectInterviewer\}/,
  'Scheduling should route manual interviewer changes through the pending-default cancellation handler',
);
assert.match(
  assignment,
  /await api\.createInterviewAssignment\([\s\S]*setDemandId\(''\)[\s\S]*setPendingDefaultInterviewerId\(null\)[\s\S]*setInterviewerId\(null\)/,
  'Saving an assignment should clear both the selected demand and any pending default interviewer',
);
assert.match(
  assignment,
  /key=\{`interviewer-\$\{demandId \|\| 'none'\}`\}/,
  'Changing demands should reset stale search text even when both demands share the same default',
);
assert.match(
  assignment,
  /defaultInterviewerUnavailable\s*&&\s*interviewerId\s*===\s*null/,
  'The unavailable-default warning should disappear after HR selects a replacement',
);
assert.doesNotMatch(
  assignment,
  /interviewerId[^\n]*王杰|王杰[^\n]*interviewerId/,
  'Scheduling must never infer a default from the example name',
);
