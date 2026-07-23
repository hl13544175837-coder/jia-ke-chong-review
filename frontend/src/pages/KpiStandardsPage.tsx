import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Spinner,
  useToast,
} from '../components/ui';
import type {
  KpiBlockCategory,
  KpiStandardConfig,
} from '../types';

type SectionKey = 'categories' | 'risk';

function copyConfig(config: KpiStandardConfig): KpiStandardConfig {
  return JSON.parse(JSON.stringify(config)) as KpiStandardConfig;
}

function NumberField({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        className="h-10 w-24 rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix && <span className="text-sm text-[#777b78]">{suffix}</span>}
    </div>
  );
}

function Section({
  title,
  description,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-[#e8e7e1]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#fafbf8]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand)]">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#292b2a]">{title}</h2>
              <span className="rounded bg-[#f1f2ee] px-2 py-0.5 text-[11px] text-[#777b78]">{badge}</span>
            </div>
            <p className="mt-1 text-xs text-[#858a86]">{description}</p>
          </div>
        </div>
      </button>
      {open && <div className="border-t border-[#ecece8] px-5 py-5">{children}</div>}
    </Card>
  );
}

export function KpiStandardsPage() {
  const toast = useToast();
  const standardsAsync = useAsync(() => api.getKpiStandards(), []);
  const [config, setConfig] = useState<KpiStandardConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    categories: true,
    risk: true,
  });

  useEffect(() => {
    if (!standardsAsync.data) return;
    setConfig(copyConfig(standardsAsync.data.config));
    setVersion(standardsAsync.data.version);
    setDirty(false);
  }, [standardsAsync.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !config) return { categories: true, risk: true };
    return {
      categories: config.block_categories.some((category) => (
        `${category.name} ${category.keywords.join(' ')}`.toLowerCase().includes(term)
      )),
      risk: ['预警', '阈值', '停滞', '推荐', '面试', '开放', 'deadline'].some((item) => item.toLowerCase().includes(term)),
    };
  }, [config, search]);

  function update(next: KpiStandardConfig) {
    setConfig(next);
    setDirty(true);
  }

  function updateCategory(id: string, patch: Partial<KpiBlockCategory>) {
    if (!config) return;
    update({
      ...config,
      block_categories: config.block_categories.map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  }

  function addCategory() {
    if (!config || config.block_categories.length >= 20) return;
    const id = `category-${crypto.randomUUID()}`;
    update({
      ...config,
      block_categories: [...config.block_categories, { id, name: '', keywords: [] }],
    });
    setExpanded((current) => ({ ...current, categories: true }));
  }

  function removeCategory(id: string) {
    if (!config || config.block_categories.length <= 1) return;
    update({ ...config, block_categories: config.block_categories.filter((item) => item.id !== id) });
  }

  function moveCategory(id: string, direction: -1 | 1) {
    if (!config) return;
    const currentIndex = config.block_categories.findIndex((item) => item.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= config.block_categories.length) return;
    const categories = [...config.block_categories];
    const [item] = categories.splice(currentIndex, 1);
    categories.splice(targetIndex, 0, item);
    update({ ...config, block_categories: categories });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await api.saveKpiStandards(version, config);
      setConfig(copyConfig(saved.config));
      setVersion(saved.version);
      setDirty(false);
      toast.success('流程口径已保存');
      standardsAsync.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '保存失败，请刷新后重试');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      const saved = await api.resetKpiStandards(version);
      setConfig(copyConfig(saved.config));
      setVersion(saved.version);
      setDirty(false);
      setConfirmReset(false);
      toast.success('已恢复默认流程口径');
      standardsAsync.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '恢复失败，请刷新后重试');
    } finally {
      setSaving(false);
    }
  }

  if (standardsAsync.loading) {
    return <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#777b78]"><Spinner />加载口径配置…</div>;
  }
  if (standardsAsync.error) {
    return <ErrorState message={standardsAsync.error.message} onRetry={standardsAsync.reload} />;
  }
  if (!config) {
    return <ErrorState message="口径配置为空，请重试" onRetry={standardsAsync.reload} />;
  }

  const risk = config.risk_thresholds;

  return (
    <div data-ui="readdy-kpi-standards" className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-[var(--enterprise-brand)]" /><h1 className="text-2xl font-bold text-[#292b2a]">招聘流程口径配置</h1></div>
          <p className="mt-2 text-sm text-[#777b78]">用于 Demand 卡点归类和流程预警；不用于个人排名或绩效评价。</p>
          <p className="mt-1 text-xs text-[#969a97]">当前版本 {version} · {standardsAsync.data?.updated_by_name ? `最近由 ${standardsAsync.data.updated_by_name} 更新` : '尚未自定义'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(true)} disabled={saving}><RotateCcw className="h-4 w-4" />恢复默认</Button>
          <Button onClick={save} loading={saving} disabled={!dirty}><Save className="h-4 w-4" />保存配置</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#959a96]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#e0e1dc] bg-white pl-10 pr-4 text-sm outline-none focus:border-[var(--enterprise-brand)]"
          placeholder="搜索规则名称、分类关键词…"
        />
      </div>

      <div className="space-y-3">
        {visible.categories && (
          <Section
            title="阻塞原因分类规则"
            description="系统按顺序匹配关键词，未命中时落入“其他原因”"
            badge={`${config.block_categories.length} 条规则`}
            open={expanded.categories}
            onToggle={() => setExpanded((current) => ({ ...current, categories: !current.categories }))}
          >
            <div className="space-y-3">
              {config.block_categories.map((category, index) => (
                <div key={category.id} className="flex flex-col gap-3 rounded-xl border border-[#ecece8] bg-[#fafbf8] p-3 sm:flex-row sm:items-center">
                  <div className="flex gap-1 sm:flex-col">
                    <button type="button" onClick={() => moveCategory(category.id, -1)} disabled={index === 0} title={index === 0 ? '已经是第一项' : '上移一项'} className="rounded p-1.5 text-[#858a86] hover:bg-white disabled:opacity-30" aria-label="上移"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveCategory(category.id, 1)} disabled={index === config.block_categories.length - 1} title={index === config.block_categories.length - 1 ? '已经是最后一项' : '下移一项'} className="rounded p-1.5 text-[#858a86] hover:bg-white disabled:opacity-30" aria-label="下移"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <input
                    value={category.name}
                    onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                    className="h-10 flex-1 rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
                    placeholder="分类名称"
                    maxLength={80}
                  />
                  <input
                    value={category.keywords.join(', ')}
                    onChange={(event) => updateCategory(category.id, {
                      keywords: event.target.value.split(/[,，]/).map((item) => item.trim()),
                    })}
                    className="h-10 flex-[1.5] rounded-lg border border-[#dcded8] bg-white px-3 text-sm outline-none focus:border-[var(--enterprise-brand)]"
                    placeholder="多个关键词用逗号分隔"
                  />
                  <button type="button" onClick={() => removeCategory(category.id)} disabled={config.block_categories.length <= 1} title={config.block_categories.length <= 1 ? '至少保留一个阻塞分类' : '删除分类'} className="self-end rounded-lg p-2 text-[#929793] hover:bg-red-50 hover:text-red-600 disabled:opacity-30 sm:self-auto" aria-label="删除分类"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addCategory} disabled={config.block_categories.length >= 20}><Plus className="h-4 w-4" />添加分类</Button>
            </div>
          </Section>
        )}

        {visible.risk && (
          <Section
            title="Demand 流程预警阈值"
            description="每个数值都直接驱动 Demand 卡点或 BI 预警，不计算个人绩效"
            badge={`5 项真实阈值`}
            open={expanded.risk}
            onToggle={() => setExpanded((current) => ({ ...current, risk: !current.risk }))}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">目标日期预警天数</p><NumberField value={risk.deadline_warning_days} min={1} max={90} suffix="天内" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, deadline_warning_days: value } })} /></div>
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">阶段停滞天数</p><NumberField value={risk.stale_stage_days} min={1} max={365} suffix="天" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, stale_stage_days: value } })} /></div>
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">无推荐预警天数</p><NumberField value={risk.no_recommendation_days} min={1} max={365} suffix="天" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, no_recommendation_days: value } })} /></div>
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">低面试转化候选人阈值</p><NumberField value={risk.low_interview_candidate_threshold} min={1} max={10000} suffix="人" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, low_interview_candidate_threshold: value } })} /></div>
              <div><p className="mb-2 text-sm font-medium text-[#4f5551]">需求开放过久天数</p><NumberField value={risk.open_too_long_days} min={1} max={3650} suffix="天" onChange={(value) => update({ ...config, risk_thresholds: { ...risk, open_too_long_days: value } })} /></div>
            </div>
          </Section>
        )}

        {!visible.categories && !visible.risk && (
          <Card className="p-8 text-center text-sm text-[#777b78]">没有匹配的配置项</Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="恢复默认流程口径？"
        description="当前组织的自定义规则会被默认值覆盖，操作会记录审计历史。"
        confirmLabel="恢复默认"
        destructive
        loading={saving}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

export default KpiStandardsPage;
