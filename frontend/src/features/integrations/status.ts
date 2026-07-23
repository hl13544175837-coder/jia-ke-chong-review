import type { IntegrationHealth, IntegrationMode } from './types';

export type IntegrationStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface IntegrationStatusPresentation {
  label: string;
  hint: string;
  tone: IntegrationStatusTone;
}

export const INTEGRATION_MODE_STEPS: Array<{
  mode: IntegrationMode;
  label: string;
}> = [
  { mode: 'manual_bridge', label: '人工过渡' },
  { mode: 'shadow', label: '对照数据' },
  { mode: 'dual_run', label: '双轨运行' },
  { mode: 'authoritative', label: '正式接管' },
  { mode: 'legacy_retired', label: '旧功能下线' },
];

const MODE_PRESENTATION: Record<IntegrationMode, IntegrationStatusPresentation> = {
  manual_bridge: {
    label: '暂时人工处理',
    hint: '接口还没接好，当前继续按人工流程处理。',
    tone: 'warning',
  },
  shadow: {
    label: '正在对照数据',
    hint: '新接口只做同步比对，还不改变当前业务结果。',
    tone: 'info',
  },
  dual_run: {
    label: '新旧流程并行',
    hint: '新接口已经参与真实流程，旧方式暂时保留用于回退。',
    tone: 'info',
  },
  authoritative: {
    label: '已正式接管',
    hint: '该外部系统已成为唯一数据来源。',
    tone: 'success',
  },
  legacy_retired: {
    label: '旧功能已下线',
    hint: '旧的重复功能已经停用，历史记录仍可追溯。',
    tone: 'neutral',
  },
};

const HEALTH_PRESENTATION: Record<IntegrationHealth, IntegrationStatusPresentation> = {
  unconfigured: {
    label: '还没接接口',
    hint: '等负责人提供接口资料后再开始对接。',
    tone: 'neutral',
  },
  healthy: {
    label: '连接正常',
    hint: '最近一次检查未发现连接问题。',
    tone: 'success',
  },
  degraded: {
    label: '部分异常',
    hint: '部分请求失败，需要查看错误并重试。',
    tone: 'warning',
  },
  unavailable: {
    label: '暂时不可用',
    hint: '当前连不上外部系统，不会把失败显示成成功。',
    tone: 'danger',
  },
};

export function describeIntegrationMode(mode: IntegrationMode): IntegrationStatusPresentation {
  return MODE_PRESENTATION[mode];
}

export function describeIntegrationHealth(health: IntegrationHealth): IntegrationStatusPresentation {
  return HEALTH_PRESENTATION[health];
}

export function integrationModeStep(mode: IntegrationMode): number {
  return INTEGRATION_MODE_STEPS.findIndex((step) => step.mode === mode);
}
