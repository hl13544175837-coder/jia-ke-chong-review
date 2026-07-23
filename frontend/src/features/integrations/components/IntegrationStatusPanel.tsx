import { Cable, CircleDotDashed, PlugZap } from 'lucide-react';
import { Badge, EmptyState, ErrorState, Skeleton } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { useAsync } from '../../../lib/useAsync';
import { integrationsApi } from '../api';
import {
  describeIntegrationHealth,
  describeIntegrationMode,
  INTEGRATION_MODE_STEPS,
  integrationModeStep,
} from '../status';
import type { IntegrationCapability } from '../types';

function IntegrationLoadingState() {
  return (
    <div role="status" aria-label="正在读取外部接口状态" className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full max-w-xl" />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function CapabilityStage({ capability }: { capability: IntegrationCapability }) {
  const currentStep = integrationModeStep(capability.mode);

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-muted">当前阶段</p>
      <ol
        aria-label={`${capability.name}接入阶段`}
        className="mt-2 grid grid-cols-5 gap-1"
      >
        {INTEGRATION_MODE_STEPS.map((step, index) => {
          const current = index === currentStep;
          const reached = index <= currentStep;
          return (
            <li key={step.mode} className="min-w-0">
              <div className="flex items-center" aria-hidden="true">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full border transition-colors',
                    current
                      ? 'border-[var(--enterprise-brand)] bg-[var(--enterprise-brand)] ring-4 ring-[var(--enterprise-brand-soft)]'
                      : reached
                        ? 'border-[var(--enterprise-brand)] bg-[var(--enterprise-brand-soft)]'
                        : 'border-hairline bg-canvas',
                  )}
                />
                {index < INTEGRATION_MODE_STEPS.length - 1 && (
                  <span
                    className={cn(
                      'h-px flex-1',
                      index < currentStep ? 'bg-[var(--enterprise-brand)]' : 'bg-hairline',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'mt-2 block truncate text-[10px] leading-4',
                  current ? 'font-semibold text-ink' : 'text-muted-soft',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CapabilityCard({ capability }: { capability: IntegrationCapability }) {
  const mode = describeIntegrationMode(capability.mode);
  const health = describeIntegrationHealth(capability.health);

  return (
    <article className="relative overflow-hidden rounded-xl border border-hairline bg-canvas p-5 shadow-apple-xs">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          health.tone === 'success' && 'bg-success-500',
          health.tone === 'warning' && 'bg-warning-500',
          health.tone === 'danger' && 'bg-danger-500',
          (health.tone === 'neutral' || health.tone === 'info') && 'bg-surface-strong',
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{capability.name}</h3>
            <Badge tone={health.tone}>{health.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">对接责任方：{capability.owner}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand-dark)]">
          <PlugZap className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-body">{capability.description}</p>

      <div className="mt-4 rounded-lg border border-hairline bg-surface-soft px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={mode.tone}>{mode.label}</Badge>
          <span className="text-xs leading-5 text-muted">{mode.hint}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted">
          <CircleDotDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {health.hint}
        </p>
      </div>

      <CapabilityStage capability={capability} />

      {capability.required_inputs.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-xs font-semibold text-ink">接入前还需要</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {capability.required_inputs.map((input) => (
              <span
                key={input}
                className="rounded-md border border-hairline bg-surface-soft px-2.5 py-1 text-xs text-body"
              >
                {input}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function IntegrationStatusPanel() {
  const { data, loading, error, reload } = useAsync(
    () => integrationsApi.listCapabilities(),
    [],
  );

  if (loading) return <IntegrationLoadingState />;

  if (error) {
    return (
      <ErrorState
        message={`外部接口状态暂时没读到：${error.message}。当前没有把任何接口显示成已接通。`}
        onRetry={reload}
        className="py-5"
      />
    );
  }

  const capabilities = data?.items ?? [];

  if (capabilities.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title="还没有接口清单"
        description="后端还没返回任何外部接口。请先补充接口清单，再回来查看。"
        className="rounded-xl border border-dashed border-hairline bg-surface-soft"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[rgba(0,192,123,0.2)] bg-[var(--enterprise-brand-faint)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand-dark)]">
            <Cable className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">外部系统分块接入</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              后续拿到某个接口资料时，只改对应模块，不会牵动其他招聘流程。
            </p>
          </div>
        </div>
        <Badge tone="brand">共 {capabilities.length} 项</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {capabilities.map((capability) => (
          <CapabilityCard key={capability.code} capability={capability} />
        ))}
      </div>
    </div>
  );
}
