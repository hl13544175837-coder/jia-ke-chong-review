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

export interface TalentMapPerson {
  id: number;
  map_id: number;
  company_id: number | null;
  company_name: string;
  name: string;
  title: string;
  city: string;
  tags: string[];
  salary_range: string;
  contact_status: string;
  evaluation: string;
  source: string;
  next_follow_at: string | null;
  note: string;
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

export interface TalentBoard {
  departments: TalentDepartment[];
  nodes: TalentNode[];
  personMeta: Record<string, TalentPersonMeta>;
  hiddenPersonIds: number[];
  companyShortNames: Record<string, string>;
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
  title?: string;
  city?: string;
  tags?: string[];
  salary_range?: string;
  contact_status?: string;
  evaluation?: string;
  source?: string;
  next_follow_at?: string | null;
  note?: string;
}
