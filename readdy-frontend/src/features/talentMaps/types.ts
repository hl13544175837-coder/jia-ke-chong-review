export interface TalentMapSummary {
  id: number;
  name: string;
  job_id: number | null;
  job_title: string;
  department: string;
  owner_hr_id: number;
  companies_count: number;
  people_count: number;
  updated_at: string | null;
}

export interface TalentMapCompany {
  id: number;
  map_id: number;
  company_name: string;
  city: string;
  region: string;
  industry: string;
  priority: string;
  note: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface TalentMapContactLog {
  id: number;
  person_id: number;
  content: string;
  contact_at: string | null;
  created_by_name: string;
  created_at: string | null;
}

export interface TalentMapPerson {
  id: number;
  map_id: number;
  company_id: number | null;
  company_name: string;
  name: string;
  department: string;
  title: string;
  level: string;
  module: string;
  phone: string;
  city: string;
  tags: string[];
  salary_range: string;
  contact_status: string;
  evaluation: string;
  source: string;
  owner_hr_id: number | null;
  owner_name: string;
  next_follow_at: string | null;
  note: string;
  contact_logs?: TalentMapContactLog[];
  created_at: string | null;
  updated_at: string | null;
}

export interface TalentNode {
  id: string;
  companyId: string;
  departmentId: string;
  title: string;
  level: string;
  personName?: string;
  personSource?: 'resume' | 'manual';
  personId?: number;
  reportsTo: string | null;
  status: 'confirmed' | 'estimated' | 'gap';
  responsibilities?: string;
  notes?: string;
}

export interface TalentDepartment {
  id: string;
  companyId: string;
  name: string;
  headcountConfirmed: number;
  headcountEstimated: number;
  parentDeptId?: string;
  description?: string;
}

export interface TalentCompany {
  id: string;
  name: string;
  industry: string;
  shortName: string;
  description: string;
  mappedFrom: number;
  totalHeadcount: number;
  confirmedHeadcount: number;
}

export interface TalentPersonMeta {
  departmentId: string;
  reportsTo: string | null;
  level: string;
  status: TalentNode['status'];
}

/** 人才地图中可独立维护的公司组织结构；空部门/岗位也会保存。 */
export interface TalentMapOrganizationDepartment {
  name: string;
  roles: string[];
}

export interface TalentMapOrganization {
  departments: TalentMapOrganizationDepartment[];
}

/** 保存组织结构时的部门草稿：source_name 用于把改名同步到已有人员。 */
export interface TalentMapOrganizationRoleDraft {
  source_title: string;
  title: string;
}

export interface TalentMapOrganizationDepartmentDraft {
  source_name: string;
  name: string;
  roles: TalentMapOrganizationRoleDraft[];
}

export interface TalentBoard {
  departments: TalentDepartment[];
  nodes: TalentNode[];
  personMeta: Record<string, TalentPersonMeta>;
  hiddenPersonIds: number[];
  companyShortNames: Record<string, string>;
  organization: Record<string, TalentMapOrganization>;
}

export interface TalentMapDetail extends TalentMapSummary {
  board_json: Partial<TalentBoard>;
  companies: TalentMapCompany[];
  people: TalentMapPerson[];
  created_at: string | null;
}

export interface TalentMapCreateInput {
  name: string;
  department?: string;
  job_id?: number | null;
  board_json?: Partial<TalentBoard>;
}

export interface TalentMapCompanyInput {
  company_name: string;
  city?: string;
  region?: string;
  industry?: string;
  priority?: string;
  note?: string;
}

export interface TalentMapPersonInput {
  company_id?: number | null;
  name: string;
  department?: string;
  title?: string;
  level?: string;
  module?: string;
  phone?: string;
  city?: string;
  tags?: string[];
  salary_range?: string;
  contact_status?: string;
  evaluation?: string;
  source?: string;
  next_follow_at?: string | null;
  note?: string;
}

/* ---------- AI 从简历库导入 ---------- */
export interface ResumeCandidateItem {
  candidate_id: number;
  source_type: 'resume' | 'online';
  name: string;
  company: string;
  position: string;
  duration: string;
  phone: string;
}

export interface ImportMatchItem extends ResumeCandidateItem {
  matched_company_id: number;
  matched_company_name: string;
  industry: string;
}

export interface ImportMapCompanyOption {
  id: number;
  company_name: string;
  industry: string;
}

export interface ImportPreviewResult {
  match: ImportMatchItem[];
  unmatch: ResumeCandidateItem[];
  map_companies: ImportMapCompanyOption[];
}

export interface ImportConfirmResult {
  created: TalentMapPerson[];
  count: number;
  skipped: number;
}

export interface ImportConfirmItem {
  candidate_id?: number;
  name: string;
  company_id?: number | null;
  create_company_name?: string;
  industry?: string;
  department?: string;
  title?: string;
  level?: string;
  module?: string;
  phone?: string;
  city?: string;
  contact_status?: string;
  note?: string;
  source?: string;
}
