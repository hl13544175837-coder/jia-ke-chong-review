export interface BlockCategoryRule {
  id: string;
  name: string;
  keywords: string;
}

export interface RiskThresholdConfig {
  highIfStatusPausedOrClosed: boolean;
  highIfZeroFillAndBlocked: boolean;
  mediumFillRatioThreshold: number;
  mediumIfBlocked: boolean;
  deadlineWarningDays: number;
}

export interface HealthThresholdConfig {
  greenThreshold: number;
  yellowThreshold: number;
}

export interface KpiStandardConfig {
  blockCategories: BlockCategoryRule[];
  riskThresholds: RiskThresholdConfig;
  healthThresholds: HealthThresholdConfig;
}

export const defaultBlockCategories: BlockCategoryRule[] = [
  { id: 'cat-1', name: '用人部门需求模糊', keywords: '需求模糊' },
  { id: 'cat-2', name: '面试官/用人部门响应慢', keywords: '未反馈,拖延,改期' },
  { id: 'cat-3', name: '薪资不匹配', keywords: '薪资' },
  { id: 'cat-4', name: '候选人放弃', keywords: '放弃,入职他司' },
  { id: 'cat-5', name: '其他原因', keywords: '' },
];

export const defaultRiskThresholds: RiskThresholdConfig = {
  highIfStatusPausedOrClosed: true,
  highIfZeroFillAndBlocked: true,
  mediumFillRatioThreshold: 0.5,
  mediumIfBlocked: true,
  deadlineWarningDays: 14,
};

export const defaultHealthThresholds: HealthThresholdConfig = {
  greenThreshold: 70,
  yellowThreshold: 40,
};

export const defaultKpiConfig: KpiStandardConfig = {
  blockCategories: defaultBlockCategories,
  riskThresholds: defaultRiskThresholds,
  healthThresholds: defaultHealthThresholds,
};

const STORAGE_KEY = 'zhipin_kpi_standards_v1';

export function loadKpiConfig(): KpiStandardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultKpiConfig };
    const parsed = JSON.parse(raw) as Partial<KpiStandardConfig>;
    return {
      blockCategories: parsed.blockCategories || [...defaultBlockCategories],
      riskThresholds: { ...defaultRiskThresholds, ...parsed.riskThresholds },
      healthThresholds: { ...defaultHealthThresholds, ...parsed.healthThresholds },
    };
  } catch {
    return { ...defaultKpiConfig };
  }
}

export function saveKpiConfig(config: KpiStandardConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetKpiConfig(): KpiStandardConfig {
  localStorage.removeItem(STORAGE_KEY);
  return { ...defaultKpiConfig };
}

/** 根据配置的分类规则，把阻塞原因归类 */
export function categorizeBlockReason(reason: string | undefined, rules: BlockCategoryRule[]): string {
  if (!reason || reason === '暂无' || reason === '暂无明显阻塞') return '无阻塞';

  for (const rule of rules) {
    if (!rule.keywords.trim()) continue;
    const kws = rule.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (kws.some((k) => reason.includes(k))) return rule.name;
  }

  const fallback = rules.find((r) => r.name === '其他原因');
  return fallback ? fallback.name : '其他原因';
}

/** 根据配置的健康度阈值返回颜色类名 */
export function getHealthColorClass(percent: number, thresholds: HealthThresholdConfig): string {
  if (percent >= thresholds.greenThreshold) return 'text-primary-600';
  if (percent >= thresholds.yellowThreshold) return 'text-accent-600';
  return 'text-accent-600';
}

export function getHealthStrokeColor(percent: number, thresholds: HealthThresholdConfig): string {
  if (percent >= thresholds.greenThreshold) return 'oklch(var(--primary-500))';
  if (percent >= thresholds.yellowThreshold) return 'oklch(var(--accent-500))';
  return 'oklch(var(--accent-500))';
}