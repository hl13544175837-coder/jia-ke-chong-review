export interface DepartmentHiring {
  department: string;
  headcount: number;
  hired: number;
  inProgress: number;
  openReqs: number;
}

export interface MonthlyTrend {
  month: string;
  hires: number;
  offers: number;
  interviews: number;
  resumes: number;
}

export interface SourceChannel {
  channel: string;
  resumes: number;
  interviews: number;
  hires: number;
  rate: number;
}

export interface AnalyticsOverview {
  totalHiresMonth: number;
  totalHiresQuarter: number;
  avgTimeToFill: number;
  avgCostPerHire: number;
  offerAcceptRate: number;
  totalOpenReqs: number;
  totalCandidates: number;
  pipelineHealth: number;
}

export const analyticsOverview: AnalyticsOverview = {
  totalHiresMonth: 34,
  totalHiresQuarter: 98,
  avgTimeToFill: 18,
  avgCostPerHire: 4200,
  offerAcceptRate: 86,
  totalOpenReqs: 47,
  totalCandidates: 1256,
  pipelineHealth: 72,
};

export const departmentHiring: DepartmentHiring[] = [
  { department: '技术研发部', headcount: 180, hired: 12, inProgress: 8, openReqs: 5 },
  { department: '产品设计部', headcount: 35, hired: 4, inProgress: 3, openReqs: 2 },
  { department: '市场运营部', headcount: 52, hired: 6, inProgress: 5, openReqs: 4 },
  { department: '销售业务部', headcount: 68, hired: 5, inProgress: 7, openReqs: 6 },
  { department: '客户成功部', headcount: 40, hired: 3, inProgress: 2, openReqs: 3 },
  { department: '人力行政部', headcount: 22, hired: 2, inProgress: 1, openReqs: 1 },
  { department: '财务法务部', headcount: 18, hired: 1, inProgress: 1, openReqs: 0 },
  { department: '供应链管理部', headcount: 30, hired: 1, inProgress: 3, openReqs: 2 },
];

export const monthlyTrends: MonthlyTrend[] = [
  { month: '1月', hires: 12, offers: 15, interviews: 48, resumes: 180 },
  { month: '2月', hires: 8, offers: 10, interviews: 35, resumes: 142 },
  { month: '3月', hires: 15, offers: 19, interviews: 55, resumes: 210 },
  { month: '4月', hires: 10, offers: 13, interviews: 42, resumes: 168 },
  { month: '5月', hires: 14, offers: 17, interviews: 52, resumes: 195 },
  { month: '6月', hires: 18, offers: 22, interviews: 60, resumes: 230 },
  { month: '7月', hires: 11, offers: 14, interviews: 45, resumes: 175 },
];

export const sourceChannels: SourceChannel[] = [
  { channel: 'BOSS直聘', resumes: 380, interviews: 85, hires: 28, rate: 22.4 },
  { channel: '猎聘', resumes: 245, interviews: 52, hires: 18, rate: 21.2 },
  { channel: '内推', resumes: 180, interviews: 68, hires: 32, rate: 37.8 },
  { channel: '脉脉', resumes: 142, interviews: 30, hires: 8, rate: 21.1 },
  { channel: '智联招聘', resumes: 128, interviews: 22, hires: 6, rate: 17.2 },
  { channel: '校招', resumes: 210, interviews: 45, hires: 12, rate: 21.4 },
  { channel: 'LinkedIn', resumes: 65, interviews: 14, hires: 5, rate: 21.5 },
];

export const hiringFunnel = {
  resumes: 1256,
  screened: 458,
  interviewed: 186,
  offered: 72,
  hired: 34,
};

export const timeToFillByDept: { department: string; days: number }[] = [
  { department: '技术研发部', days: 25 },
  { department: '产品设计部', days: 18 },
  { department: '市场运营部', days: 14 },
  { department: '销售业务部', days: 12 },
  { department: '客户成功部', days: 16 },
  { department: '人力行政部', days: 20 },
  { department: '财务法务部', days: 28 },
  { department: '供应链管理部', days: 22 },
];